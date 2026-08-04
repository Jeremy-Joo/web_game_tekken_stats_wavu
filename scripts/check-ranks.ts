// 계급(rank) 매핑 자가검증 (네트워크 없음).
//
// 여기가 지키는 것은 **조용히 깨지는 것들**이다. 셋 다 화면은 멀쩡하고 값만 틀린다.
//  1. 이름이 겹치는 것. rankIndex 가 이름→숫자로 되돌리는데(승단 그래프가 쓴다),
//     이름이 겹치면 엉뚱한 계급으로 되돌아가 계단선이 딴 데로 튄다.
//  2. 목록 길이가 흔들리는 것. 0~37 이 전부라는 근거가 ranks.ts 주석에 있다.
//     시즌4 로 늘어난다면 이 검사가 먼저 걸려서, 근거를 다시 적게 만든다.
//  3. 왕복이 깨지는 것. 표는 이름을 싣고 그래프는 숫자를 쓰므로,
//     rankName → rankIndex 가 제자리로 돌아오지 않으면 그래프가 조용히 어긋난다.

import { RANK_NAMES, rankName, rankIndex } from '../lib/wavu/ranks';
import { buildRankHistory } from '../lib/tekken/aggregations';
import type { MatchRecord } from '../lib/tekken/models';

let fail = 0;
const ok = (m: string) => console.log(`ok    ${m}`);
const bad = (m: string, d: string) => {
  console.error(`FAIL  ${m}\n      ${d}`);
  fail++;
};
const is = (cond: boolean, m: string, d: string) => (cond ? ok(m) : bad(m, d));

// ── 1. 매핑 자체 ────────────────────────────────────────────
is(
  RANK_NAMES.length === 38,
  `계급 ${RANK_NAMES.length}종`,
  '0~37 = 38종이어야 한다 — tlounge /ranks/37.webp 는 200, 38.webp 는 404 였다',
);

{
  const seen = new Map<string, number>();
  for (let i = 0; i < RANK_NAMES.length; i++) {
    const n = RANK_NAMES[i];
    const prev = seen.get(n);
    if (prev != null) bad('이름이 겹친다', `${prev} 와 ${i} 가 둘 다 '${n}'`);
    seen.set(n, i);
  }
  if (seen.size === RANK_NAMES.length) ok('이름이 전부 다르다 (rankIndex 가 되돌릴 수 있다)');
}

// 경계 — 두 출처가 일치하는 지점과, 이미지로만 확인한 구간의 양 끝.
is(RANK_NAMES[28] === 'Tekken God Supreme', '28 = Tekken God Supreme', `실제: ${RANK_NAMES[28]}`);
is(RANK_NAMES[29] === 'God of Destruction', '29 = God of Destruction', `실제: ${RANK_NAMES[29]}`);
is(RANK_NAMES[30] === 'God of Destruction I', '30 = God of Destruction I', `실제: ${RANK_NAMES[30]}`);
is(RANK_NAMES[37] === 'God of Destruction ∞', '37 = God of Destruction ∞', `실제: ${RANK_NAMES[37]}`);

// ── 2. 왕복 ────────────────────────────────────────────────
{
  let broken = 0;
  for (let i = 0; i < RANK_NAMES.length; i++) if (rankIndex(rankName(i)) !== i) broken++;
  is(broken === 0, '이름 → 숫자 왕복이 전부 제자리다', `${broken}개가 어긋난다`);
}

// 모르는 번호는 숫자를 그대로 낸다 — 시즌4 가 와도 화면에서 정보가 사라지지 않게.
is(rankName(99) === '99', '모르는 번호는 숫자로 나온다', `실제: ${rankName(99)}`);
is(rankIndex('99') === 99, '그 숫자도 되돌아간다', `실제: ${rankIndex('99')}`);
is(rankName(null) === '', 'null 은 빈 문자열', `실제: '${rankName(null)}'`);

// ── 3. 승단 이력 표가 이름을 싣는가 ──────────────────────────
{
  // 27 → 28 로 한 번 올라가는 최소 전적.
  const mk = (i: number, rank: number): MatchRecord =>
    ({
      dt: new Date(Date.UTC(2026, 0, 1, i)),
      myChar: 'Jack-8',
      oppChar: 'Jin',
      oppName: 'opp',
      oppPolaris: 'oppid0000000',
      result: 'W',
      myRating: 1500 + i,
      oppRating: 1500,
      myRounds: 3,
      oppRounds: 1,
      season: 'S3',
      gameVersion: 30101,
      myRank: rank,
      oppRank: rank,
      myPower: 300000,
    }) as MatchRecord;

  const t = buildRankHistory([mk(0, 27), mk(1, 27), mk(2, 28)]);
  const row = t.rows[0];
  is(row != null, '승단 이력이 한 줄 나온다', '이벤트가 안 잡혔다');
  if (row) {
    is(row[1] === 'Tekken God', "From 이 'Tekken God'", `실제: ${String(row[1])}`);
    is(row[2] === 'Tekken God Supreme', "To 가 'Tekken God Supreme'", `실제: ${String(row[2])}`);
    is(row[3] === '▲ 승단', '승단으로 판정한다', `실제: ${String(row[3])}`);
  }
}

// 강등 판정이 이름 사전순으로 뒤집히지 않는가 —
// 'God of Destruction II' < 'God of Destruction I' 라 이름으로 비교하면 거꾸로 간다.
{
  const mk = (i: number, rank: number): MatchRecord =>
    ({
      dt: new Date(Date.UTC(2026, 0, 2, i)),
      myChar: 'Jin',
      oppChar: 'Paul',
      oppName: 'opp',
      oppPolaris: 'oppid0000001',
      result: 'L',
      myRating: 1900 - i,
      oppRating: 1900,
      myRounds: 1,
      oppRounds: 3,
      season: 'S3',
      gameVersion: 30101,
      myRank: rank,
      oppRank: rank,
      myPower: 400000,
    }) as MatchRecord;

  const t = buildRankHistory([mk(0, 30), mk(1, 30), mk(2, 31)]);
  const row = t.rows[0];
  if (row) {
    is(
      row[3] === '▲ 승단',
      'GoD I → II 를 승단으로 본다 (이름 사전순에 안 속는다)',
      `실제: ${String(row[3])} — ${String(row[1])} → ${String(row[2])}`,
    );
  }
}

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
if (fail) process.exit(1);
