'use client';

// 단일 화면: 식별코드(1명 or 여러 명) + 기간 → /api/replays | /api/compare → 탭 + 표.
// 표 렌더는 서버가 준 TabData 를 그대로 그린다(집계는 전부 서버).
// 레이팅 추이 탭만 클라이언트에서 SVG 그래프를 추가로 그린다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrendChart, DailyChart, SessionChart, type DailyStyle } from './charts';
import {
  LANGS,
  LANG_KEY,
  makeT,
  TAB_LABELS,
  cellText,
  colText,
  type Lang,
} from './i18n';
import { looksLikeId, toPolarisId } from '@/lib/wavu/token';
import { COMPARE_MIN_GAMES } from '@/lib/tekken/compare';

interface TabData {
  key: string;
  label: string;
  columns: string[];
  rows: (string | number | null)[][];
}

interface PlayerResponse {
  polarisId: string;
  myName: string;
  recordCount: number; // 필터 적용 후
  totalCount: number; // 전체 이력
  firstDt: string | null;
  lastDt: string | null;
  tabs: TabData[];
  charCounts?: { name: string; games: number }[]; // 사용 캐릭터 (경기 수 내림차순)
  selectedChar?: string | null;
  stats?: { total: number; kept: number; dropped: number; dupes: number };
  seasons?: SeasonInfo[]; // 이 플레이어가 실제로 뛴 시즌들 (전체 이력 기준)
  advice?: {
    baselineWinRate: number;
    bands: { from: number; to: number; games: number; winRate: number; avgDelta: number; enough: boolean }[];
    goodUpTo: number | null;
    stopAfter: number | null;
    reliable: boolean;
  } | null;
  filtered?: {
    start: string | null;
    end: string | null;
    season?: string | null;
    count: number;
  };
  /** stale=true 면 wavu 수집 실패로 지난 사본을 보는 중. */
  cache?: { fetchedAt?: number; stale?: boolean };
  error?: string;
}

interface CompareResponse {
  players: { polarisId: string; name: string; count: number }[];
  tabs: TabData[];
  seasons?: SeasonInfo[];
  filtered?: { start: string | null; end: string | null; season?: string | null };
  cache?: { stale?: boolean };
  error?: string;
}

type Mode = 'single' | 'compare';
type PeriodMode = 'all' | 'month' | 'year' | 'custom' | 'season';

/** 서버가 데이터에서 뽑아준 시즌 구간 (lib/tekken/seasons.ts). */
interface SeasonInfo {
  key: string; // 'S1' | 'S2' | ...
  start: string; // 'yyyy-MM-dd'
  end: string;
  games: number;
}

// 조회 **전에만** 쓰는 시즌 버튼 목록 — 표시용 기본값이다.
//
// 예전에는 여기에 시즌 경계 날짜를 적어두고 그 날짜로 필터링했다. 그러면 S4 가 열려도
// 아무도 손대지 않는 한 S4 는 영영 안 나타나고, 시즌 탭(game_version 기준)과 답이 갈렸다.
// 지금은 필터가 날짜가 아니라 season 키로 나가고(서버가 game_version 으로 판정),
// 버튼도 조회 직후 서버가 준 실제 목록으로 갈아끼운다.
// 그래서 새 시즌은 **첫 조회 즉시** 나타난다 — 이 상수를 고칠 필요가 없다.
const FALLBACK_SEASONS = ['S1', 'S2', 'S3'];

/** 닉네임 검색 결과 항목. */
interface Favorite {
  id: string;
  name: string;
}

/** 서버가 받는 비교 인원 상한 (api/compare 의 MAX_PLAYERS 와 같아야 한다). */
const MAX_COMPARE = 4;

const WIN_LOSS_COLS = new Set(['result', 'result_for_a']);
const ROW_CHUNK = 100; // 긴 표는 이 단위로 끊어 보여준다
const CHART_TABS = new Set(['trend', 'daily', 'sessions']); // 그래프/표 토글 지원 탭

function cellClass(col: string, v: string | number | null): string | undefined {
  if (!WIN_LOSS_COLS.has(col)) return undefined;
  if (v === 'W') return 'win';
  if (v === 'L') return 'loss';
  return undefined;
}

/** 현재 KST 기준 'YYYY-MM'. */
function currentMonth(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

/** 'YYYY-MM' → [1일, 말일]. */
function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}

