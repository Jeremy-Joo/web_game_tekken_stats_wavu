// 플레이어 인덱스를 만든다. **개발자가 손으로 돌리는 스크립트다** (build-hex-baseline 과 동급).
//
//   npx tsx scripts/build-player-index.ts ga [개수]        GA 조회 기록에서 신규 수집
//                                                            (매일, .github/workflows/player-index-daily.yml)
//   npx tsx scripts/build-player-index.ts feed [개수]      피드 표본 보충 (월 1회)
//   npx tsx scripts/build-player-index.ts refresh [개수]   25일 넘은 행 재수집 (월 1회, feed 와 같이)
//   npx tsx scripts/build-player-index.ts stats            현재 인덱스 요약만 출력
//
// ── 지키는 것들 ──────────────────────────────────────────────────────
//  · wavu 는 **한 번에 하나씩** (공식 문서 지침). 요청 사이 1.2초.
//  · 한 명 끝날 때마다 파일에 쓴다 — 중간에 끊겨도 그 자리부터 다시.
//  · 500판 미달은 skipped 에 기록해 매번 다시 받지 않는다 (60일 뒤 재확인 —
//    그 사이 500판을 넘겼을 수 있다).
//  · GA 비밀번호는 .env.local 의 ADMIN_PASSWORD. GA 자격증명은 Vercel 에만 있으므로
//    직접 GA 를 부르지 않고 **운영 admin API 를 통해** 조회 목록을 받는다.
//
// 소요 시간 감각: 한 명당 수집+계산 2~4초. 200명이면 10~15분.

import fs from 'node:fs';
import path from 'node:path';
import { getRecords } from '../lib/wavu/cache';
import { hexScores } from '../lib/tekken/hexagon';
import { sessionAdvice } from '../lib/tekken/advice';
import type { MatchRecord } from '../lib/tekken/models';
import type { PlayerIndex, PlayerIndexRow } from '../lib/tekken/player-index';

const FILE = path.join(__dirname, '..', 'lib', 'tekken', 'player-index-data.json');
const MIN_GAMES = 500;
const REFRESH_DAYS = 25; // 월 주기보다 살짝 짧게 — 갱신 실행일이 며칠 밀려도 전부 걸리게
const RECHECK_SKIPPED_DAYS = 60;
const WAVU_GAP_MS = 1200;
const PROD = 'https://tekkenstats.com';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowS = () => Math.floor(Date.now() / 1000);

function load(): PlayerIndex {
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as PlayerIndex;
}
function save(ix: PlayerIndex) {
  ix.updatedAt = nowS();
  // 행 순서를 고정해 diff 가 읽히게 한다.
  ix.rows.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(FILE, JSON.stringify(ix, null, 1), 'utf8');
}

