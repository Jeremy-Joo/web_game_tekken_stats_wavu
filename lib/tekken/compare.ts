// 여러 명 비교 — C# CompareReport.cs 의 웹 이식.
// overview(지표×플레이어) / 시즌별 / 캐릭터별 / 맞대결 / 공통 상대.
// (ByType 시트는 wavu 가 랭크전만 주므로 뺐다)

import type { MatchRecord } from './models';
import { formatDt, dateKey } from './models';
import { Table } from './table';
import { wr, roundTo, cmpOIC } from './aggregations';
import type { TabData } from './compute';

export interface ComparePlayer {
  polarisId: string;
  name: string;
  records: MatchRecord[];
}

/** 이름이 겹치면 식별코드 앞 6자를 붙여 구분. (C# BuildLabels 와 동일) */
function buildLabels(players: ComparePlayer[]): Map<ComparePlayer, string> {
  const count = new Map<string, number>();
  for (const p of players) {
    const base = (p.name || p.polarisId).toUpperCase();
    count.set(base, (count.get(base) ?? 0) + 1);
  }
  const labels = new Map<ComparePlayer, string>();
  for (const p of players) {
    const base = p.name || p.polarisId;
    labels.set(
      p,
      (count.get(base.toUpperCase()) ?? 0) > 1
        ? `${base} (${p.polarisId.slice(0, 6)})`
        : base,
    );
  }
  return labels;
}

const tab = (key: string, label: string, t: Table): TabData => ({
  key,
  label,
  columns: t.columns,
  rows: t.rows,
});

