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
  minG = WEAK_MIN_GAMES,
  maxWr = WEAK_MAX_WR,
): Table {
  const rows = groupByOpp(df)
    .filter((x) => x.games >= minG && wr(x.w, x.games) < maxWr)
    .sort((a, b) => wr(a.w, a.games) - wr(b.w, b.games) || b.games - a.games);
  const t = new Table('opp_char', 'Games', 'W', 'L', 'WinRate(%)');
  for (const x of rows) t.add(x.opp, x.games, x.w, x.l, wr(x.w, x.games));
  return t;
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
export function buildRound(df: MatchRecord[]): Table {
  const t = new Table(
    'my_char', 'Games', 'RoundsWon', 'RoundsLost', 'RoundWR(%)',
    'AvgRoundsWon', 'AvgRoundsLost', 'CloseGames', 'Close(%)', 'CloseWins',
    'CloseWin(%)', 'CloseLosses', 'CloseLoss(%)', 'Shutouts_Dealt',
    'ShutoutWin(%)', 'Shutouts_Received', 'ShutoutLoss(%)',
  );

  const byChar = new Map<string, MatchRecord[]>();
  for (const r of df) {
    let g = byChar.get(r.myChar);
    if (!g) {
      g = [];
      byChar.set(r.myChar, g);
    }
    g.push(r);
  }
  const perChar = [...byChar.entries()]
    .map(([c, rows]) => ({ c, rows }))
    .sort((a, b) => b.rows.length - a.rows.length);
  for (const x of perChar) t.rows.push(roundRow(x.rows, x.c));
  t.rows.push(roundRow(df, 'ALL'));
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
 * 레이팅 추이 — py build_rating_trend 포팅. 시간순(오래된→최신).
 * 기본 4열 뒤에 캐릭터명 컬럼이 붙고, 각 행은 자기 캐릭터 컬럼에만 값이 있다.
 * (차트를 '캐릭터마다 한 선'으로 그리기 위한 와이드 포맷)
 */
export function buildRatingTrend(df: MatchRecord[]): { table: Table; chars: string[] } {
  const ordered = [...df].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const chars = [...new Set(ordered.map((r) => r.myChar))].sort(cmpOIC);
  const t = new Table('dt', 'my_rating', 'my_char', 'result', ...chars);
  for (const r of ordered) {
    const row: (string | number | null)[] = [formatDt(r.dt), r.myRating, r.myChar, r.result];
    for (const c of chars) row.push(c === r.myChar ? r.myRating : null);
    t.rows.push(row);
  }
  return { table: t, chars };
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
