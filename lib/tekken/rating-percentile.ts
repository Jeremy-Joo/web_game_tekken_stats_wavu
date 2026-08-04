// 레이팅 → "상위 몇 %".
//
// ⚠ **제품에서 쓰지 않는다.** 요약 카드에 '상위 38.9%' 배지로 한 번 붙였다가 뺐다.
//   app/ 어디서도 import 하지 않으며 npm run check 에도 연결돼 있지 않다.
//   남겨둔 이유는 hexagon.ts 와 같다 — 다시 꺼낼 때 처음부터 하지 않기 위해서고,
//   여기서 정한 판단(표본·시점을 감추지 않는다, 표본 밖은 단정하지 않는다)은
//   다른 지표를 만들 때도 그대로 쓰인다.
//   기준값을 다시 뽑으려면: npx tsx scripts/build-rating-baseline.ts <창수>
//
// ── 이건 왜 인구 데이터를 써도 되나 (hexagon.ts 와 반대로 보이는 이유) ──────
// hexagon.ts 에서는 백분위를 걷어냈다. 거기서는 **개인 지표를 남과 비교해 점수로
// 만든 것**이 문제였다 — 조회자가 한 판도 안 쳤는데 모집단이 바뀌면 '실력 91.8'이
// 달라졌다. 지표의 뜻이 인구에 의존할 이유가 없는데 의존하고 있었다.
//
// 여기는 반대다. **"상위 몇 %"는 인구 비교가 곧 정의**다. 모집단이 바뀌면 값이
// 바뀌는 게 정상이고, 그걸 감추지만 않으면 된다. 그래서 화면은 반드시
// 표본 수·수집 시점·"활동 중인 플레이어 기준"을 같이 낸다.
//
// 표본도 급이 다르다: 헥사곤은 80명이었고 이건 37,000명대다(wavu 전체 리플레이 피드).
//
// ── 안 만든 것: 단(rank) 백분위 ──────────────────────────────────────
// "GOD 1 = 상위 10.74%" 같은 표가 밖에 있지만 **랭크 이름 기준**이다.
// 우리가 가진 건 숫자(myRank)뿐이고 wavu 는 이름을 어디에도 안 준다
// (플레이어 HTML·API 문서 다 확인). 번호↔이름을 추측해 이으면
// CLAUDE.md 가 스테이지에서 금지한 것과 같은 짓이 된다 —
// **매핑이 확보되기 전에는 만들지 말 것.** 레이팅은 그 문제가 없어 이쪽으로 냈다.

import { RATING_QUANTILES, RATING_BASELINE_N, RATING_BASELINE_AT } from './rating-baseline';

export { RATING_BASELINE_N, RATING_BASELINE_AT };

export interface RatingRank {
  /** 상위 몇 % 인가. 1.0 이면 상위 1%. 작을수록 위. */
  top: number;
  /** 나보다 낮은 사람의 비율(0~100). top = 100 - below. */
  below: number;
  /** 표본의 최저/최고를 벗어났는가 — 그때는 '상위 0.x%' 처럼 단정하면 안 된다. */
  clamped: 'low' | 'high' | null;
}

/**
 * 레이팅의 백분위. 분위수 배열(0·1·…·100)에서 선형보간으로 찾는다.
 *
 * 표본 밖으로 나가면 `clamped` 가 붙는다 — 최고 표본보다 높은 사람에게
 * "상위 0%"라고 말할 수는 없다. 화면이 이걸 보고 표현을 바꾼다.
 */
export function ratingPercentile(rating: number): RatingRank | null {
  const q = RATING_QUANTILES;
  if (!Number.isFinite(rating) || rating <= 0 || q.length < 2) return null;

  if (rating <= q[0]) return { top: 100, below: 0, clamped: 'low' };
  if (rating >= q[q.length - 1]) return { top: 0, below: 100, clamped: 'high' };

  const step = 100 / (q.length - 1);
  for (let i = 1; i < q.length; i++) {
    if (rating <= q[i]) {
      const span = q[i] - q[i - 1];
      const frac = span > 0 ? (rating - q[i - 1]) / span : 0;
      const below = (i - 1) * step + frac * step;
      return {
        below: Math.round(below * 10) / 10,
        top: Math.round((100 - below) * 10) / 10,
        clamped: null,
      };
    }
  }
  return { top: 0, below: 100, clamped: 'high' };
}
