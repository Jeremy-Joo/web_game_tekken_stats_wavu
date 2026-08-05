// 플레이어 인덱스 위에서 하는 검색 — "승률 비슷한/정반대인 사람", "장기전 패턴".
//
// ── 육각형에서 이걸로 바꾼 이유 (2026-08-06) ──────────────────────────
// 처음엔 hexagon.ts 의 6축 거리로 찾았다. 그런데 원했던 건 "승률이 비슷하거나
// 정반대인 사람"·"장기전에서 승률이 오르내리는 사람"이었고, 이건 육각형 축이
// **일부러 지우도록 설계된 값**이다. 어려운 도구로 돌아가서 부정확하게
// 도달하고 있었다 — 승률을 보고 싶으면 승률을 그냥 보면 된다.
//
// ── 왜 승률은 캐릭터별인데 장기전은 계정 전체인가 ───────────────────────
// 승률은 그 캐릭터 판만 세면 그만이라 캐릭터로 잘라도 안 왜곡된다. 장기전
// 패턴(stopAfter/dropPp/riseAfter/risePp)은 '세션'이라는 시간 구조에 기대는
// 값이라, 캐릭터로 잘라내면 왜곡된다 — 한 세션에 로우→리→로우로 바꿔가며
// 쳤는데 로우만 걸러내면 이어진 세션이 캐릭터 바뀐 지점마다 끊긴 것처럼
// 계산된다. 그래서 장기전 필터는 계정 전체 값(player-index.ts 의 stopAfter
// 등)을 그대로 쓴다 — 여기서 다시 계산하지 않는다.
//
// ── '상승' 필터를 쓸 때 주의 ──────────────────────────────────────────
// advice.ts 머리말의 경고가 그대로 적용된다: 이기고 있으면 계속 치고 지면
// 그만두는 경향 때문에 뒷구간 승률이 높게 나오는 건 흔한 현상이고, 그게
// '몸이 풀려서 더 잘한다'는 뜻은 아니다. 화면에서 이 경고를 같이 보여줄 것.
//
// ── 판수·레이팅 대역을 추가한 이유 (2026-08-06) ──────────────────────
// 승률만 보면 완전히 다른 실력대 사람도 "비슷하다"고 나올 수 있다 — 초심자
// 구간에서 55% 와 파괴신 구간에서 55% 는 같은 숫자지만 같은 실력이 아니다.
// 레이팅은 **방향을 안 가리고 대역으로** 막는다(낮은 쪽만 배제하지 않는다) —
// "나보다 낮으면 이상하다"고 예외 처리하면 어디까지 낮아야 걸러지는지
// 기준이 애매해진다. 대역을 좁게 잡으면 낮은 쪽이든 높은 쪽이든 크게
// 어긋난 사람은 애초에 후보에 안 들어온다 — 더 단순하고 결과도 같다.
// 판수(gamesBand)는 계정 전체 판수다 — charGamesBand(그 캐릭터 판수)와는
// 다른 목적이다: 이건 '경험치'가 비슷한 사람을 찾는 것이다.
//
// ── 캐릭터 판수를 문턱값 대신 대역으로 바꾼 이유 (2026-08-06) ───────────
// 처음엔 "그 캐릭터로 20판 이상이면 통과"였다. 그런데 20판짜리 승률과
// 10,000판짜리 승률은 숫자가 같아도 신뢰도가 다르다 — 20판이면 진짜 실력은
// 표본 오차로 넓게 흔들리고, 10,000판이면 거의 확정된 값이다. 문턱값은
// 그 차이를 무시하고 둘을 같은 무게로 비교해버린다. 신뢰구간을 계산해
// 보정하는 방법도 있지만, 그건 결국 '진짜 승률을 추정'하는 것이고 이
// 사이트는 추정값을 쓰지 않는다(랭크 포인트 추정 기능을 정확하지 않다는
// 이유로 철회한 전례가 있다). 대신 판수·레이팅과 같은 방식을 쓴다 — 내
// 판수 근처 사람만 후보로 본다. 20판인 내게는 20판 근처 사람만, 10,000판인
// 내게는 10,000판 근처 사람만 비교 대상이 된다 — 표본 크기가 다르면 애초에
// 비교 대상에 들어오지 않는다.

import type { PlayerIndexRow } from './player-index';

export type CharGamesBand = 10 | 20 | 30 | 0; // 0 = 무관
export type GamesBand = 10 | 20 | 30 | 0; // 0 = 무관
export type RatingBand = 100 | 200 | 300 | 0; // 0 = 무관
export type SessionTrend = 'any' | 'declining' | 'rising';
export type Recency = 'month' | 'patch' | 'all';
export type Direction = 'similar' | 'opposite';

export interface SimilarityQuery {
  /** 비교 기준 캐릭터. 보통 조회자의 최근 캐릭터. */
  charaId: string;
  /** 그 캐릭터에서 조회자의 승률(0~100). */
  myWinRate: number;
  /** 조회자가 그 캐릭터로 친 판수. charGamesBand 의 기준. */
  myCharGames: number;
  /** 조회자의 통산 판수(계정 전체). gamesBand 의 기준. */
  myGames: number;
  /** 조회자의 현재 레이팅. ratingBand 의 기준. */
  myRating: number;
  direction: Direction;
  /** 그 캐릭터 판수가 내 판수의 ±N% 안이어야 한다 — 승률의 표본 크기(신뢰도)를
   *  맞춘다. 0 이면 무관. */
  charGamesBand: CharGamesBand;
  /** 통산 판수가 내 판수의 ±N% 안이어야 한다. 0 이면 무관. */
  gamesBand: GamesBand;
  /** 레이팅이 내 레이팅의 ±N 안이어야 한다. 0 이면 무관. */
  ratingBand: RatingBand;
  sessionTrend: SessionTrend;
  recency: Recency;
  /**
   * '이번 패치' 판정 기준. player-index.ts 의 currentVersionOf(index) 로
   * 호출부가 한 번만 계산해 넘긴다 — 풀 안 행마다 다시 계산하면 O(n²) 다.
   */
  currentVersion: number;
  /** 결과에서 뺄 ID (자기 자신) */
  excludeId?: string;
}

