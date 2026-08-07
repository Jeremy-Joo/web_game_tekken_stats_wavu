// 농담이 인용할 '사실'을 한 곳에서 계산한다.
//
// 왜 따로 두나: 멘트가 붙는 화면이 둘이다(조회 화면·리포트). 조회 화면은 클라이언트라
// 원본 레코드가 없고(API 가 일부러 안 내려준다), 리포트는 서버라 있다. 계산을 양쪽에
// 두면 같은 농담이 두 화면에서 다른 숫자를 말하게 된다. 여기서 한 번 계산해
// API 응답에 실어 보내고, 리포트는 직접 부른다.
//
// ── 이 파일의 규칙 ────────────────────────────────────────────────
//  1. **못 재는 건 null 이다.** 값을 지어내지 않는다. 호출부는 null 이면 그 축을 통째로
//     건너뛴다. (season-jokes.ts 가 반구를 못 가를 때 en 을 빈 배열로 둔 것과 같은 원칙)
//  2. **표본 가드를 각 축이 스스로 건다.** 12판짜리 표본으로 "승단 후 12%p 떨어졌다"고
//     말하면 그건 측정이 아니라 우연이다.
//  3. **Date.now() 를 부르지 않는다.** 시각 규약은 models.ts 한 곳이고, '오늘'은
//     인자로 받는다. 안 그러면 서버/클라 시계가 갈려 같은 조회가 다른 농담을 낸다.
//
// ── 실측으로 뺀 것 (2026-08-03, 4명 26,107경기) ────────────────────
//  · 틸트(경기 간격이 줄어드는가): 평소의 70% 미만인 세션이 0/1/0/0%. 사람이 열받아도
//    간격은 안 줄어든다 — 매칭 대기가 지배해서 통제 폭이 작다. 근거가 안 잡히는데
//    "마음이 급하십니다"라고 하면 그게 이 프로젝트가 금지한 추측이다.
//  · 첫 판 효과: 격차가 4.5/1.6/2.3/0.4%p. 표본이 가장 큰 21,197판 유저가 제일 작다 —
//    작은 표본에서 큰 격차가 나온다는 건 효과가 아니라 노이즈라는 뜻이다. 게다가
//    advice.ts 가 적어둔 선택 편향(이기면 계속·지면 중단)이 여기 정확히 작동한다.
//  · 강등까지 남은 판수: wavu 가 단 내 포인트를 주지 않는다. 계산 불가.

import type { MatchRecord } from './models';
import { dateKey } from './models';
import { SESSION_GAP_MINUTES } from './aggregations';

/** 마일스톤. 촘촘하면 희소성이 사라지고 성기면 평생 한 번도 못 본다. */
const MILESTONES = [500, 1000, 2500, 5000, 10_000, 20_000, 30_000, 50_000];
/** 마일스톤을 넘긴 뒤 이 판수까지만 "방금"이라고 부른다. */
const MILESTONE_WINDOW = 60;
/** 단 변화를 "방금"이라고 부를 수 있는 판수. 실측상 12판에 한 번꼴로 바뀐다. */
const RANK_RECENT = 12;
/** 승단 전후 성적을 비교하려면 양쪽 다 이만큼은 있어야 한다. */
const RANK_COMPARE_MIN = 50;
/** 최고 레이팅을 "방금 갱신"이라고 부를 수 있는 판수. */
const PEAK_FRESH = 5;
/**
 * '추락했다 회복 중'이라 부르려면 최고점→최저점 낙폭이 이만큼은 돼야 한다.
 * 경기당 변동이 ±8~13(위 DIVERGE 주석의 실측)이라 150이면 두 자릿수 순연패 급 —
 * 작은 출렁임까지 회복 서사로 부풀리지 않기 위한 하한이다.
 */
const RECOVERY_DIP = 150;
/**
 * 최저점에서 이만큼은 올라와야 '회복 중'이다. 바닥에서 두어 판 이긴 걸
 * 회복이라 불렀다가 다음 조회에서 도로 내려가 있으면 거짓말이 된다.
 */
const RECOVERY_UP = 100;
/**
 * 최저점이 이 판수 안에 있어야 '회복 중'이다 — **처음 구현엔 이 게이트가 없었고,
 * 실측 12명 전원(100%)에서 회복이 검출됐다(2026-08-07).** 이력이 길면 최고점은
 * 위쪽 극단값, 그 후 최저점은 아래쪽 극단값이라 "현재가 최저점보다 위"는 거의
 * 항상 참이 된다 — 수천 판 전 바닥에서 +655 는 회복이 아니라 세월이다.
 * '회복 중'은 현재형 서사라 바닥이 최근이어야 성립한다. 200은 advice.ts 의
 * FORM_BASE_N 과 같은 값 — 이 코드베이스에서 '요즘'의 기존 정의(헤비 유저 2주치)다.
 */
