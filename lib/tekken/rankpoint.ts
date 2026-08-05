// 랭크 포인트(단위 포인트) 복원.
//
// ── 왜 복원인가 ──────────────────────────────────────────────────────
// wavu 는 랭크 포인트를 주지 않는다. `/replays` JSON 24개 필드, `?_format=json`,
// `/player/<id>` HTML(593KB) 전수 확인 — 어디에도 없다. `rating`(2,543 급)은
// 완전히 다른 척도다(실제 랭크 포인트는 407,700 급).
//
// 그런데 **랭크 포인트는 0~999,999 연속값이고 단은 그 값의 구간일 뿐**이다.
// 그래서 단이 바뀐 경기 = 점수가 경계를 넘은 순간 = **정확한 앵커**가 된다.
// wavu 는 모든 경기의 단을 주므로 앵커를 전부 알 수 있다. 남는 건 앵커 이후
// 경기들의 증감뿐이고, 그건 과거 세그먼트들로 적합할 수 있다.
//
// ── 반드시 캐릭터별로 ────────────────────────────────────────────────
// 단은 캐릭터마다 따로다. 섞으면 34단 -> 36단 같은 도약이 생겨 앵커가 망가진다.
//
// ── 왜 승점 = 패점인가 ───────────────────────────────────────────────
// 처음에는 승/패 점수를 따로 적합했는데(2파라미터) 값이 들쭉날쭉했고, 패점이
// 승점보다 큰 단이 여럿 나왔다. 그러면 5할 승률인 사람이 계속 떨어진다는 뜻이라
// 매칭 평형과 모순이다. 실제로 적합된 승/패 비는 대부분 1.00 근처(0.82~1.07)였다.
//
// 그래서 **승점 = 패점** 으로 묶어 한 파라미터만 적합한다. 오차가 크게 줄었다:
//   30단 -46% · 31단 -50% · 35단 -84% · 28단 -19% · 27단 -13%
// 화면에 숫자가 나오는 비율도 46% -> 71% 로 올랐다(15명, 캐릭터 235개 기준).
//
// ── 정확도 (2026-08-05 실측) ─────────────────────────────────────────
// 15명 pooled, 세그먼트 18,644개. medianErr 는 그 단 세그먼트 적합의 중앙오차(점).
//
// 36·37단은 대부분 들어온 경계로 되돌아 나가 순증이 0이라 적합이 안 된다.
// BASEBALL LOVE 실측(36단, 승단 후 40승 5패 -> 407,700)에서 역산한 220을 쓴다.
// **표본 1개짜리 보정이라 독립 검증이 아니다.** 다른 계정으로 확인이 필요하다.

export interface RankBand {
  id: number;
  min: number;
  max: number;
}

export const RANK_BANDS: readonly RankBand[] = [
  { id: 0, min: 0, max: 3999 }, { id: 1, min: 4000, max: 7999 },
  { id: 2, min: 8000, max: 11999 }, { id: 3, min: 12000, max: 16999 },
  { id: 4, min: 17000, max: 21999 }, { id: 5, min: 22000, max: 26999 },
  { id: 6, min: 27000, max: 32999 }, { id: 7, min: 33000, max: 38999 },
  { id: 8, min: 39000, max: 44999 }, { id: 9, min: 45000, max: 50999 },
  { id: 10, min: 51000, max: 56999 }, { id: 11, min: 57000, max: 62999 },
  { id: 12, min: 63000, max: 69999 }, { id: 13, min: 70000, max: 76999 },
  { id: 14, min: 77000, max: 83999 }, { id: 15, min: 84000, max: 93999 },
  { id: 16, min: 94000, max: 103999 }, { id: 17, min: 104000, max: 113999 },
  { id: 18, min: 114000, max: 124999 }, { id: 19, min: 125000, max: 135999 },
  { id: 20, min: 136000, max: 146999 }, { id: 21, min: 147000, max: 158999 },
  { id: 22, min: 159000, max: 170999 }, { id: 23, min: 171000, max: 182999 },
  { id: 24, min: 183000, max: 194999 }, { id: 25, min: 195000, max: 207999 },
  { id: 26, min: 208000, max: 221999 }, { id: 27, min: 222000, max: 236999 },
  { id: 28, min: 237000, max: 252999 }, { id: 29, min: 253000, max: 274999 },
  { id: 30, min: 275000, max: 294999 }, { id: 31, min: 295000, max: 314999 },
  { id: 32, min: 315000, max: 334999 }, { id: 33, min: 335000, max: 354999 },
  { id: 34, min: 355000, max: 374999 }, { id: 35, min: 375000, max: 399999 },
  { id: 36, min: 400000, max: 429999 }, { id: 37, min: 430000, max: 999999 },
];

