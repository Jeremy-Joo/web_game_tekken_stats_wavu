// 집계 모음.
// web_game_tekken_stats_mobile 의 aggregations.ts(C# Aggregations.cs 포팅)를 기반으로,
// wavu 데이터에 맞게 조정했다:
//   - ByType 제거 — wavu 는 랭크전(battle_type=2)만 준다. 종류 구분이 무의미.
//   - buildSessions 추가 — py main.py build_sessions 포팅 (120분 공백 = 새 세션).
//   - buildRatingTrend 추가 — py build_rating_trend 포팅 (캐릭터별 한 선).
//   - h2h 는 상대 polaris_id 기준 — wavu JSON 이 상대 식별코드를 직접 준다.

import type { MatchRecord } from './models';
import { Table } from './table';
import { formatDt, formatDtMin, dateKey } from './models';
import { stageName } from '@/lib/wavu/stages';
import { rankName } from '@/lib/wavu/ranks';

/** C# Math.Round / py round 와 같은 은행가 반올림(half-to-even). */
export function roundTo(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  const x = value * f;
  const floor = Math.floor(x);
  const diff = x - floor;
  const eps = 1e-9;
  let r: number;
  if (Math.abs(diff - 0.5) < eps) {
    r = floor % 2 === 0 ? floor : floor + 1;
  } else {
    r = Math.round(x);
  }
  return r / f;
}

/**
 * 배열에서 최대/최소 뽑기. **`Math.max(...arr)` 를 쓰지 말 것.**
 *
 * 스프레드는 원소를 하나씩 **함수 인자로 펼친다.** V8 의 인자 개수 한계(대략 6.5만)를
 * 넘으면 "Maximum call stack size exceeded" 로 죽는다. 메모리와 무관하고, 배열이
 * 일정 크기를 넘는 순간 갑자기 터지는 종류의 버그다.
 *
 * 실제 사고: 138,560경기 플레이어를 비교할 때 최고 레이팅을 구하는 자리에서
 * 서버가 죽어 **본문 없는 500** 이 나갔고, 화면에는 파서 오류만 떴다.
 * (30,233 + 44,306 은 각자 한계 아래라 멀쩡히 돌아가서 더 늦게 발견됐다)
 */
export function maxBy<T>(items: readonly T[], pick: (x: T) => number): number {
  let m = -Infinity;
  for (const it of items) {
    const v = pick(it);
    if (v > m) m = v;
  }
  return m;
}

export function minBy<T>(items: readonly T[], pick: (x: T) => number): number {
  let m = Infinity;
  for (const it of items) {
    const v = pick(it);
    if (v < m) m = v;
  }
  return m;
}

export const wr = (w: number, total: number): number =>
  total > 0 ? roundTo((w * 100) / total, 2) : 0.0;

export const pct = (n: number, total: number): number =>
  total > 0 ? roundTo((n * 100) / total, 2) : 0.0;

export const avg = (n: number, games: number): number =>
  games > 0 ? roundTo(n / games, 2) : 0.0;

export function cmpOIC(a: string, b: string): number {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return A < B ? -1 : A > B ? 1 : 0;
}

// 임계값 (py main.py 상수와 동일).
export const WEAK_MIN_GAMES = 5;

/* ── 매치업 표본 보정 ──────────────────────────────────────────────
   예전에는 **표본 하한이 5판 고정**이었고 정렬이 **순수 승률순**이었다.
   그러면 표본이 작을수록 위로 온다 — 실측(JackFather 909판)에서
   강점 1위가 `Miary Zo 10판 90%` 였고 `Kazuya 49판 79.6%` 가 3위였다.
   9승 1패는 운으로도 나오지만 39승 10패는 아니다. 순서가 뒤집혀 있었다.

   두 곳을 고친다. 각자 다른 절반을 푼다.
    (1) 하한을 판수에 맞춘다 — 200판 유저와 20,000판 유저에게 같은 5판을
        요구할 이유가 없다. 다만 표본 적정성은 **절대량**이라 위로도 묶는다.
        30판이면 승률 오차가 ±9%p 수준이고, 그 이상 요구하면 쓸 수 있는
        데이터를 버리는 쪽이 된다(실측: 21,271판 유저는 41종 전부 100판 이상).
    (2) 순위를 **윌슨 하한**으로 매긴다. "적어도 이만큼은 된다"를 비교하므로
        표본이 작으면 자동으로 뒤로 밀린다. 하한을 낮춰도 5판짜리가 1위로
        올라오지 않는 이유가 이것이다. */

/** 표본 하한 — 전체 판수의 1%, 단 5~30판 사이. */
export function matchupMinGames(total: number): number {
  return Math.max(5, Math.min(30, Math.round(total / 100)));
}

/**
 * 윌슨 점수 구간. `side='lower'` 는 보수적 추정("적어도 이만큼"),
 * `'upper'` 는 낙관적 추정("잘해야 이만큼")이다.
 *
 * 강점은 하한으로 줄 세운다 — 표본이 커야 위로 온다.
 * 약점은 **상한**으로 줄 세운다 — 낙관적으로 봐도 낮아야 진짜 약점이다.
 */
export function wilsonBound(w: number, n: number, side: 'lower' | 'upper'): number {
  if (n <= 0) return side === 'lower' ? 0 : 100;
  const z = 1.96; // 95%
  const p = w / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return (((side === 'lower' ? c - m : c + m) / d) * 100);
}
export const WEAK_MAX_WR = 50.0;
export const H2H_MIN_GAMES = 2;
export const SESSION_GAP_MINUTES = 120;