const RECOVERY_TROUGH_RECENT = 200;
/** 실력차 버킷을 가르는 레이팅 차. */
const GAP_RATING = 50;
/** 버킷 하나를 인용하려면 최소 이만큼. */
const BUCKET_MIN = 50;
/** 이 일수 이상 쉬었다 오면 '복귀'다. */
const COMEBACK_DAYS = 30;
/** 매치업 하나를 범인으로 지목하려면 최소 이만큼 붙어봤어야 한다. */
const MATCHUP_MIN = 20;
/** 하루 안에서 같은 상대 캐릭이 이만큼 몰리면 '유행'이라고 말할 수 있다. */
const TODAY_SAME_CHAR = 5;

/**
 * 승률·레이팅 어긋남을 재는 창. 25로 둔 근거: 손익분기 실측(2026-08-05, 15명
 * 363,237경기)을 25경기 창으로 했고, 그 창에서 2200+ 는 17승 8패(68%)여도
 * 레이팅이 떨어진 비율이 33%였다 — 이 어긋남이 실재한다는 게 이 축의 존재 이유다.
 * 손익분기 승률은 1600대 52% → 2400+ 64% 로 오른다(이길 때 +8, 질 때 -13 규모).
 */
const DIVERGE_WINDOW = 25;
/** 창 안에서 레이팅 변동이 있는 경기가 이만큼은 돼야 말할 수 있다(방금 경기는 TBD=0). */
const DIVERGE_KNOWN_MIN = 15;
/** '이기고 있다'로 부르는 승수 (25판 중 15승 = 60%). */
const DIVERGE_WIN_HI = 15;
/** '5할 이하'로 부르는 승수 (25판 중 12승 = 48%). */
const DIVERGE_WIN_LO = 12;
/** 순변화가 이 안이면 '제자리'다. 경기당 변동이 ±8~13 이라 한 판 값보다 크게 잡았다. */
const DIVERGE_FLAT = 15;

export interface QuipFacts {
  /**
   * 보고 있는 범위가 **현재까지 이어지는가**(범위의 마지막 경기 = 통산 마지막 경기).
   *
   * 리포트는 시즌·기간으로 좁혀 볼 수 있다. 지난 시즌을 보면서 "방금 승단하셨군요",
   * "지금 7연승 중입니다" 라고 하면 전부 거짓말이 된다. 그래서 **'사건' 계열 사실은
   * 이게 false 면 통째로 null 로 내린다** — 아래 항목들의 주석에 `사건` 이라고 적어뒀다.
   * '특성' 계열(실력차·셧아웃·약점 매치업)은 범위를 설명하는 값이라 그대로 둔다.
   */
  isCurrent: boolean;

  /** 사건 — 방금 넘긴 마일스톤. 아니면 null. */
  milestone: number | null;
  /** 통산 경기 수. */
  totalGames: number;
  /**
   * 통산 플레이 시간(시). 세션 안 인접 경기 간격의 **중앙값 × 경기 수**다.
   * 상수를 박지 않는 이유: 사람마다 다르고, 그 사람 값이면 "당신 기준"이 된다.
   * 실측 중앙값은 3.0~3.5분이었다. 세션 사이 대기는 안 들어가므로 **과소 추정**이고,
   * 문구에서 '대략'이라고 말해야 한다.
   */
  hoursPlayed: number | null;