/**
 * 단별 1경기 점수(승리 +delta, 패배 -delta). `scripts/check-rankpoint.ts` 가 갱신한다.
 * `medianErr` 는 세그먼트 적합의 중앙오차로, 화면 표기 정밀도를 정하는 데 쓴다.
 */
export interface PointModel {
  delta: number;
  medianErr: number;
  /** 자체 적합이 안 돼 다른 근거로 넣은 값 */
  calibrated?: boolean;
}

export const POINT_MODEL: Readonly<Record<number, PointModel>> = {
  24: { delta: 1169, medianErr: 1478 },
  25: { delta: 1068, medianErr: 1948 },
  26: { delta: 1001, medianErr: 2000 },
  27: { delta: 894, medianErr: 1786 },
  28: { delta: 779, medianErr: 1557 },
  29: { delta: 389, medianErr: 388 },
  30: { delta: 637, medianErr: 638 },
  31: { delta: 598, medianErr: 597 },
  32: { delta: 801, medianErr: 1601 },
  33: { delta: 924, medianErr: 1847 },
  34: { delta: 688, medianErr: 1376 },
  35: { delta: 106, medianErr: 212 },
  36: { delta: 220, medianErr: 1500, calibrated: true },
  37: { delta: 220, medianErr: 2500, calibrated: true },
};

export function bandOf(rankId: number): RankBand {
  return RANK_BANDS[rankId] ?? RANK_BANDS[RANK_BANDS.length - 1];
}

/** 이 모듈이 필요로 하는 최소 경기 정보. wavu 리플레이에서 뽑아 넣는다. */
export interface RankMatch {
  battleAt: number;
  charaId: number;
  rank: number;
  won: boolean;
}

export type Confidence = 'exact' | 'good' | 'rough' | 'none';

/** 추정 불가 사유. 화면 문구는 3개 국어라 코드로 넘기고 표시는 UI 가 맡는다. */
export type ReasonCode =
  | 'no-matches'
  | 'no-transition'
  | 'rank-jump'
  | 'no-model'
  | 'out-of-band'
  | 'too-far';

export interface RankPointEstimate {
  rankId: number;
  band: RankBand;
  /** 추정 점수. confidence 가 'none' 이면 null. */
  score: number | null;
  /** 다음 단까지 남은 추정 점수. */
  toNext: number | null;
  /** 구간 진행률 0~1. */
  progress: number | null;
  /** 추정 오차(점). 표기 정밀도를 정하는 값. */
  errorMargin: number | null;
  confidence: Confidence;
  /** 마지막 단 변동 이후 전적 — 이건 추정이 아니라 사실이다. */
  sinceAnchor: { matches: number; wins: number; losses: number } | null;
  reasonCode?: ReasonCode;
}

/**
 * 한 캐릭터의 경기 이력에서 현재 랭크 포인트를 추정한다.
 * `matches` 는 **그 캐릭터의 경기만** 담겨야 한다(단은 캐릭터별).
 */
