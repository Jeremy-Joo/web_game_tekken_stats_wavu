// 조회 로그 — "누구를 몇 번 조회했는지"를 Vercel Blob 한 파일에 모은다.
//
// ── 반드시 지켜야 하는 두 가지 (lib/wavu/blob.ts 의 사고 이력 참조) ──────────
// ① **읽을 때 list() 를 쓰지 않는다.** list()/put() 은 Advanced Operation 이고
//    무료 한도가 월 2,000 이다. 예전에 읽기마다 list() 를 부르다 스토어가 정지됐다.
//    → readPublicBlob() 으로 경로에서 바로 읽는다.
// ② **읽지 못했으면 쓰지 않는다.** '못 읽음'을 '0'으로 착각하고 쓰면 누적값이
//    통째로 날아간다. 한 건 덜 세는 편이 낫다.
//
// ── 쓰기 예산 ───────────────────────────────────────────────────────────────
// put() 도 Advanced Operation 이라 조회 1건마다 쓰면 한도를 금방 태운다.
// 그래서 증분을 메모리에 모았다가 최소 간격(WRITE_MIN_INTERVAL_MS)마다만 저장한다.
// 인스턴스가 내려가면 아직 저장 못 한 증분은 사라진다 — 통계 용도라 근사치면 충분하다.

import { put } from '@vercel/blob';
import { readPublicBlob, rememberOriginFrom } from '@/lib/wavu/blob';

const BLOB_PATH = 'lookups.json';

/** 같은 인스턴스에서 이 간격보다 자주 저장하지 않는다 (Advanced Op 절약). */
const WRITE_MIN_INTERVAL_MS = 60_000;
/** 쓰기가 막혀 있으면(스토어 정지 등) 이 시간 동안 시도하지 않는다. */
const WRITE_RETRY_MS = 5 * 60_000;

/** 저장 상한 — 파일이 무한히 자라지 않게 상위 항목만 유지한다. */
const MAX_PLAYERS = 500;
const MAX_SEARCHES = 300;
const MAX_DAYS = 90;

export interface PlayerHit {
  name: string;
  count: number;
  last: number; // epoch seconds
}

export interface SearchHit {
  count: number;
  hits: number; // 결과가 1건 이상이었던 횟수
  last: number;
}

export interface LookupLog {
  total: number;
  players: Record<string, PlayerHit>; // 식별코드 → 조회 통계
  searches: Record<string, SearchHit>; // 닉네임 검색어 → 통계
  byDay: Record<string, number>; // 'yyyy-MM-dd'(KST) → 조회 수
}

const EMPTY: LookupLog = { total: 0, players: {}, searches: {}, byDay: {} };

export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * ok=false 는 **읽지 못했다**는 뜻 — '기록 없음'이 아니다.
 * 파일이 아직 없는 경우만 ok=true + 빈 값으로 돌려준다.
 */
export async function readLog(): Promise<{ ok: boolean; log: LookupLog }> {
  const r = await readPublicBlob(BLOB_PATH);
  if (!r.ok) return { ok: false, log: EMPTY };
  if (!r.body) return { ok: true, log: { total: 0, players: {}, searches: {}, byDay: {} } };

  try {
    const d = JSON.parse(Buffer.from(r.body).toString('utf8')) as Partial<LookupLog>;
    if (typeof d?.total !== 'number') return { ok: false, log: EMPTY };
    return {
      ok: true,
      log: {
        total: d.total,
        players: d.players && typeof d.players === 'object' ? d.players : {},
        searches: d.searches && typeof d.searches === 'object' ? d.searches : {},
        byDay: d.byDay && typeof d.byDay === 'object' ? d.byDay : {},
      },
    };
  } catch {
    return { ok: false, log: EMPTY };
  }
}

/* ── 아직 저장하지 못한 증분 (인스턴스 메모리) ───────────────────────────── */

interface Pending {
  players: Map<string, { name: string; count: number; last: number }>;
  searches: Map<string, { count: number; hits: number; last: number }>;
  byDay: Map<string, number>;
  total: number;
}

const pending: Pending = {
  players: new Map(),
  searches: new Map(),
  byDay: new Map(),
  total: 0,
};