/** CSV 문자열 생성 (BOM 포함 → 엑셀에서 한글 정상). */
function toCsv(tab: TabData, lang: Lang): string {
  const esc = (v: string | number | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [tab.columns.map((c) => esc(colText(lang, c))).join(',')];
  for (const r of tab.rows) lines.push(r.map(esc).join(','));
  return '﻿' + lines.join('\r\n');
}

function downloadBlob(content: string, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── 일별 탭 롤업 (월/분기/반기/연) ─────────────────────────────
   일별 rows: [Date, my_char, Games, W, L, WinRate(%), RatingDelta, EndRating]
   를 기간 키로 다시 묶는다. 합산은 W/L/Δ, EndRating 은 기간 내 마지막 날 값. */

type DailyGran = 'day' | 'month' | 'quarter' | 'half' | 'year' | 'season';

const DAILY_STYLE_LABEL: Record<DailyStyle, Record<Lang, string>> = {
  updown: { ko: '승▲ 패▼', en: 'W▲ L▼', ja: '勝▲ 敗▼' },
  stack: { ko: '누적', en: 'Stacked', ja: '積み上げ' },
  rate: { ko: '승률 라인', en: 'Win rate', ja: '勝率ライン' },
};
const DAILY_STYLES: DailyStyle[] = ['updown', 'stack', 'rate'];

const GRAN_LABEL: Record<DailyGran, Record<Lang, string>> = {
  day: { ko: '일별', en: 'Daily', ja: '日別' },
  month: { ko: '월별', en: 'Monthly', ja: '月別' },
  quarter: { ko: '분기별', en: 'Quarterly', ja: '四半期' },
  half: { ko: '반기별', en: 'Half-yearly', ja: '半期' },
  year: { ko: '연별', en: 'Yearly', ja: '年別' },
  season: { ko: '시즌별', en: 'By season', ja: 'シーズン別' },
};

function periodKey(date: string, g: DailyGran, seasons: SeasonInfo[]): string {
  if (g === 'day') return date;
  if (g === 'season') {
    // 경계는 서버가 데이터에서 뽑아준 구간을 그대로 쓴다 — 날짜 하드코딩 없음.
    for (const s of seasons) if (date >= s.start && date <= s.end) return s.key;
    return '?';
  }
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  if (g === 'month') return date.slice(0, 7);
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  if (g === 'half') return `${y}-H${m <= 6 ? 1 : 2}`;
  return y;
}

/** 일별 데이터가 걸친 범위에 맞는 집계 단위만 제시 (2개 그룹 이상 생길 때만). */
function granOptions(tab: TabData, seasons: SeasonInfo[]): DailyGran[] {
  const dates = tab.rows.map((r) => String(r[0]));
  const opts: DailyGran[] = ['day'];
  for (const g of ['month', 'quarter', 'half', 'year', 'season'] as DailyGran[]) {
    if (new Set(dates.map((d) => periodKey(d, g, seasons))).size >= 2) opts.push(g);
  }
  return opts;
}

/* ── 상대전적 탭 보기 옵션 ────────────────────────────────────────
   전부 나열하면 1,000행이 넘고(실측 7,828경기 → 1,009명), 2~3판 만난 상대가
   섞여 승률이 100%/0% 로 튄다. '몇 판 이상 만난 상대만' + '강점/약점 순'으로
   좁혀야 실제로 읽을 수 있다. 한 명 모드의 강점/약점 매치업과 같은 취지다. */

type H2hView = 'all' | 'strong' | 'weak';
/**
 * 두 컨트롤이 같은 눈금을 쓴다. 어느 쪽이든 **데이터가 받쳐주는 값만** 화면에 나온다
 * (h2hMinOptions / h2hTopOptions 가 걸러낸다) — 상대가 300명인데 '상위 5000명'
 * 버튼이 보이거나, 최다 대전이 939판인데 '2500판 이상' 버튼이 보이는 일은 없다.
 */
const H2H_STEPS = [10, 50, 100, 250, 500, 1000, 2500, 5000];
/** 최소 경기수 — 'N판 이상 붙어본 상대만'. 0 = 전체. */
const H2H_MINS = [0, ...H2H_STEPS];
/** 보여줄 인원 — 정렬 기준 상위 N명만. 0 = 전체. */
const H2H_TOPS = [...H2H_STEPS, 0];
/**
 * '마지막으로 만난 날' 기준.
 *   0     전체
 *   양수  최근 N일 안에 만난 상대
 *   음수  |N|일보다 **이전에** 마지막으로 만난 상대 (요즘 안 보이는 옛 상대)
 */
const H2H_DAYS = [0, 30, 90, 365, -365];

const H2H_VIEW_LABEL: Record<H2hView, Record<Lang, string>> = {
  all: { ko: '전체', en: 'All', ja: '全体' },
  strong: { ko: '강점 (승률 높은 순)', en: 'Strong (best WR)', ja: '得意 (勝率順)' },
  weak: { ko: '약점 (승률 낮은 순)', en: 'Weak (worst WR)', ja: '苦手 (勝率順)' },
};

const H2H_DAY_LABEL = (d: number, lang: Lang): string => {
  if (d === 0) return { ko: '전체', en: 'All', ja: '全体' }[lang];
  if (d < 0)
    return { ko: '1년 이상 전', en: 'Over 1 year ago', ja: '1年以上前' }[lang];
  if (d === 365) return { ko: '1년 이내', en: 'Within 1 year', ja: '1年以内' }[lang];
  return { ko: `${d}일 이내`, en: `${d} days`, ja: `${d}日以内` }[lang];
};

/** 이 탭에 쓸 수 있는 최소 경기수 선택지 (행이 남는 값만). 비교 모드 맞대결 탭이면 null. */
function h2hMinOptions(tab: TabData): number[] | null {
  const gi = tab.columns.indexOf('Games');
  if (gi < 0 || tab.columns.indexOf('WinRate(%)') < 0) return null;
  return H2H_MINS.filter((m) => m === 0 || tab.rows.some((r) => Number(r[gi]) >= m));
}

/** 지금 남은 행 수보다 작은 선택지만 (300명인데 '상위 500명' 버튼은 의미가 없다). */
function h2hTopOptions(count: number): number[] {
  const opts = H2H_TOPS.filter((n) => n === 0 || n < count);
  return opts.length > 1 ? opts : [];
}

/**
 * 상대전적 좁히기.
 *
 * `days` 는 **'그 상대를 마지막으로 만난 날'** 기준이다 — "최근 3개월 안에 붙어본 상대 중
 * 내가 약한 사람"을 뽑는 용도. 승/패 수 자체는 조회 기간 전체의 누적이다.
 * '그 기간 동안의 전적'이 필요하면 위쪽 조회 기간(월별/시즌/직접입력)을 쓰면 된다 —
 * 그건 서버가 다시 집계하므로 정확하다.
 */
function filterH2h(
  tab: TabData,
  min: number,
  days: number,
  view: H2hView,
): TabData {
  const gi = tab.columns.indexOf('Games');
  const wi = tab.columns.indexOf('WinRate(%)');
  const li = tab.columns.indexOf('LastPlayed');
  if (gi < 0 || wi < 0) return tab;

  let rows = min > 0 ? tab.rows.filter((r) => Number(r[gi]) >= min) : tab.rows;
  if (days !== 0 && li >= 0) {
    // KST 기준 날짜 문자열끼리 비교 (LastPlayed 도 KST 'yyyy-MM-dd HH:mm:ss')
    const cutoff = new Date(Date.now() + 9 * 3600_000 - Math.abs(days) * 86400_000)
      .toISOString()
      .slice(0, 10);
    rows = rows.filter((r) => {
      const last = String(r[li]).slice(0, 10);
      return days > 0 ? last >= cutoff : last < cutoff; // 음수 = 그 이전에 마지막으로 만남
    });
  }
  const g = (r: (string | number | null)[]) => Number(r[gi]);
  const w = (r: (string | number | null)[]) => Number(r[wi]);

  // 경계(정확히 50%)는 강점 쪽에 넣는다 — aggregations.buildStrong 과 같은 규칙이라
  // 같은 상대가 강점/약점에 동시에 나타나지 않는다.
  if (view === 'strong')
    rows = rows.filter((r) => w(r) >= 50).sort((a, b) => w(b) - w(a) || g(b) - g(a));
  else if (view === 'weak')
    rows = rows.filter((r) => w(r) < 50).sort((a, b) => w(a) - w(b) || g(b) - g(a));

  return { ...tab, rows };
}

/* ── 시간대 탭: '구분' 열 대신 보기 전환 ──────────────────────────
   서버는 하루 시간대(24행)와 요일(7행)을 'Unit' 열로 묶어 한 표에 담아 보낸다.
   화면에서는 둘을 섞어 보여줄 이유가 없으므로 버튼으로 고르고, 구분 열은 지운다.
   (엑셀/CSV 에는 Unit 이 남아 있어야 두 표를 구분할 수 있으니 서버 형식은 그대로 둔다) */

type TimeView = '시간대' | '요일';

const TIME_VIEW_LABEL: Record<TimeView, Record<Lang, string>> = {
  시간대: { ko: '하루 시간대', en: 'Hour of day', ja: '時間帯' },
  요일: { ko: '요일별', en: 'By weekday', ja: '曜日別' },
};

/** 'Unit' 열로 묶인 표에서 한 묶음만 남기고 그 열은 없앤다. */
function pickUnit(tab: TabData, unit: string): TabData {
  const ui = tab.columns.indexOf('Unit');
  if (ui < 0) return tab;
  const drop = <T,>(arr: T[]) => arr.filter((_, i) => i !== ui);
  return {
    ...tab,
    columns: drop(tab.columns),
    rows: tab.rows.filter((r) => r[ui] === unit).map(drop),
  };
}

function rollupDaily(tab: TabData, g: DailyGran, seasons: SeasonInfo[]): TabData {
  if (g === 'day') return tab;
  interface Agg {
    period: string;
    char: string;
    w: number;
    l: number;
    delta: number;
    end: number;
    lastDate: string;
  }
  const m = new Map<string, Agg>();
  for (const r of tab.rows) {
    const [date, char, , w, l, , delta, end] = r as [
      string, string, number, number, number, number, number, number,
    ];
    const p = periodKey(date, g, seasons);
    const k = `${p}|${char}`;
    let x = m.get(k);
    if (!x) m.set(k, (x = { period: p, char, w: 0, l: 0, delta: 0, end: 0, lastDate: '' }));
    x.w += w;
    x.l += l;
    x.delta += delta;
    if (date > x.lastDate) {
      x.lastDate = date;
      x.end = end;
    }
  }
  const rows = [...m.values()].sort(
    (a, b) =>
      (a.period < b.period ? 1 : a.period > b.period ? -1 : 0) ||
      b.w + b.l - (a.w + a.l) ||
      (a.char.toUpperCase() < b.char.toUpperCase() ? -1 : 1),
  );
  return {
    key: 'daily',
    label: tab.label,
    columns: ['Period', 'my_char', 'Games', 'W', 'L', 'WinRate(%)', 'RatingDelta', 'EndRating'],
    rows: rows.map((x) => {
      const games = x.w + x.l;
      return [
        x.period, x.char, games, x.w, x.l,
        games ? Math.round((x.w * 10000) / games) / 100 : 0,
        x.delta, x.end,
      ];
    }),
  };
}

/**
 * 비교 표 우위 하이라이트 — 행 안에서 플레이어 간 비교가 성립하는 값만.
 * 반환: 행(row)을 받아 하이라이트할 컬럼 인덱스 집합을 주는 함수 (해당 없으면 null).
 * 행 단위 계산이라 검색 필터/더보기로 행 순서가 바뀌어도 안전하다.
 */
function makeRowHighlighter(
  tab: TabData,
): ((row: (string | number | null)[]) => Set<number>) | null {
  const cols = tab.columns;

  if (tab.key === 'overview') {
    // 지표별 방향: high=클수록 우위, low=작을수록 우위. 없으면 하이라이트 안 함.
    const DIR: Record<string, 'high' | 'low'> = {
      '경기 승률(%)': 'high',
      '라운드 승률(%)': 'high',
      '접전 승률(%)': 'high',
      '완승 비율(%)': 'high',
      '완패 비율(%)': 'low',
      '최고 레이팅': 'high',
      '최고 텍켄파워': 'high',
    };
    return (row) => {
      const hs = new Set<number>();
      const dir = DIR[String(row[0])];
      if (!dir) return hs;
      const vals = row.slice(1).map(Number);
      const best = dir === 'high' ? Math.max(...vals) : Math.min(...vals);
      vals.forEach((v, j) => {
        if (v === best) hs.add(j + 1);
      });
      return hs;
    };
  }

  if (tab.key === 'season') {
    // [Season, 지표, 플레이어...] — 승률 행만
    return (row) => {
      const hs = new Set<number>();
      if (!String(row[1]).includes('승률')) return hs;
      const vals = row.slice(2).map(Number);
      const best = Math.max(...vals);
      if (best <= 0) return hs;
      vals.forEach((v, j) => {
        if (v === best) hs.add(j + 2);
      });
      return hs;
    };
  }

  if (tab.key === 'chars' || tab.key === 'vs_common') {
    // *_wr(%) 컬럼들끼리 비교
    const wrCols = cols
      .map((c, j) => (c.endsWith('_wr(%)') ? j : -1))
      .filter((j) => j >= 0);
    if (wrCols.length < 2) return null;
    return (row) => {
      const hs = new Set<number>();
      const vals = wrCols.map((j) => Number(row[j]));
      const best = Math.max(...vals);
      if (best <= 0) return hs;
      wrCols.forEach((j, k) => {
        if (vals[k] === best) hs.add(j);
      });
      return hs;
    };
  }

  if (tab.key === 'h2h') {
    // 맞대결: a_wins vs b_wins 큰 쪽
    const ai = cols.indexOf('a_wins');
    const bi = cols.indexOf('b_wins');
    if (ai < 0 || bi < 0) return null;
    return (row) => {
      const hs = new Set<number>();
      const a = Number(row[ai]);
      const b = Number(row[bi]);
      if (a > b) hs.add(ai);
      else if (b > a) hs.add(bi);
      return hs;
    };
  }

  return null;
}

function DataTable({
  tab,
  rowHl,
  lang = 'ko',
  onCompare,
}: {
  tab: TabData;
  rowHl?: ((row: (string | number | null)[]) => Set<number>) | null;
  lang?: Lang;
  /** 주어지면 상대 이름/식별코드 클릭이 '비교 목록에 담기'가 된다 (한 명 모드 전용). */
  onCompare?: (oppPolaris: string, oppName: string) => void;
}) {
  const tt = makeT(lang);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(ROW_CHUNK);

  // 탭이 바뀌면 검색/표시 개수 초기화
  useEffect(() => {
    setQuery('');
    setLimit(ROW_CHUNK);
  }, [tab.key]);

  const filtered = useMemo(() => {
    if (!query.trim()) return tab.rows;
    const q = query.trim().toLowerCase();
    return tab.rows.filter((r) =>
      r.some((v) => v !== null && String(v).toLowerCase().includes(q)),
    );
  }, [tab.rows, query]);

  const visible = filtered.slice(0, limit);
  const searchable = tab.rows.length > 30;

  // 상대 식별코드가 있는 표(상대전적·공통 상대)는 이름/ID 클릭 → 새 창에서 그 플레이어 조회
  const polIdx = tab.columns.indexOf('opp_polaris');
  const nameIdx = tab.columns.indexOf('opp_name'); // 칩에 보일 닉네임
  const isLinkCol = (j: number) =>
    polIdx >= 0 && (j === polIdx || tab.columns[j] === 'opp_name');

  return (
    <>
      {searchable && (
        <div className="table-tools">
          <input
            type="text"
            placeholder={tt('searchInTable')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="hint">
            {query ? `${filtered.length}${tt('matched')}` : ''}
            {tab.rows.length}
            {tt('totalRows')}
          </span>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {tab.columns.map((c) => (
                <th key={c} title={c !== colText(lang, c) ? c : undefined}>
                  {colText(lang, c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const hl = rowHl ? rowHl(r) : null;
              return (
                <tr key={i}>
                  {r.map((v, j) => {
                    const pol = polIdx >= 0 ? String(r[polIdx] ?? '') : '';
                    const linked = v !== null && pol && isLinkCol(j);
                    return (
                      <td
                        key={j}
                        className={
                          [cellClass(tab.columns[j], v), hl?.has(j) ? 'hl' : undefined]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                      >
                        {linked ? (
                          <span className="plink-cell">
                            {/* 기본 동작 = 비교 목록에 담기 (화면은 그대로 둔다).
                                onCompare 가 없는 화면(이미 비교 모드 등)에서는
                                예전처럼 그 플레이어 조회로 떨어진다. */}
                            {onCompare ? (
                              <button
                                type="button"
                                className="plink"
                                title={`${pol} — ${tt('addToCompare')}`}
                                onClick={() =>
                                  onCompare(pol, nameIdx >= 0 ? String(r[nameIdx] ?? '') : '')
                                }
                              >
                                {v}
                              </button>
                            ) : (
                              <a
                                className="plink"
                                href={`/player/${encodeURIComponent(pol)}`}
                                target="_blank"
                                rel="noreferrer"
                                title={pol}
                              >
                                {v}
                              </a>
                            )}
                            {/* 그 사람 전적만 따로 보고 싶을 때 — 새 창 */}
                            {onCompare && (
                              <a
                                className="plink-out"
                                href={`/player/${encodeURIComponent(pol)}`}
                                target="_blank"
                                rel="noreferrer"
                                title={tt('openPlayer')}
                              >
                                ↗
                              </a>
                            )}
                          </span>
                        ) : v === null ? (
                          ''
                        ) : typeof v === 'string' ? (
                          cellText(lang, v)
                        ) : (
                          v
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="row">
          <button className="ghost" onClick={() => setLimit((n) => n + ROW_CHUNK * 2)}>
            {tt('loadMore')} ({limit} / {filtered.length})
          </button>
        </div>
      )}
      {visible.length === 0 && <p className="hint">{tt('noRows')}</p>}
    </>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('single');
  const [id, setId] = useState('');
  const [ids, setIds] = useState(''); // 비교 모드: 쉼표/공백 구분
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [seasonSel, setSeasonSel] = useState(''); // 'S1' | 'S2' | ... (periodMode==='season')
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxMsg, setXlsxMsg] = useState('');
  const [h2hMin, setH2hMin] = useState(0); // 상대전적: 최소 경기수
  const [h2hDays, setH2hDays] = useState(0); // 상대전적: 만난 시기
  const [h2hTop, setH2hTop] = useState(0); // 상대전적: 상위 N명만 (0=전체)
  const [timeView, setTimeView] = useState<TimeView>('시간대');
  // 상대전적에서 눌러 담은 비교 대상 (나는 제외 — 목록을 만들 때 앞에 붙인다)
  const [picked, setPicked] = useState<Favorite[]>([]);
  const [pickMsg, setPickMsg] = useState('');
  const [h2hView, setH2hView] = useState<H2hView>('all');
  // 비교 표에서 표본 미달(5경기 미만) 행 숨기기 — 3판 100% 가 39판 55% 위에 뜨는 걸 막는다
  const [hideThin, setHideThin] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [single, setSingle] = useState<PlayerResponse | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [activeTab, setActiveTab] = useState('');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [dailyGran, setDailyGran] = useState<DailyGran>('day');
  const [dailyStyle, setDailyStyle] = useState<DailyStyle>('updown');
  const [charSel, setCharSel] = useState(''); // ''=전체, 그 외=해당 캐릭터만 집계
  const [lang, setLangState] = useState<Lang>('ko');
  const t = makeT(lang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  };

  // 비교 표 우위 하이라이트 on/off
  const [hlOn, setHlOn] = useState(true);

  // 통합 입력: 닉네임이 여러 명과 일치할 때 고를 후보 (pendingToken = 어느 입력 항목이었는지)
  const [searchMsg, setSearchMsg] = useState('');
  const [results, setResults] = useState<Favorite[]>([]);
  const [pendingToken, setPendingToken] = useState('');
  // 칩 선택의 동작: replace = 조회 중 모호한 항목 교체 후 재조회, append = 비교 목록에 추가
  const [resultsMode, setResultsMode] = useState<'replace' | 'append'>('replace');

  // 비교 모드: 검색해서 목록에 추가하는 보조 입력
  const [addQ, setAddQ] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  // 닉네임 검색 시 과거 닉네임까지 포함할지 (wavu 는 개명 이력도 검색해준다)
  const [inclHistory, setInclHistory] = useState(false);

  // 최근 조회한 플레이어 (이 브라우저에만 저장, 최대 8명)
  const [recent, setRecent] = useState<Favorite[]>([]);
  const pushRecent = (items: Favorite[]) => {
    setRecent((prev) => {
      const merged = [...items, ...prev.filter((r) => !items.some((i) => i.id === r.id))].slice(0, 8);
      try {
        localStorage.setItem('tkwavu_recent', JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      return merged;
    });
  };

  // 방문자 카운터 (세션당 1회만 증가)
  const [visits, setVisits] = useState<{ total: number; today: number } | null>(null);

  // 과거 버전이 저장해둔 값 정리 (입력 ID·관리자 비밀번호는 더 이상 저장하지 않는다)
  useEffect(() => {
    try {
      localStorage.removeItem('tkwavu');
      localStorage.removeItem('tkwavu_admin_pw');
      const l = localStorage.getItem(LANG_KEY) as Lang | null;
      if (l && ['ko', 'en', 'ja'].includes(l)) setLangState(l);
      const rc = localStorage.getItem('tkwavu_recent');
      if (rc) {
        const arr = JSON.parse(rc) as Favorite[];
        if (Array.isArray(arr)) setRecent(arr.filter((f) => f && f.id).slice(0, 8));
      }
    } catch {
      /* ignore */
    }
    // 방문 집계: 같은 브라우저 세션에서는 한 번만 센다
    const counted = sessionStorage.getItem('tkwavu_visited');
    fetch('/api/visit', { method: counted ? 'GET' : 'POST' })
      .then((r) => r.json())
      .then((d: { total?: number; today?: number }) => {
        if (typeof d.total === 'number')
          setVisits({ total: d.total, today: d.today ?? 0 });
        sessionStorage.setItem('tkwavu_visited', '1');
      })
      .catch(() => {});
  }, []);

  /**
   * 입력 항목 하나를 식별코드로 해석한다.
   * 식별코드 표기(looksLikeId)면 그대로 쓰고, 아니면 닉네임으로 wavu 검색.
   * 검색 결과가 정확히 1명이면 그 식별코드, 여러 명이면 후보를 돌려준다.
   *
   * 표기만 보고 고른 것은 `guess: true` 로 표시한다 — 12자 영숫자 닉네임은
   * 여전히 식별코드와 구분이 안 되므로, 호출부가 빗나갔을 때 되돌릴 수 있어야 한다.
   * `forceSearch` 는 그 되돌리기용(표기 판정을 건너뛰고 닉네임으로만 해석).
   */
  const resolveToken = async (
    tok: string,
    opts?: { forceSearch?: boolean },
  ): Promise<
    | { id: string; name?: string; guess?: boolean }
    | { choices: Favorite[] }
    | { error: string }
  > => {
    if (!opts?.forceSearch && looksLikeId(tok))
      return { id: toPolarisId(tok), guess: true };
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(tok)}${inclHistory ? '&history=1' : ''}`,
    );
    const data = (await res.json()) as { results?: Favorite[]; error?: string };
    if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
    const found = data.results ?? [];
    if (found.length === 0)
      return { error: `'${tok}' 닉네임 검색 결과가 없습니다.` };
    if (found.length === 1) return { id: found[0].id, name: found[0].name };
    return { choices: found };
  };


  /**
   * 기간 상태 → **공유 URL** 파라미터 (서버 쿼리가 아니라 화면 상태 복원용).
   * 주소창 동기화와 '즉시 비교(새 창)'가 같은 형식을 쓰도록 한 곳에 모았다 —
   * 갈라지면 새 창만 기간이 초기화되는 식으로 조용히 어긋난다.
   */
  const periodShareParams = useCallback((): URLSearchParams => {
    const sp = new URLSearchParams();
    if (periodMode === 'all') return sp;
    sp.set('pm', periodMode);
    if (periodMode === 'month') sp.set('mo', month);
    if (periodMode === 'year') sp.set('yr', year);
    if (periodMode === 'season') sp.set('sn', seasonSel);
    if (periodMode === 'custom') {
      if (start) sp.set('st', start);
      if (end) sp.set('en', end);
    }
    return sp;
  }, [periodMode, month, year, seasonSel, start, end]);

  /** 기간 모드 → 실제 start/end 쿼리. */
  const periodQuery = useCallback((): URLSearchParams => {
    const q = new URLSearchParams();
    if (periodMode === 'month' && month) {
      const [s, e] = monthRange(month);
      q.set('start', s);
      q.set('end', e);
    } else if (periodMode === 'year' && year) {
      q.set('start', `${year}-01-01`);
      q.set('end', `${year}-12-31`);
    } else if (periodMode === 'custom') {
      if (start) q.set('start', start);
      if (end) q.set('end', end);
    } else if (periodMode === 'season' && seasonSel) {
      // 날짜가 아니라 시즌 키로 보낸다 — 서버가 game_version 으로 판정한다.
      q.set('season', seasonSel);
    }
    return q;
  }, [periodMode, month, year, start, end, seasonSel]);

  /**
   * 조회. 입력칸의 각 항목(식별코드 또는 닉네임)을 resolveToken 으로 해석한 뒤 실행.
   * 닉네임이 여러 명과 일치하면 칩을 띄우고 멈춘다 — 칩 선택 시 해당 항목만 바꿔 재실행.
   * setState 반영 전에 재실행할 수 있도록 override 인자를 받는다.
   */
  const run = useCallback(
    async (
      overrideId?: string,
      overrideIds?: string,
      overrideChar?: string,
      /** 모드까지 바꾸면서 바로 실행할 때 (setMode 는 다음 렌더에나 반영되므로 필요). */
      overrideMode?: Mode,
    ) => {
      const inputId = overrideId ?? id;
      const inputIds = overrideIds ?? ids;
      const charFilter = overrideChar !== undefined ? overrideChar : charSel;
      const runMode = overrideMode ?? mode;
      setLoading(true);
      setError('');
      setResults([]);
      setSearchMsg('');
      try {
        if (runMode === 'single') {
          const tok = inputId.trim();
          if (!tok) throw new Error(t('needInput'));
          const r = await resolveToken(tok);
          if ('error' in r) throw new Error(r.error);
          if ('choices' in r) {
            setPendingToken(tok);
            setResultsMode('replace');
            setResults(r.choices);
            setSearchMsg(t('multiFound')(tok));
            return;
          }
          if (r.id !== tok) setId(r.id); // 닉네임 → 찾은 식별코드를 입력칸에 반영
          const q = periodQuery();
          if (charFilter) q.set('char', charFilter);
          let res = await fetch(`/api/replays/${encodeURIComponent(r.id)}?${q}`);

          // 표기만 보고 식별코드로 넘겼는데 없는 코드였다면 닉네임으로 다시 해석한다.
          // 12자 영숫자 닉네임은 표기가 식별코드와 완전히 겹쳐 사전 판별이 불가능하다.
          // 판정이 빗나가도 조회가 404 로 끝나지 않게 하는 안전망.
          if (res.status === 404 && r.guess) {
            const alt = await resolveToken(tok, { forceSearch: true });
            if ('choices' in alt) {
              setPendingToken(tok);
              setResultsMode('replace');
              setResults(alt.choices);
              setSearchMsg(t('multiFound')(tok));
              return;
            }
            // 양쪽 다 실패 — 한쪽 메시지만 보이면 원인을 오해하므로 둘 다 밝힌다
            if ('error' in alt) throw new Error(t('noMatch')(tok));
            setId(alt.id);
            res = await fetch(`/api/replays/${encodeURIComponent(alt.id)}?${q}`);
          }

          const data = (await res.json()) as PlayerResponse;
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setSingle(data);
          setCompare(null);
          // 공유 URL 로 복원된 탭은 유지하되, 이 결과에 없는 탭이면 첫 탭으로
          setActiveTab((prev) =>
            data.tabs.some((tb) => tb.key === prev) ? prev : (data.tabs[0]?.key ?? ''),
          );
          pushRecent([{ id: data.polarisId, name: data.myName || data.polarisId }]);
        } else {
          // 닉네임에 공백이 올 수 있으므로 쉼표로만 구분한다
          const tokens = inputIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (tokens.length < 2) throw new Error(t('needTwo'));
          const resolved: string[] = [];
          for (const tok of tokens) {
            const r = await resolveToken(tok);
            if ('error' in r) throw new Error(r.error);
            if ('choices' in r) {
              setPendingToken(tok);
              setResultsMode('replace');
              setResults(r.choices);
              setSearchMsg(t('multiFound')(tok));
              return;
            }
            resolved.push(r.id);
          }
          const joined = resolved.join(', ');
          if (joined !== inputIds.trim()) setIds(joined); // 해석된 식별코드로 입력칸 갱신
          const q = periodQuery();
          q.set('ids', resolved.join(','));
          const res = await fetch(`/api/compare?${q}`);
          const data = (await res.json()) as CompareResponse;
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setCompare(data);
          setSingle(null);
          // 단일 모드와 동일하게 — 공유 URL 의 tab= 이 조회 완료로 덮이지 않게 보존
          setActiveTab((prev) =>
            data.tabs.some((tb) => tb.key === prev) ? prev : (data.tabs[0]?.key ?? ''),
          );
          pushRecent(data.players.map((pl) => ({ id: pl.polarisId, name: pl.name })));
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, id, ids, charSel, periodQuery, lang, inclHistory],
  );

  /** 캐릭터 칩 선택 → 그 캐릭터 경기만으로 전 탭 재집계 (''=전체). */
  const pickChar = (c: string) => {
    setCharSel(c);
    run(undefined, undefined, c);
  };

  /**
   * 상대전적에서 상대를 눌렀을 때 — **비교 목록에 담기만 한다.**
   *
   * 예전에는 곧바로 비교 조회로 넘어갔는데, 보던 상대전적 표가 사라지고
   * 한 명하고만 비교할 수 있었다. 표를 그대로 둔 채 여러 명을 골라 담고,
   * 다 고르면 새 창에서 열거나 복사해 쓰는 편이 실제 흐름에 맞는다.
   */
  const addPick = (oppPolaris: string, oppName: string) => {
    const me = single?.polarisId;
    if (!me || !oppPolaris || me === oppPolaris) return;
    const label = oppName ? `${oppName} (${oppPolaris})` : oppPolaris;
    if (picked.some((p) => p.id === oppPolaris)) {
      setPickMsg(t('already')(oppName || oppPolaris));
      return;
    }
    // 서버 상한이 4명이고 그중 한 자리는 '나'가 쓴다
    if (picked.length + 1 >= MAX_COMPARE) {
      setPickMsg(t('pickFull')(MAX_COMPARE));
      return;
    }
    setPicked((prev) => [...prev, { id: oppPolaris, name: oppName }]);
    setPickMsg(t('added')(label));
  };

  /** 비교 목록 = 나 + 고른 상대들. 복사·새 창 양쪽이 같은 값을 쓴다. */
  const pickedIds = single ? [single.polarisId, ...picked.map((p) => p.id)] : [];
  const pickedText = pickedIds.join(', ');

  const copyPicked = async () => {
    try {
      await navigator.clipboard.writeText(pickedText);
      setPickMsg(t('copied'));
    } catch {
      // 클립보드 권한이 없거나 http 인 환경 — 입력칸을 직접 고르게 안내한다
      setPickMsg(t('copyFail'));
    }
  };

  /** 새 창에서 비교 — 지금 화면(상대전적)을 유지한 채 결과를 따로 본다. */
  const openCompare = () => {
    if (!single || picked.length === 0) return;
    const sp = periodShareParams();
    sp.set('ids', pickedIds.join(','));
    window.open(`/?${sp}`, '_blank', 'noopener');
  };

  // ── 공유 URL: 조회 상태(모드·기간·캐릭터·탭)를 주소에 싣고, 열릴 때 복원한다 ──
  // 복원은 2단계: (1) 파라미터 → 상태 반영, (2) 상태가 커밋된 다음 렌더에서 run().
  // (같은 이펙트에서 바로 run() 하면 periodQuery 가 이전 상태를 캡처하기 때문)
  const bootRef = useRef(false);
  const [bootRun, setBootRun] = useState(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    // /player/<식별코드> 로 들어온 경우 경로에서 읽는다 (쿼리 ?id= 도 계속 지원)
    const m = window.location.pathname.match(/^\/player\/([^/?#]+)/);
    const qid = m ? decodeURIComponent(m[1]).replace(/[^A-Za-z0-9]/g, '') : sp.get('id');
    const qids = sp.get('ids');
    if (!qid && !qids) return;
    if (qids) {
      setMode('compare');
      setIds(qids.split(',').join(', '));
    } else if (qid) {
      setId(qid);
    }
    const pmRaw = sp.get('pm');
    // 예전 공유 링크는 시즌을 pm=s1|s2|s3 로 실었다. 계속 열리게 받아준다.
    if (pmRaw && /^s\d+$/i.test(pmRaw)) {
      setPeriodMode('season');
      setSeasonSel(pmRaw.toUpperCase());
    } else {
      const pm = pmRaw as PeriodMode | null;
      if (pm && ['all', 'month', 'year', 'custom', 'season'].includes(pm)) {
        setPeriodMode(pm);
        if (pm === 'month' && sp.get('mo')) setMonth(sp.get('mo')!);
        if (pm === 'year' && sp.get('yr')) setYear(sp.get('yr')!);
        if (pm === 'season' && sp.get('sn')) setSeasonSel(sp.get('sn')!);
        if (pm === 'custom') {
          if (sp.get('st')) setStart(sp.get('st')!);
          if (sp.get('en')) setEnd(sp.get('en')!);
        }
      }
    }
    if (sp.get('ch')) setCharSel(sp.get('ch')!);
    if (sp.get('tab')) setActiveTab(sp.get('tab')!);
    setBootRun(true);
  }, []);

  useEffect(() => {
    if (!bootRun) return;
    setBootRun(false);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootRun]);

  // 조회 결과가 있는 동안 상태 변화를 주소창에 반영 (replaceState — 히스토리 오염 없음)
  useEffect(() => {
    // 현재 모드의 결과가 있을 때만 쓴다 — 결과 표시 중 모드만 토글하면
    // (mode 는 바뀌었는데 그 모드의 결과는 없음) URL 의 id/ids 가 지워지는 것을 방지
    if (mode === 'single' ? !single : !compare) return;
    const sp = periodShareParams();
    // 단일은 /player/<식별코드> 를 기본 주소로 쓴다 (wavu·tknow 와 같은 형식).
    // 비교는 대상이 여럿이라 쿼리로 유지한다.
    const single1 = mode === 'single' && single;
    if (!single1 && mode === 'compare' && compare)
      sp.set('ids', compare.players.map((p) => p.polarisId).join(','));
    if (periodMode !== 'all') {
      sp.set('pm', periodMode);
      if (periodMode === 'month') sp.set('mo', month);
      if (periodMode === 'year') sp.set('yr', year);
      if (periodMode === 'season') sp.set('sn', seasonSel);
      if (periodMode === 'custom') {
        if (start) sp.set('st', start);
        if (end) sp.set('en', end);
      }
    }
    if (mode === 'single' && charSel) sp.set('ch', charSel);
    if (activeTab) sp.set('tab', activeTab);
    const qs = sp.toString();
    const path = single1
      ? `/player/${encodeURIComponent(single.polarisId)}`
      : '/';
    window.history.replaceState(null, '', qs ? `${path}?${qs}` : path);
  }, [single, compare, mode, activeTab, charSel, periodMode, month, year, start, end, seasonSel]);

  /** 비교 목록에 식별코드 추가 (중복 제외). */
  const appendToIds = (fid: string, name?: string) => {
    setIds((prev) => {
      const list = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.includes(fid)) {
        setSearchMsg(t('already')(name ?? fid));
        return prev;
      }
      setSearchMsg(t('added')(name ? `${name} (${fid})` : fid));
      return [...list, fid].join(', ');
    });
  };

  /**
   * 후보 칩 선택.
   * - replace: 조회 중 모호했던 항목을 바꿔 즉시 재조회
   * - append: 비교 목록에 덧붙이기만 (계속 검색해서 더 추가할 수 있게 조회는 안 함)
   */
  /** 최근 조회 칩 → 모드에 맞게 입력칸 채우기 (단일=교체, 비교=덧붙임). */
  const fillFromChip = (f: Favorite) => {
    if (mode === 'single') {
      setId(f.id);
      setCharSel('');
    } else {
      appendToIds(f.id, f.name);
    }
  };

  const pickResult = (f: Favorite) => {
    setResults([]);
    setSearchMsg('');
    if (resultsMode === 'append') {
      appendToIds(f.id, f.name);
      return;
    }
    if (mode === 'single') {
      setId(f.id);
      run(f.id);
    } else {
      const newIds = ids
        .split(',')
        .map((s) => (s.trim() === pendingToken ? f.id : s.trim()))
        .filter(Boolean)
        .join(', ');
      setIds(newIds);
      run(undefined, newIds);
    }
  };

  /** 비교 모드 보조 검색: 닉네임/ID 를 해석해 목록에 추가. 여러 명이면 칩으로 고르게. */
  const searchAndAdd = async () => {
    const tok = addQ.trim();
    if (!tok) return;
    setAddBusy(true);
    setSearchMsg('');
    setResults([]);
    try {
      const r = await resolveToken(tok);
      if ('error' in r) {
        setSearchMsg(r.error);
      } else if ('choices' in r) {
        setResultsMode('append');
        setResults(r.choices);
        setSearchMsg(t('addPick')(tok));
      } else {
        appendToIds(r.id, r.name);
        setAddQ('');
      }
    } finally {
      setAddBusy(false);
    }
  };

  const xlsxHref = (() => {
    const q = periodQuery();
    if (mode === 'single' && single) {
      if (charSel) q.set('char', charSel);
      return `/api/xlsx/${encodeURIComponent(single.polarisId)}?${q}`;
    }
    if (mode === 'compare' && compare) {
      q.set('ids', compare.players.map((p) => p.polarisId).join(','));
      return `/api/xlsx/compare?${q}`;
    }
    return null;
  })();

  const tabs = mode === 'single' ? single?.tabs : compare?.tabs;
  const current = tabs?.find((t) => t.key === activeTab) ?? tabs?.[0];

  // wavu 가 막혀 지난 사본을 보고 있는가. null 이면 정상(신선한 데이터).
  const staleMinutes = (() => {
    const c = mode === 'single' ? single?.cache : compare?.cache;
    if (!c?.stale) return null;
    const at = (c as { fetchedAt?: number }).fetchedAt;
    return at ? Math.max(1, Math.round((Date.now() - at) / 60000)) : 10;
  })();

  // 엑셀 예상 소요 — 실측(30,233경기 ≈ 27.6초)에서 뽑은 대략치. 정확할 필요는 없고
  // "금방 끝날 일이 아니다"를 미리 알리는 게 목적이다.
  const xlsxGames =
    mode === 'single'
      ? (single?.recordCount ?? 0)
      : (compare?.players.reduce((s, p) => s + p.count, 0) ?? 0);
  const xlsxEtaSec = Math.round(xlsxGames / 1100);

  // 시즌 목록 — 조회 결과가 있으면 그것이 정답(데이터에서 파생), 없으면 표시용 기본값.
  const seasons: SeasonInfo[] =
    (mode === 'single' ? single?.seasons : compare?.seasons) ?? [];
  const seasonList = seasons.length ? seasons.map((s) => s.key) : FALLBACK_SEASONS;

  // 일별 탭: 조회 범위가 넓으면 월/분기/반기/연 집계 단위 제공
  const dailyOpts = current?.key === 'daily' ? granOptions(current, seasons) : null;
  const effGran: DailyGran =
    dailyOpts && dailyOpts.includes(dailyGran) ? dailyGran : 'day';

  // 상대전적 탭: 최소 경기수 → 만난 시기 → 강점/약점 정렬 → 상위 N명
  // (자르기는 정렬 뒤에 해야 '강점 상위 10명'이 뜻대로 나온다)
  const h2hOpts = current?.key === 'h2h' ? h2hMinOptions(current) : null;
  const effH2hMin = h2hOpts && h2hOpts.includes(h2hMin) ? h2hMin : 0;
  const h2hFiltered =
    current?.key === 'h2h' && h2hOpts
      ? filterH2h(current, effH2hMin, h2hDays, h2hView)
      : null;
  const h2hTopOpts = h2hFiltered ? h2hTopOptions(h2hFiltered.rows.length) : null;
  const effH2hTop = h2hTopOpts?.includes(h2hTop) ? h2hTop : 0;

  const displayTab =
    current?.key === 'daily'
      ? rollupDaily(current, effGran, seasons)
      : h2hFiltered
        ? effH2hTop > 0
          ? { ...h2hFiltered, rows: h2hFiltered.rows.slice(0, effH2hTop) }
          : h2hFiltered
        : current?.key === 'time'
          ? pickUnit(current, timeView)
          : current;

  // 비교 표(캐릭터·상대 캐릭·공통 상대)에서 표본이 얇은 행을 걸러낼 수 있는가.
  // 실측: 39행 중 3행이 5경기 미만이었고 그중 둘이 '3전 100%' 였다.
  const thinCols = displayTab
    ? displayTab.columns
        .map((c, i) => (c.endsWith('_games') ? i : -1))
        .filter((i) => i >= 0)
    : [];
  const thinnable = mode === 'compare' && thinCols.length >= 2;
  const shownTab =
    thinnable && hideThin && displayTab
      ? {
          ...displayTab,
          // 아무도 기준을 못 채운 행만 숨긴다. 한쪽만 많이 한 매치업은
          // '상대는 안 한다'는 정보 자체가 비교거리라 남긴다.
          rows: displayTab.rows.filter((r) =>
            thinCols.some((i) => Number(r[i]) >= COMPARE_MIN_GAMES),
          ),
        }
      : displayTab;

  // 오늘의 요약 (단일 조회): 일별 탭에서 오늘(KST) 행 합산 + 전적 목록 첫 행에서 현재 레이팅
  const summary = useMemo(() => {
    if (!single) return null;
    const daily = single.tabs.find((tb) => tb.key === 'daily');
    const matches = single.tabs.find((tb) => tb.key === 'matches');
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    let w = 0;
    let l = 0;
    let delta = 0;
    for (const r of daily?.rows ?? []) {
      if (r[0] === today) {
        w += Number(r[3]);
        l += Number(r[4]);
        delta += Number(r[6]);
      }
    }
    const lastRow = matches?.rows[0];
    return {
      w, l, delta,
      games: w + l,
      rating: lastRow ? Number(lastRow[4]) : null,
      lastDt: lastRow ? String(lastRow[0]).slice(0, 10) : null,
    };
  }, [single]);

  const baseName =
    mode === 'single'
      ? single?.myName || single?.polarisId || 'tekken'
      : compare?.players.map((p) => p.name).join('_vs_') || 'compare';

  const downloadCsv = () => {
    if (!displayTab) return;
    downloadBlob(
      toCsv(displayTab, lang),
      'text/csv;charset=utf-8',
      `${baseName}_${displayTab.key}.csv`,
    );
  };
  const downloadJson = () => {
    if (!tabs) return;
    const payload = mode === 'single' ? single : compare;
    downloadBlob(
      JSON.stringify(payload, null, 1),
      'application/json',
      `${baseName}_stats.json`,
    );
  };

  /**
   * 엑셀 다운로드.
   *
   * 예전에는 <a href> 였다. 그러면 30,233경기(실측 27.6초) 같은 경우 클릭 후
   * 30초 가까이 **아무 표시도 없이** 브라우저만 멈춰 있고, 서버가 429/504 를 줘도
   * 오류 JSON 이 파일로 저장돼 버렸다. fetch 로 바꿔 상태와 오류를 화면에 낸다.
   */
  const downloadXlsx = async () => {
    if (!xlsxHref || xlsxBusy) return;
    setXlsxBusy(true);
    setXlsxMsg('');
    try {
      const res = await fetch(xlsxHref);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      // 서버가 RFC 5987 로 실어 보낸 한글 파일명을 그대로 쓴다
      const cd = res.headers.get('content-disposition') ?? '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = m ? decodeURIComponent(m[1]) : `${baseName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setXlsxMsg((e as Error).message);
    } finally {
      setXlsxBusy(false);
    }
  };

  const yearOptions = (() => {
    const now = new Date().getFullYear();
    const ys: string[] = [];
    for (let y = now; y >= 2024; y--) ys.push(String(y)); // 철권8 데이터는 2024-03부터
    return ys;
  })();

  /** 메인(초기 화면)으로 — 결과를 닫고 맨 위로. 입력값과 즐겨찾기는 유지. */
  const goHome = () => {
    setSingle(null);
    setCompare(null);
    setError('');
    setActiveTab('');
    window.scrollTo({ top: 0 });
  };

  return (
    <main>
      <div className="titlebar">
        <h1>
          <button className="home-btn" onClick={goHome} title="Home">
            {t('title')}
          </button>
        </h1>
        <div className="lang-switch">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={lang === l.code ? 'on' : ''}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <p className="sub">{t('sub')}</p>

      <div className="mode-switch">
        <button
          className={mode === 'single' ? 'on' : ''}
          onClick={() => setMode('single')}
        >
          {t('single')}
        </button>
        <button
          className={mode === 'compare' ? 'on' : ''}
          onClick={() => setMode('compare')}
        >
          {t('compare')}
        </button>
        <a
          className="tier-link"
          href="https://season-end-web.vercel.app/tekken-tier"
          target="_blank"
          rel="noreferrer"
          title={
            lang === 'ko'
              ? '시즌별 티어 분포 (상위 %)'
              : lang === 'ja'
                ? 'シーズン別ティア分布 (上位%)'
                : 'Rank distribution by season (top %)'
          }
        >
          🏆 Tekken Tier Percent
        </a>
        <a
          className="tier-link"
          href="https://tekken8-tube.vercel.app/"
          target="_blank"
          rel="noreferrer"
          title={
            lang === 'ko'
              ? '캐릭터별 콤보·확정반격 영상 모음 (매시간 갱신)'
              : lang === 'ja'
                ? 'キャラ別コンボ・確定反撃動画まとめ (毎時更新)'
                : 'Combo and punish video guides by character (hourly)'
          }
        >
          🎬 Tekken 8 Tube
        </a>
      </div>

      <div className="panel">
        {mode === 'single' ? (
          <>
            <label htmlFor="pid">{t('idOrNick')}</label>
            <div className="row id-row">
              <input
                id="pid"
                className="id-input"
                type="text"
                placeholder={t('idPlaceholder')}
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setCharSel('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button onClick={() => run()} disabled={loading}>
                {loading ? t('querying') : t('query')}
              </button>
            </div>

            {/* 상대전적에서 눌러 담은 비교 목록.
                여기서 끝내지 않고 '복사'(여러 명 비교에 붙여넣기)와
                '즉시 비교'(새 창) 두 갈래를 준다 — 보던 표를 잃지 않게. */}
            {picked.length > 0 && (
              <div className="pick-box">
                <div className="pick-head">
                  <span className="ctl-label">
                    {t('pickLabel')(pickedIds.length, MAX_COMPARE)}
                  </span>
                  <button
                    className="ghost"
                    onClick={() => {
                      setPicked([]);
                      setPickMsg('');
                    }}
                  >
                    {t('clearBtn')}
                  </button>
                </div>
                <div className="pick-chips">
                  <span className="chip me">
                    {single?.myName || single?.polarisId} · {t('meLabel')}
                  </span>
                  {picked.map((p) => (
                    <span key={p.id} className="chip">
                      {p.name || p.id}
                      <button
                        className="chip-x"
                        title={t('remove')}
                        onClick={() =>
                          setPicked((v) => v.filter((x) => x.id !== p.id))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="row">
                  <input
                    className="pick-text"
                    readOnly
                    value={pickedText}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={t('pickTextLabel')}
                  />
                  <button className="ghost" onClick={copyPicked}>
                    {t('copyBtn')}
                  </button>
                  <button onClick={openCompare}>{t('compareNow')}</button>
                </div>
                {pickMsg && <p className="hint">{pickMsg}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <label htmlFor="pids">{t('idsLabel')}</label>
            <div className="row id-row">
              <input
                id="pids"
                type="text"
                placeholder="ex) ID, ID"
                value={ids}
                onChange={(e) => setIds(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button onClick={() => run()} disabled={loading}>
                {loading ? t('querying') : t('query')}
              </button>
            </div>

            <label htmlFor="addq" style={{ marginTop: '0.8rem' }}>
              {t('addLabel')}
            </label>
            <div className="row id-row">
              <input
                id="addq"
                className="id-input"
                type="text"
                placeholder={t('addPlaceholder')}
                value={addQ}
                onChange={(e) => setAddQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !addBusy && searchAndAdd()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="ghost" onClick={searchAndAdd} disabled={addBusy}>
                {addBusy ? t('searching') : t('addBtn')}
              </button>
            </div>
          </>
        )}

        <label className="hl-toggle" style={{ marginTop: '0.6rem' }}>
          <input
            type="checkbox"
            checked={inclHistory}
            onChange={(e) => setInclHistory(e.target.checked)}
          />
          {t('historyOpt')}
        </label>

        {recent.length > 0 && (
          <div className="fav-chips recent-chips">
            <span className="hint" style={{ margin: 0 }}>{t('recent')}:</span>
            {recent.map((r) => (
              <button
                key={r.id}
                className="chip"
                title={r.id}
                onClick={() => fillFromChip(r)}
              >
                {r.name}
              </button>
            ))}
            <button
              className="ghost small"
              onClick={() => {
                setRecent([]);
                try {
                  localStorage.removeItem('tkwavu_recent');
                } catch {
                  /* ignore */
                }
              }}
            >
              {t('clearBtn')}
            </button>
          </div>
        )}

        {searchMsg && <p className="hint">{searchMsg}</p>}
        {results.length > 0 && (
          <div className="fav-chips">
            {results.map((r) => (
              <button
                key={r.id}
                className="chip"
                title={r.id}
                onClick={() => pickResult(r)}
              >
                {r.name} <span className="chip-id">{r.id}</span>
              </button>
            ))}
          </div>
        )}

        <label style={{ marginTop: '0.8rem' }}>{t('period')}</label>
        <div className="mode-switch period">
          {(
            [
              ['all', t('periodAll')],
              ['month', t('periodMonth')],
              ['year', t('periodYear')],
              ['custom', t('periodCustom')],
            ] as [PeriodMode, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              className={periodMode === k ? 'on' : ''}
              onClick={() => setPeriodMode(k)}
            >
              {label}
            </button>
          ))}
          {/* 시즌 버튼은 조회 결과가 알려준 실제 시즌으로 만든다.
              조회 전에는 표시용 기본 목록. 새 시즌이 열리면 첫 조회 즉시 나타난다. */}
          {seasonList.map((s) => (
            <button
              key={s}
              className={periodMode === 'season' && seasonSel === s ? 'on' : ''}
              onClick={() => {
                setPeriodMode('season');
                setSeasonSel(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {periodMode === 'month' && (
          <div className="row">
            <input
              type="month"
              value={month}
              min="2024-03"
              max={currentMonth()}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        )}
        {periodMode === 'year' && (
          <div className="row">
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
        )}
        {periodMode === 'season' && seasonSel && (
          <p className="hint" style={{ marginTop: '0.2rem' }}>
            {(() => {
              const s = seasons.find((x) => x.key === seasonSel);
              return s
                ? `${s.start} ~ ${s.end} (${s.games.toLocaleString()}${t('games')})`
                : seasonSel;
            })()}
          </p>
        )}
        {periodMode === 'custom' && (
          <div className="row">
            <span>
              <label htmlFor="start">{t('startDate')}</label>
              <input
                id="start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </span>
            <span>
              <label htmlFor="end">{t('endDate')}</label>
              <input
                id="end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </span>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {/* wavu 수집 실패 → 지난 사본으로 버티는 중. 예전에는 이때 사이트가 통째로 멈췄다. */}
        {staleMinutes !== null && (
          <p className="warn">{t('staleWarn')(staleMinutes)}</p>
        )}
        <p className="hint">{t('firstHint')}</p>
        {mode === 'compare' && <p className="hint">{t('compareHint')}</p>}
      </div>

      {single && (
        <>
          <p className="meta">
            <b>{single.myName || single.polarisId}</b>
            {single.selectedChar ? <b> — {single.selectedChar}</b> : null} ·{' '}
            {single.filtered?.count}
            {t('games')}
            {single.filtered?.start || single.filtered?.end
              ? ` (${single.filtered?.start ?? ''} ~ ${single.filtered?.end ?? ''}, ${t('totalSuffix')} ${single.totalCount})`
              : ''}
            {single.firstDt ? ` · ${single.firstDt.slice(0, 10)} ~ ${single.lastDt?.slice(0, 10)}` : ''}
          </p>
          {summary && (
            <div className="sum-card">
              <div className="sum-block">
                <span className="sum-label">{t('sumToday')}</span>
                {summary.games > 0 ? (
                  <span className="sum-value">
                    <b className="sw">{summary.w}{t('winChar')}</b>{' '}
                    <b className="sl">{summary.l}{t('lossChar')}</b>{' '}
                    <span className="sum-sub">
                      {Math.round((summary.w * 1000) / summary.games) / 10}%
                    </span>
                  </span>
                ) : (
                  <span className="sum-value sum-muted">{t('sumNoToday')}</span>
                )}
              </div>
              {summary.games > 0 && (
                <div className="sum-block">
                  <span className="sum-label">Δ</span>
                  <span className={`sum-value ${summary.delta >= 0 ? 'sw' : 'sl'}`}>
                    {summary.delta > 0 ? `+${summary.delta}` : summary.delta}
                  </span>
                </div>
              )}
              {summary.rating !== null && summary.rating > 0 && (
                <div className="sum-block">
                  <span className="sum-label">{t('sumRating')}</span>
                  <span className="sum-value">{summary.rating.toLocaleString()}</span>
                </div>
              )}
              {summary.games === 0 && summary.lastDt && (
                <div className="sum-block">
                  <span className="sum-label">{t('sumLastDay')}</span>
                  <span className="sum-value sum-date">{summary.lastDt}</span>
                </div>
              )}
            </div>
          )}
          {single.charCounts && single.charCounts.length > 1 && (
            <div className="char-chips">
              <span className="hint" style={{ margin: 0 }}>{t('charLabel')}:</span>
              <button
                className={`chip${charSel === '' ? ' on' : ''}`}
                onClick={() => pickChar('')}
              >
                {t('charAll')}
              </button>
              {single.charCounts.map((c) => (
                <button
                  key={c.name}
                  className={`chip${charSel === c.name ? ' on' : ''}`}
                  onClick={() => pickChar(c.name)}
                >
                  {c.name} <span className="chip-id">{c.games}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {compare && (
        <p className="meta compare-meta">
          {compare.players.map((p, i) => (
            <span key={p.polarisId}>
              {i > 0 && <span className="vs"> vs </span>}
              <b>{p.name}</b> <span className="cnt">({p.count})</span>
            </span>
          ))}
        </p>
      )}

      {tabs && (
        <>
          <div className="row dl-row">
            {xlsxHref && (
              <button className="ghost" onClick={downloadXlsx} disabled={xlsxBusy}>
                {xlsxBusy ? t('xlsxBusy') : t('xlsxBtn')}
              </button>
            )}
            <button className="ghost" onClick={downloadCsv}>
              {t('csvBtn')}
            </button>
            <button className="ghost" onClick={downloadJson}>
              {t('jsonBtn')}
            </button>
          </div>
          {/* 오래 걸릴 조회에만 예상 시간을 미리 알린다 (실측 기반 근사) */}
          {xlsxHref && !xlsxBusy && xlsxEtaSec >= 5 && (
            <p className="hint">{t('xlsxEta')(xlsxEtaSec)}</p>
          )}
          {xlsxMsg && <p className="error">{xlsxMsg}</p>}

          <div className="tabs">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                className={tb.key === (current?.key ?? '') ? 'on' : ''}
                onClick={() => setActiveTab(tb.key)}
              >
                {TAB_LABELS[tb.key]?.[lang] ?? tb.label}
              </button>
            ))}
          </div>

          {mode === 'compare' && (
            <div className="hl-row">
              <label className="hl-toggle">
                <input
                  type="checkbox"
                  checked={hlOn}
                  onChange={(e) => setHlOn(e.target.checked)}
                />
                {t('hlToggle')}
              </label>
              <span className="hl-period">
                {t('periodPrefix')}:{' '}
                {compare?.filtered?.start || compare?.filtered?.end
                  ? `${compare?.filtered?.start ?? t('begin')} ~ ${compare?.filtered?.end ?? t('today')}`
                  : t('periodAll')}
              </span>
            </div>
          )}

          {current && CHART_TABS.has(current.key) ? (
            <>
              <div className="mode-switch period">
                <button
                  className={view === 'chart' ? 'on' : ''}
                  onClick={() => setView('chart')}
                >
                  {t('chart')}
                </button>
                <button
                  className={view === 'table' ? 'on' : ''}
                  onClick={() => setView('table')}
                >
                  {t('table')}
                </button>
                {current.key === 'daily' && view === 'chart' && (
                  <>
                    <span className="gran-sep" />
                    {DAILY_STYLES.map((st) => (
                      <button
                        key={st}
                        className={dailyStyle === st ? 'on' : ''}
                        onClick={() => setDailyStyle(st)}
                      >
                        {DAILY_STYLE_LABEL[st][lang]}
                      </button>
                    ))}
                  </>
                )}
                {dailyOpts && dailyOpts.length > 1 && (
                  <>
                    <span className="gran-sep" />
                    {dailyOpts.map((g) => (
                      <button
                        key={g}
                        className={effGran === g ? 'on' : ''}
                        onClick={() => setDailyGran(g)}
                      >
                        {GRAN_LABEL[g][lang]}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {view === 'chart' ? (
                current.key === 'trend' ? (
                  <TrendChart rows={current.rows} lang={lang} />
                ) : current.key === 'daily' ? (
                  <DailyChart rows={displayTab!.rows} lang={lang} style={dailyStyle} />
                ) : (
                  <SessionChart rows={current.rows} lang={lang} />
                )
              ) : (
                <DataTable tab={displayTab ?? current} lang={lang} />
              )}
            </>
          ) : (
            current && (
              <>
                {current.key === 'matches' &&
                  single?.filtered &&
                  single.filtered.count > current.rows.length && (
                    <p className="hint">
                      {t('trendLimit')(current.rows.length, single.filtered.count)}
                    </p>
                  )}

                {/* 상대전적: 몇 판 이상 만난 상대만 + 강점/약점 순 */}
                {h2hOpts && (
                  <>
                    <div className="mode-switch period">
                      <span className="ctl-label">{t('minGames')}</span>
                      {h2hOpts.map((m) => (
                        <button
                          key={m}
                          className={effH2hMin === m ? 'on' : ''}
                          onClick={() => setH2hMin(m)}
                        >
                          {m === 0 ? t('periodAll') : `${m}+`}
                        </button>
                      ))}
                      <span className="gran-sep" />
                      <span className="ctl-label">{t('metSince')}</span>
                      {H2H_DAYS.map((d) => (
                        <button
                          key={d}
                          className={h2hDays === d ? 'on' : ''}
                          onClick={() => setH2hDays(d)}
                        >
                          {H2H_DAY_LABEL(d, lang)}
                        </button>
                      ))}
                    </div>
                    <div className="mode-switch period">
                      {(['all', 'strong', 'weak'] as H2hView[]).map((v) => (
                        <button
                          key={v}
                          className={h2hView === v ? 'on' : ''}
                          onClick={() => setH2hView(v)}
                        >
                          {H2H_VIEW_LABEL[v][lang]}
                        </button>
                      ))}
                      {/* 정렬 뒤에 자르므로 '강점 상위 10명'처럼 뜻대로 동작한다 */}
                      {h2hTopOpts && h2hTopOpts.length > 0 && (
                        <>
                          <span className="gran-sep" />
                          <span className="ctl-label">{t('showTop')}</span>
                          {h2hTopOpts.map((n) => (
                            <button
                              key={n}
                              className={effH2hTop === n ? 'on' : ''}
                              onClick={() => setH2hTop(n)}
                            >
                              {n === 0 ? t('periodAll') : n}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* 흐름: 이 사람 데이터로 뽑은 권장 판수.
                    단정하지 않는다 — 표본이 얇거나 꺾이는 지점이 없으면 그렇게 말한다. */}
                {current.key === 'flow' && single?.advice && (
                  <div className="advice">
                    {single.advice.reliable ? (
                      <>
                        <p className="advice-main">
                          {single.advice.stopAfter
                            ? t('adviceStop')(
                                single.advice.goodUpTo ?? single.advice.stopAfter,
                                single.advice.stopAfter,
                              )
                            : t('adviceNoDrop')(single.advice.goodUpTo ?? 0)}
                        </p>
                        <p className="advice-bands">
                          {single.advice.bands
                            .filter((b) => b.enough)
                            .map((b) => `${b.from}~${b.to}판 ${b.winRate}%`)
                            .join('  ·  ')}
                          {`  (${t('adviceBaseline')} ${single.advice.baselineWinRate}%)`}
                        </p>
                      </>
                    ) : (
                      <p className="advice-main">{t('adviceThin')}</p>
                    )}
                    <p className="hint">{t('adviceCaveat')}</p>
                  </div>
                )}

                {/* 시간대: 하루 시간대 / 요일별 */}
                {current.key === 'time' && (
                  <div className="mode-switch period">
                    {(['시간대', '요일'] as TimeView[]).map((v) => (
                      <button
                        key={v}
                        className={timeView === v ? 'on' : ''}
                        onClick={() => setTimeView(v)}
                      >
                        {TIME_VIEW_LABEL[v][lang]}
                      </button>
                    ))}
                  </div>
                )}

                {/* 비교 표: 표본이 얇은 행 숨기기 */}
                {thinnable && (
                  <label className="hl-toggle">
                    <input
                      type="checkbox"
                      checked={hideThin}
                      onChange={(e) => setHideThin(e.target.checked)}
                    />
                    {t('hideThin')(COMPARE_MIN_GAMES)}
                  </label>
                )}

                <DataTable
                  tab={shownTab ?? current}
                  lang={lang}
                  rowHl={
                    mode === 'compare' && hlOn ? makeRowHighlighter(current) : null
                  }
                  // 한 명 모드의 상대전적에서만 '비교 목록에 담기'가 성립한다
                  onCompare={mode === 'single' && single ? addPick : undefined}
                />
              </>
            )
          )}
        </>
      )}


      <footer>
        {t('footer1')}{' '}
        <a href="https://wank.wavu.wiki" target="_blank" rel="noreferrer">
          wank.wavu.wiki
        </a>{' '}
        {t('footer2')}
        <br />
        <span className="byline">by Jeremio, Jinho.ju@live.com</span>
        {visits && (
          <span className="byline visit-count">
            {' '}
            · 👁 {t('visitors')} {visits.total.toLocaleString()} ({t('todayLabel')}{' '}
            {visits.today.toLocaleString()})
          </span>
        )}
      </footer>
    </main>
  );
}
