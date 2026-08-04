// 플레이 성향 육각형.
//
// ── 왜 이 여섯인가 ────────────────────────────────────────────────────────
// 후보 10개를 실제 전적으로 재보고 골랐다. 레이더 차트는 축이 서로 독립일 때만
// '모양'이 생긴다 — 축들이 같이 움직이면 잘하는 사람은 큰 육각형, 못하는 사람은
// 작은 육각형이 되어 사실상 승률 하나를 여섯 번 그린 것이 된다.
//
// 버린 것들(실측 13명):
//   공격(완승 비율)·수비(완패 안 당함)·접전(풀라운드 승률)·라운드 획득률
//     → 서로 +0.74~+0.95, 승률과 +0.83~+0.99. 넷이 사실상 한 축이라 하나만 남겼다.
//   도전(상위 상대와 붙은 비율)
//     → 승률과 **-0.97**. '도전 정신'이 아니라 "내가 약해서 위쪽 상대밖에 없다"를
//       재고 있었다. 이름과 반대되는 것을 재는 축은 없느니만 못하다.
//
// 남긴 여섯 중 다섯은 승률과 -0.19~+0.50 으로 느슨하게 붙어 있다. 덕분에 실력이
// 비슷한 두 사람도 모양이 다르게 나온다. 기준점 삼아 실력 축(라운드 획득률) 하나만
// 넣었다 — 그게 없으면 나머지를 읽을 기준이 없다.
//
// ── 왜 절대 눈금인가 (백분위를 걷어낸 이유) ──────────────────────────────
// 처음에는 **다른 사람들 대비 몇 %인가**(백분위)로 환산했다. 원값을 그대로 0~1 축에
// 얹으면 실측 범위가 좁아(지구력 0.59~0.76, 라운드 획득률 0.47~0.60) 전부 같은 모양이
// 되기 때문이었다. 모양은 잘 갈렸지만 **틀린 방식이었다.**
//
//  1. 조회자가 한 판도 안 쳤는데 모양이 바뀐다. 모집단을 다시 뽑으면 같은 사람의
//     실력이 91.8 에서 85 가 된다. app/jokes.ts 가 세운 원칙과 정면으로 어긋난다 —
//     "조회 결과가 같은데 말이 달라지면 신뢰가 깎인다."
//  2. 시즌마다 낡는다. 레이팅 분포가 통째로 움직이므로 기준값을 다시 만들어야 하고,
//     안 만들면 조용히 틀린 값이 나간다. seasons.ts 에서 "시즌 경계 날짜를 코드에
//     적지 말 것"이라고 정한 것과 정반대 방향이다.
//  3. 이 사이트가 피하기로 한 의존성을 뒷문으로 들여온다. 인구 통계는 ewgf 가 맡고
//     여기는 개인을 맡는다 — wavu 레이트리밋 때문에 인구 데이터는 신뢰성 있게
//     유지할 수도 없다.
//  4. 표본이 무작위도 아니었다. wavu 공개 피드에서 500판 이상만 뽑아 헤비 유저에
//     치우쳐 있어, 라이트 유저를 대면 전 축이 낮게 나온다.
//
// 그래서 **눈금을 축마다 고정 상수로 박는다.** 점수는 조회자의 전적과 이 상수들만으로
// 정해진다. 좁은 범위 문제는 눈금을 좁게 잡아서 푼다 — 0~1 을 통째로 쓰지 않는다.
//
// 눈금의 근거는 두 종류뿐이다. **어느 쪽도 남의 전적이 아니다.**
//   (가) 지표 정의나 확률에서 나오는 값 — 라운드 승률 0.5, 레이팅 변화 0,
//        지구력 비율 1.0, Elo 기대승률. 이건 논쟁의 여지가 없다.
//   (나) 읽기 좋으라고 고른 관례 — 눈금의 폭. 임의성이 남아 있으므로 축마다
//        `scaleWhy` 에 근거를 적어두고, 바꿀 때 그 문장부터 고친다.

