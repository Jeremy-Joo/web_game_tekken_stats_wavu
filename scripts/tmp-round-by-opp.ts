// [임시] 라운드 탭을 상대 캐릭터별로 묶었을 때 무엇이 보이는지 눈으로 확인용.
// 프로토타입 확인이 끝나면 지운다.
//
//   npx tsx scripts/tmp-round-by-opp.ts <식별코드> [내캐릭]

import { getRecords } from '../lib/wavu/cache';
import { buildRound } from '../lib/tekken/aggregations';

const id = process.argv[2] ?? '53deQ2dmLday';
const want = process.argv[3];

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function main() {
const { records, myName } = await getRecords(id);

const counts = new Map<string, number>();
for (const r of records) counts.set(r.myChar, (counts.get(r.myChar) ?? 0) + 1);
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

console.log(`${myName} (${id}) — ${records.length}판`);
console.log('내 캐릭:', ranked.slice(0, 6).map(([c, n]) => `${c} ${n}`).join(' · '));

const myChar = want ?? ranked[0][0];
const filtered = records.filter((r) => r.myChar === myChar);
console.log(`\n선택: ${myChar} (${filtered.length}판)`);

// ── 지금 동작 (my 로 묶음) ──
const now = buildRound(filtered, 'my');
console.log(`\n[현재] 행 ${now.rows.length}개 — 첫 컬럼 '${now.columns[0]}'`);
for (const r of now.rows) console.log('  ', r.slice(0, 5).join('\t'));

// ── 제안 (opp 로 묶음) ──
const next = buildRound(filtered, 'opp');
console.log(`\n[제안] 행 ${next.rows.length}개 — 첫 컬럼 '${next.columns[0]}'`);
const show = ['Games', 'RoundWR(%)', 'Close(%)', 'CloseWin(%)', 'ShutoutWin(%)', 'ShutoutLoss(%)'];
const idx = show.map((c) => next.columns.indexOf(c));
console.log('  상대캐릭        ' + show.map((s) => s.padStart(13)).join(''));
for (const r of next.rows) {
  const games = Number(r[next.columns.indexOf('Games')]);
  if (games < 5 && r[0] !== 'ALL') continue; // 표본 5판 미만은 접어둔다
  console.log(
    '  ' + String(r[0]).padEnd(16) + idx.map((i) => String(r[i]).padStart(13)).join(''),
  );
}
}
