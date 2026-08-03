// /player/<식별코드>/report — 한 장짜리 종합 리포트.
//
// 왜 별도 페이지인가: 결과 화면은 탭이 16개다. 데이터가 부족한 게 아니라 많아서
// 처음 온 사람이 어디를 볼지 모른다. 리포트는 **새로 계산하지 않고** 이미 있는 값을
// "이 사람은 이런 플레이어다" 한 흐름으로 재배치한다.
//
// 서버 컴포넌트인 이유: 완성된 HTML 로 나가야 공유 링크·인쇄(PDF)·검색엔진에 그대로 쓰인다.
// 클라이언트로 넘기는 건 추이 그래프의 점들뿐이다.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecords } from '@/lib/wavu/cache';
import { computeFromRecords } from '@/lib/tekken/compute';
import { sessionAdvice } from '@/lib/tekken/advice';
import { seasonSpans } from '@/lib/tekken/seasons';
import { SESSION_GAP_MINUTES } from '@/lib/tekken/aggregations';
import { dateKey, type MatchRecord } from '@/lib/tekken/models';
import {
  pickJoke,
  pickCoach,
  pickCondition,
  type Mood,
  type Condition,
  type ConditionFacts,
} from '@/app/jokes';
import { R, parseLang, weekdayText, hourText, REPORT_LANGS, type Lang } from './strings';
import ReportChart, { type TrendPoint } from './ReportChart';
import ShareBar from './ShareBar';
import './report.css';

type Query = Record<string, string | string[] | undefined>;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}

const normalize = (raw: string) => decodeURIComponent(raw).replace(/[^A-Za-z0-9]/g, '');

// ── 조회 범위 ────────────────────────────────────────────────────
// 리포트는 원래 '전체 기간 한 장'이었다. 그런데 3천 판 넘게 쌓인 사람은 전체 승률이
// 거의 안 움직여서 "지금 어떤가"가 안 보인다. 시즌·기간으로 잘라 볼 수 있게 한다.
//
// 상태를 쿼리스트링에 두는 이유: 서버 컴포넌트를 그대로 유지하려는 것이다.
// 클라이언트 상태로 만들면 리포트 전체가 클라이언트로 내려가 공유 링크·인쇄·SEO 가
// 다 깨진다. 링크만으로 전환되면 '시즌3 리포트'를 그대로 공유할 수도 있다.
// 표시 언어(lang)도 같은 이유로 쿼리스트링이다 — localStorage 를 읽으려면 클라이언트가
// 필요하고, 그러면 크롤러와 인쇄본이 항상 한국어로 굳는다.