interface CharAgg {
  c: string;
  w: number;
  l: number;
  total: number;
}

/** Total: 내 캐릭터별 승/패/승률 + ALL 행. */
export function buildTotal(df: MatchRecord[]): Table {
  const t = new Table('my_char', 'Total', 'W', 'L', 'WinRate(%)');

  const byChar = new Map<string, CharAgg>();
  for (const r of df) {
    let g = byChar.get(r.myChar);
    if (!g) {
      g = { c: r.myChar, w: 0, l: 0, total: 0 };
      byChar.set(r.myChar, g);
    }
    if (r.result === 'W') g.w++;
    else g.l++;
  }
  for (const g of byChar.values()) g.total = g.w + g.l;

  const groups = [...byChar.values()].sort(
    (x, y) =>
      y.total - x.total ||
      wr(y.w, y.total) - wr(x.w, x.total) ||
      cmpOIC(x.c, y.c),
  );

  for (const x of groups) t.add(x.c, x.total, x.w, x.l, wr(x.w, x.total));

  const aw = groups.reduce((s, x) => s + x.w, 0);
  const al = groups.reduce((s, x) => s + x.l, 0);
  const at = aw + al;
  t.add('ALL', at, aw, al, wr(aw, at));

  return t;
}

interface OppAgg {
  opp: string;
  w: number;
  l: number;
  games: number;
}

function groupByOpp(df: MatchRecord[]): OppAgg[] {
  const m = new Map<string, OppAgg>();
  for (const r of df) {
    let g = m.get(r.oppChar);
    if (!g) {
      g = { opp: r.oppChar, w: 0, l: 0, games: 0 };
      m.set(r.oppChar, g);
    }
    if (r.result === 'W') g.w++;
    else g.l++;
  }
  for (const g of m.values()) g.games = g.w + g.l;
  return [...m.values()];
}

/** 상대 캐릭터 피벗. */
export function buildPivot(
  df: MatchRecord[],
  sortKey: 'games' | 'winrate' = 'games',
): Table {
  const rows = groupByOpp(df);
  rows.sort((a, b) =>
    sortKey === 'winrate'
      ? wr(b.w, b.games) - wr(a.w, a.games) ||
        b.games - a.games ||
        cmpOIC(a.opp, b.opp)
      : b.games - a.games ||
        wr(b.w, b.games) - wr(a.w, a.games) ||
        cmpOIC(a.opp, b.opp),
  );
  const t = new Table('opp_char', 'Games', 'W', 'L', 'WinRate(%)');
  for (const x of rows) t.add(x.opp, x.games, x.w, x.l, wr(x.w, x.games));
  return t;
}

/** 약점 매치업 — 표본 충분 + 승률 낮은 상대 캐릭터. 약한 순 정렬. */
export function buildWeak(
  df: MatchRecord[],
  minG = matchupMinGames(df.length),
  maxWr = WEAK_MAX_WR,
): Table {
  // 낙관적으로 봐도(상한) 낮은 순 — 5판 1승4패가 40판 35% 위로 오지 않는다.
  const rows = groupByOpp(df)
    .filter((x) => x.games >= minG && wr(x.w, x.games) < maxWr)
    .sort(
      (a, b) =>
        wilsonBound(a.w, a.games, 'upper') - wilsonBound(b.w, b.games, 'upper') ||
        b.games - a.games,
    );
  const t = new Table('opp_char', 'Games', 'W', 'L', 'WinRate(%)');
  for (const x of rows) t.add(x.opp, x.games, x.w, x.l, wr(x.w, x.games));
  return t;
}

/**
 * 강점 매치업 — 약점의 대칭. 표본 충분 + 승률 높은 상대 캐릭터, 강한 순 정렬.
 * 경계(정확히 50%)는 강점 쪽에 넣어 5경기 이상인 매치업이 약점/강점 중
 * 정확히 한쪽에만 나타나게 한다.
 */
export function buildStrong(
  df: MatchRecord[],
  minG = matchupMinGames(df.length),
  minWr = WEAK_MAX_WR,
): Table {
  // 보수적으로 봐도(하한) 높은 순 — 10판 90% 보다 49판 79.6% 가 위다.
  const rows = groupByOpp(df)
    .filter((x) => x.games >= minG && wr(x.w, x.games) >= minWr)
    .sort(
      (a, b) =>
        wilsonBound(b.w, b.games, 'lower') - wilsonBound(a.w, a.games, 'lower') ||
        b.games - a.games,
    );
  const t = new Table('opp_char', 'Games', 'W', 'L', 'WinRate(%)');
  for (const x of rows) t.add(x.opp, x.games, x.w, x.l, wr(x.w, x.games));
  return t;
}