let lastWrite = 0;
let writeBlockedUntil = 0;
let flushing = false;

const hasPending = () =>
  pending.total > 0 || pending.players.size > 0 || pending.searches.size > 0;

/** 상한을 넘은 항목은 조회 수가 적은 것부터 버린다. */
function trim<T extends { count: number }>(m: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(m);
  if (keys.length <= max) return m;
  const out: Record<string, T> = {};
  for (const k of keys.sort((a, b) => m[b].count - m[a].count).slice(0, max)) out[k] = m[k];
  return out;
}

/** 모아둔 증분을 저장본에 합쳐 한 번에 쓴다. 실패하면 증분을 그대로 남겨 다음 기회에 재시도. */
async function flush(): Promise<void> {
  if (flushing || !hasPending()) return;
  if (Date.now() < writeBlockedUntil) return; // 막힌 걸 아는 동안은 조용히 건너뛴다
  if (Date.now() - lastWrite < WRITE_MIN_INTERVAL_MS) return;

  flushing = true;
  try {
    const { ok, log } = await readLog();
    if (!ok) return; // ★ 못 읽었으면 쓰지 않는다 (누적값 보호)

    for (const [id, p] of pending.players) {
      const cur = log.players[id];
      log.players[id] = {
        name: p.name || cur?.name || id,
        count: (cur?.count ?? 0) + p.count,
        last: Math.max(cur?.last ?? 0, p.last),
      };
    }
    for (const [q, s] of pending.searches) {
      const cur = log.searches[q];
      log.searches[q] = {
        count: (cur?.count ?? 0) + s.count,
        hits: (cur?.hits ?? 0) + s.hits,
        last: Math.max(cur?.last ?? 0, s.last),
      };
    }
    for (const [d, n] of pending.byDay) log.byDay[d] = (log.byDay[d] ?? 0) + n;
    log.total += pending.total;

    log.players = trim(log.players, MAX_PLAYERS);
    log.searches = trim(log.searches, MAX_SEARCHES);
    const days = Object.keys(log.byDay).sort();
    for (const d of days.slice(0, Math.max(0, days.length - MAX_DAYS))) delete log.byDay[d];

    const res = await put(BLOB_PATH, JSON.stringify(log), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false, // URL 이 경로에서 결정돼야 읽을 때 list() 를 안 쓴다
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    rememberOriginFrom(res.url);

    // 성공했을 때만 비운다
    pending.players.clear();
    pending.searches.clear();
    pending.byDay.clear();
    pending.total = 0;
    lastWrite = Date.now();
  } catch (e) {
    writeBlockedUntil = Date.now() + WRITE_RETRY_MS;
    console.warn(
      `[stats] Blob 저장 실패 — ${WRITE_RETRY_MS / 60000}분간 기록만 모아둔다: ${(e as Error).message}`,
    );
  } finally {
    flushing = false;
  }
}

/** 플레이어 조회 1건 기록. 조회 자체엔 영향이 없어야 하므로 절대 throw 하지 않는다. */
export async function logPlayerLookup(id: string, name: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const cur = pending.players.get(id);
    pending.players.set(id, {
      name: name || cur?.name || id,
      count: (cur?.count ?? 0) + 1,
      last: now,
    });
    pending.total += 1;
    const day = todayKst();
    pending.byDay.set(day, (pending.byDay.get(day) ?? 0) + 1);
    await flush();
  } catch {
    /* 로깅 실패는 조용히 무시 */
  }
}

/** 닉네임 검색 1건 기록 (URL 에 안 남아 페이지뷰 분석으로는 못 보는 정보). */
export async function logSearch(query: string, resultCount: number): Promise<void> {
  try {
    const q = query.trim().slice(0, 40);
    if (!q) return;
    const now = Math.floor(Date.now() / 1000);
    const cur = pending.searches.get(q);
    pending.searches.set(q, {
      count: (cur?.count ?? 0) + 1,
      hits: (cur?.hits ?? 0) + (resultCount > 0 ? 1 : 0),
      last: now,
    });
    await flush();
  } catch {
    /* 무시 */
  }
}
