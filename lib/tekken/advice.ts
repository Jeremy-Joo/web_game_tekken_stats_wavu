// "오늘 몇 판까지 하는 게 좋은가" — 그 사람 데이터로만 계산한다.
//
// 세션 안 몇 번째 경기인지로 5판 단위 구간을 만들고, 구간별 승률이 자기 평균에서
// 언제 꺾이는지 본다. 평균보다 나은 구간이 이어지는 동안이 '권장', 표본이 충분한데
// 평균을 뚜렷이 밑도는 첫 구간이 '중단 권장'이다.
//
// ── 이 수치의 한계 (반드시 화면에도 밝힐 것) ──────────────────────────
// 이건 **상관관계지 인과가 아니다.** 사람은 이기고 있으면 계속하고 지면 그만두는
// 경향이 있어서, '30판째' 표본은 애초에 '그날 잘 풀린 세션'에 치우친다.
// 그래서 뒷구간 승률이 높게 나오는 일도 흔하다 — 그걸 "많이 할수록 좋다"로 읽으면 안 된다.
// 우리가 말할 수 있는 건 "이 사람 기록에서는 이 지점부터 성적이 꺾였다"까지다.

import type { MatchRecord } from './models';
import { wr, roundTo, SESSION_GAP_MINUTES } from './aggregations';

/** 구간 크기(판). 5판이면 한 세트 감각과 맞고, 표본도 너무 잘게 쪼개지지 않는다. */
const BAND = 5;
/** 이 구간까지만 본다. 그 이상은 표본이 급격히 줄어 노이즈가 된다. */
const MAX_POS = 60;
/** 구간 하나를 신뢰하려면 최소 이만큼의 경기가 있어야 한다. */
const MIN_BAND_GAMES = 50;
/** 자기 평균보다 이만큼(%p) 낮으면 '꺾였다'고 본다. 통계적 유의성이 아니라 실용 기준이다. */
const DROP_PP = 3;

export interface AdviceBand {
  from: number; // 세션 내 순번 (1부터)
  to: number;
  games: number;
  wins: number;
  winRate: number;
  avgDelta: number; // 이 구간 경기당 평균 레이팅 증감
  enough: boolean; // 표본이 기준을 넘는가
}

export interface SessionAdvice {
  baselineWinRate: number; // 이 사람 전체 승률
  bands: AdviceBand[];
  /** 여기까지는 평균 이상이었다 (판수). 없으면 null. */
  goodUpTo: number | null;
  /** 이 판수를 넘기면 성적이 꺾였다. 없으면 null(꺾이는 지점을 못 찾음). */
  stopAfter: number | null;
  /** 판단에 쓸 만한 표본이 있었는가. false 면 화면에서 단정하지 말 것. */
  reliable: boolean;
}

export function sessionAdvice(
  records: MatchRecord[],
  gapMinutes = SESSION_GAP_MINUTES,
): SessionAdvice | null {
  if (records.length < MIN_BAND_GAMES * 2) return null; // 표본이 너무 적으면 아예 말하지 않는다

  const ordered = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const count = Math.ceil(MAX_POS / BAND);
  const agg = Array.from({ length: count }, (_, i) => ({
    from: i * BAND + 1,
    to: (i + 1) * BAND,
    games: 0,
    wins: 0,
    delta: 0,
  }));

  let pos = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && ordered[i].dt.getTime() - ordered[i - 1].dt.getTime() > gapMinutes * 60_000)
      pos = 0;
    pos++;
    const b = agg[Math.floor((pos - 1) / BAND)];
    if (!b) continue; // MAX_POS 를 넘는 구간은 버린다
    b.games++;
    if (ordered[i].result === 'W') b.wins++;
    b.delta += ordered[i].myDelta;
  }

  const bands: AdviceBand[] = agg
    .filter((b) => b.games > 0)
    .map((b) => ({
      from: b.from,
      to: b.to,
      games: b.games,
      wins: b.wins,
      winRate: wr(b.wins, b.games),
      avgDelta: b.games ? roundTo(b.delta / b.games, 2) : 0,
      enough: b.games >= MIN_BAND_GAMES,
    }));

  const baselineWinRate = wr(
    ordered.filter((r) => r.result === 'W').length,
    ordered.length,
  );

  // 표본이 충분한 구간만 판단에 쓴다.
  const usable = bands.filter((b) => b.enough);
  let goodUpTo: number | null = null;
  let stopAfter: number | null = null;
  for (const b of usable) {
    if (b.winRate < baselineWinRate - DROP_PP) {
      stopAfter = b.from - 1; // 이 구간 직전까지
      break;
    }
    goodUpTo = b.to;
  }

  return {
    baselineWinRate,
    bands,
    goodUpTo,
    stopAfter,
    // 구간 셋은 있어야 '추세'라고 부를 수 있다
    reliable: usable.length >= 3,
  };
}