  /** 통산 최고 레이팅. */
  peakRating: number;
  /** 지금(범위의 마지막) 레이팅. */
  currentRating: number;
  /** 최고점이 몇 판 전인가. 0 이면 마지막 경기가 최고점이다. */
  peakGamesAgo: number;
  /** 사건 — 방금 최고를 갱신했는가. */
  peakFresh: boolean;
  /**
   * 최고점 이후 최저점 대비 회복 (2026-08-07). 최고점 → 그 후 최저점(trough) →
   * 현재의 세 지점에서, 바닥 대비 충분히 올라온 중일 때만 값이 있다.
   *
   * 세션 위치 기반 반등(docs/advice-text.md ⑦ — 실측 후 기각)과 다른 점:
   * 그쪽은 "30판째 구간"이 잘 풀린 세션만 담는 표집 편향으로 거의 전원에게
   * 반등이 보였지만, 레이팅 곡선은 모든 경기가 정확히 한 번씩 들어가는 단일
   * 시계열이라 내려갔다 올라온 게 관측된 사실이다. 단, 평균 회귀는 남는다 —
   * 문구는 관찰형("올라왔다")까지만 쓰고 예측("계속 오른다")·인과("실력이
   * 돌아왔다")는 쓰지 않는다(fact-jokes.ts 쪽 규칙).
   *
   * 현재가 최고점을 넘어서면 null — 그 순간은 peakFresh 사건이 이어받는다.
   * '올라오는 중'은 현재형 주장이라 isCurrent 가 아니면 null 이고, 같은 이유로
   * 최저점이 최근(RECOVERY_TROUGH_RECENT판 이내)일 때만 값이 있다 — 근접성 게이트가
   * 없던 첫 구현은 실측 12명 전원에게 떠서(수천 판 전 바닥 대비 +655 같은 '세월'까지
   * 회복으로 불렀다) 게이트를 추가했다.
   */
  recovery: { troughRating: number; up: number; toPeak: number } | null;

  /**
   * 최근 단 변화. 실측상 12판에 한 번꼴로 바뀌므로 '희귀한 사건'이 아니다 —
   * `gamesAgo <= RANK_RECENT` 일 때만 값이 있다.
   * `visits` 는 그 단을 몇 번째 밟는가(수백이 나올 수 있다. 그게 사실이다).
   * `deltaPp` 는 변화 직후와 직전의 승률 차이. 양쪽 표본이 부족하면 null.
   */
  rankChange: { up: boolean; gamesAgo: number; visits: number; deltaPp: number | null } | null;

  /** 사건 — 현재 연승 (연패 중이면 0). */
  winStreak: number;
  /** 통산 최장 연승. */
  bestWinStreak: number;

  /** 사건 — 직전 공백(일). COMEBACK_DAYS 이상일 때만 값이 있다. */
  comebackDays: number | null;

  /**
   * 마지막 경기의 **현지** 시각·요일. 시간대를 모르면(추정 실패) null 이다.
   * guessTimezone 은 모를 때도 KST 를 돌려주지만 그건 "추정하지 않았다"는 뜻이라
   * 그 값으로 "새벽 3시" 라고 말하면 안 된다 — 호출부가 tzKnown 을 넘긴다.
   */
  clock: { hour: number; dow: number } | null;

  /** 나보다 레이팅이 높은 상대 성적. 표본이 적으면 null. */
  vsUp: { games: number; wr: number } | null;
  /** 나보다 낮은 상대. */
  vsDown: { games: number; wr: number } | null;
  /** 범위 전체 승률 — 위 두 값과 견주는 데 쓴다. */
  overallWr: number;

  /** 3-0 으로 진 비율(%). 점수가 없는 경기가 많으면 null. */
  shutoutLossPct: number | null;

  /** 가장 까다로운 상대 캐릭터. 표본이 적으면 null. */
  worstMatchup: { opp: string; wr: number; games: number } | null;

  /** 마지막 세션 판수. */
  lastSessionGames: number;

  /** 오늘 같은 상대 캐릭을 몇 번 만났나. 몰리지 않았으면 null. */
  todaySameChar: { opp: string; count: number } | null;

  /**
   * 상태 — 최근 DIVERGE_WINDOW 판의 **승률과 레이팅 방향이 어긋날 때만** 값이 있다.
   * 사건(한 번 참)도 특성(늘 참)도 아니라서 셋째 갈래다: 몇 판 지속되다 사라진다.
   *   winNoGain   이기고 있는데(60%+) 레이팅은 제자리거나 후퇴 — 위쪽 상대가 없다
   *   loseButGain 5할 이하인데 레이팅은 올랐다 — 위를 잡고 아래에 진 것
   *   flatEven    5할 이하 + 레이팅도 제자리 — 시스템이 판단을 보류 중
   * 승률이 좋고 레이팅도 오르는 경우(정상)와 나쁘고 떨어지는 경우(mood 가 맡는다)는
   * 여기 안 담는다 — 어긋남이 없으면 이 축은 침묵한다.
   */
  divergence: {
    kind: 'winNoGain' | 'loseButGain' | 'flatEven';
    wins: number;
    losses: number;
    /** 창 안 레이팅 순변화(반올림). */
    net: number;
  } | null;
}

