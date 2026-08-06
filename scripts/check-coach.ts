// 조언(코치) 문구 자가검증 (네트워크 없음).
//
// 지키는 것은 **조용히 되돌아오는 것들**이다.
//  1. 조언에 '프레임 찾아보라'가 다시 섞이는 것. 이 파일은 레이팅이 아니라 mood 로
//     문구를 고르므로, 그런 줄이 하나 들어가면 상위권 사람에게도 그대로 나간다.
//     프레임 조회는 입문에서 끝나는 일이라 그 순간 상대를 초심자로 단정하는 게 된다.
//  2. 레이팅을 모를 때 상위권 묶음이 나가는 것. 모르면 예전 그대로여야 한다 —
//     모르는 채로 수위를 올리면 초심자에게 "위 레이팅대는 다른 게임입니다"가 나간다.
//  3. 상위권 묶음이 비어서 조용히 기본 묶음으로 돌아가는 것. 화면은 멀쩡하고
//     레이팅을 나눈 의미만 사라진다.

import { pickCoach, COACH_HIGH_MIN_RATING, type Mood } from '../app/jokes';
import type { Lang } from '../app/i18n';

let fail = 0;
const ok = (m: string) => console.log(`ok    ${m}`);
const bad = (m: string, d: string) => {
  console.error(`FAIL  ${m}\n      ${d}`);
  fail++;
};
const is = (c: boolean, m: string, d: string) => (c ? ok(m) : bad(m, d));

const MOODS: Mood[] = ['blazing', 'hot', 'steady', 'cooling', 'cold', 'frozen'];
const LANGS: Lang[] = ['ko', 'en', 'ja'];
/** 씨앗을 여러 개 돌려 묶음 전체를 훑는다(한 줄만 보고 판단하지 않게). */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7 + 1);

const lowAll: string[] = [];
const highAll: string[] = [];
for (const m of MOODS)
  for (const l of LANGS)
    for (const s of SEEDS) {
      lowAll.push(pickCoach(m, l, s, 1200));
      highAll.push(pickCoach(m, l, s, 2400));
    }

// ── 1. 프레임 권유가 없다 ───────────────────────────────────
{
  const FRAME = /프레임|프레임표|frame data|フレーム/i;
  const hitLow = [...new Set(lowAll.filter((x) => FRAME.test(x)))];
  const hitHigh = [...new Set(highAll.filter((x) => FRAME.test(x)))];
  is(hitLow.length === 0, '★ 기본 조언에 프레임 권유가 없다', `걸림: ${hitLow.join(' / ')}`);
  is(hitHigh.length === 0, '★ 상위권 조언에 프레임 권유가 없다', `걸림: ${hitHigh.join(' / ')}`);
}

// ── 2. 레이팅을 모르면 올리지 않는다 ────────────────────────
{
  let same = true;
  const diff: string[] = [];
  for (const m of MOODS)
    for (const l of LANGS)
      for (const s of SEEDS.slice(0, 10)) {
        const none = pickCoach(m, l, s);
        const low = pickCoach(m, l, s, 1200);
        if (none !== low) {
          same = false;
          diff.push(`${m}/${l}: '${none}' vs '${low}'`);
        }
      }
  is(same, '★ 레이팅을 모르면 기본 묶음이 나간다', diff.slice(0, 3).join(' | '));
}

// ── 3. 경계에서 갈린다 ──────────────────────────────────────
{
  const below = COACH_HIGH_MIN_RATING - 1;
  let split = true;
  const same: string[] = [];
  for (const m of MOODS)
    for (const s of SEEDS.slice(0, 8)) {
      const lo = pickCoach(m, 'ko', s, below);
      const hi = pickCoach(m, 'ko', s, COACH_HIGH_MIN_RATING);
      if (lo === hi) {
        split = false;
        same.push(`${m}: '${lo}'`);
      }
    }
  is(
    split,
    `★ ${COACH_HIGH_MIN_RATING} 을 경계로 묶음이 갈린다`,
    `경계 양쪽이 같다: ${same.slice(0, 2).join(' | ')}`,
  );
}

// ── 4. 상위권 묶음이 비어 있지 않다 ─────────────────────────
{
  const empty: string[] = [];
  for (const m of MOODS)
    for (const l of LANGS) {
      const got = new Set(SEEDS.map((s) => pickCoach(m, l, s, 2400)));
      if (got.size < 2 || [...got].some((x) => !x)) empty.push(`${m}/${l} (${got.size}종)`);
    }
  is(empty.length === 0, '상위권 묶음이 수위·언어마다 2줄 이상', `빈약: ${empty.join(', ')}`);
}

