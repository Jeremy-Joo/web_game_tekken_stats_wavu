// 조회 로그 — "누구를 몇 번 조회했는지"를 Vercel Blob 한 파일에 모은다.
//
// 서버(API 라우트)에서 기록한다. 클라이언트 비콘과 달리 광고차단에 막히지 않고,
// 우리 응답은 CDN 캐시를 타지 않으므로(상류 wavu fetch 에만 캐시가 걸려 있다)
// 실제 조회 한 건이 함수 실행 한 번과 1:1로 대응한다.
//
// 동시성: 읽고-더하고-쓰는 방식이라 같은 순간에 겹친 조회는 일부 유실될 수 있다.
// 개인 사이트 트래픽(일 수백 건)에서는 무시할 수준이고, 정밀 집계가 필요해지면
// KV 의 원자적 증가 연산으로 옮긴다.

import { list, put } from '@vercel/blob';

const BLOB_PATH = 'lookups.json';

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

const empty = (): LookupLog => ({ total: 0, players: {}, searches: {}, byDay: {} });

export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function readLog(): Promise<LookupLog> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return empty();
    const d = (await res.json()) as Partial<LookupLog>;
    return {
      total: typeof d.total === 'number' ? d.total : 0,
      players: d.players && typeof d.players === 'object' ? d.players : {},
      searches: d.searches && typeof d.searches === 'object' ? d.searches : {},
      byDay: d.byDay && typeof d.byDay === 'object' ? d.byDay : {},
    };
  } catch {
    return empty();
  }
}

/** 상한을 넘은 항목은 조회 수가 적은 것부터 버린다. */
function trim<T extends { count: number }>(
  m: Record<string, T>,
  max: number,
): Record<string, T> {
  const keys = Object.keys(m);
  if (keys.length <= max) return m;
  const kept = keys
    .sort((a, b) => m[b].count - m[a].count)
    .slice(0, max);
  const out: Record<string, T> = {};
  for (const k of kept) out[k] = m[k];
  return out;
}

async function writeLog(log: LookupLog): Promise<void> {
  log.players = trim(log.players, MAX_PLAYERS);
  log.searches = trim(log.searches, MAX_SEARCHES);
  const days = Object.keys(log.byDay).sort();
  for (const d of days.slice(0, Math.max(0, days.length - MAX_DAYS)))
    delete log.byDay[d];

  await put(BLOB_PATH, JSON.stringify(log), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

/** 플레이어 조회 1건 기록. 실패해도 조회 자체엔 영향이 없어야 하므로 절대 throw 하지 않는다. */
export async function logPlayerLookup(id: string, name: string): Promise<void> {
  try {
    const log = await readLog();
    const now = Math.floor(Date.now() / 1000);
    const cur = log.players[id];
    log.players[id] = {
      name: name || cur?.name || id,
      count: (cur?.count ?? 0) + 1,
      last: now,
    };
    log.total += 1;
    const day = todayKst();
    log.byDay[day] = (log.byDay[day] ?? 0) + 1;
    await writeLog(log);
  } catch {
    /* 로깅 실패는 조용히 무시 */
  }
}

/** 닉네임 검색 1건 기록 (URL 에 남지 않아 페이지뷰 분석으로는 안 잡히는 정보). */
export async function logSearch(query: string, resultCount: number): Promise<void> {
  try {
    const q = query.trim().slice(0, 40);
    if (!q) return;
    const log = await readLog();
    const now = Math.floor(Date.now() / 1000);
    const cur = log.searches[q];
    log.searches[q] = {
      count: (cur?.count ?? 0) + 1,
      hits: (cur?.hits ?? 0) + (resultCount > 0 ? 1 : 0),
      last: now,
    };
    await writeLog(log);
  } catch {
    /* 무시 */
  }
}
