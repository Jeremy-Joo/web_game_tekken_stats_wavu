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
// ── 왜 백분위인가 ────────────────────────────────────────────────────────
// 원값을 그대로 0~1 축에 얹으면 전부 같은 모양이 된다. 실측 범위가 좁기 때문이다
// (지구력 0.59~0.76, 라운드 획득률 0.47~0.60). 그래서 **다른 사람들 대비 몇 %인가**로
// 환산한다. 기준값은 hexagon-baseline.ts 에 미리 계산해 둔다 — 조회할 때마다
// 남의 전적을 받아오면 느리고 wavu 에도 부담이다.

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
}

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
  },
  {
    key: 'grind',
    label: '몰입',
    desc: '한 번 잡으면 몇 판이나 하는가 (판수 ÷ 접속한 날 수).',
    calc: (rs) => {
      const days = new Set(rs.map((r) => r.dt.toISOString().slice(0, 10)));
      return days.size ? rs.length / days.size : null;
    },
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
  },
  {
    key: 'giantkill',
    label: '역상성',
    desc: '나보다 레이팅이 50 이상 높은 상대를 이기는 비율.',
    calc: (rs) => {
      const up = rs.filter((r) => r.oppRating - r.myRating >= 50);
      return up.length >= 30 ? winRate(up) : null;
    },
  },
];

/**
 * 축별 기준값 — 모집단에서 미리 뽑아둔 분위수 21개(0·5·…·100%).
 * scripts/build-hex-baseline.ts 가 만든다.
 */
export type HexBaseline = Record<string, number[]>;

export interface HexScore {
  key: string;
  label: string;
  desc: string;
  /** 원래 값. 화면에 같이 보여줘서 백분위가 무엇을 뜻하는지 감출 수 없게 한다. */
  raw: number | null;
  /** 0~100. 모집단에서 이 사람보다 낮은 사람의 비율. 낼 수 없으면 null. */
  pct: number | null;
}

/** 정렬된 분위수 배열에서 값의 백분위를 선형보간으로 찾는다. */
function percentileOf(q: number[], v: number): number {
  if (!q.length) return 50;
  if (v <= q[0]) return 0;
  if (v >= q[q.length - 1]) return 100;
  const step = 100 / (q.length - 1);
  for (let i = 1; i < q.length; i++) {
    if (v <= q[i]) {
      const span = q[i] - q[i - 1];
      const frac = span > 0 ? (v - q[i - 1]) / span : 0;
      return (i - 1) * step + frac * step;
    }
  }
  return 100;
}

/**
 * 육각형 점수.
 *
 * 표본이 모자라 못 내는 축은 pct 가 null 이다 — 0 으로 채우지 않는다.
 * 0 으로 채우면 "이 사람은 이 항목이 바닥"으로 읽히는데, 사실은 '모른다'다.
 */
export function hexScores(records: MatchRecord[], baseline: HexBaseline): HexScore[] {
  return HEX_AXES.map((ax) => {
    const raw = ax.calc(records);
    const q = baseline[ax.key];
    return {
      key: ax.key,
      label: ax.label,
      desc: ax.desc,
      raw,
      pct: raw === null || !q?.length ? null : Math.round(percentileOf(q, raw) * 10) / 10,
    };
  });
}
