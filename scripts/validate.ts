// 실데이터 자가검증: wavu 에서 실제 플레이어를 받아 파이프라인 전체를 돌리고
// 몇 가지 불변식을 확인한다. (npm run validate [-- <식별코드>])
//
// 네트워크 1회 요청뿐이라 레이트리밋 걱정 없이 돌려도 된다.

import { fetchReplays } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import { computeFromRecords } from '../lib/tekken/compute';
import { formatDt } from '../lib/tekken/models';

const id = process.argv[2] ?? '5m6Lj5Jb6MfQ';

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`[1] fetch ${id} ...`);
  const replays = await fetchReplays(id);
  console.log(`    replays: ${replays.length}`);
  if (replays.length === 0) fail('replay 0건');

  console.log('[2] normalize ...');
  const { records, myName, stats } = normalizeReplays(replays, id);
  console.log(
    `    kept=${stats.kept} dropped=${stats.dropped} dupes=${stats.dupes} name='${myName}'`,
  );
  if (records.length === 0) fail('정규화 결과 0건');
  if (stats.kept + stats.dropped + stats.dupes !== stats.total)
    fail('kept+dropped+dupes ≠ total');

  // 불변식: 시간 오름차순, W/L 만 존재, score 형식
  for (let i = 1; i < records.length; i++)
    if (records[i].dt.getTime() < records[i - 1].dt.getTime())
      fail(`시간 역행 @${i}`);
  for (const r of records) {
    if (r.result !== 'W' && r.result !== 'L') fail(`result='${r.result}'`);
    if (!/^\d+-\d+$/.test(r.score)) fail(`score='${r.score}'`);
    if (r.myChar.startsWith('#'))
      console.warn(`    주의: 미확인 캐릭터 id ${r.myChar} (${formatDt(r.dt)})`);
  }

  console.log('[3] compute ...');
  const result = computeFromRecords(records, id, myName);
  for (const t of result.tabs)
    console.log(`    ${t.key.padEnd(9)} ${String(t.rows.length).padStart(5)}행`);

  // 불변식: total 탭 ALL 행 = 전체 경기 수, W+L=Games
  const total = result.tabs.find((t) => t.key === 'total')!;
  const all = total.rows[total.rows.length - 1];
  if (all[0] !== 'ALL') fail('total 마지막 행이 ALL 이 아님');
  if (all[1] !== records.length) fail(`ALL Games=${all[1]} ≠ ${records.length}`);
  for (const row of total.rows) {
    const [, games, w, l] = row as [string, number, number, number];
    if (w + l !== games) fail(`W+L≠Games: ${row[0]}`);
  }

  // 불변식: 세션 탭 경기 합 = 전체 경기 수
  const sess = result.tabs.find((t) => t.key === 'sessions')!;
  const sessGames = sess.rows.reduce((s, r) => s + (r[4] as number), 0);
  if (sessGames !== records.length)
    fail(`세션 경기 합 ${sessGames} ≠ ${records.length}`);

  // 불변식: 일별 탭 경기 합 = 전체 경기 수
  const daily = result.tabs.find((t) => t.key === 'daily')!;
  const dailyGames = daily.rows.reduce((s, r) => s + (r[2] as number), 0);
  if (dailyGames !== records.length)
    fail(`일별 경기 합 ${dailyGames} ≠ ${records.length}`);

  console.log('PASS');
}

main().catch((e) => fail((e as Error).message));
