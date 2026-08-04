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

/**
 * 이 이상 안 치면 선을 끊는다. 이어 그리면 **없던 변화를 그린 것**이 된다 —
 * 실측(JackFather)에서 183일 공백이 직선 한 줄로 이어져 "그동안 천천히 내려갔다"처럼
 * 보였다. 활동 히트맵이 그 공백을 드러내면서 발견했다.
 */
const TREND_GAP_DAYS = 21;
/** 계열당 그릴 점의 상한. 30,233경기 유저는 한 폴리라인이 3만 점이 된다. */
const TREND_MAX_PTS = 900;

/**
 * 공백에서 끊고, 점이 많으면 솎아낸다.
 *
 * 솎을 때 **구간의 최저·최고를 남긴다.** 단순히 N번째마다 뽑으면 봉우리와 골이
 * 통째로 사라져 그래프가 실제보다 밋밋해진다.
 */
function splitAndThin(pts: TrendPt[]): TrendPt[][] {
  const gap = TREND_GAP_DAYS * 86400000;
  const segs: TrendPt[][] = [];
  let cur: TrendPt[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && pts[i].t - pts[i - 1].t > gap) {
      segs.push(cur);
      cur = [];
    }
    cur.push(pts[i]);
  }
  if (cur.length) segs.push(cur);

  const total = pts.length;
  if (total <= TREND_MAX_PTS) return segs;

  const keep = Math.max(2, Math.floor(TREND_MAX_PTS / segs.length));
  return segs.map((seg) => {
    if (seg.length <= keep) return seg;
    const bucket = Math.ceil(seg.length / (keep / 2));
    const out: TrendPt[] = [];
    for (let i = 0; i < seg.length; i += bucket) {
      const part = seg.slice(i, i + bucket);
      let lo = part[0];
      let hi = part[0];
      for (const p of part) {
        if (p.y < lo.y) lo = p;
        if (p.y > hi.y) hi = p;
      }
      // 시간 순서를 지켜 넣는다 — 뒤집으면 선이 되감긴다.
      if (lo.t <= hi.t) out.push(lo, hi);
      else out.push(hi, lo);
    }
    if (out[out.length - 1] !== seg[seg.length - 1]) out.push(seg[seg.length - 1]);
    return out;
  });
}

/* ── 캐릭터 계열 고르기 (추이·승단 공용) ───────────────────────────
   예전에는 **경기 수 상위 8종을 자동으로 그리고 나머지는 텍스트로만 안내**했다.
   캐릭터를 많이 쓰는 사람은 (1) 선이 8개라 읽을 수 없고 (2) 빠진 캐릭터를
   볼 방법이 아예 없었다.

   지금은 **최근에 친 순으로 기본 4종만 켜고, 나머지는 범례에서 켤 수 있다.**
   '경기 수'가 아니라 '최근'인 이유: 1년 전에 접은 주력보다 요즘 잡은 캐릭이
   지금 궁금한 것이다. 동시에 켤 수 있는 상한은 팔레트 색 수(8)와 같다 —
   9번째 색을 만들지 않는다(파일 머리말 규칙). */

const DEFAULT_ON = 4;

interface Pickable {
  ch: string;
  pts: { t: number }[];
}

/** 마지막으로 친 시각 내림차순. 같으면 경기 수 많은 쪽. */
function byRecent<T extends Pickable>(all: T[]): T[] {
  return [...all].sort((a, b) => {
    const at = a.pts.length ? a.pts[a.pts.length - 1].t : 0;
    const bt = b.pts.length ? b.pts[b.pts.length - 1].t : 0;
    return bt - at || b.pts.length - a.pts.length;
  });
}

/**
 * 계열 on/off. `null` 이면 아직 손대지 않은 상태라 기본값(최근 4종)을 쓴다.
 * 색은 **켜진 것들 사이 순서**로 준다 — 항상 8색 안에서 겹치지 않는다.
 */
