// 플레이어 인덱스 위에서 하는 유사도 검색 — "비슷한 유형" / "반대 유형".
//
// hexagon.ts 의 육각형 6축(절대 눈금, 늘 참인 특성)을 그대로 쓴다. 축이
// 서로 독립이라 유클리드 거리가 '모양이 닮았는가'를 실제로 잰다 — 승률
// 하나로 재면 실력만 갈리고 성향은 안 갈린다는 게 hexagon.ts 의 핵심 논지고,
// 그게 그대로 유사도 검색에도 적용된다.
//
// player-index.ts 가 이미 정리해둔 hex 값(0~100, 못 재면 null)을 그대로 쓴다.
// 여기서 새로 계산하지 않는다 — 계산 로직은 hexagon.ts 한 곳에만 있어야
// 기준값이 바뀌었을 때 두 곳을 따로 고치는 사고를 막는다.

import type { PlayerIndexRow } from './player-index';

export type GamesBand = 10 | 20 | 30 | 0; // 0 = 제한 없음
export type Recency = 'month' | 'patch' | 'all';
export type Direction = 'similar' | 'opposite';

export interface SimilarityQuery {
  myGames: number;
  myHex: Record<string, number | null>;
  direction: Direction;
  gamesBand: GamesBand;
  recency: Recency;
  /**
   * '이번 패치' 판정 기준. player-index.ts 의 currentVersionOf(index) 로
   * **호출부가 한 번만 계산해 넘긴다** — withinRecency 는 풀 안 행마다 불리므로,
   * 여기서 다시 계산하면(예전에는 그렇게 했다) 매 행마다 전체 인덱스를 훑는
   * O(n²) 이 된다.
   */
  currentVersion: number;
  /** 결과에서 뺄 ID (자기 자신 — 인덱스에 조회자 본인이 들어있을 수 있다) */
  excludeId?: string;
}

export interface SimilarityResult {
  row: PlayerIndexRow;
  /** 축 유클리드 거리. 작을수록 닮음. 못 겹치는 축이 있으면 그만큼만으로 계산 — sharedAxes 로 신뢰도를 알린다. */
  distance: number;
  /** 거리 계산에 실제로 쓰인 축 수. 6개 중 적으면(3개 미만) 결과에서 뺀다. */
  sharedAxes: number;
}

const MIN_SHARED_AXES = 3;
const NOW_S = () => Math.floor(Date.now() / 1000);
const MONTH_S = 30 * 86400;

function hexDistance(
  a: Record<string, number | null>,
  b: Record<string, number | null>,
): { distance: number; shared: number } {
  let sumSq = 0;
  let shared = 0;
  for (const key of Object.keys(a)) {
    const av = a[key];
    const bv = b[key];
    if (av == null || bv == null) continue;
    sumSq += (av - bv) ** 2;
    shared++;
  }
  return { distance: shared > 0 ? Math.sqrt(sumSq / shared) : Infinity, shared };
}

function withinGamesBand(rowGames: number, myGames: number, band: GamesBand): boolean {
  if (band === 0) return true;
  const lo = myGames * (1 - band / 100);
  const hi = myGames * (1 + band / 100);
  return rowGames >= lo && rowGames <= hi;
}

function withinRecency(row: PlayerIndexRow, recency: Recency, currentVersion: number): boolean {
  if (recency === 'all') return true;
  if (recency === 'month') return NOW_S() - row.lastPlayed <= MONTH_S;
  // 'patch' — 인덱스에서 관측된 최신 game_version 과 같아야 '이번 패치'다.
  // 시즌 경계를 코드에 박지 않는다(seasons.ts 규칙과 같은 이유) — 관측값으로 판정한다.
  return row.lastVersion === currentVersion;
}

/**
 * rows 를 필터링하고 거리순으로 정렬한다.
 * similar 는 거리 오름차순(가까운 순), opposite 는 내림차순(먼 순).
 * 결과가 비어도 예외를 던지지 않는다 — 호출부가 "표본 N명 중 조건에 맞는 사람 없음"을
 * 정직하게 말할 수 있도록, 필터를 하나씩 완화한 경우의 결과 수도 같이 계산해 돌려준다.
 */
export function findSimilar(
  rows: PlayerIndexRow[],
  q: SimilarityQuery,
): { results: SimilarityResult[]; wouldMatchWithWiderBand: number } {
  const pool = rows.filter(
    (r) => r.id !== q.excludeId && withinRecency(r, q.recency, q.currentVersion),
  );

  const scored: SimilarityResult[] = [];
  for (const row of pool) {
    if (!withinGamesBand(row.games, q.myGames, q.gamesBand)) continue;
    const { distance, shared } = hexDistance(q.myHex, row.hex);
    if (shared < MIN_SHARED_AXES) continue;
    scored.push({ row, distance, sharedAxes: shared });
  }

  scored.sort((a, b) =>
    q.direction === 'similar' ? a.distance - b.distance : b.distance - a.distance,
  );

  // 오차폭을 한 단계 넓히면 몇 명이 더 나오는지 — 결과가 얇을 때 힌트로 쓴다.
  const widerBand: GamesBand = q.gamesBand === 10 ? 20 : q.gamesBand === 20 ? 30 : 0;
  const wouldMatchWithWiderBand =
    q.gamesBand === 0
      ? 0
      : pool.filter((r) => withinGamesBand(r.games, q.myGames, widerBand)).length -
        pool.filter((r) => withinGamesBand(r.games, q.myGames, q.gamesBand)).length;

  return { results: scored, wouldMatchWithWiderBand };
}
