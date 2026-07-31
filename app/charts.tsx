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

export function TrendChart({ rows, lang = 'ko' }: { rows: Row[]; lang?: ChartLang }) {
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

const DAILY_MAX_BARS = 92; // 약 3달치. 그 이상은 최근 것만 (기간 필터로 좁히면 전부 보임)

export function DailyChart({ rows, lang = 'ko' }: { rows: Row[]; lang?: ChartLang }) {
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
    const maxGames = Math.max(...days.map((d) => d.w + d.l));
    const { ticks, hi } = niceTicks(0, maxGames);
    const plotW = W - PAD.l - PAD.r;
    const band = plotW / days.length;
    const barW = Math.min(24, Math.max(2, band - 2)); // ≤24px, 2px 표면 간격
    const x = (i: number) => PAD.l + i * band + (band - barW) / 2;
    const y = (v: number) => H - PAD.b - (v / hi) * (H - PAD.t - PAD.b);
    return { days, truncated: allDays.length - days.length, ticks, hi, x, y, band, barW };
  }, [rows]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { days, truncated, ticks, x, y, band, barW } = model;
  const hover = hoverI !== null ? days[hoverI] : null;

  // x 라벨: 5~7개만 추려서
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));

  return (
    <div className="chart-root">
      <Legend
        items={[
          { label: CL.win[lang], color: GOOD },
          { label: CL.loss[lang], color: CRIT },
        ]}
      />
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
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={INK_MUTED}>
              {v}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const total = d.w + d.l;
          const yTop = y(total);
          const yMid = y(d.l); // 패가 아래(기준선), 승이 위
          return (
            <g key={d.date}>
              {/* 패: 기준선에서 위로 (사각) */}
              {d.l > 0 && (
                <rect x={x(i)} y={yMid} width={barW} height={H - PAD.b - yMid} fill={CRIT} />
              )}
              {/* 승: 그 위에 2px 표면 간격 + 4px 라운드 데이터 끝 */}
              {d.w > 0 && (
                <path
                  d={`M ${x(i)} ${(d.l > 0 ? yMid - 2 : H - PAD.b)}
                      L ${x(i)} ${yTop + 4}
                      Q ${x(i)} ${yTop} ${x(i) + Math.min(4, barW / 2)} ${yTop}
                      L ${x(i) + barW - Math.min(4, barW / 2)} ${yTop}
                      Q ${x(i) + barW} ${yTop} ${x(i) + barW} ${yTop + 4}
                      L ${x(i) + barW} ${(d.l > 0 ? yMid - 2 : H - PAD.b)} Z`}
                  fill={GOOD}
                />
              )}
              {/* 히트 타깃: 열 전체 (마크보다 크게) */}
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
                  {/* 일별(yyyy-MM-dd)은 월-일만, 월/분기/반기/연 라벨은 그대로 */}
                  {d.date.length === 10 ? d.date.slice(5) : d.date}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke={BASELINE} strokeWidth="1" />
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
            <b>{hover.w + hover.l ? Math.round((hover.w * 1000) / (hover.w + hover.l)) / 10 : 0}%</b>
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
    const barW = Math.min(24, Math.max(2, band - 2));
    const x = (i: number) => PAD.l + i * band + (band - barW) / 2;
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    return { sess, truncated: allSess.length - sess.length, ticks, x, y, band, barW };
  }, [rows]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { sess, truncated, ticks, x, y, band, barW } = model;
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