function useSeriesPick<T extends Pickable>(all: T[]) {
  const [manual, setManual] = useState<Set<string> | null>(null);
  const ordered = useMemo(() => byRecent(all), [all]);
  const on = useMemo(
    () => manual ?? new Set(ordered.slice(0, DEFAULT_ON).map((s) => s.ch)),
    [manual, ordered],
  );
  const vis = ordered.filter((s) => on.has(s.ch));
  const colorOf = (ch: string) => SERIES[vis.findIndex((s) => s.ch === ch)] ?? INK_MUTED;
  const atCap = vis.length >= MAX_SERIES;
  const toggle = (ch: string) =>
    setManual(() => {
      const next = new Set(on);
      if (next.has(ch)) next.delete(ch);
      else if (next.size < MAX_SERIES) next.add(ch);
      return next;
    });
  const clear = () => setManual(new Set());
  const reset = () => setManual(null);
  const isDefault = manual === null;
  return { ordered, on, vis, colorOf, toggle, atCap, clear, reset, isDefault };
}

/** 범례 아래 한 줄 안내. 상한에 걸렸는지, 몇 개 켜져 있는지를 말한다. */
function pickHint(total: number, shown: number, atCap: boolean, lang: ChartLang): string {
  if (atCap) {
    return lang === 'ko'
      ? `한 번에 ${MAX_SERIES}종까지 볼 수 있습니다 — 다른 캐릭터를 보려면 켜둔 것을 먼저 끄세요.`
      : lang === 'ja'
        ? `同時に表示できるのは${MAX_SERIES}キャラまでです — 別のキャラを見るには先に消してください。`
        : `Up to ${MAX_SERIES} at once — turn one off to add another.`;
  }
  return lang === 'ko'
    ? `${total}종 중 ${shown}종 표시 중 · 범례를 눌러 켜고 끕니다 (기본: 최근 ${DEFAULT_ON}종)`
    : lang === 'ja'
      ? `${total}キャラ中 ${shown}キャラ表示 · 凡例をタップで切替 (既定: 直近${DEFAULT_ON}キャラ)`
      : `${shown} of ${total} shown · click the legend to toggle (default: ${DEFAULT_ON} most recent)`;
}

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

