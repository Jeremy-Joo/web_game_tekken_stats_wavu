// 레이팅 백분위 자가검증 (네트워크 없음).
//
// 조용히 깨지는 것들을 지킨다 — 셋 다 숫자만 틀리고 화면은 멀쩡하다.
//  1. 분위수 배열이 오름차순이 아니면 백분위가 뒤집힌다.
//  2. 표본 밖 값에 '상위 0%'/'상위 100%'를 단정하는 것.
//  3. 방향이 뒤집히는 것 — 레이팅이 높은데 '상위 90%'로 나오는 사고.

import {
  ratingPercentile,
  RATING_BASELINE_N,
  RATING_BASELINE_AT,
} from '../lib/tekken/rating-percentile';
import { RATING_QUANTILES } from '../lib/tekken/rating-baseline';

let fail = 0;
const ok = (m: string) => console.log(`ok    ${m}`);
const bad = (m: string, d: string) => {
  console.error(`FAIL  ${m}\n      ${d}`);
  fail++;
};

// ── 1. 분위수 배열 자체 ──────────────────────────────────
{
  RATING_QUANTILES.length === 101
    ? ok('분위수 101개 (0~100)')
    : bad('분위수 개수', `${RATING_QUANTILES.length}개 — 0·1·…·100 이어야 한다`);

  let sorted = true;
  for (let i = 1; i < RATING_QUANTILES.length; i++)
    if (RATING_QUANTILES[i] < RATING_QUANTILES[i - 1]) sorted = false;
  sorted
    ? ok('분위수가 오름차순')
    : bad('분위수 정렬', '내림가는 구간이 있다 — 백분위가 뒤집힌다');

  RATING_BASELINE_N >= 1000
    ? ok(`표본 ${RATING_BASELINE_N.toLocaleString()}명`)
    : bad('표본 크기', `${RATING_BASELINE_N}명 — 너무 적다`);

  /^\d{4}-\d{2}-\d{2}$/.test(RATING_BASELINE_AT)
    ? ok(`수집 시점 ${RATING_BASELINE_AT}`)
    : bad('수집 시점', `'${RATING_BASELINE_AT}' — 화면에 낼 수 없는 형식`);
}

// ── 2. 방향 — 높을수록 상위여야 한다 ─────────────────────
{
  const lo = ratingPercentile(RATING_QUANTILES[10]);
  const mid = ratingPercentile(RATING_QUANTILES[50]);
  const hi = ratingPercentile(RATING_QUANTILES[90]);
  lo && mid && hi && lo.top > mid.top && mid.top > hi.top
    ? ok(`방향 정상 (${lo.top}% > ${mid.top}% > ${hi.top}%)`)
    : bad('방향', `레이팅이 높을수록 top 이 작아야 한다 — ${lo?.top}/${mid?.top}/${hi?.top}`);

  const m = ratingPercentile(RATING_QUANTILES[50]);
  m && Math.abs(m.top - 50) <= 1
    ? ok(`중앙값이 상위 ${m.top}%`)
    : bad('중앙값', `상위 ${m?.top}% — 50 근처여야 한다`);

  const q75 = ratingPercentile(RATING_QUANTILES[75]);
  q75 && Math.abs(q75.top - 25) <= 1
    ? ok(`75분위가 상위 ${q75.top}%`)
    : bad('75분위', `상위 ${q75?.top}%`);
}

// ── 3. top + below = 100 ─────────────────────────────────
{
  let bidirectional = true;
  for (const r of [1200, 1400, 1500, 1600, 1800, 2000]) {
    const p = ratingPercentile(r);
    if (p && Math.abs(p.top + p.below - 100) > 0.2) bidirectional = false;
  }
  bidirectional ? ok('top + below = 100') : bad('top/below', '합이 100이 아니다');
}

// ── 4. 표본 밖은 단정하지 않는다 ─────────────────────────
{
  const low = ratingPercentile(RATING_QUANTILES[0] - 500);
  low?.clamped === 'low'
    ? ok("표본 최저 아래 → clamped='low'")
    : bad('하한 밖', `clamped=${low?.clamped} — 표본 밖임을 밝혀야 한다`);

  const high = ratingPercentile(RATING_QUANTILES[100] + 500);
  high?.clamped === 'high'
    ? ok("표본 최고 위 → clamped='high'")
    : bad('상한 밖', `clamped=${high?.clamped}`);

  const inside = ratingPercentile(RATING_QUANTILES[50]);
  inside?.clamped === null
    ? ok('표본 안 → clamped 없음')
    : bad('표본 안', `clamped=${inside?.clamped} — 안쪽인데 밖으로 표시됐다`);
}

// ── 5. 못 내는 입력은 null ───────────────────────────────
{
  ratingPercentile(0) === null && ratingPercentile(NaN) === null
    ? ok('레이팅 0·NaN → null (0% 로 안 채운다)')
    : bad('잘못된 입력', '0 이나 NaN 에 값을 만들어냈다');
}

console.log(fail === 0 ? '\n전부 통과' : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