type Scope =
  | { kind: 'all' }
  | { kind: 'season'; key: string }
  | { kind: 'range'; from: string; to: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 오늘 (KST). 레코드의 dt 가 KST 로 shift 된 Date 라 같은 기준으로 맞춘다. */
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 'yyyy-MM-dd' 에서 n일 전. */
function minusDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function parseScope(q: Query): Scope {
  const season = one(q.season);
  if (/^S\d+$/.test(season)) return { kind: 'season', key: season };

  const from = one(q.from);
  const to = one(q.to);
  if (isDate(from) && isDate(to)) {
    // 거꾸로 넣어도 동작하게 정렬해 둔다
    return from <= to ? { kind: 'range', from, to } : { kind: 'range', from: to, to: from };
  }
  return { kind: 'all' };
}

function applyScope(records: MatchRecord[], scope: Scope): MatchRecord[] {
  if (scope.kind === 'all') return records;
  if (scope.kind === 'season') return records.filter((r) => r.season === scope.key);
  return records.filter((r) => {
    const d = dateKey(r.dt);
    return d >= scope.from && d <= scope.to;
  });
}

const scopeLabel = (scope: Scope, lang: Lang) =>
  scope.kind === 'all'
    ? R.scopeAllLabel[lang]
    : scope.kind === 'season'
      ? R.seasonLabel[lang](scope.key.slice(1))
      : `${scope.from} ~ ${scope.to}`;

/** 범위·언어를 유지한 채 일부만 바꾼 주소를 만든다. */
function hrefWith(base: string, scope: Scope, lang: Lang, override?: Partial<Query>): string {
  const p = new URLSearchParams();
  if (scope.kind === 'season') p.set('season', scope.key);
  if (scope.kind === 'range') {
    p.set('from', scope.from);
    p.set('to', scope.to);
  }
  if (lang !== 'ko') p.set('lang', lang);
  for (const [k, v] of Object.entries(override ?? {})) {
    if (v == null || v === '') p.delete(k);
    else p.set(k, String(v));
  }
  // 범위 키는 서로 배타적이다 — season 을 켜면 from/to 는 지운다(그 반대도).
  if (override && 'season' in override) {
    p.delete('from');
    p.delete('to');
  }
  if (override && ('from' in override || 'to' in override)) p.delete('season');
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const id = normalize((await params).id);
  const q = await searchParams;
  const scope = parseScope(q);
  const lang = parseLang(q.lang);
  let name = id;
  try {
    const { myName } = await getRecords(id);
    if (myName) name = myName;
  } catch {
    /* 이름을 못 얻어도 페이지는 나간다 */
  }
  const suffix = scope.kind === 'all' ? '' : ` (${scopeLabel(scope, lang)})`;
  const t = {
    ko: `${name} 리포트${suffix} — 철권8 전적 통계`,
    en: `${name} Report${suffix} — Tekken 8 Stats`,
    ja: `${name} レポート${suffix} — 鉄拳8 戦績スタッツ`,
  }[lang];
  const d = {
    ko: `${name} 의 철권8 랭크전 종합 리포트 — 캐릭터별 성적, 강점·약점 매치업, 레이팅 추이, 플레이 패턴.`,
    en: `${name}'s Tekken 8 ranked report — character results, best and worst matchups, rating trend, play patterns.`,
    ja: `${name} の鉄拳8ランクマッチ総合レポート — キャラ別成績、得意・苦手マッチアップ、レート推移、プレイ傾向。`,
  }[lang];
  return {
    title: t,
    description: d,
    // 범위·언어를 바꾼 주소는 같은 내용의 변형이라 색인 대상이 아니다.
    // canonical 은 항상 기본 주소를 가리킨다.
    alternates: { canonical: `/player/${id}/report` },
    robots: scope.kind === 'all' && lang === 'ko' ? undefined : { index: false, follow: true },
    openGraph: { title: t, description: d, url: `/player/${id}/report` },
  };
}

/** 표에서 컬럼명으로 값을 꺼낸다 (컬럼 순서가 바뀌어도 안전하게). */
function pick(
  tab: { columns: string[]; rows: (string | number | null)[][] } | undefined,
  col: string,
) {
  const i = tab?.columns.indexOf(col) ?? -1;
  return (row: (string | number | null)[]) => (i >= 0 ? row[i] : null);
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
const wrOf = (w: number, n: number) => (n > 0 ? Math.round((w * 1000) / n) / 10 : 0);

/**
 * 마지막 세션(직전 경기와 SESSION_GAP_MINUTES 이상 안 비는 묶음)의 성적.
 * 컨디션 한 줄이 "방금 어떻게 끝냈나"를 말하려면 하루가 아니라 세션 단위여야 한다 —
 * 새벽 2시에 끝낸 판과 같은 날 저녁 판은 다른 이야기다.
 */
function lastSession(records: MatchRecord[]) {
  const ordered = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const gap = SESSION_GAP_MINUTES * 60_000;
  let start = ordered.length - 1;
  while (start > 0 && ordered[start].dt.getTime() - ordered[start - 1].dt.getTime() < gap) start--;
  const rows = ordered.slice(start);
  let wins = 0;
  let delta = 0;
  for (const r of rows) {
    if (r.result === 'W') wins++;
    delta += r.myDelta;
  }
  return { games: rows.length, wins, losses: rows.length - wins, delta };
}

export default async function ReportPage({ params, searchParams }: Props) {
  const id = normalize((await params).id);
  if (!id) notFound();

  let data;
  try {
    data = await getRecords(id);
  } catch {
    notFound();
  }
  const { records: allRecords, myName } = data;
  if (!allRecords.length) notFound();

  const q = await searchParams;
  const scope = parseScope(q);
  const lang = parseLang(q.lang);
  const records = applyScope(allRecords, scope);

  const spans = seasonSpans(allRecords);
  const today = todayKst();
  const base = `/player/${id}/report`;
  const href = (o?: Partial<Query>) => hrefWith(base, scope, lang, o);
  const lastPlayed = dateKey(allRecords.reduce((a, b) => (a.dt > b.dt ? a : b)).dt);

  // 범위 바 — 링크만으로 전환된다 (JS 없이 동작하고, 그대로 공유된다)
  const scopeBar = (
    <nav className="rp-scope" aria-label={R.scope[lang]}>
      <div className="rp-scope-row">
        <span className="rp-scope-tag">{R.scope[lang]}</span>
        <a
          className={`rp-pill ${scope.kind === 'all' ? 'on' : ''}`}
          href={hrefWith(base, { kind: 'all' }, lang)}
        >
          {R.scopeAll[lang]}
        </a>
        {spans.map((s) => (
          <a
            key={s.key}
            className={`rp-pill ${scope.kind === 'season' && scope.key === s.key ? 'on' : ''}`}
            href={href({ season: s.key })}
          >
            {s.key}
            <em>{R.gamesUnit[lang](s.games.toLocaleString())}</em>
          </a>
        ))}
      </div>

      <div className="rp-scope-row">
        <span className="rp-scope-tag">{R.period[lang]}</span>
        {(
          [
            [R.last30[lang], minusDays(today, 30)],
            [R.last90[lang], minusDays(today, 90)],
            [R.thisYear[lang], `${today.slice(0, 4)}-01-01`],
          ] as const
        ).map(([label, from]) => (
          <a
            key={label}
            className={`rp-pill ${
              scope.kind === 'range' && scope.from === from && scope.to === today ? 'on' : ''
            }`}
            href={href({ from, to: today })}
          >
            {label}
          </a>
        ))}
        <form className="rp-scope-form" method="get" action={base}>
          {lang !== 'ko' && <input type="hidden" name="lang" value={lang} />}
          <input
            type="date"
            name="from"
            aria-label={R.from[lang]}
            defaultValue={scope.kind === 'range' ? scope.from : ''}
          />
          <span className="rp-scope-tilde">~</span>
          <input
            type="date"
            name="to"
            aria-label={R.to[lang]}
            defaultValue={scope.kind === 'range' ? scope.to : today}
          />
          <button type="submit">{R.apply[lang]}</button>
        </form>
      </div>

      <div className="rp-scope-row">
        <span className="rp-scope-tag">{R.language[lang]}</span>
        {REPORT_LANGS.map((l) => (
          <a
            key={l}
            className={`rp-pill ${l === lang ? 'on' : ''}`}
            href={hrefWith(base, scope, l, { lang: l === 'ko' ? '' : l })}
            hrefLang={l}
          >
            {l === 'ko' ? '한국어' : l === 'en' ? 'English' : '日本語'}
          </a>
        ))}
      </div>
    </nav>
  );

  // 범위를 잘랐더니 한 판도 안 남는 경우 — 404 가 아니라 '그 범위에 없다'가 맞는 설명이다
  if (!records.length) {
    return (
      <main className="report">
        <header className="rp-hero">
          <div className="rp-hero-top">
            <a className="rp-back" href={`/player/${id}`}>
              {R.backToStats[lang]}
            </a>
          </div>
          <h1 className="rp-name">{myName || id}</h1>
          <p className="rp-sub">
            <span className="rp-code">{id}</span>
            <span className="rp-dot">·</span>
            <span className="rp-scope-chip">{scopeLabel(scope, lang)}</span>
          </p>
        </header>
        {scopeBar}
        <section className="rp-sec">
          <p className="rp-empty">
            {R.emptyScope[lang](
              scopeLabel(scope, lang),
              lastPlayed,
              allRecords.length.toLocaleString(),
            )}
          </p>
          <p className="rp-note">
            <a className="rp-cta" href={hrefWith(base, { kind: 'all' }, lang)}>
              {R.seeAllPeriod[lang]}
            </a>
          </p>
        </section>
      </main>
    );
  }

  const result = computeFromRecords(records, id, myName, { matchesLimit: 0 });
  const tabs = Object.fromEntries(result.tabs.map((t) => [t.key, t]));
  const advice = sessionAdvice(records);

  // ── 헤드라인 수치 ──────────────────────────────────────────────
  const total = tabs.total;
  const allRow = total?.rows.find((r) => r[0] === 'ALL');
  const gTotal = pick(total, 'Total');
  const gW = pick(total, 'W');
  const gL = pick(total, 'L');
  const gWr = pick(total, 'WinRate(%)');

  const games = allRow ? num(gTotal(allRow)) : records.length;
  const wins = allRow ? num(gW(allRow)) : 0;
  const losses = allRow ? num(gL(allRow)) : 0;
  const winRate = allRow ? num(gWr(allRow)) : 0;

  // 캐릭터별 (ALL 제외, 경기 수 순)
  const charRows = (total?.rows ?? [])
    .filter((r) => r[0] !== 'ALL')
    .map((r) => ({
      name: String(r[0]),
      games: num(gTotal(r)),
      wins: num(gW(r)),
      losses: num(gL(r)),
      wr: num(gWr(r)),
    }))
    .sort((a, b) => b.games - a.games);
  const mainChar = charRows[0];

  // 최신 경기 = 현재 레이팅·단
  const latest = [...records].sort((a, b) => b.dt.getTime() - a.dt.getTime())[0];
  const peakRating = Math.max(...records.map((r) => r.myRating));
  const peakPower = Math.max(...records.map((r) => r.myPower));

  // ── 매치업 ────────────────────────────────────────────────────
  const mkMatchups = (key: 'strong' | 'weak') => {
    const t = tabs[key];
    const g = pick(t, 'Games');
    const w = pick(t, 'W');
    const wr = pick(t, 'WinRate(%)');
    return (t?.rows ?? [])
      .map((r) => ({
        opp: String(r[0]),
        games: num(g(r)),
        wins: num(w(r)),
        wr: num(wr(r)),
      }))
      .slice(0, 3);
  };
  const strong = mkMatchups('strong');
  const weak = mkMatchups('weak');

  // ── 레이팅 추이 (그래프용 점) ──────────────────────────────────
  // 경기가 수만 건일 수 있어 그대로 넘기면 페이지가 무거워진다. 캐릭터별로 고르게 솎는다.
  const MAX_POINTS = 1200;
  const stride = Math.max(1, Math.ceil(records.length / MAX_POINTS));
  const ordered = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const points: TrendPoint[] = ordered
    .map((r, i) => ({ i, t: r.dt.getTime(), y: r.myRating, c: r.myChar }))
    .filter((_, i) => i % stride === 0 || i === ordered.length - 1);
  const trendChars = charRows.slice(0, 6).map((c) => c.name);

  // ── 라운드 지표 ───────────────────────────────────────────────
  const round = tabs.round;
  const rAll = round?.rows.find((r) => r[0] === 'ALL');
  const roundWr = rAll ? num(pick(round, 'RoundWR(%)')(rAll)) : 0;
  const closeWr = rAll
    ? (() => {
        const cw = num(pick(round, 'CloseWins')(rAll));
        const cl = num(pick(round, 'CloseLosses')(rAll));
        return cw + cl > 0 ? Math.round((cw * 1000) / (cw + cl)) / 10 : 0;
      })()
    : 0;
  const shutoutWin = rAll ? num(pick(round, 'ShutoutWin(%)')(rAll)) : 0;

  // 최장 연승 — flow 탭에도 있지만 한국어 라벨을 문자열로 맞춰야 해서 직접 센다
  let bestStreak = 0;
  let run = 0;
  for (const r of ordered) {
    run = r.result === 'W' ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  // ── 시즌별 (항상 전체 기록 기준) ───────────────────────────────
  // 범위를 시즌으로 좁혀놓고 이 표까지 좁히면 한 줄만 남아 비교가 성립하지 않는다.
  const seasonRows = spans
    .map((s) => {
      const rs = allRecords.filter((r) => r.season === s.key);
      const w = rs.filter((r) => r.result === 'W').length;
      return { key: s.key, games: rs.length, wins: w, wr: wrOf(w, rs.length), span: s };
    })
    .filter((s) => s.games > 0);
  const bestSeasonWr = Math.max(...seasonRows.map((s) => s.wr), 0);

  // ── 언제 강한가 ───────────────────────────────────────────────
  // 표본이 얇은 칸이 1위로 올라오면 "새벽 4시에 100%" 같은 헛소리가 된다.
  const MIN_BUCKET = 10;
  const timeTab = tabs.time;
  const tG = pick(timeTab, 'Games');
  const tWr = pick(timeTab, 'WinRate(%)');
  const buckets = (unit: string) =>
    (timeTab?.rows ?? [])
      .filter((r) => String(r[0]) === unit && num(tG(r)) >= MIN_BUCKET)
      .map((r) => ({ label: String(r[1]), games: num(tG(r)), wr: num(tWr(r)) }));
  const hours = buckets('시간대');
  const dows = buckets('요일');
  const bestOf = <T extends { wr: number }>(a: T[]) =>
    a.length ? a.reduce((m, x) => (x.wr > m.wr ? x : m)) : null;
  const worstOf = <T extends { wr: number }>(a: T[]) =>
    a.length ? a.reduce((m, x) => (x.wr < m.wr ? x : m)) : null;
  const whenCells = [
    hours.length > 1 && { k: R.bestHour[lang], v: hourText(lang, bestOf(hours)!.label), x: bestOf(hours)! , good: true },
    hours.length > 1 && { k: R.worstHour[lang], v: hourText(lang, worstOf(hours)!.label), x: worstOf(hours)!, good: false },
    dows.length > 1 && { k: R.bestDay[lang], v: weekdayText(lang, bestOf(dows)!.label), x: bestOf(dows)!, good: true },
    dows.length > 1 && { k: R.worstDay[lang], v: weekdayText(lang, worstOf(dows)!.label), x: worstOf(dows)!, good: false },
  ].filter(Boolean) as { k: string; v: string; x: { games: number; wr: number }; good: boolean }[];

  // ── 실력차별 ──────────────────────────────────────────────────
  // 전체 승률은 만나는 상대 수준에 좌우된다. 나보다 위인 상대 승률이 실력에 더 가깝다.
  const GAP = 50;
  const gapAgg = { up: { g: 0, w: 0 }, even: { g: 0, w: 0 }, down: { g: 0, w: 0 } };
  for (const r of records) {
    const my = r.myRating - r.myDelta;
    const op = r.oppRating - r.oppDelta;
    if (my <= 0 || op <= 0) continue; // 레이팅이 아직 안 붙은 경기는 실력차를 말할 수 없다
    const d = op - my;
    const b = d >= GAP ? gapAgg.up : d <= -GAP ? gapAgg.down : gapAgg.even;
    b.g++;
    if (r.result === 'W') b.w++;
  }
  const gapRows = (
    [
      [R.gapUp[lang], gapAgg.up],
      [R.gapEven[lang], gapAgg.even],
      [R.gapDown[lang], gapAgg.down],
    ] as const
  )
    .filter(([, v]) => v.g > 0)
    .map(([label, v]) => ({ label, games: v.g, wr: wrOf(v.w, v.g) }));

  const period =
    result.firstDt && result.lastDt
      ? `${result.firstDt.slice(0, 10)} ~ ${result.lastDt.slice(0, 10)}`
      : '';

  // 표본이 이보다 적으면 수치를 확정처럼 보여주지 않는다.
  // (라운드·완승 비율 같은 파생 지표는 더 심하게 흔들린다 — 8경기짜리에서
  //  '완승 비율 25%'가 크게 떠 있는 걸 보고 넣었다)
  const THIN_GAMES = 30;
  const thin = games < THIN_GAMES;

  // ── 멘트 ──────────────────────────────────────────────────────
  // 조회 화면에만 있던 걸 리포트에도 붙인다. 리포트가 이 사이트에서 제일 많이 공유되는
  // 화면인데 정작 성격이 드러나는 한 줄이 여기 없었다.
  //
  // 씨앗은 조회 결과에서 나온 안정된 정수다 — 같은 사람·같은 범위면 항상 같은 문구가
  // 나오고(새로고침할 때마다 바뀌면 인쇄본과 화면이 달라진다), 성적이 바뀌면 문구도 바뀐다.
  const seed = games * 7 + wins * 3 + Math.round(winRate * 10) + (scope.kind === 'all' ? 0 : 101);
  const mood = (advice?.mood ?? 'steady') as Mood;
  const quip = advice ? pickJoke(mood, lang, seed, advice.recentDeltaPp, advice.losingStreak) : '';
  const coach = advice ? pickCoach(mood, lang, seed + 13) : '';

  const sess = lastSession(records);
  const daysSince = Math.max(
    0,
    Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dateKey(latest.dt)}T00:00:00Z`)) / 86_400_000),
  );
  const condKind: Condition =
    daysSince === 0 ? 'today'
    : daysSince >= 7 ? 'rusty'
    : sess.delta > 0 ? 'endedWell'
    : sess.delta < 0 ? 'endedBadly'
    : 'endedFlat';
  const condFacts: ConditionFacts = { days: daysSince, ...sess };
  const condition = pickCondition(condKind, lang, seed + 29, condFacts);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <main className="report">
      {/* ── 표지 ── */}
      <header className="rp-hero">
        <div className="rp-hero-top">
          <a className="rp-back" href={`/player/${id}`}>
            {R.backToStats[lang]}
          </a>
          <ShareBar name={myName || id} lang={lang} />
        </div>

        <h1 className="rp-name">{myName || id}</h1>
        <p className="rp-sub">
          <span className="rp-code">{id}</span>
          {scope.kind !== 'all' && (
            <>
              <span className="rp-dot">·</span>
              <span className="rp-scope-chip">{scopeLabel(scope, lang)}</span>
            </>
          )}
          {mainChar && (
            <>
              <span className="rp-dot">·</span>
              <b>{mainChar.name}</b> {R.mainChar[lang]}
            </>
          )}
          {period && (
            <>
              <span className="rp-dot">·</span>
              {period}
            </>
          )}
        </p>

        <div className="rp-hero-stats">
          <div className="rp-stat rp-stat-lead">
            <span className="rp-stat-label">{R.winRate[lang]}</span>
            <span className="rp-stat-value">{winRate.toFixed(1)}%</span>
            <span className="rp-stat-note">
              <b className={winRate >= 50 ? 'sw' : 'sl'}>
                {R.winsLosses[lang](fmt(wins), fmt(losses))}
              </b>
            </span>
          </div>
          <div className="rp-stat">
            <span className="rp-stat-label">{R.totalGames[lang]}</span>
            <span className="rp-stat-value">{fmt(games)}</span>
          </div>
          <div className="rp-stat">
            {/* 범위를 자르면 '현재'가 아니라 '그 범위의 마지막'이다. 라벨을 속이지 않는다. */}
            <span className="rp-stat-label">
              {scope.kind === 'all' ? R.currentRating[lang] : R.lastRating[lang]}
            </span>
            <span className="rp-stat-value">{fmt(latest.myRating)}</span>
            <span className="rp-stat-note">{R.peak[lang](fmt(peakRating))}</span>
          </div>
          <div className="rp-stat">
            <span className="rp-stat-label">{R.tekkenPower[lang]}</span>
            <span className="rp-stat-value">{fmt(latest.myPower)}</span>
            <span className="rp-stat-note">{R.peak[lang](fmt(peakPower))}</span>
          </div>
        </div>

        {/* 승률 미터 — 같은 계열의 옅은 트랙 위에 채운다 */}
        <div className="rp-meter" aria-label={`${R.winRate[lang]} ${winRate.toFixed(1)}%`}>
          <div
            className={`rp-meter-fill ${winRate >= 50 ? 'good' : 'bad'}`}
            style={{ width: `${Math.max(0, Math.min(100, winRate))}%` }}
          />
          <span className="rp-meter-mid" />
        </div>
        <p className="rp-meter-cap">{winRate >= 50 ? R.meterAbove[lang] : R.meterBelow[lang]}</p>

        {condition && <p className="rp-condition">{condition}</p>}

        {thin && <p className="rp-thin">{R.thin[lang](games)}</p>}
      </header>

      {scopeBar}

      {/* ── 최근 폼 ── */}
      {!advice && (
        <section className="rp-sec">
          <h2 className="rp-h2">{R.secForm[lang]}</h2>
          <p className="rp-empty">{R.formEmpty[lang](games)}</p>
        </section>
      )}
      {advice && (
        <section className="rp-sec">
          <h2 className="rp-h2">{R.secForm[lang]}</h2>
          <div className={`rp-form rp-mood-${advice.mood}`}>
            <div className="rp-form-head">
              <span className="rp-form-mood">{R.mood[lang][advice.mood] ?? advice.mood}</span>
              <span className="rp-form-delta">
                {R.vsAverage[lang](
                  `${advice.recentDeltaPp > 0 ? '+' : ''}${advice.recentDeltaPp.toFixed(1)}`,
                )}
              </span>
            </div>
            <p className="rp-form-body">
              {advice.reliable && advice.goodUpTo
                ? advice.stopAfter
                  ? R.bandBoth[lang](advice.goodUpTo, advice.stopAfter)
                  : R.bandGood[lang](advice.goodUpTo)
                : R.bandThin[lang]}
              {advice.losingStreak >= 3 && R.streakNow[lang](advice.losingStreak)}
            </p>
            {quip && (
              <p className="rp-quip">
                {quip}
                {coach && <span className="rp-coach">{coach}</span>}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── 레이팅 추이 ── */}
      {points.length > 1 && (
        <section className="rp-sec">
          <h2 className="rp-h2">{R.secTrend[lang]}</h2>
          <div className="rp-card">
            <ReportChart points={points} chars={trendChars} />
          </div>
        </section>
      )}

      {/* ── 캐릭터별 ── */}
      {charRows.length > 0 && (
        <section className="rp-sec">
          <h2 className="rp-h2">{R.secChars[lang]}</h2>
          {/* 막대를 0~100% 로 그리면 승률이 55~66% 로 몰릴 때 길이가 다 비슷해
              '어느 캐릭이 유독 좋은가'가 안 보인다. 50% 를 가운데 두고 편차만 그린다. */}
          <div className="rp-bars">
            {charRows.slice(0, 8).map((c) => {
              const dev = c.wr - 50; // %p
              const half = Math.min(50, Math.abs(dev)); // 한쪽 최대 50%p
              return (
                <div key={c.name} className="rp-bar-row">
                  <span className="rp-bar-name">{c.name}</span>
                  <span className="rp-bar-track rp-bar-dev">
                    <span className="rp-bar-mid" />
                    <span
                      className={`rp-bar-fill ${dev >= 0 ? 'good' : 'bad'}`}
                      style={{
                        left: dev >= 0 ? '50%' : `${50 - half}%`,
                        width: `${Math.max(0.6, half)}%`,
                      }}
                    />
                  </span>
                  <span className={`rp-bar-wr ${dev >= 0 ? 'good' : 'bad'}`}>
                    {c.wr.toFixed(1)}%
                  </span>
                  <span className="rp-bar-games">{R.gamesUnit[lang](fmt(c.games))}</span>
                </div>
              );
            })}
          </div>
          <p className="rp-note">{R.charsNote[lang]}</p>
        </section>
      )}

      {/* ── 매치업 ── */}
      {strong.length === 0 && weak.length === 0 && (
        <section className="rp-sec">
          <h2 className="rp-h2">{R.secMatchups[lang]}</h2>
          <p className="rp-empty">{R.matchupsEmpty[lang]}</p>
        </section>
      )}
      {(strong.length > 0 || weak.length > 0) && (
        <section className="rp-sec">
          <h2 className="rp-h2">{R.secMatchups[lang]}</h2>
          <div className="rp-mu">
            <div className="rp-mu-col">
              <h3 className="rp-mu-title good">{R.strongOpp[lang]}</h3>
              {strong.length ? (
                strong.map((m) => (
                  <div key={m.opp} className="rp-mu-item">
                    <span className="rp-mu-opp">{m.opp}</span>
                    <span className="rp-mu-wr good">{m.wr.toFixed(1)}%</span>
                    <span className="rp-mu-games">{R.gamesUnit[lang](fmt(m.games))}</span>
                  </div>
                ))
              ) : (
                <p className="rp-mu-empty">{R.waitingSample[lang]}</p>
              )}
            </div>
            <div className="rp-mu-col">
              <h3 className="rp-mu-title bad">{R.weakOpp[lang]}</h3>
              {weak.length ? (
                weak.map((m) => (
                  <div key={m.opp} className="rp-mu-item">
                    <span className="rp-mu-opp">{m.opp}</span>
                    <span className="rp-mu-wr bad">{m.wr.toFixed(1)}%</span>
                    <span className="rp-mu-games">{R.gamesUnit[lang](fmt(m.games))}</span>
                  </div>
                ))
              ) : (
                <p className="rp-mu-empty">{R.waitingSample[lang]}</p>
              )}
            </div>
          </div>
          <p className="rp-note">{R.matchupsNote[lang]}</p>
        </section>
      )}

      {/* ── 시즌별 ── */}
      {seasonRows.length > 1 && (
        <section className="rp-sec">
          <h2 className="rp-h2">{R.secSeasons[lang]}</h2>
          <div className="rp-bars">
            {seasonRows.map((s) => {
              const dev = s.wr - 50;
              const half = Math.min(50, Math.abs(dev));
              const on = scope.kind === 'season' && scope.key === s.key;
              return (
                <a
                  key={s.key}
                  className={`rp-bar-row rp-bar-link ${on ? 'on' : ''}`}
                  href={href({ season: s.key })}
                >
                  <span className="rp-bar-name">
                    {s.key}
                    {s.wr === bestSeasonWr && <em className="rp-best">{R.seasonBest[lang]}</em>}
                  </span>
                  <span className="rp-bar-track rp-bar-dev">
                    <span className="rp-bar-mid" />
                    <span
                      className={`rp-bar-fill ${dev >= 0 ? 'good' : 'bad'}`}
                      style={{
                        left: dev >= 0 ? '50%' : `${50 - half}%`,
                        width: `${Math.max(0.6, half)}%`,
                      }}
                    />
                  </span>
                  <span className={`rp-bar-wr ${dev >= 0 ? 'good' : 'bad'}`}>
                    {s.wr.toFixed(1)}%
                  </span>
                  <span className="rp-bar-games">{R.gamesUnit[lang](fmt(s.games))}</span>
                </a>
              );
            })}
          </div>
          <p className="rp-note">{R.seasonsNote[lang]}</p>
        </section>
      )}

      {/* ── 언제 강한가 ── */}
      <section className="rp-sec">
        <h2 className="rp-h2">{R.secWhen[lang]}</h2>
        {whenCells.length === 0 ? (
          <p className="rp-empty">{R.whenEmpty[lang]}</p>
        ) : (
          <>
            <div className="rp-grid">
              {whenCells.map((c) => (
                <div key={c.k} className="rp-cell">
                  <span className="rp-cell-label">{c.k}</span>
                  <span className={`rp-cell-value ${c.good ? 'good' : 'bad'}`}>{c.v}</span>
                  <span className="rp-cell-note">
                    {c.x.wr.toFixed(1)}% · {R.gamesUnit[lang](fmt(c.x.games))}
                  </span>
                </div>
              ))}
            </div>
            <p className="rp-note">{R.whenNote[lang](MIN_BUCKET)}</p>
          </>
        )}
      </section>

      {/* ── 실력차별 ── */}
      <section className="rp-sec">
        <h2 className="rp-h2">{R.secGap[lang]}</h2>
        {gapRows.length === 0 ? (
          <p className="rp-empty">{R.gapEmpty[lang]}</p>
        ) : (
          <>
            <div className="rp-bars">
              {gapRows.map((g) => {
                const dev = g.wr - 50;
                const half = Math.min(50, Math.abs(dev));
                return (
                  <div key={g.label} className="rp-bar-row">
                    <span className="rp-bar-name">{g.label}</span>
                    <span className="rp-bar-track rp-bar-dev">
                      <span className="rp-bar-mid" />
                      <span
                        className={`rp-bar-fill ${dev >= 0 ? 'good' : 'bad'}`}
                        style={{
                          left: dev >= 0 ? '50%' : `${50 - half}%`,
                          width: `${Math.max(0.6, half)}%`,
                        }}
                      />
                    </span>
                    <span className={`rp-bar-wr ${dev >= 0 ? 'good' : 'bad'}`}>
                      {g.wr.toFixed(1)}%
                    </span>
                    <span className="rp-bar-games">{R.gamesUnit[lang](fmt(g.games))}</span>
                  </div>
                );
              })}
            </div>
            <p className="rp-note">{R.gapNote[lang]}</p>
          </>
        )}
      </section>

      {/* ── 세부 지표 ── */}
      <section className="rp-sec">
        <h2 className="rp-h2">{R.secDetail[lang]}</h2>
        <div className="rp-grid">
          <div className="rp-cell">
            <span className="rp-cell-label">{R.roundWr[lang]}</span>
            <span className="rp-cell-value">{roundWr.toFixed(1)}%</span>
          </div>
          <div className="rp-cell">
            <span className="rp-cell-label">{R.closeWr[lang]}</span>
            <span className="rp-cell-value">{closeWr.toFixed(1)}%</span>
            <span className="rp-cell-note">{R.closeNote[lang]}</span>
          </div>
          <div className="rp-cell">
            <span className="rp-cell-label">{R.shutoutWr[lang]}</span>
            <span className="rp-cell-value">{shutoutWin.toFixed(1)}%</span>
            <span className="rp-cell-note">{R.shutoutNote[lang]}</span>
          </div>
          <div className="rp-cell">
            <span className="rp-cell-label">{R.bestStreak[lang]}</span>
            <span className="rp-cell-value">{fmt(bestStreak)}</span>
          </div>
          <div className="rp-cell">
            <span className="rp-cell-label">{R.charsUsed[lang]}</span>
            <span className="rp-cell-value">{fmt(charRows.length)}</span>
          </div>
        </div>
      </section>

      <footer className="rp-footer">
        <a className="rp-cta" href={`/player/${id}`}>
          {R.cta[lang]}
        </a>
        <p className="rp-credit">{R.credit[lang]}</p>
      </footer>
    </main>
  );
}