// ── 5. 같은 입력이면 같은 문구 (씨앗 결정성) ────────────────
{
  const a = pickCoach('steady', 'ko', 12345, 2400);
  const b = pickCoach('steady', 'ko', 12345, 2400);
  is(a === b, '같은 씨앗이면 같은 문구', `'${a}' vs '${b}'`);
}

// ── 6. steady + 승률≥50 이면 다른 풀로 갈린다 ───────────────
{
  let split = true;
  const same: string[] = [];
  for (const l of LANGS)
    for (const s of SEEDS.slice(0, 10)) {
      const plain = pickCoach('steady', l, s, 1200);
      const winning = pickCoach('steady', l, s, 1200, 55);
      if (plain === winning) {
        split = false;
        same.push(`${l}: '${plain}'`);
      }
    }
  is(
    split,
    '★ steady·승률≥50 이면 기본 steady 풀과 다른 문구가 나간다',
    `경계 양쪽이 같다: ${same.slice(0, 2).join(' | ')}`,
  );
}

// ── 7. 경계는 딱 50 (49 는 기존 풀, 50 은 새 풀) ─────────────
{
  let split = true;
  const same: string[] = [];
  for (const s of SEEDS.slice(0, 10)) {
    const below = pickCoach('steady', 'ko', s, 1200, 49);
    const plain = pickCoach('steady', 'ko', s, 1200);
    if (below !== plain) {
      split = false;
      same.push(`'${below}' vs '${plain}'`);
    }
  }
  is(split, '★ 승률 49 는 기존 steady 풀 그대로다', same.slice(0, 2).join(' | '));
}

// ── 8. winRatePct 는 steady 에서만 쓴다 (다른 무드는 무시) ──
{
  let same = true;
  const diff: string[] = [];
  for (const m of MOODS.filter((x) => x !== 'steady'))
    for (const l of LANGS)
      for (const s of SEEDS.slice(0, 5)) {
        const plain = pickCoach(m, l, s, 1200);
        const withWr = pickCoach(m, l, s, 1200, 80);
        if (plain !== withWr) {
          same = false;
          diff.push(`${m}/${l}: '${plain}' vs '${withWr}'`);
        }
      }
  is(same, 'winRatePct 는 steady 가 아니면 무시된다', diff.slice(0, 3).join(' | '));
}

// ── 9. 새 풀에도 프레임 권유가 없다 ──────────────────────────
{
  const FRAME = /프레임|프레임표|frame data|フレーム/i;
  const lowWinning: string[] = [];
  const highWinning: string[] = [];
  for (const l of LANGS)
    for (const s of SEEDS) {
      lowWinning.push(pickCoach('steady', l, s, 1200, 60));
      highWinning.push(pickCoach('steady', l, s, 2400, 60));
    }
  const hitLow = [...new Set(lowWinning.filter((x) => FRAME.test(x)))];
  const hitHigh = [...new Set(highWinning.filter((x) => FRAME.test(x)))];
  is(hitLow.length === 0, '★ 승률≥50 조언에 프레임 권유가 없다', `걸림: ${hitLow.join(' / ')}`);
  is(hitHigh.length === 0, '★ 승률≥50 상위권 조언에 프레임 권유가 없다', `걸림: ${hitHigh.join(' / ')}`);
}

// ── 10. 새 풀도 수위·언어마다 2줄 이상 ───────────────────────
{
  const empty: string[] = [];
  for (const l of LANGS) {
    const gotLow = new Set(SEEDS.map((s) => pickCoach('steady', l, s, 1200, 60)));
    const gotHigh = new Set(SEEDS.map((s) => pickCoach('steady', l, s, 2400, 60)));
    if (gotLow.size < 2 || [...gotLow].some((x) => !x)) empty.push(`기본/${l} (${gotLow.size}종)`);
    if (gotHigh.size < 2 || [...gotHigh].some((x) => !x)) empty.push(`상위권/${l} (${gotHigh.size}종)`);
  }
  is(empty.length === 0, '승률≥50 풀이 수위·언어마다 2줄 이상', `빈약: ${empty.join(', ')}`);
}

console.log(fail === 0 ? '\n전부 통과' : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