// ── 시즌/버전 나눠보기 ────────────────────────────────────────────────
//
// '시즌' 탭(계정 전체를 시즌별로 묶은 표, summaryBy 로 만듦)과 같은 발상을
// 캐릭터별(buildTotal)·매치업(buildStrong/buildWeak) 표에도 적용한다.
// 캐릭터·매치업은 이미 "무엇으로 묶을까"가 있는 표라(내 캐릭터, 상대 캐릭터),
// summaryBy 를 그대로 못 쓰고 — 시즌/버전으로 먼저 표본을 쪼갠 다음 **같은
// 집계 함수를 그룹마다 돌려 이어붙인다.** 앞에 구분 열 하나만 더 얹으면
// 결과 스키마가 기존 표와 호환돼 화면의 DataTable 을 그대로 쓸 수 있다.
function splitByPeriod(
  df: MatchRecord[],
  by: 'season' | 'version',
): { label: string; rows: MatchRecord[] }[] {
  const keyOf = by === 'season' ? (r: MatchRecord) => r.season : (r: MatchRecord) => `${r.season}-${r.gameVersion}`;
  const m = new Map<string, MatchRecord[]>();
  for (const r of df) {
    const k = keyOf(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  // S1<S2<S3 사전순=시간순(season 탭과 같은 근거). 버전도 자리수가 같아 마찬가지다.
  return [...m.entries()].sort((a, b) => cmpOIC(a[0], b[0])).map(([label, rows]) => ({ label, rows }));
}

/**
 * buildFn(records) 이 "records 배열 → 같은 컬럼 구성의 Table" 인 함수라면 뭐든
 * 재사용할 수 있는 공통 뼈대다. 그룹마다 buildFn 을 그대로 돌리고 앞에 구분
 * 열(시즌/버전)만 붙여 이어붙인다 — 컬럼 구성은 첫 그룹 결과에서 그대로 가져온다.
 */
function splitTable(
  df: MatchRecord[],
  by: 'season' | 'version',
  buildFn: (rows: MatchRecord[]) => Table,
): Table {
  const groups = splitByPeriod(df, by);
  const t = new Table(by === 'season' ? 'Season' : 'Version');
  let colsSet = false;
  for (const g of groups) {
    const sub = buildFn(g.rows);
    if (!colsSet) {
      t.columns.push(...sub.columns);
      colsSet = true;
    }
    for (const row of sub.rows) t.rows.push([g.label, ...row]);
  }
  return t;
}

/** buildTotal 을 시즌/버전으로 나눠 이어붙인다 — 앞에 구분 열이 붙는다. */
export function buildTotalSplit(df: MatchRecord[], by: 'season' | 'version'): Table {
  return splitTable(df, by, buildTotal);
}

/**
 * buildStrong/buildWeak 을 시즌/버전으로 나눠 이어붙인다.
 * 표본 하한(minG)은 **전체 df 기준으로 한 번만** 정해 모든 그룹에 그대로 쓴다 —
 * 시즌별로 다시 정하면(예: 30판 하한이 5판으로 뚝 떨어짐) 시즌 하나가 8판짜리
 * 매치업으로도 '강점'이라고 말하게 된다. 대신 표본이 정말 얇은 시즌은 매치업이
 * 아예 안 나올 수 있다 — 그게 맞는 동작이다.
 */
export function buildStrongSplit(df: MatchRecord[], by: 'season' | 'version'): Table {
  const minG = matchupMinGames(df.length);
  return splitTable(df, by, (rows) => buildStrong(rows, minG));
}

export function buildWeakSplit(df: MatchRecord[], by: 'season' | 'version'): Table {
  const minG = matchupMinGames(df.length);
  return splitTable(df, by, (rows) => buildWeak(rows, minG));
}

/** buildStage 를 시즌/버전으로 나눠 이어붙인다. */
export function buildStageSplit(df: MatchRecord[], by: 'season' | 'version'): Table {
  return splitTable(df, by, buildStage);
}

/** buildPivot 을 시즌/버전으로 나눠 이어붙인다. 정렬 기준은 기본값(판수순)으로 고정한다. */
export function buildPivotSplit(df: MatchRecord[], by: 'season' | 'version'): Table {
  return splitTable(df, by, (rows) => buildPivot(rows));
}

/** buildVsRating 을 시즌/버전으로 나눠 이어붙인다. */
export function buildVsRatingSplit(df: MatchRecord[], by: 'season' | 'version'): Table {
  return splitTable(df, by, buildVsRating);
}

/**
 * buildRound 를 시즌/버전으로 나눠 이어붙인다. **'my' 기준만** 나눈다 — 화면의
 * '상대 캐릭터별로 펼쳐보기'(roundByOpp)와는 별개 축이라, 둘을 곱하면(내 캐릭터×
 * 상대 캐릭터×시즌) 표가 과하게 커지고 화면 토글도 3차원이 돼 복잡해진다.
 */
export function buildRoundSplit(df: MatchRecord[], by: 'season' | 'version'): Table {
  return splitTable(df, by, (rows) => buildRound(rows, 'my'));
}

function roundRow(sub: MatchRecord[], label: string) {
  const games = sub.length;
  let rw = 0,
    rl = 0,
    close = 0,
    closeW = 0,
    closeL = 0,
    sd = 0,
    sr = 0;
  for (const r of sub) {
    rw += r.myRounds;
    rl += r.oppRounds;
    if (Math.abs(r.myRounds - r.oppRounds) === 1) {
      close++;
      if (r.result === 'W') closeW++;
      else closeL++;
    }
    if (r.oppRounds === 0) sd++;
    if (r.myRounds === 0) sr++;
  }
  const rtot = rw + rl;
  return [
    label, games, rw, rl, wr(rw, rtot), avg(rw, games), avg(rl, games),
    close, pct(close, games), closeW, pct(closeW, games),
    closeL, pct(closeL, games), sd, pct(sd, games), sr, pct(sr, games),
  ];
}

/** 라운드 통계 (캐릭터별 + ALL). 접전(1라운드차)·셧아웃 포함. */
/**
 * 라운드 집계.
 *
 * `by` 는 무엇으로 묶을지다.
 *  'my'  — 내 캐릭터별 (기본). "내 캐릭 중 뭐가 라운드를 잘 따나".
 *  'opp' — 상대 캐릭터별. **화면의 '상대 캐릭터별로 펼쳐보기'가 쓴다.**
 *          같은 표가 "누구를 만나면 셧아웃당하나"를 답하게 된다.
 *          캐릭터별 상세(?char=)에서 특히 값이 크다 — 거기서는 'my' 가
 *          1행 + ALL 뿐이라 볼 게 없다.
 *
 * **ALL 을 맨 위에 둔다.** 다른 표와 관례가 다른데, 여기만 행이 캐릭터 수만큼
 * (실측 41행) 늘어나서 합계가 스크롤 밖으로 밀려나기 때문이다. 기준값이 안 보이면
 * 개별 행의 40%·70%가 높은지 낮은지 판단할 수가 없다.
 *
 * 행 수는 **캐릭터 수로 묶여 있다(최대 42행)** — 경기 수에 비례하지 않는다.
 * CLAUDE.md 의 "경기수 × 무언가로 커지는 표를 싣지 말 것"에 걸리지 않는 이유다.
 */
export function buildRound(df: MatchRecord[], by: 'my' | 'opp' = 'my'): Table {
  const t = new Table(
    by === 'opp' ? 'opp_char' : 'my_char',
    'Games', 'RoundsWon', 'RoundsLost', 'RoundWR(%)',
    'AvgRoundsWon', 'AvgRoundsLost', 'CloseGames', 'Close(%)', 'CloseWins',
    'CloseWin(%)', 'CloseLosses', 'CloseLoss(%)', 'Shutouts_Dealt',
    'ShutoutWin(%)', 'Shutouts_Received', 'ShutoutLoss(%)',
  );

  const byChar = new Map<string, MatchRecord[]>();
  for (const r of df) {
    const key = by === 'opp' ? r.oppChar : r.myChar;
    let g = byChar.get(key);
    if (!g) {
      g = [];
      byChar.set(key, g);
    }
    g.push(r);
  }
  const perChar = [...byChar.entries()]
    .map(([c, rows]) => ({ c, rows }))
    .sort((a, b) => b.rows.length - a.rows.length);
  // 합계가 먼저다 — 아래 개별 행을 읽을 기준이 되어야 하므로 맨 위에 둔다.
  if (df.length) t.rows.push(roundRow(df, 'ALL'));
  for (const x of perChar) t.rows.push(roundRow(x.rows, x.c));
  return t;
}

interface H2hAgg {
  pol: string;
  w: number;
  l: number;
  games: number;
  last: Date;
  names: Map<string, number>;
  chars: Map<string, number>;
}

/**
 * 상대전적 — 상대 polaris_id 로 그룹화.
 * (wavu JSON 이 상대 식별코드를 직접 주므로 닉네임 동명이인 문제가 없다.
 *  캐릭터는 그 상대가 가장 많이 쓴 것을 대표로 표기.)
 */
export function buildH2h(df: MatchRecord[], minG = H2H_MIN_GAMES): Table {
  const m = new Map<string, H2hAgg>();
  for (const r of df) {
    const key = r.oppPolaris || r.oppName; // 식별코드 없는 옛 데이터 대비
    let g = m.get(key);
    if (!g) {
      g = { pol: r.oppPolaris, w: 0, l: 0, games: 0, last: r.dt, names: new Map(), chars: new Map() };
      m.set(key, g);
    }
    if (r.result === 'W') g.w++;
    else g.l++;
    if (r.dt.getTime() > g.last.getTime()) g.last = r.dt;
    if (r.oppName) g.names.set(r.oppName, (g.names.get(r.oppName) ?? 0) + 1);
    g.chars.set(r.oppChar, (g.chars.get(r.oppChar) ?? 0) + 1);
  }

  const top = (mm: Map<string, number>, fallback: string): string => {
    let best = -1;
    let out = fallback;
    for (const [k, c] of mm)
      if (c > best) {
        best = c;
        out = k;
      }
    return out;
  };

  const rows = [...m.values()]
    .map((g) => ({
      ...g,
      games: g.w + g.l,
      name: top(g.names, '(unknown)'),
      char: top(g.chars, '?'),
    }))
    .filter((x) => x.games >= minG)
    .sort(
      (a, b) =>
        b.games - a.games ||
        wr(b.w, b.games) - wr(a.w, a.games) ||
        cmpOIC(a.name, b.name),
    );

  const t = new Table(
    'opp_name', 'opp_polaris', 'main_char', 'Games', 'W', 'L', 'WinRate(%)', 'LastPlayed',
  );
  for (const x of rows)
    t.add(x.name, x.pol, x.char, x.games, x.w, x.l, wr(x.w, x.games), formatDt(x.last));
  return t;
}

interface DailyAgg {
  date: string;
  myChar: string;
  w: number;
  l: number;
  delta: number;
  endRating: number;
  lastDt: Date;
}

/** 일별 집계 (KST 날짜 × 캐릭터). 최신 날짜 우선. */
export function buildDaily(df: MatchRecord[]): Table {
  const m = new Map<string, DailyAgg>();
  for (const r of df) {
    const d = dateKey(r.dt);
    const key = `${d} ${r.myChar}`;
    let g = m.get(key);
    if (!g) {
      g = { date: d, myChar: r.myChar, w: 0, l: 0, delta: 0, endRating: r.myRating, lastDt: r.dt };
      m.set(key, g);
    }
    if (r.result === 'W') g.w++;
    else g.l++;
    g.delta += r.myDelta;
    if (r.dt.getTime() >= g.lastDt.getTime()) {
      g.lastDt = r.dt;
      g.endRating = r.myRating;
    }
  }

  const rows = [...m.values()]
    .map((g) => ({ ...g, games: g.w + g.l }))
    .sort(
      (a, b) =>
        (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
        b.games - a.games ||
        cmpOIC(a.myChar, b.myChar),
    );

  const t = new Table('Date', 'my_char', 'Games', 'W', 'L', 'WinRate(%)', 'RatingDelta', 'EndRating');
  for (const x of rows)
    t.add(x.date, x.myChar, x.games, x.w, x.l, wr(x.w, x.games), x.delta, x.endRating);
  return t;
}

/**
 * 세션 집계 — py main.py build_sessions 포팅.
 * 직전 경기와 SESSION_GAP_MINUTES 이상 비면 새 세션(캐릭터 무관, 시간 기준).
 * 세션 안에서 캐릭터별로 분리해 한 행씩. 최신 세션 우선.
 */
export function buildSessions(
  df: MatchRecord[],
  gapMinutes = SESSION_GAP_MINUTES,
): Table {
  const t = new Table(
    'Session', 'Start', 'End', 'my_char', 'Games', 'W', 'L',
    'WinRate(%)', 'RatingDelta', 'EndRating',
  );
  if (df.length === 0) return t;

  const ordered = [...df].sort((a, b) => a.dt.getTime() - b.dt.getTime());

  // 세션 경계 나누기
  const sessions: MatchRecord[][] = [];
  let cur: MatchRecord[] = [ordered[0]];
  for (let i = 1; i < ordered.length; i++) {
    const gapMs = ordered[i].dt.getTime() - ordered[i - 1].dt.getTime();
    if (gapMs > gapMinutes * 60 * 1000) {
      sessions.push(cur);
      cur = [];
    }
    cur.push(ordered[i]);
  }
  sessions.push(cur);

  interface Row {
    label: string;
    start: string;
    end: string;
    char: string;
    w: number;
    l: number;
    delta: number;
    endRating: number;
  }
  const rows: Row[] = [];
  for (const sess of sessions) {
    const label = formatDtMin(sess[0].dt);
    const start = label;
    const end = formatDtMin(sess[sess.length - 1].dt);
    const byChar = new Map<string, MatchRecord[]>();
    for (const r of sess) {
      let g = byChar.get(r.myChar);
      if (!g) {
        g = [];
        byChar.set(r.myChar, g);
      }
      g.push(r);
    }
    for (const [char, sub] of byChar) {
      let w = 0,
        l = 0,
        delta = 0;
      for (const r of sub) {
        if (r.result === 'W') w++;
        else l++;
        delta += r.myDelta;
      }
      rows.push({
        label, start, end, char, w, l, delta,
        endRating: sub[sub.length - 1].myRating,
      });
    }
  }

  rows.sort(
    (a, b) =>
      (a.label < b.label ? 1 : a.label > b.label ? -1 : 0) ||
      b.w + b.l - (a.w + a.l) ||
      cmpOIC(a.char, b.char),
  );
  for (const x of rows) {
    const games = x.w + x.l;
    t.add(x.label, x.start, x.end, x.char, games, x.w, x.l, wr(x.w, games), x.delta, x.endRating);
  }
  return t;
}

/**
 * 레이팅 추이 — 시간순(오래된→최신). **경기당 4칸의 좁은 포맷.**
 *
 * 예전에는 여기서 캐릭터마다 컬럼을 만들어 자기 칸에만 값을 넣는 와이드 포맷을 냈다
 * (py build_rating_trend 와 같은 형태). 그 비용은 `경기수 × 캐릭터수` 로 **곱해진다** —
 * 실측(30,233경기 · 39캐릭): 130만 셀 중 88.4%가 null, 응답 하나에 6.83MB.
 *
 * 그런데 그래프(TrendChart)는 처음부터 앞 3칸만 읽고 캐릭터 컬럼은 건드리지 않는다.
 * '이 점이 어느 캐릭터 것인가'는 my_char 이 이미 답하고, 선 나누기는 그리는 쪽이 한다.
 * 즉 그 컬럼들은 전송만 되고 아무도 안 쓰는 값이었다.
 *
 * 엑셀은 사정이 다르다 — 시트에서 캐릭터별 계열로 차트를 그리려면 와이드가 필요하고,
 * 파일은 네트워크로 흐르지도 않는다. 그래서 xlsx 경로만 widenTrend() 로 펼친다.
 */
export function buildRatingTrend(df: MatchRecord[]): { table: Table; chars: string[] } {
  const ordered = [...df].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const chars = [...new Set(ordered.map((r) => r.myChar))].sort(cmpOIC);
  const t = new Table('dt', 'my_rating', 'my_char', 'result');
  for (const r of ordered) t.add(formatDt(r.dt), r.myRating, r.myChar, r.result);
  return { table: t, chars };
}

/**
 * 좁은 trend → 캐릭터별 컬럼을 펼친 와이드 표. **엑셀 전용.**
 * py/WPF 결과물과 같은 형태를 유지해 시트에서 바로 차트를 만들 수 있게 한다.
 */
export function widenTrend(narrow: Table, chars: string[]): Table {
  const ci = narrow.columns.indexOf('my_char');
  const ri = narrow.columns.indexOf('my_rating');
  const t = new Table(...narrow.columns, ...chars);
  for (const row of narrow.rows) {
    const ch = row[ci];
    const rating = row[ri];
    t.rows.push([...row, ...chars.map((c) => (c === ch ? rating : null))]);
  }
  return t;
}

/* ══════════════════════════════════════════════════════════════════
   아래 넷은 이미 수집·정규화까지 해놓고 쓰지 않던 필드를 살린 것이다.
   (myRank/oppRating 은 집계에서 한 번도 안 쓰였다)
   추가 수집 없이 만들어지므로 wavu 요청은 늘지 않는다.
   `stageId` 도 같은 처지지만 이름을 알 길이 없어 남겨뒀다 — 이 파일 아래쪽 주석 참조.
   ══════════════════════════════════════════════════════════════════ */

/** 경기 **직전** 레이팅 = 경기 후 값 - 변동. 상대와의 실력차는 이 값으로 봐야 맞다. */
const ratingBefore = (r: MatchRecord) => r.myRating - r.myDelta;
const oppRatingBefore = (r: MatchRecord) => r.oppRating - r.oppDelta;

// 레이팅차 구간 — 상대가 나보다 얼마나 위/아래였나. 경계는 표시 순서를 겸한다.
const DIFF_BANDS: { label: string; lo: number; hi: number }[] = [
  { label: '-300 이하 (내가 훨씬 위)', lo: -Infinity, hi: -300 },
  { label: '-300 ~ -150', lo: -300, hi: -150 },
  { label: '-150 ~ -50', lo: -150, hi: -50 },
  { label: '-50 ~ +50 (비슷)', lo: -50, hi: 50 },
  { label: '+50 ~ +150', lo: 50, hi: 150 },
  { label: '+150 ~ +300', lo: 150, hi: 300 },
  { label: '+300 이상 (상대가 훨씬 위)', lo: 300, hi: Infinity },
];

/**
 * 상대 레이팅대별 성적.
 *
 * 전체 승률 하나만 보면 55%가 '만만한 상대만 이겨서'인지 '강자도 잡아서'인지 알 수 없다.
 * 레이팅차로 갈라 보면 그게 드러난다. 레이팅은 경기 **직전** 값을 쓴다.
 */
export function buildVsRating(df: MatchRecord[]): Table {
  const t = new Table(
    'RatingGap', 'Games', 'W', 'L', 'WinRate(%)', 'AvgRatingDelta', 'Share(%)',
  );
  const agg = DIFF_BANDS.map((b) => ({ b, w: 0, l: 0, delta: 0 }));
  let counted = 0;

  for (const r of df) {
    const my = ratingBefore(r);
    const op = oppRatingBefore(r);
    // 레이팅이 아직 안 붙은 경기(둘 중 하나가 0)는 실력차를 말할 수 없다 — 뺀다.
    if (my <= 0 || op <= 0) continue;
    const diff = op - my;
    const g = agg.find((x) => diff >= x.b.lo && diff < x.b.hi);
    if (!g) continue;
    if (r.result === 'W') g.w++;
    else g.l++;
    g.delta += r.myDelta;
    counted++;
  }

  for (const x of agg) {
    const games = x.w + x.l;
    if (games === 0) continue; // 빈 구간은 행을 만들지 않는다
    t.add(x.b.label, games, x.w, x.l, wr(x.w, games), avg(x.delta, games), pct(games, counted));
  }
  return t;
}

/**
 * 승단 이력 — 단이 바뀐 시점만 한 줄씩. 최신 우선.
 *
 * 단별 누적 통계가 아니라 **사건 기록**이다. "언제 올라갔고 언제 떨어졌나,
 * 그 직전 단에서 얼마나 버텼나"가 레이팅 숫자보다 체감에 가깝다.
 *
 * 단 이름은 붙이지 않는다 — wavu 가 노출하지 않아 숫자 그대로다
 * (lib/wavu/chars.ts 와 같은 방침: 추측한 이름은 숫자보다 나쁘다).
 * 오르내림은 숫자 크기로 판정하므로 이름을 몰라도 방향은 정확하다.
 */
export function buildRankHistory(df: MatchRecord[]): Table {
  const t = new Table(
    'dt', 'From', 'To', 'Change', 'my_char', 'my_rating', 'PrevGames', 'PrevWinRate(%)',
  );
  const ordered = df
    .filter((r) => r.myRank != null)
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());
  if (ordered.length === 0) return t;

  interface Ev {
    dt: Date;
    from: number;
    to: number;
    char: string;
    rating: number;
    games: number;
    w: number;
  }
  const events: Ev[] = [];

  // **단은 캐릭터마다 따로 간다.** 하나의 cur 로 전체를 추적하면 캐릭터를 갈아탈 때
  // 없던 승단·강등이 생긴다 — Jack-8(28단)로 치다 Zafina(27단)로 바꾸면 '▼강등 28→27'
  // 이 기록됐다. 실측(JackFather 909경기): 58건 중 7건이 이 가짜였다.
  // 직전 단 성적(segW/segL)도 같은 이유로 캐릭터별로 센다.
  const cur = new Map<string, { rank: number; w: number; l: number }>();

  for (const r of ordered) {
    let c = cur.get(r.myChar);
    if (!c) {
      // 이 캐릭의 첫 경기 — 시작 단일 뿐 승단이 아니다.
      cur.set(r.myChar, { rank: r.myRank, w: 0, l: 0 });
      c = cur.get(r.myChar)!;
    } else if (r.myRank !== c.rank) {
      // 직전 단에서의 성적은 이 경기 **이전**까지다 — 이 경기는 새 단 소속.
      events.push({
        dt: r.dt,
        from: c.rank,
        to: r.myRank,
        char: r.myChar,
        rating: r.myRating,
        games: c.w + c.l,
        w: c.w,
      });
      c.rank = r.myRank;
      c.w = 0;
      c.l = 0;
    }
    if (r.result === 'W') c.w++;
    else c.l++;
  }

  // 단은 이름으로 싣는다 — `27 → 28` 은 단을 외우고 있어야 읽힌다(ranks.ts).
  // 승단/강등 판정은 이름이 아니라 **숫자로** 남긴다. 이름 비교는 사전순이라
  // 'God of Destruction II' < 'God of Destruction I' 처럼 거꾸로 뒤집힌다.
  for (const x of events.reverse())
    t.add(
      formatDt(x.dt).slice(0, 16),
      rankName(x.from),
      rankName(x.to),
      x.to > x.from ? '▲ 승단' : '▼ 강등',
      x.char,
      x.rating,
      x.games,
      wr(x.w, x.games),
    );
  return t;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 시간대·요일 패턴. 두 표를 한 탭에 담는다 (탭이 무한정 늘지 않게).
 * `dt` 는 KST 벽시계를 UTC 필드에 담고 있으므로 getUTC* 로 읽는다(models.ts 규약).
 *
 * `shiftMinutes` — KST 로부터의 차이(분). 0 이면 지금까지와 똑같이 KST 로 묶는다.
 * 외국 플레이어를 그 사람 현지 시각으로 보기 위한 것이다 (lib/wavu/region.ts).
 * **이 표에만 적용한다.** 일별·세션·기간 필터·엑셀 파일명은 KST 로 남는다 —
 * 그쪽까지 흔들면 '기간 2026-08-01~08-02' 의 의미가 조회 대상에 따라 달라지고,
 * 두 사람을 비교할 때 같은 날짜가 다른 구간을 가리키게 된다.
 * 요일도 같이 민다: UTC-8 의 토요일 밤은 KST 로 일요일이라, 시각만 밀면 어긋난다.
 */
export function buildTimePatterns(df: MatchRecord[], shiftMinutes = 0): Table {
  const t = new Table('Unit', 'Bucket', 'Games', 'W', 'L', 'WinRate(%)', 'AvgRatingDelta');

  const push = (unit: string, label: string, rows: MatchRecord[]) => {
    if (rows.length === 0) return;
    let w = 0,
      delta = 0;
    for (const r of rows) {
      if (r.result === 'W') w++;
      delta += r.myDelta;
    }
    t.add(unit, label, rows.length, w, rows.length - w, wr(w, rows.length), avg(delta, rows.length));
  };

  const byHour = new Map<number, MatchRecord[]>();
  const byDow = new Map<number, MatchRecord[]>();
  const bucket = (m: Map<number, MatchRecord[]>, k: number, r: MatchRecord) => {
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  };
  for (const r of df) {
    // shiftMinutes 가 0 이면 새 Date 를 만들지 않는다 — 흔한 경로(KST)를 그대로 둔다.
    const d = shiftMinutes ? new Date(r.dt.getTime() + shiftMinutes * 60_000) : r.dt;
    bucket(byHour, d.getUTCHours(), r);
    bucket(byDow, d.getUTCDay(), r);
  }
  for (let h = 0; h < 24; h++) push('시간대', `${String(h).padStart(2, '0')}시`, byHour.get(h) ?? []);
  for (let d = 0; d < 7; d++) push('요일', WEEKDAYS[d], byDow.get(d) ?? []);
  return t;
}

// 세션 안 몇 번째 경기인지 구간 (피로도 확인용).
// 라벨에 '세션'을 붙여둔 이유: 흐름 표는 구분 열 없이 항목만 보여주므로
// 라벨 하나만 읽고도 무슨 기준인지 알 수 있어야 한다.
const NTH_BANDS: [string, number, number][] = [
  ['세션 1~5번째', 1, 5],
  ['세션 6~10번째', 6, 10],
  ['세션 11~20번째', 11, 20],
  ['세션 21~30번째', 21, 30],
  ['세션 31번째 이상', 31, Infinity],
];

/**
 * '흐름' — 최근 폼 / 세션 내 순번(피로도) / 연승·연패 직후 / 연속 기록.
 *
 * 넷을 한 탭에 담는 이유: 각각은 표 몇 줄이라 탭을 따로 낼 만큼이 아니고,
 * 넷 다 "지금 계속할까 그만할까"라는 한 가지 질문에 답하기 때문이다.
 *
 * 구분 열은 두지 않는다 — 항목 라벨이 스스로 무슨 기준인지 말하게 써놨다
 * ('세션 11~20번째', '3연패 이상 직후'처럼).
 */
export function buildFlow(
  df: MatchRecord[],
  gapMinutes = SESSION_GAP_MINUTES,
): Table {
  const t = new Table('Bucket', 'Games', 'W', 'L', 'WinRate(%)');
  if (df.length === 0) return t;

  const ordered = [...df].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const add = (label: string, rows: MatchRecord[]) => {
    if (!rows.length) return;
    const w = rows.filter((r) => r.result === 'W').length;
    t.add(label, rows.length, w, rows.length - w, wr(w, rows.length));
  };

  // ── 최근 폼: 최근 N경기가 전체와 다른가 ──
  const recent = [...ordered].reverse();
  for (const n of [20, 50, 100]) {
    if (ordered.length > n) add(`최근 ${n}경기`, recent.slice(0, n));
  }
  add('전체 평균', ordered);

  // ── 세션 내 순번: 오래 할수록 떨어지는가 ──
  const nth: MatchRecord[][] = NTH_BANDS.map(() => []);
  let idx = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && ordered[i].dt.getTime() - ordered[i - 1].dt.getTime() > gapMinutes * 60_000)
      idx = 0;
    idx++;
    const b = NTH_BANDS.findIndex(([, lo, hi]) => idx >= lo && idx <= hi);
    if (b >= 0) nth[b].push(ordered[i]);
  }
  NTH_BANDS.forEach(([label], i) => add(label, nth[i]));

  // ── 연승·연패 직후: 흐름을 타는가, 무너지는가 ──
  const after: Record<string, MatchRecord[]> = {
    '2연승 직후': [],
    '3연승 이상 직후': [],
    '2연패 직후': [],
    '3연패 이상 직후': [],
  };
  let run = 0; // 양수=연승, 음수=연패
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0) {
      if (run >= 3) after['3연승 이상 직후'].push(ordered[i]);
      else if (run === 2) after['2연승 직후'].push(ordered[i]);
      else if (run <= -3) after['3연패 이상 직후'].push(ordered[i]);
      else if (run === -2) after['2연패 직후'].push(ordered[i]);
    }
    const won = ordered[i].result === 'W';
    run = won ? (run > 0 ? run + 1 : 1) : run < 0 ? run - 1 : -1;
  }
  for (const [k, v] of Object.entries(after)) add(k, v);

  // ── 연속 기록: 최장 연승/연패와 현재 상태 ──
  let bestW = 0,
    bestL = 0,
    cur = 0;
  for (const r of ordered) {
    cur = r.result === 'W' ? (cur > 0 ? cur + 1 : 1) : cur < 0 ? cur - 1 : -1;
    if (cur > bestW) bestW = cur;
    if (-cur > bestL) bestL = -cur;
  }
  t.add('최장 연승', bestW, bestW, 0, 100);
  t.add('최장 연패', bestL, 0, bestL, 0);
  t.add(
    cur >= 0 ? '현재 연승' : '현재 연패',
    Math.abs(cur),
    cur >= 0 ? cur : 0,
    cur < 0 ? -cur : 0,
    cur >= 0 ? 100 : 0,
  );
  return t;
}

