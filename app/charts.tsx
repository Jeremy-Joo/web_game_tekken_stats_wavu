'use client';

// SVG 차트 3종 (외부 라이브러리 없음, 모바일 responsive viewBox).
//
// - TrendChart   레이팅 추이: 캐릭터마다 한 선 (라인)
// - DailyChart   일별: 승/패 스택 막대 (시간순)
// - SessionChart 세션: 세션별 레이팅 변동 막대 (0 기준 상하)
//
// 색 규칙 (dataviz 절차 준수):
// - 시리즈 8색은 검증기(validate_palette.js)를 사이트 배경 #171a21 기준으로 돌려
//   전 항목 PASS 확인한 고정 순서. 순서를 섞거나 9번째 색을 만들지 말 것.
//   캐릭터가 8종을 넘으면 상위 8종만 그리고 나머지는 표로 안내한다.
// - 승/패·상승/하락은 시리즈색이 아니라 상태색(good/critical)을 쓴다.
//   상태색은 색만으로 의미를 못 지게 범례 라벨과 함께 쓴다.
// - 축·격자·라벨 텍스트는 데이터색을 입지 않는다(잉크 토큰만).

import { useMemo, useRef, useState } from 'react';

export type ChartLang = 'ko' | 'en' | 'ja';

// 차트 안에서 쓰는 소량의 문구만 자체 사전으로 (i18n.ts 의존 없이 독립 유지)
const CL: Record<string, Record<ChartLang, string>> = {
  win: { ko: '승', en: 'Wins', ja: '勝' },
  loss: { ko: '패', en: 'Losses', ja: '敗' },
  up: { ko: '레이팅 상승', en: 'Rating gain', ja: 'レート上昇' },
  down: { ko: '하락', en: 'loss', ja: '下降' },
  winrate: { ko: '승률', en: 'Win rate', ja: '勝率' },
  delta: { ko: '레이팅 Δ', en: 'Rating Δ', ja: 'レートΔ' },
  session: { ko: '세션', en: 'session', ja: 'セッション' },
  endRating: { ko: '종료 레이팅', en: 'End rating', ja: '終了レート' },
  noData: { ko: '그래프로 그릴 데이터가 없습니다.', en: 'No data to chart.', ja: 'グラフ化するデータがありません。' },
  gamesUnit: { ko: '경기', en: 'games', ja: '試合' },
};

const SERIES = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];
const MAX_SERIES = 8;

const GOOD = '#0ca30c'; // 승 / 레이팅 상승
const CRIT = '#d03b3b'; // 패 / 레이팅 하락
const INK_MUTED = '#898781';
const GRID = '#2c2c2a';
const BASELINE = '#383835';
const SURFACE = '#171a21';

const W = 720;
const H = 320;
const PAD = { l: 46, r: 12, t: 12, b: 30 };

type Row = (string | number | null)[];

/** 'yyyy-MM-dd[ HH:mm[:ss]]' → epoch(ms). 같은 포맷끼리 순서/간격용. */
const parseDt = (s: string): number =>
  Date.parse(s.length > 10 ? s.replace(' ', 'T') + (s.length === 16 ? ':00Z' : 'Z') : s + 'T00:00:00Z');

/** y 범위 → 깔끔한 눈금 배열. */
function niceTicks(min: number, max: number): { ticks: number[]; lo: number; hi: number } {
  const span = Math.max(1, max - min);
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 6) ?? mag * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, lo, hi };
}

function useSvgPointer(): {
  ref: React.RefObject<SVGSVGElement | null>;
  x: number | null;
  onMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  clear: () => void;
} {
  const ref = useRef<SVGSVGElement>(null);
  const [x, setX] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    setX(Math.max(PAD.l, Math.min(W - PAD.r, px)));
  };
  return { ref, x, onMove, clear: () => setX(null) };
}

/* ── 세션 내 순번별 승률 (흐름 탭) ──────────────────────────────
   구간 12개를 텍스트로 나열하면 "1~5판 56.15% · 6~10판 57.53% · …" 처럼
   한 줄이 화면을 넘어가고, 어디서 꺾이는지가 눈에 안 들어온다.
   같은 값을 3~4줄 높이의 작은 선 그래프로 바꾼다.

   형태 선택: 세션 내 순번은 **순서가 있는 연속량**이고 묻는 것도 '올라가나
   내려가나'라서 선이 맞다. 막대는 길이로 크기를 말하는 형태라, 승률처럼
   0에서 시작할 필요가 없는 값에 쓰면 축을 자르는 순간 거짓말이 된다.
   선은 y축을 데이터 범위로 좁혀도 되지만, 대신 **내 평균선을 같이 그려**
   기준 없이 오르내림만 보고 오해하는 일을 막는다.

   계열이 하나라 범례는 두지 않는다(제목이 곧 계열명). 색은 charts.tsx 상단의
   검증된 팔레트에서 첫 색만 쓴다 — 새 색을 만들지 않는다. */

const AW = 720; // 이 차트만 별도 크기 (본문 3~4줄 높이에 맞춘 납작한 비율)
const AH = 132;
const APAD = { l: 40, r: 46, t: 12, b: 26 };

export interface AdviceBandPoint {
  from: number;
  to: number;
  games: number;
  winRate: number;
  enough: boolean;
}