import type { MatchRecord } from './models';

const SESSION_GAP_MS = 120 * 60_000;

export interface HexAxis {
  key: string;
  /** 화면 라벨. 짧아야 육각형 꼭짓점에 들어간다. */
  label: string;
  /** 한 줄 설명 — 무엇을 재는지 숨기지 않는다. */
  desc: string;
  /** 표본이 모자라면 null. '0 점'과 '못 냄'은 다르다. */
  calc: (records: MatchRecord[]) => number | null;

  /** 눈금 아래끝 — 이 값 이하는 막대 0. */
  min: number;
  /** 눈금 위끝 — 이 값 이상은 막대 가득. */
  max: number;
  /**
   * 이 지표의 '중립'값. 지표 정의에서 나오는 것만 넣는다(라운드 반반, 변화 없음 …).
   * 없는 축은 null — 화면은 이때 기준선을 안 그린다.
   * **관례로 정한 값을 여기 넣지 말 것.** 기준선은 "여기가 본전"이라고 단언하는 표시다.
   */
  neutral: number | null;
  /** 눈금을 이렇게 잡은 근거. 화면·문서·코드가 같은 말을 하도록 여기 한 곳에 둔다. */
  scaleWhy: string;
  /** 원값 표기 (백분위가 아니라 이걸 화면에 같이 낸다). */
  fmt: (v: number) => string;
}

const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * 레이팅이 나보다 50 높은 상대에게 **기대되는** 승률.
 * Elo: E = 1/(1+10^(Δ/400)). 남의 전적이 아니라 레이팅 시스템의 정의에서 나온다.
 */
export const EXPECTED_VS_STRONGER = 1 / (1 + Math.pow(10, 50 / 400));

const winRate = (rs: MatchRecord[]) =>
  rs.length ? rs.filter((r) => r.result === 'W').length / rs.length : null;

/** 세션 안에서 몇 번째 경기인가. 2시간 이상 비면 새 세션으로 본다. */
function sessionNth(ordered: MatchRecord[]): number[] {
  const out: number[] = [];
  let nth = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && ordered[i].dt.getTime() - ordered[i - 1].dt.getTime() > SESSION_GAP_MS) nth = 0;
    out.push(++nth);
  }
  return out;
}