const wrOf = (w: number, n: number) => (n > 0 ? Math.round((w * 1000) / n) / 10 : 0);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

export interface QuipFactsInput {
  /** 지금 보고 있는 범위 (필터·시즌이 걸린 뒤). */
  records: MatchRecord[];
  /** 통산 이력. 마일스톤·최고 레이팅·복귀처럼 '평생' 개념은 이쪽을 본다. */
  allRecords: MatchRecord[];
  /** 오늘 (KST, 'yyyy-MM-dd'). 호출부가 준다 — 이 파일은 시계를 안 본다. */
  today: string;
  /** 현지 시각 보정(분). tzKnown 이 false 면 무시된다. */
  tzOffsetMinutes: number;
  /** 시간대를 **추정에 성공했는가**. false 면 clock 이 null 이 된다. */
  tzKnown: boolean;
}

export function buildQuipFacts(input: QuipFactsInput): QuipFacts | null {
  const { records, allRecords, today, tzOffsetMinutes, tzKnown } = input;
  if (!records.length || !allRecords.length) return null;

  const ord = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const all = [...allRecords].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const last = ord[ord.length - 1];

  // ── 마일스톤 ───────────────────────────────────────────────────
  const totalGames = all.length;
  let milestone: number | null = null;
  for (const m of MILESTONES)
    if (totalGames >= m && totalGames - m <= MILESTONE_WINDOW) milestone = m;

  // ── 누적 시간 ──────────────────────────────────────────────────
  // 세션 안 인접 경기 간격만 모은다. 세션 사이 공백(며칠)이 섞이면 값이 터진다.
  const gapMs = SESSION_GAP_MINUTES * 60_000;
  const gaps: number[] = [];
  for (let i = 1; i < all.length; i++) {
    const d = all[i].dt.getTime() - all[i - 1].dt.getTime();
    if (d > 0 && d < gapMs) gaps.push(d);
  }
  // 간격 표본이 너무 적으면 평균을 말할 수 없다.
  const hoursPlayed =
    gaps.length >= 100 ? Math.round((median(gaps) * totalGames) / 3_600_000) : null;

  // ── 레이팅 최고점 ──────────────────────────────────────────────
  let peakRating = -Infinity;
  let peakIdx = -1;
  for (let i = 0; i < all.length; i++)
    if (all[i].myRating >= peakRating) {
      peakRating = all[i].myRating;
      peakIdx = i;
    }
  const peakGamesAgo = all.length - 1 - peakIdx;

  // ── 최저점 대비 회복 ───────────────────────────────────────────
  // 최고점 '이후' 구간에서 최저점을 찾아, 현재가 거기서 충분히 올라온 상태인지 본다.
  // myRating<=0 은 값이 아직 안 붙은 경기라 건너뛴다(실력차 계산과 같은 가드).
  let recovery: QuipFacts['recovery'] = null;
  if (peakIdx >= 0 && peakIdx < all.length - 1) {
    let troughRating = Infinity;
    let troughIdx = -1;
    for (let i = peakIdx + 1; i < all.length; i++) {
      const r = all[i].myRating;
      // <= 로 잡아 같은 최저값이면 **가장 최근** 것을 최저점으로 본다 — 근접성
      // 게이트(RECOVERY_TROUGH_RECENT)가 실제 회복 시작점을 기준으로 판정되게.
      if (r > 0 && r <= troughRating) {
        troughRating = r;
        troughIdx = i;
      }
    }
    const cur = all[all.length - 1].myRating;
    const troughGamesAgo = troughIdx >= 0 ? all.length - 1 - troughIdx : Infinity;
    if (
      troughRating !== Infinity &&
      troughGamesAgo <= RECOVERY_TROUGH_RECENT &&
      peakRating - troughRating >= RECOVERY_DIP &&
      cur - troughRating >= RECOVERY_UP &&
      cur < peakRating
    ) {
      recovery = {
        troughRating,
        up: cur - troughRating,
        toPeak: peakRating - cur,
      };
    }
  }

  // ── 단 변화 ────────────────────────────────────────────────────
  // myRank 가 0 인 경기는 값이 없다는 뜻이라 건너뛴다(normalize 가 ?? 0 으로 채운다).
  let rankChange: QuipFacts['rankChange'] = null;
  {
    const idx: number[] = [];
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1].myRank;
      const b = all[i].myRank;
      if (a > 0 && b > 0 && a !== b) idx.push(i);
    }
    const at = idx[idx.length - 1];
    if (at != null) {
      const gamesAgo = all.length - 1 - at;
      if (gamesAgo <= RANK_RECENT) {
        const to = all[at].myRank;
        const visits = idx.filter((i) => all[i].myRank === to).length;
        const after = all.slice(at);
        const before = all.slice(Math.max(0, at - RANK_COMPARE_MIN), at);
        const deltaPp =
          after.length >= RANK_COMPARE_MIN && before.length >= RANK_COMPARE_MIN
            ? Math.round(
                (wrOf(after.filter((r) => r.result === 'W').length, after.length) -
                  wrOf(before.filter((r) => r.result === 'W').length, before.length)) *
                  10,
              ) / 10
            : null;
        rankChange = { up: to > all[at - 1].myRank, gamesAgo, visits, deltaPp };
      }
    }
  }

  // ── 연승 ───────────────────────────────────────────────────────
  let winStreak = 0;
  for (let i = ord.length - 1; i >= 0 && ord[i].result === 'W'; i--) winStreak++;
  let bestWinStreak = 0;
  let run = 0;
  for (const r of all) {
    run = r.result === 'W' ? run + 1 : 0;
    if (run > bestWinStreak) bestWinStreak = run;
  }

  // ── 복귀 ───────────────────────────────────────────────────────
  // 마지막 경기 **직전**의 공백을 본다. '지금 몇 일 쉬었나'가 아니라
  // '오랜만에 와서 친 게 마지막 세션인가'를 묻는 것이다.
  let comebackDays: number | null = null;
  {
    const lastDay = dateKey(all[all.length - 1].dt);
    let prevDay: string | null = null;
    for (let i = all.length - 1; i >= 0; i--) {
      const d = dateKey(all[i].dt);
      if (d !== lastDay) {
        prevDay = d;
        break;
      }
    }
    if (prevDay) {
      const gap = Math.round(
        (Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${prevDay}T00:00:00Z`)) / 86_400_000,
      );
      if (gap >= COMEBACK_DAYS) comebackDays = gap;
    }
  }

  // ── 현지 시각 ──────────────────────────────────────────────────
  // dt 는 KST 로 shift 된 Date 라 getUTC* 로 읽으면 KST 벽시계가 나온다.
  // 현지로 바꾸려면 (현지오프셋 − KST) 만큼 더 민다.
  let clock: QuipFacts['clock'] = null;
  if (tzKnown) {
    const shifted = new Date(last.dt.getTime() + (tzOffsetMinutes - 9 * 60) * 60_000);
    clock = { hour: shifted.getUTCHours(), dow: shifted.getUTCDay() };
  }

  // ── 실력차 ─────────────────────────────────────────────────────
  const up = { g: 0, w: 0 };
  const down = { g: 0, w: 0 };
  for (const r of ord) {
    const my = r.myRating - r.myDelta;
    const op = r.oppRating - r.oppDelta;
    if (my <= 0 || op <= 0) continue; // 레이팅이 아직 안 붙은 경기
    const d = op - my;
    if (d >= GAP_RATING) {
      up.g++;
      if (r.result === 'W') up.w++;
    } else if (d <= -GAP_RATING) {
      down.g++;
      if (r.result === 'W') down.w++;
    }
  }
  const overallWr = wrOf(ord.filter((r) => r.result === 'W').length, ord.length);

  // ── 셧아웃 패 ──────────────────────────────────────────────────
  // 라운드 수가 없는 경기는 normalize 가 이미 버린다(myRounds == null → dropped).
  // 그래서 여기서 다시 거를 게 없다 — 표본 크기만 본다.
  const shutoutLossPct =
    ord.length >= BUCKET_MIN
      ? wrOf(ord.filter((r) => r.result === 'L' && r.myRounds === 0).length, ord.length)
      : null;

  // ── 약점 매치업 ────────────────────────────────────────────────
  let worstMatchup: QuipFacts['worstMatchup'] = null;
  {
    const m = new Map<string, { g: number; w: number }>();
    for (const r of ord) {
      const e = m.get(r.oppChar) ?? { g: 0, w: 0 };
      e.g++;
      if (r.result === 'W') e.w++;
      m.set(r.oppChar, e);
    }
    let worst: { opp: string; wr: number; games: number } | null = null;
    for (const [opp, e] of m) {
      if (e.g < MATCHUP_MIN) continue;
      // 이름을 모르는 캐릭터(chars.ts 에 없는 신캐 → '#42')는 지목하지 않는다.
      // "#42 가 범인입니다"는 농담이 아니라 고장으로 읽힌다.
      if (opp.startsWith('#')) continue;
      const wr = wrOf(e.w, e.g);
      if (!worst || wr < worst.wr) worst = { opp, wr, games: e.g };
    }
    // 전체 승률보다 뚜렷이 낮아야 '약점'이다. 그냥 최하위는 약점이 아니다.
    if (worst && worst.wr <= overallWr - 5) worstMatchup = worst;
  }

  // ── 마지막 세션 ────────────────────────────────────────────────
  let start = ord.length - 1;
  while (start > 0 && ord[start].dt.getTime() - ord[start - 1].dt.getTime() < gapMs) start--;
  const lastSessionGames = ord.length - start;

  // ── 오늘 상대 캐릭 몰림 ────────────────────────────────────────
  let todaySameChar: QuipFacts['todaySameChar'] = null;
  {
    const todays = ord.filter((r) => dateKey(r.dt) === today);
    const m = new Map<string, number>();
    for (const r of todays) m.set(r.oppChar, (m.get(r.oppChar) ?? 0) + 1);
    let top: [string, number] | null = null;
    for (const e of m) if (!top || e[1] > top[1]) top = e;
    if (top && top[1] >= TODAY_SAME_CHAR) todaySameChar = { opp: top[0], count: top[1] };
  }

  // ── 승률·레이팅 어긋남 ─────────────────────────────────────────
  // 창은 범위(ord)의 마지막 DIVERGE_WINDOW 판. 방금 끝난 경기는 wavu 가 레이팅을
  // 아직 안 매겨 delta=0 으로 오므로(normalize 의 TBD 처리), 변동이 있는 경기 수가
  // DIVERGE_KNOWN_MIN 미만이면 "모른다"로 두고 침묵한다 — 0 을 제자리로 읽으면 안 된다.
  let divergence: QuipFacts['divergence'] = null;
  if (ord.length >= DIVERGE_WINDOW) {
    const win = ord.slice(-DIVERGE_WINDOW);
    const known = win.filter((r) => r.myDelta !== 0).length;
    if (known >= DIVERGE_KNOWN_MIN) {
      const wins = win.filter((r) => r.result === 'W').length;
      const losses = DIVERGE_WINDOW - wins;
      const net = Math.round(win.reduce((s, r) => s + r.myDelta, 0));
      const kind: NonNullable<QuipFacts['divergence']>['kind'] | null =
        wins >= DIVERGE_WIN_HI && net <= 0 ? 'winNoGain'
          : wins <= DIVERGE_WIN_LO && net >= DIVERGE_FLAT ? 'loseButGain'
            : wins <= DIVERGE_WIN_LO && Math.abs(net) < DIVERGE_FLAT ? 'flatEven'
              : null;
      if (kind) divergence = { kind, wins, losses, net };
    }
  }

  // 범위가 현재까지 이어지는가 — '사건' 계열은 여기에 전부 매인다.
  const isCurrent =
    all[all.length - 1].dt.getTime() === last.dt.getTime() && all.length === records.length;

  return {
    isCurrent,
    milestone: isCurrent ? milestone : null,
    totalGames,
    hoursPlayed,
    peakRating,
    currentRating: last.myRating,
    peakGamesAgo,
    peakFresh: isCurrent && peakGamesAgo <= PEAK_FRESH,
    // '올라오는 중'은 현재형 주장이다 — 지난 시즌을 보면서 말하면 거짓말이 된다.
    recovery: isCurrent ? recovery : null,
    rankChange: isCurrent ? rankChange : null,
    winStreak: isCurrent ? winStreak : 0,
    bestWinStreak,
    comebackDays: isCurrent ? comebackDays : null,
    clock: isCurrent ? clock : null,
    vsUp: up.g >= BUCKET_MIN ? { games: up.g, wr: wrOf(up.w, up.g) } : null,
    vsDown: down.g >= BUCKET_MIN ? { games: down.g, wr: wrOf(down.w, down.g) } : null,
    overallWr,
    shutoutLossPct,
    worstMatchup,
    lastSessionGames,
    todaySameChar,
    // 지난 시즌을 보며 "지금 정체 중"이라고 말하면 거짓말이다 — 사건 계열과 같은 가드.
    divergence: isCurrent ? divergence : null,
  };
}