/**
 * 스테이지별 성적.
 *
 * **오래 못 만들던 표다.** `stage_id` 는 계속 수집하고 있었지만 이름을 알 길이 없어
 * `#500 70.14%` 같은 읽을 수 없는 행만 나왔고, 그래서 한 번 만들었다가 뺐다.
 * 2026-08-04 에 매핑을 확보·검증해서 되살렸다 — `lib/wavu/stages.ts` 와
 * docs/population-features.md 5-B 에 근거가 있다.
 *
 * 변형(낮/저녁)은 `stageKey` 가 묶는다. 묶는 근거도 빈도 실측이다 —
 * Urban Square 두 종은 합쳐서 한 칸이지만 Arena 와 Arena (Underground) 는 각자 한 칸이라,
 * 앞은 묶고 뒤는 안 묶는다. stages.ts 의 STAGE_MERGE 주석 참조.
 *
 * 원본에 `stage_id` 가 없는 경기는 `#?` 로 **표에 남긴다.** 빼면 합계가 안 맞는데
 * 왜 안 맞는지 화면에서 알 수 없게 된다.
 */
export function buildStage(df: MatchRecord[]): Table {
  const t = new Table('stage', 'Total', 'W', 'L', 'WinRate(%)');

  const byStage = new Map<string, { name: string; w: number; l: number }>();
  for (const r of df) {
    const name = stageName(r.stageId);
    let g = byStage.get(name);
    if (!g) {
      g = { name, w: 0, l: 0 };
      byStage.set(name, g);
    }
    if (r.result === 'W') g.w++;
    else g.l++;
  }

  const groups = [...byStage.values()]
    .map((g) => ({ ...g, total: g.w + g.l }))
    .sort((x, y) => y.total - x.total || wr(y.w, y.total) - wr(x.w, x.total) || cmpOIC(x.name, y.name));

  for (const g of groups) t.add(g.name, g.total, g.w, g.l, wr(g.w, g.total));

  const aw = groups.reduce((s, x) => s + x.w, 0);
  const al = groups.reduce((s, x) => s + x.l, 0);
  t.add('ALL', aw + al, aw, al, wr(aw, aw + al));

  return t;
}

/** 임의 키 요약 (시즌별 등). */
export function summaryBy(
  df: MatchRecord[],
  key: (r: MatchRecord) => string,
  keyName: string,
): Table {
  const m = new Map<string, { key: string; w: number; l: number }>();
  for (const r of df) {
    const k = key(r);
    let g = m.get(k);
    if (!g) {
      g = { key: k, w: 0, l: 0 };
      m.set(k, g);
    }
    if (r.result === 'W') g.w++;
    else g.l++;
  }
  const rows = [...m.values()].map((g) => ({ ...g, games: g.w + g.l }));
  rows.sort((a, b) => cmpOIC(a.key, b.key));
  const t = new Table(keyName, 'Games', 'W', 'L', 'WinRate(%)');
  for (const x of rows) t.add(x.key, x.games, x.w, x.l, wr(x.w, x.games));
  return t;
}
