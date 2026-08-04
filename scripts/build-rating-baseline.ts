// 레이팅 백분위의 모집단 분포를 만든다 — **자동 생성. 결과 파일을 손으로 고치지 말 것.**
//
//   npx tsx scripts/build-rating-baseline.ts [표본창수]
//
// ── 왜 이건 인구 데이터를 써도 되나 ────────────────────────────────
// lib/tekken/hexagon.ts 에서 백분위를 걷어냈던 것과 반대로 보이지만 다른 얘기다.
// 거기서는 **개인 지표(실력·지구력…)를 남과 비교해 점수로 만들었다** — 조회자가 한 판도
// 안 쳤는데 모집단이 바뀌면 값이 변하는 게 문제였다.
// 여기서 만드는 것은 "상위 몇 %" 자체다. **인구 비교가 곧 그 지표의 정의**라
// 모집단이 바뀌면 값이 바뀌는 게 정상이다. 대신 지켜야 할 것이 있다:
//   - 표본 수와 기준 시점을 화면에 같이 밝힌다(감출 수 없게 파일에 박아 내보낸다).
//   - '전체 유저'가 아니라 **'그 시점에 랭크를 돌던 사람들'** 이라고 말한다.
//
// ── 표본의 성격 (과장하지 말 것) ───────────────────────────────────
// /api/replays 는 요청 하나당 700초치 전 세계 리플레이를 준다(실측 ~4,200경기).
// 여기서 나오는 건 **그 시간대에 랭크를 돌던 사람들**이다. 게임을 사놓고 안 하는
// 사람은 안 잡히고, 많이 치는 사람일수록 표본에 들어올 확률이 높다.
// 그래서 창을 하루 곳곳에 흩어 뽑고, 플레이어 단위로 중복을 제거한다.
// 그래도 '활동 중인 플레이어 기준'이지 '보유자 전체 기준'이 아니다.
//
// 레이트리밋: 문서상 "요청을 한 번에 하나씩이면 안 걸린다". 순차로만 돈다.

import { writeFileSync } from 'node:fs';

const API = 'https://wank.wavu.wiki/api/replays';
/** 창 사이 간격(초). 700 이면 연속 구간이라, 하루에 흩어지게 크게 벌린다. */
const STEP_SEC = 7000;
const WINDOWS = Number(process.argv[2] ?? 14);

interface Replay {
  battle_at: number;
  p1_polaris_id: string | null;
  p1_rank: number | null;
  p1_rating_before: number | null;
  p1_rating_change: number | null;
  p2_polaris_id: string | null;
  p2_rank: number | null;
  p2_rating_before: number | null;
  p2_rating_change: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 플레이어별로 **가장 최근 관측 하나만** 남긴다. 많이 친 사람이 여러 번 세어지면
  // 분포가 헤비 유저 쪽으로 밀린다.
  const seen = new Map<string, { at: number; rating: number; rank: number }>();
  let before: number | undefined;
  let fetched = 0;

  for (let w = 0; w < WINDOWS; w++) {
    const url = before === undefined ? API : `${API}?before=${before}`;
    const res = await fetch(url, { headers: { 'accept-encoding': 'gzip' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
    const rows = (await res.json()) as Replay[];
    if (!rows.length) break;
    fetched += rows.length;

    for (const r of rows) {
      for (const p of [1, 2] as const) {
        const id = p === 1 ? r.p1_polaris_id : r.p2_polaris_id;
        const rank = p === 1 ? r.p1_rank : r.p2_rank;
        const rb = p === 1 ? r.p1_rating_before : r.p2_rating_before;
        const rc = p === 1 ? r.p1_rating_change : r.p2_rating_change;
        if (!id || rank == null || rb == null || rb <= 0) continue;
        const rating = rb + (rc ?? 0);
        const prev = seen.get(id);
        if (!prev || r.battle_at > prev.at) seen.set(id, { at: r.battle_at, rating, rank });
      }
    }

    const oldest = Math.min(...rows.map((r) => r.battle_at));
    before = oldest - STEP_SEC;
    console.error(
      `  창 ${w + 1}/${WINDOWS}: +${rows.length}경기 · 누적 고유 ${seen.size.toLocaleString()}명`,
    );
    await sleep(1200); // 한 번에 하나씩
  }

  const players = [...seen.values()];
  players.sort((a, b) => a.rating - b.rating);
  const ratings = players.map((p) => p.rating);
  const n = ratings.length;
  if (n < 1000) throw new Error(`표본이 ${n}명뿐이다 — 창 수를 늘릴 것`);

  // 0·1·…·100 백분위 (101개). 화면에서 선형보간으로 읽는다.
  const q: number[] = [];
  for (let i = 0; i <= 100; i++) {
    const pos = (i / 100) * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(n - 1, lo + 1);
    q.push(Math.round(ratings[lo] + (ratings[hi] - ratings[lo]) * (pos - lo)));
  }

  const rankCount = new Map<number, number>();
  for (const p of players) rankCount.set(p.rank, (rankCount.get(p.rank) ?? 0) + 1);
  const ranks = [...rankCount.keys()].sort((a, b) => a - b);

  const today = new Date().toISOString().slice(0, 10);
  const out = `// 레이팅 백분위 기준값 — **자동 생성. 손으로 고치지 말 것.**
//
//   npx tsx scripts/build-rating-baseline.ts <창수>
//
// 표본 ${n.toLocaleString()}명 (경기 ${fetched.toLocaleString()}건에서 중복 제거) · ${today} 수집.
// 출처: wank.wavu.wiki /api/replays — 요청 하나당 700초치 전 세계 리플레이.
//
// **'활동 중인 플레이어' 기준이다.** 게임을 사놓고 안 하는 사람은 안 잡힌다.
// 화면에서 이 사실과 표본 수·시점을 반드시 같이 밝힐 것 —
// "상위 몇 %"는 무엇 대비인지를 감추면 거짓말이 된다.
//
// 시즌이 바뀌면 다시 돌린다. 레이팅 분포가 통째로 움직인다.
//
//   최저 ${ratings[0]} · 하위25% ${q[25]} · 중앙 ${q[50]} · 상위25% ${q[75]} · 최고 ${ratings[n - 1]}
//   단(rank) 관측 범위 ${ranks[0]}~${ranks[ranks.length - 1]}

/** 0·1·…·100 백분위의 레이팅 값 (101개, 오름차순). */
export const RATING_QUANTILES: number[] = ${JSON.stringify(q)};

/** 표본 크기 — 화면에 같이 낸다. */
export const RATING_BASELINE_N = ${n};

/** 수집 시점 (yyyy-MM-dd) — 화면에 같이 낸다. */
export const RATING_BASELINE_AT = '${today}';
`;
  writeFileSync('lib/tekken/rating-baseline.ts', out, 'utf8');
  console.error(`\nlib/tekken/rating-baseline.ts 갱신 — 표본 ${n.toLocaleString()}명`);
  console.error(`  중앙 ${q[50]} · 상위25% ${q[75]} · 상위10% ${q[90]} · 상위1% ${q[99]}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