function Legend({
  items,
  onToggle,
  on,
  atCap,
  onClear,
  onReset,
  lang = 'ko',
}: {
  items: { label: string; color: string; note?: string }[];
  /** 주면 범례가 버튼이 된다 — 눌러서 계열을 껐다 켠다. */
  onToggle?: (label: string) => void;
  /** 켜져 있는 라벨들. */
  on?: Set<string>;
  /** 상한(8종)에 걸렸는가 — 꺼진 항목을 눌러도 안 켜지므로 그렇게 보이게 한다. */
  atCap?: boolean;
  onClear?: () => void;
  onReset?: () => void;
  lang?: ChartLang;
}) {
  if (!onToggle) {
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
  return (
    <div className="chart-legend">
      {items.map((it) => {
        const isOn = on?.has(it.label) ?? true;
        const blocked = !isOn && atCap;
        return (
          <button
            key={it.label}
            type="button"
            className={`legend-item legend-toggle${isOn ? '' : ' off'}${blocked ? ' blocked' : ''}`}
            onClick={() => onToggle(it.label)}
            aria-pressed={isOn}
            title={blocked ? CLG.capped[lang] : undefined}
          >
            <span className="legend-line" style={{ background: isOn ? it.color : INK_MUTED }} />
            {it.label}
            {it.note && <span className="legend-n">({it.note})</span>}
          </button>
        );
      })}
      {onClear && (
        <button type="button" className="legend-item legend-act" onClick={onClear}>
          {CLG.clear[lang]}
        </button>
      )}
      {onReset && (
        <button type="button" className="legend-item legend-act" onClick={onReset}>
          {CLG.reset[lang]}
        </button>
      )}
    </div>
  );
}

const CLG: Record<string, Record<ChartLang, string>> = {
  clear: { ko: '전체 해제', en: 'Clear all', ja: '全解除' },
  reset: { ko: '기본값', en: 'Default', ja: '既定' },
  capped: { ko: '먼저 켜둔 것을 끄세요', en: 'Turn one off first', ja: '先に一つ消してください' },
  none: {
    ko: '표시할 캐릭터를 하나 이상 켜세요.',
    en: 'Turn on at least one character.',
    ja: '表示するキャラを1つ以上選んでください。',
  },
};

/* ────────────────────────── 레이팅 추이 (라인) ────────────────────────── */

interface TrendPt {
  /** 전체 이력에서 이 경기가 몇 번째인가 (경기 순번 축). */
  i?: number;
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
  xAxis = 'game',
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
  /**
   * 가로축. 'date' 는 실제 시간이고, 'game' 은 경기 순번이다.
   *
   * 몰아서 치는 사람에게 'date' 는 사실상 못 읽는다 — 실측(JackFather)에서
   * Paul 52경기가 **가로 0px**, Zafina 144경기가 28px 였다. 세션 하나가 수직선이 된다.
   * 'game' 은 어느 구간이든 고르게 퍼져 선이 이어진다. 대신 '언제'가 사라지므로
   * 아래 x 눈금에 **그 순번의 날짜**를 찍어 시점을 잃지 않게 한다.
   */
  xAxis?: 'date' | 'game';
}) {
  const { ref, x: hoverX, onMove, clear } = useSvgPointer();
  // 계열 선택은 공용(useSeriesPick) — 최근 4종만 켜고 나머지는 범례에서 켠다.
  // y 범위를 **켜진 계열로만** 잡는 것이 핵심이다: 38판만 친 서브 캐릭 하나가
  // y축을 800 넓히면 주력의 실제 변동이 눌린다.

  const series = useMemo(() => {
    const byChar = new Map<string, TrendPt[]>();
    for (const r of rows) {
      const [dt, rating, ch] = r as [string, number, string];
      if (typeof rating !== 'number') continue;
      let arr = byChar.get(ch);
      if (!arr) byChar.set(ch, (arr = []));
      arr.push({ t: parseDt(dt), y: rating, dt });
    }
    // 경기 순번은 **전체 이력 공통 축**이다 — 캐릭터마다 1부터 다시 세면
    // 같은 x 가 서로 다른 시점을 가리켜 비교가 안 된다.
    const flat = [...byChar.values()].flat().sort((a, b) => a.t - b.t);
    const idx = new Map<string, number>();
    flat.forEach((p, i) => idx.set(`${p.dt}|${p.y}`, i));
    for (const pts of byChar.values())
      for (const p of pts) p.i = idx.get(`${p.dt}|${p.y}`) ?? 0;

    return [...byChar.entries()]
      .map(([ch, pts]) => ({ ch, pts, segs: splitAndThin(pts) }))
      .sort((a, b) => b.pts.length - a.pts.length);
  }, [rows]);

  const pick = useSeriesPick(series);
  const { ordered, on, vis, colorOf, toggle, atCap } = pick;

  const model = useMemo(() => {
    const shown = ordered;
    // 전부 끄면 축이 사라진다 — 그때는 전체 기준을 그대로 쓴다.
    const forScale = vis.length ? vis : shown;

    // 축 값: 'game' 이면 경기 순번, 'date' 면 시각.
    const ax = (p: TrendPt) => (xAxis === 'game' ? (p.i ?? 0) : p.t);
    let tMin = Infinity, tMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of shown) for (const p of s.pts) {
      const v = ax(p);
      if (v < tMin) tMin = v;
      if (v > tMax) tMax = v;
    }
    for (const s of forScale) for (const p of s.pts) {
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
    if (!isFinite(tMin)) return null;
    if (tMax === tMin) tMax = tMin + 1;
    const { ticks, lo, hi } = niceTicks(yMin, yMax);

    const x = (t: number) => PAD.l + ((t - tMin) / (tMax - tMin)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    // 경기 순번 축에서도 **눈금은 날짜로 찍는다** — '언제'를 잃지 않기 위해서다.
    const flat = shown.flatMap((s) => s.pts).sort((a, b) => (a.i ?? 0) - (b.i ?? 0));
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = tMin + f * (tMax - tMin);
      if (xAxis !== 'game') return { v, dt: v };
      // 그 순번에 가장 가까운 경기의 실제 시각
      let best = flat[0];
      for (const p of flat) if (Math.abs((p.i ?? 0) - v) < Math.abs((best?.i ?? 0) - v)) best = p;
      return { v, dt: best ? best.t : v };
    });
    return { shown, x, y, ticks, xTicks, tMin, tMax, ax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, on, xAxis]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { shown, x, y, ticks, xTicks, tMin, tMax, ax } = model;

  const hover = (() => {
    if (hoverX === null) return null;
    const t = tMin + ((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * (tMax - tMin);
    const at = vis
      .map((s) => {
        let last: TrendPt | null = null;
        for (const p of s.pts) {
          if (ax(p) <= t) last = p;
          else break;
        }
        return last ? { ch: s.ch, color: colorOf(s.ch), p: last } : null;
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
      <Legend
        items={ordered.map((s) => ({ label: s.ch, color: colorOf(s.ch), note: String(s.pts.length) }))}
        on={on}
        atCap={atCap}
        onToggle={toggle}
        onClear={pick.clear}
        onReset={pick.isDefault ? undefined : pick.reset}
        lang={lang}
      />
      <p className="hint">
        {vis.length === 0 ? CLG.none[lang] : pickHint(ordered.length, vis.length, atCap, lang)}
      </p>
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
        {xTicks.map((tk, i) => (
          <text
            key={i}
            x={x(tk.v)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fill={INK_MUTED}
          >
            {fmtDate(tk.dt)}
          </text>
        ))}
        {/* 시즌 경계 — 선 아래에 깔아 데이터를 가리지 않게 한다.
            보이는 구간 밖의 경계는 그리지 않는다(기간 필터를 좁히면 잘려나간다). */}
        {(seasons ?? []).map((s) => {
          // 경기 순번 축에서는 그 시즌 첫 경기의 순번에 긋는다.
          const st = parseDt(s.start);
          const flat = shown.flatMap((z) => z.pts);
          const first = flat.filter((p) => p.t >= st).sort((a, b) => a.t - b.t)[0];
          const t = xAxis === 'game' ? (first?.i ?? NaN) : st;
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
        {vis.map((s) =>
          s.segs.map((seg, k) => (
            <polyline
              key={`${s.ch}-${k}`}
              points={seg.map((p) => `${x(ax(p)).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={colorOf(s.ch)}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )),
        )}
        {/* 구간이 점 하나뿐이면 폴리라인이 안 보인다 — 점으로 찍는다 */}
        {vis.map((s) =>
          s.segs
            .filter((seg) => seg.length === 1)
            .map((seg, k) => (
              <circle key={`${s.ch}-dot-${k}`} cx={x(ax(seg[0]))} cy={y(seg[0].y)} r="2.5" fill={colorOf(s.ch)} />
            )),
        )}
        {vis.map((s) => {
          const p = s.pts[s.pts.length - 1];
          return (
            <g key={s.ch}>
              <circle cx={x(ax(p))} cy={y(p.y)} r="4" fill={colorOf(s.ch)} stroke={SURFACE} strokeWidth="2" />
              {/* 마우스를 안 올려도 마지막 값이 보이게 — 호버에 기대지 않는다 */}
              <text
                x={Math.min(x(ax(p)) + 7, W - PAD.r)}
                y={y(p.y) + 4}
                fontSize="11"
                fontWeight="600"
                fill={colorOf(s.ch)}
                textAnchor={x(ax(p)) > W - 70 ? 'end' : 'start'}
              >
                {p.y.toLocaleString()}
              </text>
            </g>
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

/* ── 세션 차트 두 형태 ────────────────────────────────────────────
   'bars'   세션마다 막대 하나 (높이=레이팅 증감, 폭=판수). 시간 순서를 본다.
   'length' **판수(x) × 레이팅 증감(y) 산점도.** "길게 치면 손해인가"에 직접 답한다.

   왜 산점도를 더했나: 막대는 순서대로 늘어놓기만 해서 '길이와 결과의 관계'가 안 보인다.
   advice.ts 가 이미 "21판째부터 -7.6%p" 를 계산해 두는데, 그 이야기를 눈으로 보여주는
   그림이 없었다. 점이 오른쪽으로 갈수록 아래로 쏠리면 그게 답이다.
   마우스를 안 올려도 읽히도록 **0선과 추세선**을 같이 긋는다. */
export type SessionView = 'bars' | 'length';

/**
 * 추세선을 그으려면 이만큼은 있어야 한다.
 * 실측: 캐릭터별 상세로 들어가면 Paul 1세션·Jun 1세션·Zafina 3세션이었다.
 * 3점에 회귀선을 그으면 기울기가 그럴듯하게 나오지만 **아무 근거가 없다.**
 */
const MIN_SCATTER = 8;

export function SessionChart({
  rows,
  lang = 'ko',
  view = 'bars',
  selectedChar = null,
}: {
  rows: Row[];
  lang?: ChartLang;
  view?: SessionView;
  /**
   * 캐릭터별 상세로 보고 있는가.
   *
   * 이때 세션은 **그 캐릭 경기만으로 다시 잘린다** — 한 자리에서 캐릭을 갈아타면
   * 없던 경계가 생긴다(실측: Zafina 3세션 중 1개). 'Games' 의 뜻도 '그 자리에서 친
   * 총 판수'가 아니라 '그 캐릭으로 친 판수'로 바뀐다. 피로는 총 판수에 달렸으므로
   * 판수-증감 산점도의 전제가 흔들린다 — 화면이 그 사실을 밝혀야 한다.
   */
  selectedChar?: string | null;
}) {
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
  if (view === 'length')
    return <SessionScatter sess={sess} lang={lang} selectedChar={selectedChar} />;
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
  games: { ko: '경기', en: ' games', ja: '戦' },
  less: { ko: '적음', en: 'less', ja: '少' },
  more: { ko: '많음', en: 'more', ja: '多' },
  days: { ko: '플레이한 날', en: 'days played', ja: 'プレイ日' },
  peak: { ko: '하루 최다', en: 'busiest day', ja: '最多' },
  streak: { ko: '최장 연속', en: 'longest streak', ja: '最長連続' },
  gap: { ko: '최장 공백', en: 'longest gap', ja: '最長ブランク' },
  dayUnit: { ko: '일', en: 'd', ja: '日' },
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
        {stat(played, HL.days[lang], HL.dayUnit[lang])}
        {stat(peak, HL.peak[lang], HL.games[lang])}
        {stat(streak, HL.streak[lang], HL.dayUnit[lang])}
        {stat(gap, HL.gap[lang], HL.dayUnit[lang])}
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

  const base = useMemo(() => {
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

    let tMin = Infinity, tMax = -Infinity;
    for (const pts of byChar.values())
      for (const p of pts) {
        if (p.t < tMin) tMin = p.t;
        if (p.t > tMax) tMax = p.t;
      }
    if (tMax === tMin) tMax = tMin + 1;
    // 마지막 단은 지금까지 이어진다 — 선을 오른쪽 끝까지 끈다.
    return { all: [...byChar.entries()].map(([ch, pts]) => ({
      ch, pts: [...pts, { t: tMax, rank: pts[pts.length - 1].rank }],
    })), tMin, tMax };
  }, [rows]);

  const pick = useSeriesPick(base?.all ?? []);
  const { ordered, on, vis, colorOf, toggle, atCap } = pick;

  const model = useMemo(() => {
    if (!base) return null;
    const { tMin, tMax } = base;
    const series = vis.length ? vis : ordered;

    let rMin = Infinity, rMax = -Infinity;
    for (const s of series)
      for (const p of s.pts) {
        if (p.rank < rMin) rMin = p.rank;
        if (p.rank > rMax) rMax = p.rank;
      }
    const lo = Math.max(0, rMin - 1);
    const hi = rMax + 1;
    const x = (t: number) => PAD.l + ((t - tMin) / (tMax - tMin)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    // 단은 정수라 눈금도 정수로 — 소수 눈금이 나오면 "27.5단"처럼 읽혀 거짓이 된다.
    const step = Math.max(1, Math.ceil((hi - lo) / 6));
    const ticks: number[] = [];
    for (let v = Math.ceil(lo); v <= hi; v += step) ticks.push(v);
    return { series, x, y, ticks, tMin, tMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, on]);

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
      .map((s) => {
        let last: { t: number; rank: number } | null = null;
        for (const p of s.pts) {
          if (p.t <= t) last = p;
          else break;
        }
        return last ? { ch: s.ch, color: colorOf(s.ch), rank: last.rank } : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.rank - a.rank);
    return at.length ? at : null;
  })();

  const rankUnit = lang === 'ko' ? '단' : lang === 'ja' ? '段' : '';

  return (
    <div className="chart-root">
      <Legend
        items={ordered.map((s) => ({ label: s.ch, color: colorOf(s.ch) }))}
        on={on}
        atCap={atCap}
        onToggle={toggle}
        onClear={pick.clear}
        onReset={pick.isDefault ? undefined : pick.reset}
        lang={lang}
      />
      <p className="hint">
        {vis.length === 0 ? CLG.none[lang] : pickHint(ordered.length, vis.length, atCap, lang)}
      </p>
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
        {series.map((s) => {
          // 계단 — 단은 순간 바뀌므로 대각선으로 이으면 "천천히 올랐다"는 거짓이 된다.
          let d = '';
          s.pts.forEach((p, k) => {
            if (k === 0) d += `M ${x(p.t).toFixed(1)} ${y(p.rank).toFixed(1)}`;
            else d += ` H ${x(p.t).toFixed(1)} V ${y(p.rank).toFixed(1)}`;
          });
          return (
            <path key={s.ch} d={d} fill="none" stroke={colorOf(s.ch)} strokeWidth="2" strokeLinejoin="round" />
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

/* ── 세션: 판수 × 레이팅 증감 산점도 ──────────────────────────────
   막대 그림은 세션을 시간 순서로 늘어놓기만 해서 **'길이와 결과의 관계'가 안 보인다.**
   advice.ts 는 이미 "21판째부터 -7.6%p" 를 계산해 두는데, 그걸 눈으로 보여주는 그림이
   없었다. 점이 오른쪽으로 갈수록 아래로 쏠리면 그게 답이다.

   마우스를 안 올려도 읽히게 두 가지를 같이 긋는다:
    - 0선 (본전) — 위/아래가 곧 이득/손해
    - 최소제곱 추세선 — 기울기가 곧 "길게 칠수록 어떻게 되나" */

interface SessAggLike {
  label: string;
  games: number;
  delta: number;
}

function SessionScatter({
  sess,
  lang,
  selectedChar,
}: {
  sess: SessAggLike[];
  lang: ChartLang;
  selectedChar?: string | null;
}) {
  const model = useMemo(() => {
    if (!sess.length) return null;
    const gMax = Math.max(...sess.map((s) => s.games));
    const dMin = Math.min(0, ...sess.map((s) => s.delta));
    const dMax = Math.max(0, ...sess.map((s) => s.delta));
    const { ticks, lo, hi } = niceTicks(dMin, dMax);
    const gHi = Math.ceil(gMax / 10) * 10;
    const x = (g: number) => PAD.l + (g / gHi) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

    // 최소제곱 추세선 — 기울기가 "1판 더 칠 때 레이팅이 얼마나 달라지나"다.
    const n = sess.length;
    const mx = sess.reduce((a, s) => a + s.games, 0) / n;
    const my = sess.reduce((a, s) => a + s.delta, 0) / n;
    let num = 0, den = 0;
    for (const s of sess) {
      num += (s.games - mx) * (s.delta - my);
      den += (s.games - mx) ** 2;
    }
    // 표본이 얇으면 기울기를 내지 않는다 — 없는 근거로 선을 긋지 않는다.
    const enough = sess.length >= MIN_SCATTER && den > 0;
    const slope = enough ? num / den : null;
    const at = (g: number) => (slope === null ? my : my + slope * (g - mx));
    const xTicks: number[] = [];
    const step = Math.max(10, Math.ceil(gHi / 6 / 10) * 10);
    for (let g = 0; g <= gHi; g += step) xTicks.push(g);
    return { x, y, ticks, xTicks, gHi, slope, at };
  }, [sess]);

  if (!model) return <p className="hint">{CL.noData[lang]}</p>;
  const { x, y, ticks, xTicks, gHi, slope, at } = model;

  // 캐릭터별 상세에서는 x 가 '그 캐릭으로 친 판수'다 — 라벨이 그걸 말해야 한다.
  const gamesLbl = selectedChar
    ? lang === 'ko'
      ? `${selectedChar} 경기 수`
      : lang === 'ja'
        ? `${selectedChar} での試合数`
        : `games as ${selectedChar}`
    : lang === 'ko'
      ? '세션 경기 수'
      : lang === 'ja'
        ? 'セッション試合数'
        : 'games in session';

  const trendLbl =
    slope === null
      ? lang === 'ko'
        ? `세션 ${sess.length}개 — 추세를 말하기엔 부족합니다 (${MIN_SCATTER}개 이상 필요)`
        : lang === 'ja'
          ? `${sess.length}セッション — 傾向を出すには不足です (${MIN_SCATTER}以上)`
          : `${sess.length} sessions — too few for a trend (need ${MIN_SCATTER})`
      : lang === 'ko'
        ? `추세: 1경기 늘 때 레이팅 ${slope >= 0 ? '+' : ''}${slope.toFixed(2)}`
        : lang === 'ja'
          ? `傾向: 1試合ごとにレート ${slope >= 0 ? '+' : ''}${slope.toFixed(2)}`
          : `Trend: ${slope >= 0 ? '+' : ''}${slope.toFixed(2)} rating per extra game`;

  const charNote = selectedChar
    ? lang === 'ko'
      ? `※ 캐릭터별 상세에서는 세션이 ${selectedChar} 경기만으로 다시 잘립니다 — 한 자리에서 캐릭을 갈아탔다면 별개 세션으로 보입니다.`
      : lang === 'ja'
        ? `※ キャラ別詳細では ${selectedChar} の試合だけでセッションを区切ります。`
        : `※ In per-character view, sessions are re-cut using only ${selectedChar}'s matches.`
    : null;

  return (
    <div className="chart-root">
      <Legend items={[{ label: trendLbl, color: slope === null ? INK_MUTED : slope < 0 ? CRIT : GOOD }]} />
      {charNote && <p className="hint">{charNote}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label="세션 판수와 레이팅 증감 산점도">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? BASELINE : GRID} strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={INK_MUTED}>
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {xTicks.map((g) => (
          <text key={g} x={x(g)} y={H - 8} textAnchor="middle" fontSize="11" fill={INK_MUTED}>
            {g}
          </text>
        ))}
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="11" fill={INK_MUTED}>
          {gamesLbl}
        </text>
        {/* 추세선 — 색으로 방향을 말한다(내려가면 손해). 표본이 얇으면 안 긋는다. */}
        {slope !== null && (
          <line
            x1={x(0)}
            y1={y(at(0))}
            x2={x(gHi)}
            y2={y(at(gHi))}
            stroke={slope < 0 ? CRIT : GOOD}
            strokeWidth="2"
            strokeDasharray="6 4"
            opacity="0.8"
          />
        )}
        {sess.map((s) => (
          <circle
            key={s.label}
            cx={x(s.games)}
            cy={y(s.delta)}
            r="4"
            fill={s.delta >= 0 ? GOOD : CRIT}
            fillOpacity="0.75"
          >
            <title>{`${s.label} · ${s.games}${CL.gamesUnit[lang]} · ${s.delta > 0 ? '+' : ''}${s.delta}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
