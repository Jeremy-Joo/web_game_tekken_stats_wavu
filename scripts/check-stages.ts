// 스테이지 매핑 자가검증 (네트워크 없음).
//
// 여기가 지키는 것은 **조용히 깨지는 것들**이다. 넷 다 화면은 멀쩡하고 숫자만 틀린다.
//  1. 새 스테이지가 추가됐는데 'Unknown' 으로 뭉쳐지는 것. `#<숫자>` 로 드러나야
//     그때 한 줄 추가할 수 있다. 뭉치면 추가를 눈치 못 챈 채 집계가 섞인다.
//  2. 변형 묶기가 풀리는 것. Urban Square 가 두 줄로 갈라지면 같은 스테이지의 승률이
//     반씩 나뉜다 — 표는 멀쩡해 보인다.
//  3. **반대로 Arena 까지 묶어버리는 것.** 100/101 은 서로 다른 스테이지다
//     (빈도 실측: 각자 한 칸). 묶으면 두 스테이지가 한 줄로 합쳐진다.
//  4. 합계가 안 맞는 것. stage_id 가 없는 경기를 빼버리면 ALL 이 전체와 어긋난다.

import { STAGE_NAMES, STAGE_MERGE, stageKey, stageName } from '../lib/wavu/stages';
import { buildStage } from '../lib/tekken/aggregations';
import type { MatchRecord } from '../lib/tekken/models';

let fail = 0;
const ok = (m: string) => console.log(`ok    ${m}`);
const bad = (m: string, d: string) => {
  console.error(`FAIL  ${m}\n      ${d}`);
  fail++;
};
const is = (cond: boolean, m: string, d: string) => (cond ? ok(m) : bad(m, d));

// ── 1. 매핑 자체 ────────────────────────────────────────────
{
  const ids = Object.keys(STAGE_NAMES).map(Number);
  is(ids.length === 22, `스테이지 ${ids.length}종`, `22종이어야 한다 — 실측 표본 셋이 전부 22종이었다`);

  // 이름 중복은 곧 두 스테이지가 한 줄로 합쳐진다는 뜻이다.
  const seen = new Map<string, number>();
  const dup: string[] = [];
  for (const id of ids) {
    const n = STAGE_NAMES[id];
    if (seen.has(n)) dup.push(`${n} (${seen.get(n)}·${id})`);
    seen.set(n, id);
  }
  is(dup.length === 0, '이름이 겹치지 않는다', `겹침: ${dup.join(', ')}`);

  // 묶기 대상·목적지가 실재해야 한다.
  const badMerge = Object.entries(STAGE_MERGE).filter(
    ([from, to]) => !STAGE_NAMES[Number(from)] || !STAGE_NAMES[to],
  );
  is(badMerge.length === 0, '묶기 대상이 전부 실재한다', `이상: ${JSON.stringify(badMerge)}`);
}

// ── 2. 묶는 것과 안 묶는 것 ─────────────────────────────────
{
  is(
    stageKey(201) === 200 && stageName(201) === stageName(200),
    '★ Urban Square 두 종이 하나로 묶인다',
    `201 → ${stageKey(201)} / '${stageName(201)}' vs '${stageName(200)}'`,
  );
  is(
    stageKey(1801) === 1800 && stageName(1801) === stageName(1800),
    '★ Genmaji 두 종이 하나로 묶인다',
    `1801 → ${stageKey(1801)}`,
  );
  is(
    stageKey(101) === 101 && stageName(100) !== stageName(101),
    '★ Arena 와 Arena (Underground) 는 안 묶인다',
    `'${stageName(100)}' vs '${stageName(101)}' — 빈도상 각자 한 칸인 별개 스테이지다`,
  );
  is(
    !/\(/.test(stageName(200)) && !/\(/.test(stageName(1800)),
    '묶인 이름에서 변형 표기가 빠진다',
    `'${stageName(200)}' · '${stageName(1800)}'`,
  );
}

// ── 3. 모르는 id 는 드러난다 ────────────────────────────────
{
  is(stageName(9999) === '#9999', '모르는 id 는 #숫자 로 남는다', `'${stageName(9999)}'`);
  is(stageName(null) === '#?', 'stage_id 없음은 #? 로 남는다', `'${stageName(null)}'`);
  is(
    !/unknown/i.test(stageName(9999)),
    "'Unknown' 으로 뭉치지 않는다",
    '뭉치면 새 스테이지 추가를 못 알아챈다',
  );
}

// ── 4. 표 ───────────────────────────────────────────────────
{
  const rec = (stageId: number | null, result: 'W' | 'L'): MatchRecord =>
    ({ stageId, result }) as unknown as MatchRecord;

  const df = [
    rec(200, 'W'), rec(201, 'W'), rec(201, 'L'), // Urban Square 3경기 2승
    rec(100, 'W'), rec(101, 'L'), //               Arena 계열은 각각 1경기
    rec(null, 'L'), //                             stage_id 없음
  ];
  const t = buildStage(df);
  const row = (name: string) => t.rows.find((r) => r[0] === name);

  const us = row('Urban Square');
  is(!!us && us[1] === 3 && us[2] === 2, '★ 변형이 한 줄로 합산된다', `Urban Square 행: ${JSON.stringify(us)}`);

  is(!!row('Arena') && !!row('Arena (Underground)'), 'Arena 는 두 줄로 남는다', '한 줄로 합쳐졌다');

  is(!!row('#?'), 'stage_id 없는 경기가 표에 남는다', '빠지면 합계가 왜 안 맞는지 알 수 없다');

  const all = row('ALL');
  is(!!all && all[1] === df.length, 'ALL 이 전체 경기 수와 같다', `ALL=${all?.[1]} vs ${df.length}`);
}

console.log(fail === 0 ? '\n전부 통과' : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