export const HEX_AXES: HexAxis[] = [
  {
    key: 'skill',
    label: '실력',
    desc: '따낸 라운드의 비율. 승패보다 잘게 봐서 아깝게 진 판도 반영된다.',
    calc: (rs) => {
      let mine = 0;
      let all = 0;
      for (const r of rs) {
        mine += r.myRounds;
        all += r.myRounds + r.oppRounds;
      }
      return all ? mine / all : null;
    },
    min: 0.35,
    max: 0.65,
    neutral: 0.5,
    // 3선승제라 라운드 승률이 경기 승률로 증폭된다. 라운드 0.65 → 경기 76.5%,
    // 0.35 → 23.5% (best-of-5 확률 계산). 그 바깥은 랭크 매칭이 유지시키지 않는
    // 구간이라 눈금 끝으로 잡았다. 중립 0.5 는 '라운드는 이기거나 진다'에서 나온다.
    scaleWhy: '라운드 승률. 0.5=반반이 구조적 중심. 눈금 끝은 경기 승률 23.5%~76.5% 지점',
    fmt: pctText,
  },
  {
    key: 'variety',
    label: '다양성',
    desc: '캐릭터를 얼마나 고르게 쓰는가. 한 캐릭만 파면 0, 여럿을 고루 쓰면 높다.',
    calc: (rs) => {
      const count = new Map<string, number>();
      for (const r of rs) count.set(r.myChar, (count.get(r.myChar) ?? 0) + 1);
      if (count.size <= 1) return 0;
      // 정규화 엔트로피. 캐릭 수가 아니라 '고르게 쓰는 정도'다 —
      // 서브를 두 판만 쓴 사람과 반반 쓴 사람을 같게 보지 않으려는 것.
      let h = 0;
      for (const v of count.values()) {
        const p = v / rs.length;
        h -= p * Math.log(p);
      }
      return h / Math.log(count.size);
    },
    min: 0,
    max: 1,
    // 유일하게 눈금을 고를 필요가 없는 축이다 — 지표가 이미 0~1 로 정규화돼 있다.
    // 중립이 없다: '고르게 쓰는 정도'에는 본전이라 할 지점이 없다.
    neutral: null,
    scaleWhy: '정규화 엔트로피 그 자체. 0=한 캐릭만, 1=완전히 고르게',
    fmt: (v) => v.toFixed(2),
  },
  {
    key: 'grind',
    label: '몰입',
    desc: '한 번 잡으면 몇 판이나 하는가 (판수 ÷ 접속한 날 수).',
    calc: (rs) => {
      const days = new Set(rs.map((r) => r.dt.toISOString().slice(0, 10)));
      return days.size ? rs.length / days.size : null;
    },
    min: 0,
    max: 60,
    // 위끝 60 은 임의로 고른 게 아니라 **같은 저장소가 이미 정해둔 한계**다 —
    // advice.ts 의 MAX_POS=60("그 이상은 표본이 급격히 줄어 노이즈가 된다").
    // 하루 60판을 넘게 치는 사람을 더 잘게 가를 근거가 이 저장소에는 없다.
    neutral: null,
    scaleWhy: '하루 평균 판수. 위끝 60은 advice.ts 의 MAX_POS(분석 한계)와 같은 값',
    fmt: (v) => `${v.toFixed(1)}판`,
  },
  {
    key: 'growth',
    label: '상승세',
    desc: '최근 400판 동안 레이팅이 얼마나 올랐는가.',
    calc: (rs) => {
      const o = [...rs]
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())
        .filter((r) => r.myRating > 0);
      // 400판은 되어야 추세라 부를 수 있다. 그 아래는 그날 운이다.
      if (o.length < 400) return null;
      return o[o.length - 1].myRating - o[o.length - 400].myRating;
    },
    min: -400,
    max: 400,
    neutral: 0,
    // 400 은 Elo 계열에서 **기대승률 10:1 이 되는 폭**이다(한 등급). 400판 동안
    // 한 등급을 오르내렸으면 눈금 끝으로 볼 만하다. 중립 0 은 '변화 없음'이라
    // 논쟁의 여지가 없다.
    scaleWhy: '최근 400판 레이팅 증감. 눈금 끝 ±400은 Elo 한 등급(기대승률 10:1)',
    fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`,
  },
  {
    key: 'stamina',
    label: '지구력',
    desc: '세션 11판째 이후 승률이 초반 5판 대비 얼마나 유지되는가.',
    calc: (rs) => {
      const ord = [...rs].sort((a, b) => a.dt.getTime() - b.dt.getTime());
      const nth = sessionNth(ord);
      const early = ord.filter((_, i) => nth[i] <= 5);
      const late = ord.filter((_, i) => nth[i] >= 11);
      // 양쪽 다 30판은 있어야 비율이 흔들리지 않는다.
      if (early.length < 30 || late.length < 30) return null;
      const e = winRate(early)!;
      return e > 0.02 ? winRate(late)! / e : null;
    },
    min: 0.6,
    max: 1.4,
    neutral: 1.0,
    // 중립 1.0 = 후반이 초반과 같다. 지표가 비율이라 본전이 명확하다.
    // 폭 ±0.4 는 관례다 — 후반 승률이 초반의 60%~140%.
    scaleWhy: '후반÷초반 승률비. 1.0=유지가 본전, 눈금 폭 ±0.4는 관례',
    fmt: (v) => `${v.toFixed(2)}배`,
  },
  {
    key: 'giantkill',
    label: '역상성',
    desc: '나보다 레이팅이 50 이상 높은 상대를 이기는 비율.',
    calc: (rs) => {
      const up = rs.filter((r) => r.oppRating - r.myRating >= 50);
      return up.length >= 30 ? winRate(up) : null;
    },
    min: 0,
    max: 0.6,
    // 중립은 **레이팅 시스템이 예측하는 승률**이다 — 남의 전적이 아니라 정의에서 나온다.
    // Elo 기대승률 E = 1/(1+10^(Δ/400)), Δ=50 이면 0.4286.
    // 이 축은 Δ>=50 인 판만 모으므로 실제 기대치는 그 이하다. 즉 0.4286 을 넘으면
    // **확실히** 기대 이상이다(보수적 기준선). 위끝 0.6은 기대치의 1.4배로 잡은 관례.
    neutral: EXPECTED_VS_STRONGER,
    scaleWhy: `레이팅 +50 이상 상대 승률. 기준선 ${(EXPECTED_VS_STRONGER * 100).toFixed(1)}%는 Elo 기대승률(Δ=50)`,
    fmt: pctText,
  },
];

/**
 * 축별 기준값 — 모집단 분위수. **제품 경로에서는 쓰지 않는다.**
 *
 * hexScores() 는 이제 이걸 받지 않는다(위 '왜 절대 눈금인가' 참조).
 * 남겨둔 이유는 scripts/ 의 탐색·검증용 스크립트가 분포를 그려볼 때 쓰기 때문이다.
 * **탐색에 쓰는 것은 괜찮고, 점수 계산에 들이는 것이 문제였다.**
 */
export type HexBaseline = Record<string, number[]>;

export interface HexScore {
  key: string;
  label: string;
  desc: string;
  /** 원래 값. 낼 수 없으면 null. */
  raw: number | null;
  /** 원래 값의 표기(단위 포함). raw 가 null 이면 null. */
  rawText: string | null;
  /**
   * 눈금 위 위치 0~100. **조회자의 전적과 고정 상수만으로 정해진다.**
   * 낼 수 없으면 null — 0 으로 채우지 않는다.
   */
  value: number | null;
  /** 중립값의 눈금 위 위치 0~100. 중립이 없는 축은 null. */
  neutral: number | null;
  /** 눈금 아래끝·위끝의 표기 — 화면이 "무엇의 0이고 무엇의 100인지" 밝히게 한다. */
  minText: string;
  maxText: string;
  /** 눈금 근거 한 줄. */
  scaleWhy: string;
}

/** 눈금 위 위치. 범위를 벗어나면 끝에 붙인다. */
function place(ax: HexAxis, v: number): number {
  const t = ((v - ax.min) / (ax.max - ax.min)) * 100;
  return Math.round(Math.min(100, Math.max(0, t)) * 10) / 10;
}

/**
 * 육각형 점수.
 *
 * **인자가 records 하나뿐인 것이 이 함수의 계약이다** — 남의 전적이 끼어들 자리가
 * 아예 없다. 두 번째 인자를 다시 만들고 싶어지면 위 '왜 절대 눈금인가'를 먼저 읽을 것.
 * scripts/check-hexagon.ts 가 이 계약을 검사한다.
 *
 * 표본이 모자라 못 내는 축은 value 가 null 이다 — 0 으로 채우지 않는다.
 * 0 으로 채우면 "이 사람은 이 항목이 바닥"으로 읽히는데, 사실은 '모른다'다.
 */
export function hexScores(records: MatchRecord[]): HexScore[] {
  return HEX_AXES.map((ax) => {
    const raw = ax.calc(records);
    return {
      key: ax.key,
      label: ax.label,
      desc: ax.desc,
      raw,
      rawText: raw === null ? null : ax.fmt(raw),
      value: raw === null ? null : place(ax, raw),
      neutral: ax.neutral === null ? null : place(ax, ax.neutral),
      minText: ax.fmt(ax.min),
      maxText: ax.fmt(ax.max),
      scaleWhy: ax.scaleWhy,
    };
  });
}
