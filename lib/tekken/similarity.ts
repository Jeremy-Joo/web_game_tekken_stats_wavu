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

import type { PlayerIndexRow } from './player-index';

export type MinCharGames = 20 | 50 | 100 | 200;
export type SessionTrend = 'any' | 'declining' | 'rising';
export type Recency = 'month' | 'patch' | 'all';
export type Direction = 'similar' | 'opposite';

export interface SimilarityQuery {
  /** 비교 기준 캐릭터. 보통 조회자의 최근 캐릭터. */
  charaId: string;
  /** 그 캐릭터에서 조회자의 승률(0~100). */
  myWinRate: number;
  direction: Direction;
  /** 후보가 그 캐릭터로 이 판수 이상이어야 한다 — 그 아래는 승률이 노이즈다. */
  minCharGames: MinCharGames;
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
/** minCharGames 를 완화할 때 다음으로 내려갈 단계. */
const LOOSER: Record<MinCharGames, MinCharGames | null> = { 200: 100, 100: 50, 50: 20, 20: null };

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

/**
 * rows 를 필터링하고 승률 차이순으로 정렬한다.
 * similar 는 차이 오름차순(가까운 순), opposite 는 내림차순(먼 순).
 * 결과가 비어도 예외를 던지지 않는다 — minCharGames 를 한 단계 낮추면 몇 명이
 * 더 나오는지도 같이 계산해, 호출부가 "표본 N명 중 조건에 맞는 사람 없음"과
 * 완화 힌트를 정직하게 말할 수 있게 한다.
 */
export function findSimilar(
  rows: PlayerIndexRow[],
  q: SimilarityQuery,
): { results: SimilarityResult[]; wouldMatchWithLooserMinGames: number } {
  const pool = rows.filter(
    (r) =>
      r.id !== q.excludeId &&
      withinRecency(r, q.recency, q.currentVersion) &&
      withinSessionTrend(r, q.sessionTrend),
  );

  const scoreAt = (minGames: number): SimilarityResult[] => {
    const out: SimilarityResult[] = [];
    for (const row of pool) {
      const c = row.chars[q.charaId];
      if (!c || c.games < minGames) continue;
      const wrDiff = Math.round(Math.abs(c.wrRecent - q.myWinRate) * 10) / 10;
      out.push({ row, charGames: c.games, charWinRate: c.wrRecent, wrDiff });
    }
    return out;
  };

  const scored = scoreAt(q.minCharGames);
  scored.sort((a, b) => (q.direction === 'similar' ? a.wrDiff - b.wrDiff : b.wrDiff - a.wrDiff));

  const looser = LOOSER[q.minCharGames];
  const wouldMatchWithLooserMinGames = looser == null ? 0 : scoreAt(looser).length - scored.length;

  return { results: scored, wouldMatchWithLooserMinGames };
}
