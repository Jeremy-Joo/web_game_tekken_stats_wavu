// 여러 명 비교 — C# CompareReport.cs 의 웹 이식.
// overview(지표×플레이어) / 시즌별 / 캐릭터별 / 맞대결 / 공통 상대.
// (ByType 시트는 wavu 가 랭크전만 주므로 뺐다)

import type { MatchRecord } from './models';
import { formatDt, dateKey } from './models';
import { Table } from './table';
import { wr, roundTo, cmpOIC, maxBy, minBy } from './aggregations';
import type { TabData } from './compute';

/**
 * 그래프용 점 솎아내기.
 *
 * 비교 그래프는 최대 4명 × 수만 경기다. 30,233경기를 그대로 실으면 응답이 인원수만큼
 * 곱해지는데, 차트 폭은 720px 라 그 해상도가 아무 의미가 없다.
 * 처음과 끝은 반드시 남기고 사이를 균등하게 솎는다 — 추이 모양은 보존된다.
 */
function downsample<T>(rows: T[], maxPoints: number): T[] {
  if (rows.length <= maxPoints) return rows;
  const step = (rows.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(rows[Math.round(i * step)]);
  return out;
}

/** 비교 그래프에 사람당 실을 점 개수. 720px 차트에 충분하고도 남는다. */
const TREND_POINTS = 1200;

/** 표본이 이만큼 안 되는 매치업은 승률을 신뢰할 수 없다 (aggregations.WEAK_MIN_GAMES 와 동일 취지). */
export const COMPARE_MIN_GAMES = 5;

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
    p.records.length ? maxBy(p.records, (r) => r.myRating) : 0,
  );
  // 최고 레이팅은 '전성기 기록'이라 지금 누가 센지는 말해주지 않는다.
  // 비교에서 정작 궁금한 건 현재 값이라 나란히 둔다.
  row('현재 레이팅', (p) => {
    if (!p.records.length) return 0;
    const last = p.records.reduce((m, r) => (r.dt > m.dt ? r : m), p.records[0]);
    return last.myRating;
  });
  row('최근 20경기 승률(%)', (p) => {
    const last20 = [...p.records]
      .sort((a, b) => b.dt.getTime() - a.dt.getTime())
      .slice(0, 20);
    return wr(last20.filter((r) => r.result === 'W').length, last20.length);
  });
  row('최고 텍켄파워', (p) =>
    p.records.length ? maxBy(p.records, (r) => r.myPower) : 0,
  );
  row('경기당 평균/일', (p) => {
    if (!p.records.length) return 0;
    const days = new Set(p.records.map((r) => dateKey(r.dt))).size;
    return roundTo(p.records.length / days, 1);
  });
  row('데이터 기간', (p) => {
    if (!p.records.length) return '-';
    const lo = new Date(minBy(p.records, (r) => r.dt.getTime()));
    const hi = new Date(maxBy(p.records, (r) => r.dt.getTime()));
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
    // 시즌별 최고 레이팅 — "S2 엔 A 가 위였는데 S3 에서 뒤집혔다"가 보인다
    seasonT.add(
      s,
      '최고 레이팅',
      ...players.map((p) => {
        const rs = sub(p);
        return rs.length ? maxBy(rs, (r) => r.myRating) : 0;
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
  // 상대 식별코드로 한 번만 색인한다. 예전에는 공통 상대마다 전원의 레코드를
  // 처음부터 훑어서 `공통상대수 × 전체경기수` 였다 — 실측으로 159,750경기에서
  // computeCompare 하나가 29.8초 걸렸다(함수 제한 60초). 색인을 만들면
  // `전체경기수 + 공통상대수` 로 떨어진다. 레코드를 복사하지 않고 참조만 담는다.
  const byOpp = players.map((p) => {
    const m = new Map<string, MatchRecord[]>();
    for (const r of p.records) {
      if (!r.oppPolaris || r.oppPolaris === p.polarisId) continue;
      const arr = m.get(r.oppPolaris);
      if (arr) arr.push(r);
      else m.set(r.oppPolaris, [r]);
    }
    return m;
  });

  // 전원이 만나본 상대만. 가장 작은 목록부터 훑어야 비교 횟수가 최소가 된다.
  const smallest = byOpp.reduce((a, b) => (a.size <= b.size ? a : b));
  const common: string[] = [];
  for (const pol of smallest.keys()) {
    if (players.some((p) => p.polarisId === pol)) continue; // 자기들끼리는 맞대결 시트로
    if (byOpp.every((m) => m.has(pol))) common.push(pol);
  }

  const commonRows = common
    .map((pol) => {
      // 이름은 그 상대와의 경기에서만 세면 된다 (개명 이력이 있어 최빈값을 쓴다)
      const names = new Map<string, number>();
      const per = byOpp.map((m) => {
        const rs = m.get(pol) ?? [];
        for (const r of rs)
          if (r.oppName) names.set(r.oppName, (names.get(r.oppName) ?? 0) + 1);
        return {
          games: rs.length,
          wr: wr(rs.filter((r) => r.result === 'W').length, rs.length),
        };
      });
      let name = pol;
      let bn = -1;
      for (const [n, c] of names)
        if (c > bn) {
          bn = c;
          name = n;
        }
      return { pol, name, per, total: per.reduce((s, x) => s + x.games, 0) };
    })
    .sort((a, b) => b.total - a.total || cmpOIC(a.name, b.name));
  for (const x of commonRows)
    vsCommon.add(x.name, x.pol, ...x.per.flatMap((y) => [y.games, y.wr]));

  // ── 상대 캐릭터 매치업: "드라구노프 상대로는 누가 더 강한가" ──
  // 위 charT 는 '내가 쓴 캐릭터'를 비교한다. 비교 모드에서 정작 자주 묻는
  // '어떤 캐릭터를 상대할 때 누가 나은가'는 답할 곳이 없어서 따로 만든다.
  const vsCharT = new Table(
    'opp_char',
    ...players.flatMap((p) => [`${L(p)}_games`, `${L(p)}_wr(%)`]),
  );
  const allOppChars = [
    ...new Set(players.flatMap((p) => p.records.map((r) => r.oppChar))),
  ];
  const vsCharRows = allOppChars
    .map((c) => {
      const per = players.map((p) => {
        const rs = p.records.filter((r) => r.oppChar === c);
        return {
          games: rs.length,
          wr: wr(rs.filter((r) => r.result === 'W').length, rs.length),
        };
      });
      return { c, per, total: per.reduce((s, x) => s + x.games, 0) };
    })
    .sort((a, b) => b.total - a.total || cmpOIC(a.c, b.c));
  for (const x of vsCharRows)
    vsCharT.add(x.c, ...x.per.flatMap((y) => [y.games, y.wr]));

  // ── 레이팅 추이 (그래프용) ──
  // 컬럼을 [dt, my_rating, player, result] 로 맞추면 단일 모드의 TrendChart 가
  // 그대로 쓰인다 — 그 차트는 3번째 칸을 '계열 이름'으로 보고 선을 나누기 때문이다.
  // 사람마다 솎아낸 뒤 시간순으로 합친다.
  const trend = new Table('dt', 'my_rating', 'player', 'result');
  const trendRows: { t: number; row: (string | number | null)[] }[] = [];
  for (const p of players) {
    const ordered = [...p.records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
    for (const r of downsample(ordered, TREND_POINTS))
      trendRows.push({
        t: r.dt.getTime(),
        row: [formatDt(r.dt), r.myRating, L(p), r.result],
      });
  }
  trendRows.sort((a, b) => a.t - b.t);
  for (const x of trendRows) trend.rows.push(x.row);

  const tabs: TabData[] = [
    tab('overview', '개요', overview),
    tab('trend', '레이팅 추이', trend),
    tab('season', '시즌', seasonT),
    tab('chars', '캐릭터', charT),
    tab('vs_chars', '상대 캐릭', vsCharT),
    tab('h2h', '맞대결', h2h),
    tab('h2h_detail', '맞대결 상세', h2hDetail),
    tab('vs_common', '공통 상대', vsCommon),
  ];

  // 맞대결 기록이 없으면 두 탭이 빈 채로 남는다 — 있지도 않은 기록을 찾게 만들지 말고 감춘다.
  return tabs.filter(
    (t) => !((t.key === 'h2h' || t.key === 'h2h_detail') && t.rows.length === 0),
  );
}