export function computeCompare(players: ComparePlayer[]): TabData[] {
  const labels = buildLabels(players);
  const L = (p: ComparePlayer) => labels.get(p)!;

  // ── overview: 지표 × 플레이어 ──
  const overview = new Table('지표', ...players.map(L));
  const row = (metric: string, val: (p: ComparePlayer) => string | number) =>
    overview.add(metric, ...players.map(val));

  const games = (p: ComparePlayer) => p.records.length;
  const wins = (p: ComparePlayer) => p.records.filter((r) => r.result === 'W').length;

  row('경기 수', games);
  row('승', wins);
  row('패', (p) => games(p) - wins(p));
  row('경기 승률(%)', (p) => wr(wins(p), games(p)));
  row('라운드 승률(%)', (p) => {
    let rw = 0,
      rl = 0;
    for (const r of p.records) {
      rw += r.myRounds;
      rl += r.oppRounds;
    }
    return wr(rw, rw + rl);
  });
  row('접전 승률(%)', (p) => {
    const close = p.records.filter((r) => Math.abs(r.myRounds - r.oppRounds) === 1);
    return wr(close.filter((r) => r.result === 'W').length, close.length);
  });
  row('완승 비율(%)', (p) =>
    games(p) > 0
      ? roundTo((p.records.filter((r) => r.oppRounds === 0).length * 100) / games(p), 2)
      : 0,
  );
  row('완패 비율(%)', (p) =>
    games(p) > 0
      ? roundTo((p.records.filter((r) => r.myRounds === 0).length * 100) / games(p), 2)
      : 0,
  );
  row('주 캐릭터', (p) => {
    const m = new Map<string, number>();
    for (const r of p.records) m.set(r.myChar, (m.get(r.myChar) ?? 0) + 1);
    let best = '-';
    let bn = -1;
    for (const [c, n] of m)
      if (n > bn) {
        bn = n;
        best = c;
      }
    return best;
  });
  row('사용 캐릭터 수', (p) => new Set(p.records.map((r) => r.myChar)).size);
  row('최고 레이팅', (p) =>
    p.records.length ? Math.max(...p.records.map((r) => r.myRating)) : 0,
  );
  row('최고 텍켄파워', (p) =>
    p.records.length ? Math.max(...p.records.map((r) => r.myPower)) : 0,
  );
  row('경기당 평균/일', (p) => {
    if (!p.records.length) return 0;
    const days = new Set(p.records.map((r) => dateKey(r.dt))).size;
    return roundTo(p.records.length / days, 1);
  });
  row('데이터 기간', (p) => {
    if (!p.records.length) return '-';
    const ts = p.records.map((r) => r.dt.getTime());
    const lo = new Date(Math.min(...ts));
    const hi = new Date(Math.max(...ts));
    return `${dateKey(lo)} ~ ${dateKey(hi)}`;
  });

  // ── 시즌별: 시즌 × 지표 × 플레이어 ──
  const seasonT = new Table('Season', '지표', ...players.map(L));
  const seasons = [
    ...new Set(players.flatMap((p) => p.records.map((r) => r.season))),
  ].sort((a, b) => (a < b ? 1 : -1)); // 최신 시즌 우선
  for (const s of seasons) {
    const sub = (p: ComparePlayer) => p.records.filter((r) => r.season === s);
    seasonT.add(s, '경기 수', ...players.map((p) => sub(p).length));
    seasonT.add(
      s,
      '승률(%)',
      ...players.map((p) => {
        const rs = sub(p);
        return wr(rs.filter((r) => r.result === 'W').length, rs.length);
      }),
    );
  }

  // ── 캐릭터별: 각자 주요 캐릭터 사용량/승률 나란히 ──
  const charT = new Table(
    'my_char',
    ...players.flatMap((p) => [`${L(p)}_games`, `${L(p)}_wr(%)`]),
  );
  const allChars = [
    ...new Set(players.flatMap((p) => p.records.map((r) => r.myChar))),
  ];
  const charRows = allChars
    .map((c) => {
      const per = players.map((p) => {
        const rs = p.records.filter((r) => r.myChar === c);
        return { games: rs.length, wr: wr(rs.filter((r) => r.result === 'W').length, rs.length) };
      });
      return { c, per, total: per.reduce((s, x) => s + x.games, 0) };
    })
    .sort((a, b) => b.total - a.total || cmpOIC(a.c, b.c));
  for (const x of charRows)
    charT.add(x.c, ...x.per.flatMap((y) => [y.games, y.wr]));

  // ── 맞대결: 서로 만난 기록 (상대 polaris = 상대의 ID) ──
  const h2h = new Table(
    'player_a', 'player_b', 'games', 'a_wins', 'b_wins', 'a_winrate(%)', 'last_played',
  );
  const h2hDetail = new Table(
    'dt', 'player_a', 'a_char', 'score', 'result_for_a', 'player_b', 'b_char',
  );
  for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const matches = a.records.filter((r) => r.oppPolaris === b.polarisId);
      if (!matches.length) continue;
      const aWins = matches.filter((r) => r.result === 'W').length;
      const last = matches.reduce((m, r) => (r.dt > m ? r.dt : m), matches[0].dt);
      h2h.add(L(a), L(b), matches.length, aWins, matches.length - aWins,
        wr(aWins, matches.length), formatDt(last));
      for (const m of [...matches].sort((x, y) => y.dt.getTime() - x.dt.getTime()))
        h2hDetail.add(formatDt(m.dt), L(a), m.myChar, m.score, m.result, L(b), m.oppChar);
    }

  // ── 공통 상대: 전원이 만나본 상대에 대한 승률 비교 ──
  const vsCommon = new Table(
    'opp_name', 'opp_polaris',
    ...players.flatMap((p) => [`${L(p)}_games`, `${L(p)}_wr(%)`]),
  );
  const oppSets = players.map(
    (p) =>
      new Set(
        p.records
          .filter((r) => r.oppPolaris && r.oppPolaris !== p.polarisId)
          .map((r) => r.oppPolaris),
      ),
  );
  let common = oppSets[0] ?? new Set<string>();
  for (const s of oppSets.slice(1)) common = new Set([...common].filter((x) => s.has(x)));
  // 자기들끼리는 맞대결 시트가 따로 있으니 공통 상대에서 뺀다
  for (const p of players) common.delete(p.polarisId);

  const commonRows = [...common]
    .map((pol) => {
      const names = new Map<string, number>();
      for (const p of players)
        for (const r of p.records)
          if (r.oppPolaris === pol && r.oppName)
            names.set(r.oppName, (names.get(r.oppName) ?? 0) + 1);
      let name = pol;
      let bn = -1;
      for (const [n, c] of names)
        if (c > bn) {
          bn = c;
          name = n;
        }
      const per = players.map((p) => {
        const rs = p.records.filter((r) => r.oppPolaris === pol);
        return { games: rs.length, wr: wr(rs.filter((r) => r.result === 'W').length, rs.length) };
      });
      return { pol, name, per, total: per.reduce((s, x) => s + x.games, 0) };
    })
    .sort((a, b) => b.total - a.total || cmpOIC(a.name, b.name));
  for (const x of commonRows)
    vsCommon.add(x.name, x.pol, ...x.per.flatMap((y) => [y.games, y.wr]));

  return [
    tab('overview', '개요', overview),
    tab('season', '시즌', seasonT),
    tab('chars', '캐릭터', charT),
    tab('h2h', '맞대결', h2h),
    tab('h2h_detail', '맞대결 상세', h2hDetail),
    tab('vs_common', '공통 상대', vsCommon),
  ];
}