/** 운영 admin API 에서 90일 조회 목록을 받는다. id → GA 조회수. */
async function gaLookupIds(): Promise<Map<string, number>> {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const m = /ADMIN_PASSWORD\s*=\s*"?([^"\r\n]+)"?/.exec(env);
  if (!m) throw new Error('.env.local 에 ADMIN_PASSWORD 가 없습니다.');
  const res = await fetch(`${PROD}/api/admin/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: m[1], days: 90 }),
  });
  if (!res.ok) throw new Error(`admin/stats ${res.status}`);
  const d = (await res.json()) as { players?: { id: string; lookups?: number }[] };
  const out = new Map<string, number>();
  for (const p of d.players ?? []) out.set(p.id, p.lookups ?? 0);
  return out;
}

/** 피드 한 번에서 ID 를 모은다 (build-hex-baseline 과 같은 방식). */
async function feedIds(): Promise<string[]> {
  const res = await fetch('https://wank.wavu.wiki/api/replays', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`wavu feed ${res.status}`);
  const feed = (await res.json()) as Record<string, unknown>[];
  const seen = new Set<string>();
  for (const b of feed)
    for (const side of ['p1', 'p2']) {
      const id = b[`${side}_polaris_id`];
      if (typeof id === 'string' && /^[A-Za-z0-9]{12}$/.test(id)) seen.add(id);
    }
  return [...seen];
}

function buildRow(
  id: string,
  name: string,
  records: MatchRecord[],
  source: PlayerIndexRow['source'],
  lookups: number,
): PlayerIndexRow {
  const ord = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const last = ord[ord.length - 1];

  const wins = ord.filter((r) => r.result === 'W').length;
  const recent = ord.slice(-200);
  const recentW = recent.filter((r) => r.result === 'W').length;

  const byChar = new Map<string, number>();
  for (const r of ord) byChar.set(r.myChar, (byChar.get(r.myChar) ?? 0) + 1);
  let mainChar = '';
  let mainCharGames = 0;
  for (const [c, n] of byChar) if (n > mainCharGames) ((mainChar = c), (mainCharGames = n));

  let peak = 0;
  for (const r of ord) if (r.myRating > peak) peak = r.myRating;

  const hex: Record<string, number | null> = {};
  for (const s of hexScores(ord)) hex[s.key] = s.value;

  const adv = sessionAdvice(ord);

  return {
    id,
    name,
    source,
    fetchedAt: nowS(),
    games: ord.length,
    // dt 는 KST 벽시계를 UTC 필드에 담은 Date — epoch 로 되돌릴 때 9시간을 빼야
    // 실제 UTC 시각이 된다 (models.ts 시각 규약).
    lastPlayed: Math.floor(last.dt.getTime() / 1000) - 9 * 3600,
    lastVersion: last.gameVersion,
    wrOverall: Math.round((wins * 1000) / ord.length) / 10,
    wrRecent200: Math.round((recentW * 1000) / recent.length) / 10,
    rating: last.myRating,
    peakRating: peak,
    mainChar,
    mainCharGames,
    hex,
    stopAfter: adv?.stopAfter ?? null,
    dropPp: adv?.dropPp ?? null,
    adviceReliable: adv?.reliable ?? false,
    lookups,
  };
}

async function collect(
  ix: PlayerIndex,
  ids: string[],
  source: 'lookup' | 'feed',
  lookupsOf: (id: string) => number,
  limit: number,
) {
  const have = new Map(ix.rows.map((r) => [r.id, r]));
  let done = 0;
  let skippedNew = 0;

  for (const id of ids) {
    if (done >= limit) break;

    const existing = have.get(id);
    if (existing) {
      // 이미 있으면 출처만 합친다 — 재수집은 refresh 모드의 일이다.
      if (existing.source !== source) existing.source = 'both';
      if (source === 'lookup') existing.lookups = lookupsOf(id);
      continue;
    }
    const skip = ix.skipped[id];
    if (skip && nowS() - skip.at < RECHECK_SKIPPED_DAYS * 86400) continue;

    try {
      const { records, myName } = await getRecords(id);
      if (records.length < MIN_GAMES) {
        ix.skipped[id] = { games: records.length, at: nowS() };
        skippedNew++;
      } else {
        const row = buildRow(id, myName || id, records, source, lookupsOf(id));
        ix.rows.push(row);
        have.set(id, row);
        done++;
        if (skip) delete ix.skipped[id]; // 그 사이 500판을 넘긴 경우
        console.log(
          `[${done}/${limit}] ${row.name}  ${row.games}판  wr${row.wrOverall}%  r${row.rating}`,
        );
      }
    } catch (e) {
      console.log(`  실패 ${id}: ${e instanceof Error ? e.message : e}`);
    }

    save(ix); // 한 명마다 저장 — 끊겨도 이어서
    await sleep(WAVU_GAP_MS);
  }
  console.log(`수집 ${done}명, 미달 스킵 ${skippedNew}명`);
}

async function refresh(ix: PlayerIndex, limit: number) {
  const stale = ix.rows
    .filter((r) => nowS() - r.fetchedAt > REFRESH_DAYS * 86400)
    .sort((a, b) => a.fetchedAt - b.fetchedAt)
    .slice(0, limit);
  console.log(`재수집 대상 ${stale.length}명 (${REFRESH_DAYS}일 경과)`);

  for (const [i, old] of stale.entries()) {
    try {
      const { records, myName } = await getRecords(old.id);
      if (records.length < MIN_GAMES) {
        // 판수는 줄지 않으니 실제로는 안 일어난다 — wavu 응답 이상 신호로 남긴다.
        console.log(`  경고 ${old.id}: 판수가 ${records.length}로 줄었다?`);
      } else {
        const row = buildRow(old.id, myName || old.name, records, old.source, old.lookups);
        Object.assign(old, row);
        console.log(`[${i + 1}/${stale.length}] ${row.name}  ${row.games}판`);
      }
    } catch (e) {
      console.log(`  실패 ${old.id}: ${e instanceof Error ? e.message : e}`);
    }
    save(ix);
    await sleep(WAVU_GAP_MS);
  }
}

function stats(ix: PlayerIndex) {
  const bySource = { lookup: 0, feed: 0, both: 0 };
  for (const r of ix.rows) bySource[r.source]++;
  const ages = ix.rows.map((r) => (nowS() - r.fetchedAt) / 86400).sort((a, b) => a - b);
  console.log(`행 ${ix.rows.length}개 (lookup ${bySource.lookup} / feed ${bySource.feed} / both ${bySource.both})`);
  console.log(`미달 스킵 ${Object.keys(ix.skipped).length}개`);
  if (ages.length)
    console.log(`스냅샷 나이: 최신 ${ages[0].toFixed(1)}일 / 중앙 ${ages[ages.length >> 1].toFixed(1)}일 / 최고 ${ages[ages.length - 1].toFixed(1)}일`);
}

async function main() {
  const mode = process.argv[2];
  const limit = Number(process.argv[3]) || 200;
  const ix = load();

  if (mode === 'ga') {
    const ga = await gaLookupIds();
    console.log(`GA 90일 조회 플레이어 ${ga.size}명`);
    // 많이 조회된 사람부터 — 표본 가치가 높은 쪽을 먼저 채운다.
    const ids = [...ga.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    await collect(ix, ids, 'lookup', (id) => ga.get(id) ?? 0, limit);
  } else if (mode === 'feed') {
    const ids = await feedIds();
    console.log(`피드에서 ID ${ids.length}개`);
    await collect(ix, ids, 'feed', () => 0, limit);
  } else if (mode === 'refresh') {
    await refresh(ix, limit);
  } else if (mode === 'stats') {
    stats(ix);
    return;
  } else {
    console.log('사용법: tsx scripts/build-player-index.ts <ga|feed|refresh|stats> [개수]');
    process.exit(1);
  }
  stats(ix);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