export function AdviceChart({
  bands,
  baseline,
  stopAfter,
  lang = 'ko',
}: {
  bands: AdviceBandPoint[];
  baseline: number;
  stopAfter: number | null;
  lang?: ChartLang;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = bands.filter((b) => b.enough);
  if (pts.length < 2) return null;

  // y 범위: 데이터와 평균선을 모두 담되 위아래 1%p 여유. 0 부터 그리면
  // 52~58% 구간이 한 줄로 뭉개져 아무것도 안 보인다.
  const vals = [...pts.map((p) => p.winRate), baseline];
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const x = (i: number) =>
    APAD.l + (i / (pts.length - 1)) * (AW - APAD.l - APAD.r);
  const y = (v: number) =>
    AH - APAD.b - ((v - lo) / (hi - lo)) * (AH - APAD.t - APAD.b);

  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.winRate)}`).join(' ');
  // 꺾이는 지점: advice 가 계산한 stopAfter 직후 구간
  const dropIdx = stopAfter ? pts.findIndex((p) => p.from > stopAfter) : -1;
  const h = hover !== null ? pts[hover] : null;

  const unit = lang === 'ko' ? '판' : lang === 'ja' ? '戦' : '';
  const avgLabel = lang === 'ko' ? '내 평균' : lang === 'ja' ? '平均' : 'avg';

  return (
    <svg
      className="trend-svg advice-svg"
      viewBox={`0 0 ${AW} ${AH}`}
      role="img"
      onPointerLeave={() => setHover(null)}
    >
      {/* 내 평균 — 기준선. 데이터색이 아니라 잉크색을 쓴다 */}
      <line
        x1={APAD.l} x2={AW - APAD.r} y1={y(baseline)} y2={y(baseline)}
        stroke={INK_MUTED} strokeWidth="1" strokeDasharray="4 4"
      />
      <text
        x={AW - APAD.r + 6} y={y(baseline) + 3.5}
        fill={INK_MUTED} fontSize="11"
      >
        {avgLabel} {baseline}%
      </text>

      {/* y 눈금은 위아래 둘만 — 납작한 차트에 격자를 채우면 선이 안 보인다 */}
      {[lo, hi].map((v) => (
        <text key={v} x={APAD.l - 6} y={y(v) + 3.5} fill={INK_MUTED} fontSize="11" textAnchor="end">
          {v}%
        </text>
      ))}

      <path d={path} fill="none" stroke={SERIES[0]} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />

      {pts.map((p, i) => (
        <g key={p.from}>
          <circle cx={x(i)} cy={y(p.winRate)} r="3"
            fill={i === dropIdx ? CRIT : SERIES[0]} stroke={SURFACE} strokeWidth="2" />
          {/* 손가락·마우스가 잡을 영역은 점보다 크게 */}
          <rect
            x={x(i) - 16} y={APAD.t} width="32" height={AH - APAD.t - APAD.b}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
          />
        </g>
      ))}

      {/* x 라벨은 처음·중간·끝만 — 12개를 다 적으면 겹친다 */}
      {[0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i) => (
        <text key={i} x={x(i)} y={AH - 8} fill={INK_MUTED} fontSize="11" textAnchor="middle">
          {pts[i].from}~{pts[i].to}{unit}
        </text>
      ))}

      {h && (
        <>
          <line x1={x(hover!)} x2={x(hover!)} y1={APAD.t} y2={AH - APAD.b}
            stroke={GRID} strokeWidth="1" />
          <text
            x={Math.min(Math.max(x(hover!), APAD.l + 4), AW - APAD.r - 4)}
            y={APAD.t + 10}
            fill="#e6e8ec" fontSize="12" fontWeight="600"
            textAnchor={hover! > pts.length / 2 ? 'end' : 'start'}
          >
            {h.from}~{h.to}{unit} · {h.winRate}% · {h.games.toLocaleString()}
            {CL.gamesUnit[lang]}
          </text>
        </>
      )}
    </svg>
  );
}

function Legend({ items }: { items: { label: string; color: string; note?: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label} className="legend-item">
          <span className="legend-line" style={{ background: it.color }} />
          {it.label}
          {it.note && <span className="legend-n">({it.note})</span>}
        </span>
      ))}
    </div>
  );
}

/* ────────────────────────── 레이팅 추이 (라인) ────────────────────────── */

interface TrendPt {
  t: number;
  y: number;
  dt: string;
}

/** 시즌 구간 (lib/tekken/seasons.ts 가 game_version 에서 파생시킨 것). */
export interface SeasonSpan {
  key: string;
  start: string;
  end: string;
  games: number;
}

export function TrendChart({
  rows,
  lang = 'ko',
  seasons,
}: {
  rows: Row[];
  lang?: ChartLang;
  /**
   * 시즌 경계에 세로 점선을 긋는다. 가로축이 2년을 넘어가는데 구간 표시가 없으면
   * "언제부터 달라졌나"를 눈으로 못 짚는다.
   * **경계 날짜를 여기 적지 않는다** — seasons.ts 가 game_version 에서 파생시키므로
   * 새 시즌이 열려도 저절로 따라간다(CLAUDE.md: 시즌 경계 날짜를 코드에 다시 적지 말 것).
   */
  seasons?: SeasonSpan[];
}) {
  const { ref, x: hoverX, onMove, clear } = useSvgPointer();

  const model = useMemo(() => {
    const byChar = new Map<string, TrendPt[]>();
    for (const r of rows) {
      const [dt, rating, ch] = r as [string, number, string];
      if (typeof rating !== 'number') continue;
      let arr = byChar.get(ch);
      if (!arr) byChar.set(ch, (arr = []));
      arr.push({ t: parseDt(dt), y: rating, dt });
    }
    const all = [...byChar.entries()]
      .map(([ch, pts]) => ({ ch, pts }))
      .sort((a, b) => b.pts.length - a.pts.length);
    const shown = all.slice(0, MAX_SERIES);
    const hidden = all.slice(MAX_SERIES);

    let tMin = Infinity, tMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of shown)
      for (const p of s.pts) {
        if (p.t < tMin) tMin = p.t;
        if (p.t > tMax) tMax = p.t;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
    if (!isFinite(tMin)) return null;
    if (tMax === tMin) tMax = tMin + 1;
    const { ticks, lo, hi } = niceTicks(yMin, yMax);

    const x = (t: number) => PAD.l + ((t - tMin) / (tMax - tMin)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + f * (tMax - tMin));
    return { shown, hidden, x, y, ticks, xTicks, tMin, tMax };
  }, [rows]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { shown, hidden, x, y, ticks, xTicks, tMin, tMax } = model;

  const hover = (() => {
    if (hoverX === null) return null;
    const t = tMin + ((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * (tMax - tMin);
    const at = shown
      .map((s, i) => {
        let last: TrendPt | null = null;
        for (const p of s.pts) {
          if (p.t <= t) last = p;
          else break;
        }
        return last ? { ch: s.ch, color: SERIES[i], p: last } : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.p.y - a.p.y);
    if (!at.length) return null;
    const dt = at.reduce((m, r) => (r.p.t > m.p.t ? r : m), at[0]).p.dt;
    return { dt: dt.slice(0, 16), at };
  })();

  const fmtDate = (t: number) => {
    const d = new Date(t);
    return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div className="chart-root">
      <Legend items={shown.map((s, i) => ({ label: s.ch, color: SERIES[i], note: String(s.pts.length) }))} />
      {hidden.length > 0 && (
        <p className="hint">
          {lang === 'ko'
            ? `경기 수 상위 ${MAX_SERIES}종만 표시 — ${hidden.map((h) => h.ch).join(', ')} 은(는) 표에서 확인`
            : lang === 'ja'
              ? `試合数上位${MAX_SERIES}キャラのみ表示 — ${hidden.map((h) => h.ch).join(', ')} は表で確認`
              : `Top ${MAX_SERIES} characters by games — see table for ${hidden.map((h) => h.ch).join(', ')}`}
        </p>
      )}
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="trend-svg"
        onPointerMove={onMove}
        onPointerLeave={clear}
        role="img"
        aria-label="캐릭터별 레이팅 추이 그래프"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={INK_MUTED}>
              {v.toLocaleString()}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fill={INK_MUTED}
          >
            {fmtDate(t)}
          </text>
        ))}
        {/* 시즌 경계 — 선 아래에 깔아 데이터를 가리지 않게 한다.
            보이는 구간 밖의 경계는 그리지 않는다(기간 필터를 좁히면 잘려나간다). */}
        {(seasons ?? []).map((s) => {
          const t = parseDt(s.start);
          if (!(t > tMin && t < tMax)) return null;
          const sx = x(t);
          return (
            <g key={s.key}>
              <line
                x1={sx}
                x2={sx}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke={INK_MUTED}
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.55"
              />
              <text x={sx + 4} y={PAD.t + 11} fontSize="11" fill={INK_MUTED}>
                {s.key}
              </text>
            </g>
          );
        })}
        {shown.map((s, i) => (
          <polyline
            key={s.ch}
            points={s.pts.map((p) => `${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={SERIES[i]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {shown.map((s, i) => {
          const p = s.pts[s.pts.length - 1];
          return (
            <circle key={s.ch} cx={x(p.t)} cy={y(p.y)} r="4" fill={SERIES[i]} stroke={SURFACE} strokeWidth="2" />
          );
        })}
        {hover && hoverX !== null && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H - PAD.b} stroke={INK_MUTED} strokeWidth="1" />
            {hover.at.map((r) => (
              <circle key={r.ch} cx={Math.min(x(r.p.t), hoverX)} cy={y(r.p.y)} r="4" fill={r.color} stroke={SURFACE} strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover && (
        <div className="chart-tip">
          <div className="tip-date">{hover.dt}</div>
          {hover.at.map((r) => (
            <div key={r.ch} className="tip-row">
              <span className="legend-line" style={{ background: r.color }} />
              <b>{r.p.y.toLocaleString()}</b>
              <span className="tip-ch">{r.ch}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── 일별 (승/패 스택 막대) ────────────────────────── */

interface DayAgg {
  date: string;
  w: number;
  l: number;
  delta: number;
}

const DAILY_MAX_BARS = 184; // 그 이상은 최근 것만 (기간 필터로 좁히면 전부 보임)

/** 일별 그래프 스타일: 상하(승▲/패▼) · 누적 스택 · 승률 라인 */
export type DailyStyle = 'updown' | 'stack' | 'rate';

const ACCENT = '#3987e5'; // 승률 라인 (단일 시리즈)

export function DailyChart({
  rows,
  lang = 'ko',
  style = 'updown',
}: {
  rows: Row[];
  lang?: ChartLang;
  style?: DailyStyle;
}) {
  const [hoverI, setHoverI] = useState<number | null>(null);

  const model = useMemo(() => {
    // rows: [Date, my_char, Games, W, L, WinRate, RatingDelta, EndRating] (날짜 내림차순, 캐릭터별)
    const byDate = new Map<string, DayAgg>();
    for (const r of rows) {
      const [date, , , w, l, , delta] = r as [string, string, number, number, number, number, number];
      let g = byDate.get(date);
      if (!g) byDate.set(date, (g = { date, w: 0, l: 0, delta: 0 }));
      g.w += w;
      g.l += l;
      g.delta += delta;
    }
    const allDays = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    const days = allDays.slice(-DAILY_MAX_BARS);
    if (!days.length) return null;

    // 스타일별 y 범위 — 상하는 0 을 사이에 두고 위=승·아래=패 (같은 픽셀 스케일),
    // 누적은 0~최대 경기 수, 승률은 0~100 고정.
    let lo = 0;
    let hi = 1;
    const ticks: number[] = [];
    if (style === 'updown') {
      const maxW = Math.max(...days.map((d) => d.w));
      const maxL = Math.max(...days.map((d) => d.l));
      const { ticks: base } = niceTicks(0, Math.max(maxW, maxL, 1));
      const step = base.length > 1 ? base[1] - base[0] : 1;
      hi = Math.ceil(Math.max(maxW, 1) / step) * step;
      lo = -Math.ceil(Math.max(maxL, 1) / step) * step;
      for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    } else if (style === 'stack') {
      const maxGames = Math.max(...days.map((d) => d.w + d.l));
      const t = niceTicks(0, Math.max(maxGames, 1));
      ticks.push(...t.ticks);
      hi = t.hi;
    } else {
      lo = 0;
      hi = 100;
      ticks.push(0, 25, 50, 75, 100);
    }

    const plotW = W - PAD.l - PAD.r;
    const band = plotW / days.length;
    // 밀도에 맞는 막대 폭: 일별처럼 빽빽하면 ≤10px 로 얇게,
    // 시즌/연별처럼 막대가 몇 개뿐이면 ≤24px 까지 허용해 비어 보이지 않게.
    const maxBarW = days.length <= 12 ? 24 : 10;
    const barW = Math.min(maxBarW, Math.max(1.2, band - 1.2));
    const x = (i: number) => PAD.l + i * band + (band - barW) / 2;
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    return { days, truncated: allDays.length - days.length, ticks, x, y, band, barW };
  }, [rows, style]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { days, truncated, ticks, x, y, band, barW } = model;
  const hover = hoverI !== null ? days[hoverI] : null;
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));
  const rr = Math.min(3, barW / 2); // 데이터 끝 라운드
  const wrOf = (d: DayAgg) => (d.w + d.l ? (d.w * 100) / (d.w + d.l) : 0);

  const legendItems =
    style === 'rate'
      ? [{ label: `${CL.winrate[lang]} (%)`, color: ACCENT }]
      : style === 'updown'
        ? [
            { label: `${CL.win[lang]} ▲`, color: GOOD },
            { label: `${CL.loss[lang]} ▼`, color: CRIT },
          ]
        : [
            { label: CL.win[lang], color: GOOD },
            { label: CL.loss[lang], color: CRIT },
          ];

  return (
    <div className="chart-root">
      <Legend items={legendItems} />
      {truncated > 0 && (
        <p className="hint">
          {lang === 'ko'
            ? `최근 ${days.length}일만 표시 (이전 ${truncated}일은 기간을 좁히거나 표에서)`
            : lang === 'ja'
              ? `直近${days.length}日のみ表示 (それ以前の${truncated}日は期間指定か表で)`
              : `Showing last ${days.length} days (${truncated} earlier days: narrow the period or use the table)`}
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trend-svg"
        onPointerLeave={() => setHoverI(null)}
        role="img"
        aria-label="일별 승패 그래프"
      >
        {ticks.map((v) => {
          const emphasized = style === 'updown' ? v === 0 : style === 'rate' ? v === 50 : false;
          return (
            <g key={v}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(v)}
                y2={y(v)}
                stroke={emphasized ? BASELINE : GRID}
                strokeWidth="1"
              />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={INK_MUTED}>
                {Math.abs(v)}
              </text>
            </g>
          );
        })}

        {style === 'updown' &&
          days.map((d, i) => {
            const y0 = y(0);
            const yW = y(d.w);
            const yL = y(-d.l);
            return (
              <g key={d.date}>
                {d.w > 0 && (
                  <path
                    d={`M ${x(i)} ${y0} L ${x(i)} ${yW + rr}
                        Q ${x(i)} ${yW} ${x(i) + rr} ${yW}
                        L ${x(i) + barW - rr} ${yW}
                        Q ${x(i) + barW} ${yW} ${x(i) + barW} ${yW + rr}
                        L ${x(i) + barW} ${y0} Z`}
                    fill={GOOD}
                  />
                )}
                {d.l > 0 && (
                  <path
                    d={`M ${x(i)} ${y0} L ${x(i)} ${yL - rr}
                        Q ${x(i)} ${yL} ${x(i) + rr} ${yL}
                        L ${x(i) + barW - rr} ${yL}
                        Q ${x(i) + barW} ${yL} ${x(i) + barW} ${yL - rr}
                        L ${x(i) + barW} ${y0} Z`}
                    fill={CRIT}
                  />
                )}
              </g>
            );
          })}

        {style === 'stack' &&
          days.map((d, i) => {
            const total = d.w + d.l;
            const yTop = y(total);
            const yMid = y(d.l); // 패가 아래(기준선), 승이 위
            const segGap = 1.5;
            return (
              <g key={d.date}>
                {d.l > 0 && (
                  <rect x={x(i)} y={yMid} width={barW} height={H - PAD.b - yMid} fill={CRIT} />
                )}
                {d.w > 0 && (
                  <path
                    d={`M ${x(i)} ${d.l > 0 ? yMid - segGap : H - PAD.b}
                        L ${x(i)} ${yTop + rr}
                        Q ${x(i)} ${yTop} ${x(i) + rr} ${yTop}
                        L ${x(i) + barW - rr} ${yTop}
                        Q ${x(i) + barW} ${yTop} ${x(i) + barW} ${yTop + rr}
                        L ${x(i) + barW} ${d.l > 0 ? yMid - segGap : H - PAD.b} Z`}
                    fill={GOOD}
                  />
                )}
              </g>
            );
          })}

        {style === 'rate' && (
          <>
            <polyline
              points={days
                .map((d, i) => `${(x(i) + barW / 2).toFixed(1)},${y(wrOf(d)).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {hover && hoverI !== null && (
              <circle
                cx={x(hoverI) + barW / 2}
                cy={y(wrOf(hover))}
                r="4"
                fill={ACCENT}
                stroke={SURFACE}
                strokeWidth="2"
              />
            )}
          </>
        )}

        {/* 히트 타깃 + x 라벨 (전 스타일 공통) */}
        {days.map((d, i) => (
          <g key={`hit-${d.date}`}>
            <rect
              x={PAD.l + i * band}
              y={PAD.t}
              width={band}
              height={H - PAD.t - PAD.b}
              fill="transparent"
              onPointerMove={() => setHoverI(i)}
            />
            {i % labelEvery === 0 && (
              <text x={x(i) + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={INK_MUTED}>
                {d.date.length === 10 ? d.date.slice(5) : d.date}
              </text>
            )}
          </g>
        ))}
        {hover && hoverI !== null && style !== 'rate' && (
          <rect
            x={PAD.l + hoverI * band}
            y={PAD.t}
            width={band}
            height={H - PAD.t - PAD.b}
            fill="rgba(110,168,254,0.1)"
            pointerEvents="none"
          />
        )}
      </svg>
      {hover && (
        <div className="chart-tip">
          <div className="tip-date">{hover.date}</div>
          <div className="tip-row">
            <span className="legend-line" style={{ background: GOOD }} />
            <b>{hover.w}</b>
            <span className="tip-ch">{CL.win[lang]}</span>
          </div>
          <div className="tip-row">
            <span className="legend-line" style={{ background: CRIT }} />
            <b>{hover.l}</b>
            <span className="tip-ch">{CL.loss[lang]}</span>
          </div>
          <div className="tip-row">
            <b>{Math.round(wrOf(hover) * 10) / 10}%</b>
            <span className="tip-ch">{CL.winrate[lang]}</span>
          </div>
          <div className="tip-row">
            <b>{hover.delta > 0 ? `+${hover.delta}` : hover.delta}</b>
            <span className="tip-ch">{CL.delta[lang]}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── 세션 (레이팅 변동, 0 기준 상하 막대) ─────────────────────── */

interface SessAgg {
  label: string;
  games: number;
  w: number;
  l: number;
  delta: number;
  endRating: number;
}

const SESSION_MAX_BARS = 60;

export function SessionChart({ rows, lang = 'ko' }: { rows: Row[]; lang?: ChartLang }) {
  const [hoverI, setHoverI] = useState<number | null>(null);

  const model = useMemo(() => {
    // rows: [Session, Start, End, my_char, Games, W, L, WinRate, RatingDelta, EndRating]
    // (세션 내림차순, 세션 안에서 캐릭터별 행) → 세션 단위로 합산
    const bySess = new Map<string, SessAgg>();
    for (const r of rows) {
      const [label, , , , games, w, l, , delta, endRating] = r as [
        string, string, string, string, number, number, number, number, number, number,
      ];
      let g = bySess.get(label);
      if (!g) bySess.set(label, (g = { label, games: 0, w: 0, l: 0, delta: 0, endRating }));
      g.games += games;
      g.w += w;
      g.l += l;
      g.delta += delta;
    }
    const allSess = [...bySess.values()].sort((a, b) => (a.label < b.label ? -1 : 1));
    const sess = allSess.slice(-SESSION_MAX_BARS);
    if (!sess.length) return null;
    const dMin = Math.min(0, ...sess.map((s) => s.delta));
    const dMax = Math.max(0, ...sess.map((s) => s.delta));
    const { ticks, lo, hi } = niceTicks(dMin, dMax);
    const plotW = W - PAD.l - PAD.r;
    const band = plotW / sess.length;
    // 막대 **폭 = 세션 길이(판수)**. 높이만 쓰면 91판 세션의 -180 과 5판 세션의 -180 이
    // 같은 크기로 보인다 — 전혀 다른 이야기인데. Games 컬럼이 있는데 안 쓰고 있었다.
    const gMax = Math.max(...sess.map((s) => s.games), 1);
    const wMax = Math.min(24, Math.max(3, band - 1));
    const wMin = Math.max(2, Math.min(4, wMax));
    const barOf = (g: number) => wMin + (wMax - wMin) * Math.sqrt(Math.min(1, g / gMax));
    const x = (i: number) => PAD.l + i * band + (band - barOf(sess[i].games)) / 2;
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    return { sess, truncated: allSess.length - sess.length, ticks, x, y, band, barOf };
  }, [rows]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { sess, truncated, ticks, x, y, band, barOf } = model;
  const hover = hoverI !== null ? sess[hoverI] : null;
  const labelEvery = Math.max(1, Math.ceil(sess.length / 6));

  return (
    <div className="chart-root">
      <Legend
        items={[
          { label: CL.up[lang], color: GOOD },
          { label: CL.down[lang], color: CRIT },
        ]}
      />
      {truncated > 0 && (
        <p className="hint">
          {lang === 'ko'
            ? `최근 ${sess.length}세션만 표시 (이전 ${truncated}세션은 기간을 좁히거나 표에서)`
            : lang === 'ja'
              ? `直近${sess.length}セッションのみ表示 (以前の${truncated}件は期間指定か表で)`
              : `Showing last ${sess.length} sessions (${truncated} earlier: narrow the period or use the table)`}
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trend-svg"
        onPointerLeave={() => setHoverI(null)}
        role="img"
        aria-label="세션별 레이팅 변동 그래프"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? BASELINE : GRID} strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={INK_MUTED}>
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {sess.map((s, i) => {
          const up = s.delta >= 0;
          const barW = barOf(s.games);
          const y0 = y(0);
          const y1 = y(s.delta);
          const top = up ? y1 : y0;
          const h = Math.max(1, Math.abs(y1 - y0));
          const rr = Math.min(4, barW / 2, h);
          // 데이터 끝만 4px 라운드 (위/아래 방향에 따라), 기준선 쪽은 사각
          const d = up
            ? `M ${x(i)} ${y0} L ${x(i)} ${top + rr} Q ${x(i)} ${top} ${x(i) + rr} ${top}
               L ${x(i) + barW - rr} ${top} Q ${x(i) + barW} ${top} ${x(i) + barW} ${top + rr}
               L ${x(i) + barW} ${y0} Z`
            : `M ${x(i)} ${y0} L ${x(i)} ${top + h - rr} Q ${x(i)} ${top + h} ${x(i) + rr} ${top + h}
               L ${x(i) + barW - rr} ${top + h} Q ${x(i) + barW} ${top + h} ${x(i) + barW} ${top + h - rr}
               L ${x(i) + barW} ${y0} Z`;
          return (
            <g key={s.label}>
              <path d={d} fill={up ? GOOD : CRIT} />
              <rect
                x={PAD.l + i * band}
                y={PAD.t}
                width={band}
                height={H - PAD.t - PAD.b}
                fill="transparent"
                onPointerMove={() => setHoverI(i)}
              />
              {i % labelEvery === 0 && (
                <text x={x(i) + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={INK_MUTED}>
                  {s.label.slice(5, 10)}
                </text>
              )}
            </g>
          );
        })}
        {hover && hoverI !== null && (
          <rect
            x={PAD.l + hoverI * band}
            y={PAD.t}
            width={band}
            height={H - PAD.t - PAD.b}
            fill="rgba(110,168,254,0.08)"
            pointerEvents="none"
          />
        )}
      </svg>
      {hover && (
        <div className="chart-tip">
          <div className="tip-date">{hover.label} {CL.session[lang]}</div>
          <div className="tip-row">
            <span className="legend-line" style={{ background: hover.delta >= 0 ? GOOD : CRIT }} />
            <b>{hover.delta > 0 ? `+${hover.delta}` : hover.delta}</b>
            <span className="tip-ch">{CL.delta[lang]}</span>
          </div>
          <div className="tip-row">
            <b>
              {hover.w}{CL.win[lang]} {hover.l}{CL.loss[lang]}
            </b>
            <span className="tip-ch">{hover.games}{CL.gamesUnit[lang]}</span>
          </div>
          <div className="tip-row">
            <b>{hover.endRating.toLocaleString()}</b>
            <span className="tip-ch">{CL.endRating[lang]}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════ 활동 히트맵 ══════════════
   일별 탭(buildDaily)의 같은 숫자를 달력 격자로 옮긴 것. **새 계산이 없다.**

   왜 표가 아니라 격자인가: 33행짜리 표를 다 읽어도 "몰아서 하는가 / 꾸준한가 /
   언제 쉬었는가"가 안 잡힌다. 실측(JackFather 909경기)에서 최근 1년 19일 접속,
   하루 최다 91판, 최장 공백 183일이 격자에서는 한눈에 보였다.

   색 기준이 **절대값인 것이 중요하다.** 처음엔 그 사람의 최댓값을 기준으로 잡았는데,
   그러면 (1) 몰아서 하는 사람일수록 자기 그림이 밋밋해지고 (2) **사람 간 비교가 안 된다**
   — 91판과 12판이 같은 색이 될 수 있다. 이 사이트는 여러 명 비교가 기본 기능이라
   같은 색이 같은 뜻이어야 한다. */

/** 칸 색 경계(판수). 절대 기준 — 남의 기록이나 본인 최댓값에 안 흔들린다. */
const HEAT_STEPS = [1, 10, 25, 50] as const;
const HEAT_COLORS = ['#1b1f27', '#1e3a5f', '#2f5e9e', '#4a86d8', '#6ea8fe'];

const HL = {
  none: { ko: '없음', en: 'none', ja: 'なし' },
  games: { ko: '판', en: ' games', ja: '戦' },
  less: { ko: '적음', en: 'less', ja: '少' },
  more: { ko: '많음', en: 'more', ja: '多' },
  days: { ko: '플레이한 날', en: 'days played', ja: 'プレイ日' },
  peak: { ko: '하루 최다', en: 'busiest day', ja: '最多' },
  streak: { ko: '최장 연속', en: 'longest streak', ja: '最長連続' },
  gap: { ko: '최장 공백', en: 'longest gap', ja: '最長ブランク' },
  wd: { ko: ['일', '', '화', '', '목', '', '토'], en: ['S', '', 'T', '', 'T', '', 'S'], ja: ['日', '', '火', '', '木', '', '土'] },
} as const;

const heatColor = (n: number) => {
  let i = 0;
  for (const s of HEAT_STEPS) if (n >= s) i++;
  return HEAT_COLORS[i];
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function ActivityHeatmap({
  rows,
  lang = 'ko',
  /** 며칠치를 보여줄지. 기본 1년. */
  days = 371,
}: {
  rows: Row[];
  lang?: ChartLang;
  days?: number;
}) {
  const model = useMemo(() => {
    // buildDaily 는 같은 날에 캐릭터별로 여러 행이 나온다 — 날짜로 합친다.
    const byDay = new Map<string, number>();
    let last = '';
    for (const r of rows) {
      const d = String(r[0] ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const g = Number(r[2]) || 0;
      byDay.set(d, (byDay.get(d) ?? 0) + g);
      if (d > last) last = d;
    }
    if (!last) return null;

    const end = new Date(`${last}T00:00:00Z`);
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    // 일요일에서 시작해야 열이 주 단위로 떨어진다.
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());

    const cells: { d: Date; n: number }[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const d = new Date(t);
      cells.push({ d, n: byDay.get(dayKey(d)) ?? 0 });
    }

    let played = 0, peak = 0, streak = 0, run = 0, gap = 0, grun = 0;
    for (const c of cells) {
      if (c.n > 0) {
        played++; run++; grun = 0;
        if (c.n > peak) peak = c.n;
        if (run > streak) streak = run;
      } else {
        run = 0; grun++;
        if (grun > gap) gap = grun;
      }
    }
    return { cells, played, peak, streak, gap };
  }, [rows, days]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { cells, played, peak, streak, gap } = model;

  const CS = 11, GAP = 3, STEP = CS + GAP;
  const LEFT = 22, TOP = 16;
  const weeks = Math.ceil(cells.length / 7);
  const w = LEFT + weeks * STEP;
  const h = TOP + 7 * STEP + 2;

  const months: { x: number; m: number }[] = [];
  cells.forEach((c, i) => {
    if (c.d.getUTCDay() === 0 && c.d.getUTCDate() <= 7) {
      months.push({ x: LEFT + Math.floor(i / 7) * STEP, m: c.d.getUTCMonth() + 1 });
    }
  });

  const stat = (v: number, label: string, unit = '') => (
    <div className="heat-stat">
      <b>{v.toLocaleString()}{unit}</b>
      <span>{label}</span>
    </div>
  );

  return (
    <div className="chart-root">
      <div className="heat-scroll">
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="일별 경기 수 히트맵">
          {months.map((mo, i) => (
            <text key={i} x={mo.x} y={11} fontSize="11" fill={INK_MUTED}>{mo.m}</text>
          ))}
          {HL.wd[lang].map((lb, i) =>
            lb ? (
              <text key={i} x={0} y={TOP + i * STEP + CS - 1} fontSize="11" fill={INK_MUTED}>{lb}</text>
            ) : null,
          )}
          {cells.map((c, i) => (
            <rect
              key={i}
              x={LEFT + Math.floor(i / 7) * STEP}
              y={TOP + (i % 7) * STEP}
              width={CS}
              height={CS}
              rx="2.5"
              fill={heatColor(c.n)}
            >
              <title>{`${dayKey(c.d)} — ${c.n ? c.n + HL.games[lang] : HL.none[lang]}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="heat-legend">
        <span>{HL.less[lang]}</span>
        {HEAT_COLORS.map((c, i) => (
          <i key={c} style={{ background: c }} title={i === 0 ? HL.none[lang] : `${HEAT_STEPS[i - 1]}+`} />
        ))}
        <span>{HL.more[lang]}</span>
      </div>
      <div className="heat-stats">
        {stat(played, HL.days[lang])}
        {stat(peak, HL.peak[lang], HL.games[lang])}
        {stat(streak, HL.streak[lang])}
        {stat(gap, HL.gap[lang])}
      </div>
    </div>
  );
}

/* ══════════════ 승단 이력 (계단선) ══════════════
   표만 있을 때의 문제: 단은 **캐릭터마다 따로 가는데** 표는 한 줄로 섞어 놓는다.
   Paul 11~14단과 Jack-8 14~28단이 같은 열에 번갈아 나오면 척도가 뒤섞여 안 읽힌다.

   레이팅 추이와 겹치지 않나 — 겹치는 부분이 있다(둘 다 시간축·우상향 경향).
   대신 이 그림만 답하는 게 있다: **한 단에 얼마나 머물렀나.** 계단의 '폭'이 그것이고,
   레이팅 선은 계속 움직이므로 그 정보를 못 준다. 표의 '이전 단 경기/승률'도 같은 축이다. */

export function RankChart({ rows, lang = 'ko' }: { rows: Row[]; lang?: ChartLang }) {
  const { ref, x: hoverX, onMove, clear } = useSvgPointer();

  const model = useMemo(() => {
    // rows: [dt, From, To, Change, my_char, my_rating, PrevGames, PrevWinRate] (최신 우선)
    const byChar = new Map<string, { t: number; rank: number }[]>();
    const asc = [...rows].reverse();
    for (const r of asc) {
      const [dt, from, to, , ch] = r as [string, number, number, string, string];
      if (typeof to !== 'number') continue;
      const t = parseDt(dt);
      let arr = byChar.get(ch);
      if (!arr) byChar.set(ch, (arr = [{ t, rank: from }]));
      arr.push({ t, rank: to });
    }
    if (!byChar.size) return null;

    let tMin = Infinity, tMax = -Infinity, rMin = Infinity, rMax = -Infinity;
    for (const pts of byChar.values())
      for (const p of pts) {
        if (p.t < tMin) tMin = p.t;
        if (p.t > tMax) tMax = p.t;
        if (p.rank < rMin) rMin = p.rank;
        if (p.rank > rMax) rMax = p.rank;
      }
    if (tMax === tMin) tMax = tMin + 1;
    // 마지막 단은 지금까지 이어진다 — 선을 오른쪽 끝까지 끈다.
    const series = [...byChar.entries()]
      .map(([ch, pts]) => ({ ch, pts: [...pts, { t: tMax, rank: pts[pts.length - 1].rank }] }))
      .sort((a, b) => b.pts.length - a.pts.length)
      .slice(0, MAX_SERIES);

    const lo = Math.max(0, rMin - 1);
    const hi = rMax + 1;
    const x = (t: number) => PAD.l + ((t - tMin) / (tMax - tMin)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    // 단은 정수라 눈금도 정수로 — 소수 눈금이 나오면 "27.5단"처럼 읽혀 거짓이 된다.
    const step = Math.max(1, Math.ceil((hi - lo) / 6));
    const ticks: number[] = [];
    for (let v = Math.ceil(lo); v <= hi; v += step) ticks.push(v);
    return { series, x, y, ticks, tMin, tMax };
  }, [rows]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { series, x, y, ticks, tMin, tMax } = model;

  const fmtDate = (t: number) => {
    const d = new Date(t);
    return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => tMin + f * (tMax - tMin));

  const hover = (() => {
    if (hoverX === null) return null;
    const t = tMin + ((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * (tMax - tMin);
    const at = series
      .map((s, i) => {
        let last: { t: number; rank: number } | null = null;
        for (const p of s.pts) {
          if (p.t <= t) last = p;
          else break;
        }
        return last ? { ch: s.ch, color: SERIES[i], rank: last.rank } : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.rank - a.rank);
    return at.length ? at : null;
  })();

  const rankUnit = lang === 'ko' ? '단' : lang === 'ja' ? '段' : '';

  return (
    <div className="chart-root">
      <Legend items={series.map((s, i) => ({ label: s.ch, color: SERIES[i] }))} />
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="trend-svg"
        onPointerMove={onMove}
        onPointerLeave={clear}
        role="img"
        aria-label="캐릭터별 승단 이력 계단 그래프"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={INK_MUTED}>
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={x(t)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fill={INK_MUTED}
          >
            {fmtDate(t)}
          </text>
        ))}
        {series.map((s, i) => {
          // 계단 — 단은 순간 바뀌므로 대각선으로 이으면 "천천히 올랐다"는 거짓이 된다.
          let d = '';
          s.pts.forEach((p, k) => {
            if (k === 0) d += `M ${x(p.t).toFixed(1)} ${y(p.rank).toFixed(1)}`;
            else d += ` H ${x(p.t).toFixed(1)} V ${y(p.rank).toFixed(1)}`;
          });
          return (
            <path key={s.ch} d={d} fill="none" stroke={SERIES[i]} strokeWidth="2" strokeLinejoin="round" />
          );
        })}
        {hoverX !== null && (
          <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H - PAD.b} stroke={INK_MUTED} strokeWidth="1" />
        )}
      </svg>
      {hover && (
        <div className="chart-tip">
          {hover.map((r) => (
            <div key={r.ch} className="tip-row">
              <span className="legend-line" style={{ background: r.color }} />
              {r.ch} <b>{r.rank}{rankUnit}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
