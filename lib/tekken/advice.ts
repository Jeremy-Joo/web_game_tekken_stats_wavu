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
/** 마지막 경기가 이보다 오래됐으면 '최근 폼'을 현재형으로 말하지 않는다. */
const STALE_DAYS = 30;

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
  baselineWinRate: number; // 이 사람 전체 승률 (구간 분석·차트 baseline 용)
  /**
   * 최근 폼을 견준 기준선(직전 200판 승률). `baselineWinRate` 와 다르다 —
   * 화면이 "무엇과 비교한 %p 인지"를 말할 수 있어야 해서 같이 싣는다.
   */
  formBaseline: number;
  bands: AdviceBand[];
  /** 여기까지는 평균 이상이었다 (판수). 없으면 null. */
  goodUpTo: number | null;
  /** 이 판수를 넘기면 성적이 꺾였다. 없으면 null(꺾이는 지점을 못 찾음). */
  stopAfter: number | null;
  /** 판단에 쓸 만한 표본이 있었는가. false 면 화면에서 단정하지 말 것. */
  reliable: boolean;
  /**
   * 최근 폼이 자기 평균에서 얼마나 벗어났나(%p). 양수면 물이 올랐다는 뜻.
   * 화면에서 농담 수위를 고르는 데 쓴다 — 숫자에 근거하지 않은 농담은 하지 않는다.
   */
  recentDeltaPp: number;
  /** 현재 연패 수 (연승 중이면 0). */
  losingStreak: number;
  /** 농담 수위: 좋음 → 보통 → 하락 → 심각. */
  mood: 'hot' | 'steady' | 'cooling' | 'cold';
}

/** 최근 폼을 잴 표본 크기. 너무 작으면 그날 운에 흔들린다. */
const RECENT_N = 20;

/**
 * 최근 폼을 견줄 기준선의 크기 — **통산이 아니라 그 직전 200판이다.**
 *
 * 왜 통산이면 안 되나: `baselineWinRate` 는 원래 구간 분석용이다("세션 n번째 판이
 * 내 평소보다 나쁜가"). 구간도 전체 이력에서 뽑으니 모집단이 같아 통산이 맞다.
 * 그런데 mood 가 묻는 건 "지금 평소와 달라졌나"라, 성장했거나 전성기가 지난 사람은
 * **몇 년 전의 자신**과 비교당한다. 랭크는 승률을 50%로 되돌리는 시스템이라
 * 이력이 긴 사람의 통산 승률은 실력이라기보다 매칭의 수렴값에 가깝기도 하다.
 *
 * 효과는 '고착 해소'가 아니라 **체계적 편향 제거**다. 실측(4명·2,572시점)에서
 * |통산 − 직전200판| 은 중앙 2.5%p, p90 6.5%p 였다. recent20 자체의 노이즈가
 * sd 11.2%p 라 mood 는 원래도 잘 바뀌었고(고착도 34~50%), 통산을 쓴다고 'hot 에
 * 영구히 갇히는' 일은 없었다. 문제는 편차 전체가 저 편향만큼 통째로 밀린다는 것이다 —
 * 임계값 간격이 5~7%p 뿐이라 경계 근처 판정이 뒤집힌다. 실측 불일치율 21.4%.
 *
 * 크기를 200 으로 잡은 이유: 100 이어도 통계적으로는 충분하지만(아래 참조),
 * 헤비 유저 기준 대략 2주치라 '요즘'이라는 말과 체감이 맞는다.
 */
const FORM_BASE_N = 200;

export function sessionAdvice(
  records: MatchRecord[],
  gapMinutes = SESSION_GAP_MINUTES,
  /**
   * 마지막 경기로부터 지난 날짜. 오래 쉰 사람의 '최근 20판'은 현재 폼이 아닌데
   * 화면은 그걸 현재형으로 말한다("지금 물이 올랐습니다"). 그래서 오래됐으면
   * mood 를 단정하지 않는다.
   *
   * 인자로 받는 이유: 시각 규약(KST 벽시계)은 models.ts 한 곳에만 두고,
   * 여기서 Date.now() 를 직접 부르지 않는다. 호출부가 이미 이 값을 갖고 있다.
   */
  daysSinceLast = 0,
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

  // ── 최근 폼과 연패 (농담 수위를 고르는 근거) ──
  const recent = ordered.slice(-RECENT_N);
  const recentWr = wr(recent.filter((r) => r.result === 'W').length, recent.length);

  // 기준선에서 최근 20판을 뺀다 — 재는 대상이 기준선에 섞이면 편차가 0 쪽으로 눌린다.
  const formBase = ordered.slice(-(RECENT_N + FORM_BASE_N), -RECENT_N);
  const formBaseline = formBase.length
    ? wr(formBase.filter((r) => r.result === 'W').length, formBase.length)
    : baselineWinRate; // 그것도 안 되면 통산으로 떨어진다
  const recentDeltaPp = roundTo(recentWr - formBaseline, 1);

  let losingStreak = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].result === 'L') losingStreak++;
    else break;
  }

  // 임계값은 그대로 둔다. 기준선을 30,000판에서 200판으로 줄이면 기준선 자체가
  // 흔들리지만(sd 0.3%p → 3.5%p), recent20 의 노이즈(11.2%p)가 워낙 커서
  // 합성 sd 는 11.2 → 11.7%p, 5% 증가에 그친다. mood 분포는 사실상 그대로다.
  //
  // 최근 폼이 주(主), 연패는 보(補). 연패는 짧아도 체감이 커서 한 단계 끌어내린다.
  const raw: SessionAdvice['mood'] =
    recentDeltaPp >= 7 ? 'hot'
    : recentDeltaPp <= -12 || losingStreak >= 5 ? 'cold'
    : recentDeltaPp <= -5 || losingStreak >= 3 ? 'cooling'
    : 'steady';

  // 오래 쉰 사람의 '최근 폼'은 현재가 아니다 — 단정하지 않고 steady 로 내린다.
  // (리포트에서 지난 시즌으로 좁혀 보면 여기 걸려 항상 steady 가 된다. 의도한 것이다.
  //  멘트가 전부 현재형이라, 반년 전 폼을 "지금 물이 올랐습니다"로 말할 수는 없다.)
  const mood: SessionAdvice['mood'] = daysSinceLast > STALE_DAYS ? 'steady' : raw;

  return {
    baselineWinRate,
    formBaseline,
    bands,
    goodUpTo,
    stopAfter,
    // 구간 셋은 있어야 '추세'라고 부를 수 있다
    reliable: usable.length >= 3,
    recentDeltaPp,
    losingStreak,
    mood,
  };
}
