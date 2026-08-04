'use client';

// 리포트용 레이팅 추이 — 서버가 계산한 점만 받아 그린다.
//
// 색은 이 저장소에서 이미 검증한 다크 카테고리 팔레트(사이트 배경 #171a21 기준,
// validate_palette.js 전 항목 PASS)의 앞 6색을 순서대로 쓴다. 순서를 섞거나
// 7번째 색을 만들지 말 것 — 인접 색 구분이 그 순서에서만 보장된다.

import { useMemo, useRef, useState } from 'react';

const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const INK_MUTED = '#898781';
const GRID = '#2c2c2a';
const SURFACE = '#171a21';

const W = 900;
const H = 300;
const PAD = { l: 52, r: 16, t: 14, b: 28 };

export interface TrendPoint {
  i: number; // 전체 경기 순서 (x 축) — 시간이 아니라 '몇 번째 판인가'
  t: number; // epoch ms (축 라벨용)
  y: number; // 레이팅
  c: string; // 캐릭터
}

/** 시즌 경계 — 그 시즌 첫 경기의 **순번**. x 축이 판수라 날짜가 아니라 순번으로 받는다. */
export interface SeasonMark {
  key: string;
  i: number;
}

export default function ReportChart({
  points,
  chars,
  seasons = [],
  lang = 'ko',
  total,
}: {
  points: TrendPoint[];
  /** **최근에 친 순서**로 정렬돼 온다. 여기서 앞에서부터 6종까지만 그린다. */
  chars: string[];
  /**
   * 시즌 경계에 세로 점선을 긋는다. 가로축이 수백~수만 판이라 구간 표시가 없으면
   * "언제부터 달라졌나"를 눈으로 못 짚는다.
   * 경계 날짜를 여기 적지 않는다 — seasons.ts 가 game_version 에서 파생시킨다.
   */
  seasons?: SeasonMark[];
  lang?: 'ko' | 'en' | 'ja';
  /** 그 사람이 쓴 캐릭터 전체 종수. 몇 종을 빼고 그렸는지 밝히는 데 쓴다. */
  total?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const model = useMemo(() => {
    if (!points.length) return null;
    const byChar = new Map<string, TrendPoint[]>();
    for (const p of points) {
      if (!byChar.has(p.c)) byChar.set(p.c, []);
      byChar.get(p.c)!.push(p);
    }
    const shown = chars
      .map((c) => ({ c, pts: byChar.get(c) ?? [] }))
      .filter((s) => s.pts.length > 0)
      .slice(0, SERIES.length);

    // x 는 '몇 번째 판인가'다. 시간으로 그리면 몰아서 친 하루가 거의 수직선이 되어
    // 추이가 안 보인다 — 실제 데이터에서 그랬다. 판수 축이면 세션이 폭을 갖는다.
    let iMin = Infinity, iMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of points) {
      if (p.i < iMin) iMin = p.i;
      if (p.i > iMax) iMax = p.i;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
    if (iMax === iMin) iMax = iMin + 1;
    const step = Math.max(50, Math.ceil((yMax - yMin) / 4 / 50) * 50);
    const lo = Math.floor(yMin / step) * step;
    const hi = Math.ceil(yMax / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);

    const x = (i: number) => PAD.l + ((i - iMin) / (iMax - iMin)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    // 축 라벨은 그 지점 근처 경기의 날짜로 (판수 축이지만 시기를 알 수 있게)
    const sortedByI = [...points].sort((a, b) => a.i - b.i);
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const target = iMin + f * (iMax - iMin);
      let best = sortedByI[0];
      for (const p of sortedByI) {
        if (Math.abs(p.i - target) < Math.abs(best.i - target)) best = p;
      }
      return best;
    });
    return { shown, x, y, ticks, xTicks, iMin, iMax };
  }, [points, chars]);

  if (!model) return null;
  const { shown, x, y, ticks, xTicks, iMin, iMax } = model;

  const hover = (() => {
    if (hoverX === null) return null;
    const idx = iMin + ((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * (iMax - iMin);
    const at = shown
      .map((s, i) => {
        let last: TrendPoint | null = null;
        for (const p of s.pts) {
          if (p.i <= idx) last = p;
          else break;
        }
        return last ? { c: s.c, color: SERIES[i], p: last } : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.p.y - a.p.y);
    if (!at.length) return null;
    const newest = at.reduce((m, r) => (r.p.i > m.p.i ? r : m), at[0]).p;
    return { at, date: new Date(newest.t).toISOString().slice(0, 10) };
  })();

  const fmt = (t: number) => {
    const d = new Date(t);
    return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="chart-legend">
        {shown.map((s, i) => (
          <span key={s.c} className="legend-item">
            <span className="legend-line" style={{ background: SERIES[i] }} />
            {s.c}
            <span className="legend-n">({s.pts.length})</span>
          </span>
        ))}
      </div>
      {/* 몇 종을 빼고 그렸는지 밝힌다. 조용히 자르면 '이 사람은 6종만 쓴다'로 읽힌다 —
          실제로는 23종을 쓰는 사람도 있다. 리포트는 눌러서 켜는 화면이 아니라
          한 장짜리 요약이라, 고르게 하는 대신 기준과 누락을 말로 밝힌다. */}
      {total != null && total > shown.length && (
        <p className="rp-note">
          {lang === 'ko'
            ? `캐릭터 ${total}종 중 최근에 사용한 ${shown.length}종만 표시했습니다.`
            : lang === 'ja'
              ? `${total}キャラ中、直近に使用した${shown.length}キャラのみ表示しています。`
              : `Showing the ${shown.length} most recently played of ${total} characters.`}
        </p>
      )}
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="trend-svg"
        role="img"
        aria-label="캐릭터별 레이팅 추이"
        onPointerMove={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r) return;
          const px = ((e.clientX - r.left) / r.width) * W;
          setHoverX(Math.max(PAD.l, Math.min(W - PAD.r, px)));
        }}
        onPointerLeave={() => setHoverX(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={INK_MUTED}>
              {v.toLocaleString()}
            </text>
          </g>
        ))}
        {xTicks.map((p, i) => (
          <text
            key={i}
            x={x(p.i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fill={INK_MUTED}
          >
            {fmt(p.t)}
          </text>
        ))}
        {/* 시즌 경계 — 선 아래에 깔아 데이터를 가리지 않는다.
            보이는 구간 밖(기간을 좁힌 리포트)은 그리지 않는다. */}
        {seasons.map((sm) =>
          sm.i > iMin && sm.i < iMax ? (
            <g key={sm.key}>
              <line
                x1={x(sm.i)}
                x2={x(sm.i)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="#6b7280"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text x={x(sm.i) + 4} y={PAD.t + 11} fontSize="11" fill="#9aa1ad">
                {sm.key}
              </text>
            </g>
          ) : null,
        )}
        {shown.map((s, i) => (
          <polyline
            key={s.c}
            points={s.pts.map((p) => `${x(p.i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}
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
            <circle key={s.c} cx={x(p.i)} cy={y(p.y)} r="4" fill={SERIES[i]} stroke={SURFACE} strokeWidth="2" />
          );
        })}
        {hover && hoverX !== null && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H - PAD.b} stroke={INK_MUTED} strokeWidth="1" />
            {hover.at.map((r) => (
              <circle
                key={r.c}
                cx={Math.min(x(r.p.i), hoverX)}
                cy={y(r.p.y)}
                r="4"
                fill={r.color}
                stroke={SURFACE}
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>
      {hover && (
        <div className="chart-tip">
          <div className="tip-date">{hover.date}</div>
          {hover.at.map((r) => (
            <div key={r.c} className="tip-row">
              <span className="legend-line" style={{ background: r.color }} />
              <b>{r.p.y.toLocaleString()}</b>
              <span className="tip-ch">{r.c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