export function estimateRankPoints(matches: RankMatch[]): RankPointEstimate {
  const seq = [...matches].sort((a, b) => a.battleAt - b.battleAt);

  if (seq.length === 0) {
    return {
      rankId: 0, band: bandOf(0), score: null, toNext: null, progress: null,
      errorMargin: null, confidence: 'none', sinceAnchor: null, reasonCode: 'no-matches',
    };
  }

  const rankId = seq[seq.length - 1].rank;
  const band = bandOf(rankId);
  const none = (reasonCode: ReasonCode): RankPointEstimate => ({
    rankId, band, score: null, toNext: null, progress: null,
    errorMargin: null, confidence: 'none', sinceAnchor: null, reasonCode,
  });

  // 마지막 단 변동 지점 = 앵커. 그 직후 점수가 경계값이다.
  let anchorAt = -1;
  for (let i = 1; i < seq.length; i++) if (seq[i].rank !== seq[i - 1].rank) anchorAt = i;
  if (anchorAt < 0) return none('no-transition');

  const prev = seq[anchorAt - 1].rank;
  const cur = seq[anchorAt].rank;
  // 단이 한 칸 넘게 뛰었으면 그 사이 경기가 빠진 것이다. 기준점(경계를 지났다는 사실)
  // 자체는 살아 있으므로 버리지 않고, 아래에서 오차를 크게 잡는다.
  const jumped = Math.abs(cur - prev) !== 1;

  // 승단이면 새 구간의 하한, 강등이면 새 구간의 상한을 막 지난 것이다.
  const anchorScore = cur > prev ? bandOf(cur).min : bandOf(cur).max;

  const after = seq.slice(anchorAt);
  const wins = after.filter((m) => m.won).length;
  const losses = after.length - wins;
  const sinceAnchor = { matches: after.length, wins, losses };

  const model = POINT_MODEL[rankId];
  if (!model) {
    return { ...none('no-model'), sinceAnchor };
  }

  const raw = anchorScore + (wins - losses) * model.delta;

  // 구간 밖은 있을 수 없다 — 나갔다면 이미 단이 바뀌었어야 한다. 그래도 **숨기지 않는다.**
  // 참값이 구간 안이라는 것은 확실하므로 경계로 당기는 편이 아무것도 안 보여주는 것보다 낫다.
  // 대신 어긋난 만큼을 오차에 그대로 더해 "이만큼 안 맞는다"를 드러낸다.
  const width = band.max - band.min + 1;
  const score = Math.min(band.max, Math.max(band.min, Math.round(raw)));
  const clampedBy = Math.abs(raw - score);

  // 경기당 오차가 무작위로 쌓인다고 보고 sqrt(n) 으로 누적시킨다.
  const statistical = 0.35 * model.delta * Math.sqrt(Math.max(1, after.length));
  // 단이 건너뛰었으면 그 사이 경기가 빠졌다는 뜻이라 기준점 자체가 흔들린다.
  const gapPenalty = jumped ? width * 0.15 : 0;

  const errorMargin = Math.min(
    Math.round(width / 2),
    Math.round(statistical + clampedBy + gapPenalty),
  );

  const confidence: Confidence = errorMargin <= width * 0.03 ? 'good' : 'rough';

  return {
    rankId, band, score,
    toNext: rankId >= 37 ? null : band.max + 1 - score,
    progress: (score - band.min) / width,
    errorMargin, confidence, sinceAnchor,
    // 숫자는 내보내되 왜 덜 믿을 만한지는 같이 알린다.
    reasonCode: jumped ? 'rank-jump' : clampedBy > statistical ? 'out-of-band' : undefined,
  };
}

/**
 * 오차에 맞춰 유효숫자를 줄인다. `407,xxx` 같은 자리 가림 대신
 * **자릿수 자체가 신뢰도를 말하게** 한다.
 *   오차 <1,000  → 407,700   (정확)
 *   오차 <5,000  → 408,000   (천 단위)
 *   그 이상       → 410,000   (만 단위)
 *
 * 표기(약/≈/約, 만/K)는 언어마다 다르므로 **UI 가 맡는다.** 여기서는 값과
 * 어느 자리까지 믿을 수 있는지만 돌려준다.
 */
export type Precision = 'exact' | 'thousand' | 'tenThousand';

export function roundForDisplay(
  score: number,
  errorMargin: number,
): { value: number; precision: Precision } {
  if (errorMargin < 1000) return { value: score, precision: 'exact' };
  if (errorMargin < 5000) return { value: Math.round(score / 1000) * 1000, precision: 'thousand' };
  return { value: Math.round(score / 10000) * 10000, precision: 'tenThousand' };
}
