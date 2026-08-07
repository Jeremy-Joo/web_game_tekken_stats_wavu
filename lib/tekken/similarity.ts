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
// ── AND 대역 필터를 순위 방식으로 바꾼 이유 (2026-08-08) ────────────────
// 처음엔 판수·레이팅을 "내 값의 ±N% 안"이라는 대역으로 걸러 통과 못 하면
// 후보에서 뺐다. 표본이 263명일 땐 이게 그럭저럭 됐는데, 1,888명으로 늘고
// 나서 실측해보니 여전히 프로필이 특이한 사람(예: 계정 통산 5,571판 중
// 한 캐릭터로 2,874판)은 기본 설정에서 결과 0명이었다 — 세 대역을 하나씩만
// 완화하는 힌트도 전부 0이었다(세 축이 동시에 안 맞는 사람에게는 "하나씩
// 완화"가 무의미하다). "전부 무관으로 풀기" 버튼도 검토했지만, 그러면
// 판수·레이팅이 완전히 딴판인 사람도 승률 하나만 보고 "비슷하다"고 나와서
// 이 기능의 존재 이유(실력대가 맞는 사람끼리 비교)를 깎아먹는다.
//
// 그래서 "맞다/아니다"로 걸러내는 대신, 판수·레이팅·승률 차이를 하나의
// 점수(distance)로 합쳐 가장 가까운 N명을 순위로 준다. 표본에 그 캐릭터를
// 쓰는 사람이 한 명이라도 있으면 결과가 원천적으로 비지 않는다. 대신
// 필터가 걸러주지 않으니 각자의 실제 판수·레이팅을 결과에 그대로 남겨
// 화면에서 보여준다 — "이 사람은 판수가 나보다 훨씬 적으니 참고만
// 하세요" 식으로 사용자가 직접 판단하게 하는 쪽이, 억지로 맞춰 보여주는
// 것보다 정직하다. 프로필이 많이 다른 매치는 looseMatch 로 표시해 화면에서
// 경고 배지를 붙일 수 있게 한다.

import type { PlayerIndexRow } from './player-index';

export type SessionTrend = 'any' | 'declining' | 'rising';
export type Recency = 'month' | 'patch' | 'all';
export type Direction = 'similar' | 'opposite';

/** 결과 하나가 이 이상 벌어지면 "프로필이 많이 다르다"는 배지를 붙인다.
 *  charGames/games 는 상대 차이(0~1에 가까울수록 격차 큼), rating 은
 *  300(구 대역 설정의 최대폭)을 1로 잡은 상대값이다. */
const LOOSE_MATCH_THRESHOLD = 0.5;

export interface SimilarityQuery {
  /** 비교 기준 캐릭터. 보통 조회자의 최근 캐릭터. */
  charaId: string;
  /** 그 캐릭터에서 조회자의 승률(0~100). */
  myWinRate: number;
  /** 조회자가 그 캐릭터로 친 판수. */
  myCharGames: number;
  /** 조회자의 통산 판수(계정 전체). */
  myGames: number;
  /** 조회자의 현재 레이팅. */
  myRating: number;
  direction: Direction;
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
  /** 종합 유사도 점수 — 낮을수록 순위가 위(similar 는 전체적으로 가까운
   *  사람, opposite 는 승률만 먼 나머지는 가까운 사람). 절대값 자체는
   *  의미가 없고 정렬용이다. */
  distance: number;
  /** 판수·레이팅 중 하나라도 나와 크게 다르면 true — 화면에서 "참고용"
   *  경고를 붙이는 데 쓴다. */
  looseMatch: boolean;
}

const NOW_S = () => Math.floor(Date.now() / 1000);
const MONTH_S = 30 * 86400;

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

/** 상대 차이, 0(동일)~1에 가까울수록 격차가 크다. */
function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(a, b, 1);
}

/**
 * rows 에서 그 캐릭터를 쓰는 사람 중 판수·레이팅·승률 종합으로 가장 가까운
 * limit 명을 순위로 준다. 표본에 그 캐릭터 사용자가 있는 한 결과가 비지
 * 않는다 — 예전처럼 조건에 못 맞아 0명이 되는 경우가 없다.
 */
export function findSimilar(
  rows: PlayerIndexRow[],
  q: SimilarityQuery,
  limit = 12,
): { results: SimilarityResult[]; poolSize: number } {
  const basePool = rows.filter(
    (r) =>
      r.id !== q.excludeId &&
      withinRecency(r, q.recency, q.currentVersion) &&
      withinSessionTrend(r, q.sessionTrend),
  );

  const out: SimilarityResult[] = [];
  for (const row of basePool) {
    const c = row.chars[q.charaId];
    if (!c) continue;

    const wrDiff = Math.round(Math.abs(c.wrRecent - q.myWinRate) * 10) / 10;
    const charGamesDist = relDiff(c.games, q.myCharGames);
    const gamesDist = relDiff(row.games, q.myGames);
    const ratingDist = Math.abs(row.rating - q.myRating) / 300;

    // similar: 승률차가 작을수록 좋다. opposite: 승률차가 클수록 좋다 —
    // 둘 다 "좋을수록 점수가 낮다"로 맞추려고 opposite 는 뒤집는다.
    const wrNorm = Math.min(1, wrDiff / 100);
    const wrTerm = q.direction === 'similar' ? wrNorm : 1 - wrNorm;

    // 승률(방향의 본질)에 가중치 2, 프로필 근접도(판수·레이팅)에 가중치 1씩 —
    // 승률이 우선순위지만, 프로필이 완전히 딴판인 사람이 승률 하나만 맞아
    // 상위로 튀어오르지는 않게 한다.
    const distance = Math.round((wrTerm * 2 + charGamesDist + gamesDist + ratingDist) * 100) / 100;
    const looseMatch =
      charGamesDist > LOOSE_MATCH_THRESHOLD || gamesDist > LOOSE_MATCH_THRESHOLD || ratingDist > 1;

    out.push({ row, charGames: c.games, charWinRate: c.wrRecent, wrDiff, distance, looseMatch });
  }

  out.sort((a, b) => a.distance - b.distance);
  return { results: out.slice(0, limit), poolSize: out.length };
}