export interface SimilarityResult {
  row: PlayerIndexRow;
  charGames: number;
  /** 그 캐릭터 최근 승률(최근 100판 이내, 표본이 적으면 그만큼). */
  charWinRate: number;
  /** |charWinRate - myWinRate|, %p. */
  wrDiff: number;
}

const NOW_S = () => Math.floor(Date.now() / 1000);
const MONTH_S = 30 * 86400;
/** charGamesBand 를 완화할 때 다음으로 넓어질 단계. */
const LOOSER_CHAR_GAMES: Record<CharGamesBand, CharGamesBand | null> = { 10: 20, 20: 30, 30: 0, 0: null };
/** gamesBand 를 완화할 때 다음으로 넓어질 단계. */
const LOOSER_GAMES: Record<GamesBand, GamesBand | null> = { 10: 20, 20: 30, 30: 0, 0: null };
/** ratingBand 를 완화할 때 다음으로 넓어질 단계. */
const LOOSER_RATING: Record<RatingBand, RatingBand | null> = { 100: 200, 200: 300, 300: 0, 0: null };

function withinRecency(row: PlayerIndexRow, recency: Recency, currentVersion: number): boolean {
  if (recency === 'all') return true;
  if (recency === 'month') return NOW_S() - row.lastPlayed <= MONTH_S;
  return row.lastVersion === currentVersion;
}

function withinSessionTrend(row: PlayerIndexRow, trend: SessionTrend): boolean {
  if (trend === 'any') return true;
  if (trend === 'declining') return row.dropPp != null && row.dropPp > 0;
  return row.risePp != null && row.risePp > 0; // 'rising'
}

function withinPercentBand(value: number, center: number, band: 10 | 20 | 30 | 0): boolean {
  if (band === 0) return true;
  const lo = center * (1 - band / 100);
  const hi = center * (1 + band / 100);
  return value >= lo && value <= hi;
}

function withinRatingBand(rowRating: number, myRating: number, band: RatingBand): boolean {
  if (band === 0) return true;
  return Math.abs(rowRating - myRating) <= band;
}

/**
 * rows 를 필터링하고 승률 차이순으로 정렬한다.
 * similar 는 차이 오름차순(가까운 순), opposite 는 내림차순(먼 순).
 * 결과가 비어도 예외를 던지지 않는다 — 대역을 각각 한 단계씩 완화하면 몇 명이
 * 더 나오는지도 같이 계산해, 호출부가 "표본 N명 중 조건에 맞는 사람 없음"과
 * 완화 힌트를 정직하게 말할 수 있게 한다.
 */
export function findSimilar(
  rows: PlayerIndexRow[],
  q: SimilarityQuery,
): {
  results: SimilarityResult[];
  wouldMatchWithLooserCharGamesBand: number;
  wouldMatchWithLooserGamesBand: number;
  wouldMatchWithLooserRatingBand: number;
} {
  const basePool = rows.filter(
    (r) =>
      r.id !== q.excludeId &&
      withinRecency(r, q.recency, q.currentVersion) &&
      withinSessionTrend(r, q.sessionTrend),
  );

  const scoreAt = (charGamesBand: number, gamesBand: number, ratingBand: number): SimilarityResult[] => {
    const out: SimilarityResult[] = [];
    for (const row of basePool) {
      const c = row.chars[q.charaId];
      if (!c) continue;
      if (!withinPercentBand(c.games, q.myCharGames, charGamesBand as CharGamesBand)) continue;
      if (!withinPercentBand(row.games, q.myGames, gamesBand as GamesBand)) continue;
      if (!withinRatingBand(row.rating, q.myRating, ratingBand as RatingBand)) continue;
      const wrDiff = Math.round(Math.abs(c.wrRecent - q.myWinRate) * 10) / 10;
      out.push({ row, charGames: c.games, charWinRate: c.wrRecent, wrDiff });
    }
    return out;
  };

  const scored = scoreAt(q.charGamesBand, q.gamesBand, q.ratingBand);
  scored.sort((a, b) => (q.direction === 'similar' ? a.wrDiff - b.wrDiff : b.wrDiff - a.wrDiff));

  // 세 대역을 각각 하나씩만 완화해본다(동시에 다 풀지 않는다) — "어느 걸
  // 완화해야 결과가 느는지"를 따로 알 수 있어야 사용자가 정확히 조절할 수 있다.
  const looserCharGames = LOOSER_CHAR_GAMES[q.charGamesBand];
  const wouldMatchWithLooserCharGamesBand =
    looserCharGames == null ? 0 : scoreAt(looserCharGames, q.gamesBand, q.ratingBand).length - scored.length;

  const looserGames = LOOSER_GAMES[q.gamesBand];
  const wouldMatchWithLooserGamesBand =
    looserGames == null ? 0 : scoreAt(q.charGamesBand, looserGames, q.ratingBand).length - scored.length;

  const looserRating = LOOSER_RATING[q.ratingBand];
  const wouldMatchWithLooserRatingBand =
    looserRating == null ? 0 : scoreAt(q.charGamesBand, q.gamesBand, looserRating).length - scored.length;

  return {
    results: scored,
    wouldMatchWithLooserCharGamesBand,
    wouldMatchWithLooserGamesBand,
    wouldMatchWithLooserRatingBand,
  };
}
