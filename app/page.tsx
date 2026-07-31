'use client';

// 단일 화면: 식별코드(1명 or 여러 명) + 기간 → /api/replays | /api/compare → 탭 + 표.
// 표 렌더는 서버가 준 TabData 를 그대로 그린다(집계는 전부 서버).
// 레이팅 추이 탭만 클라이언트에서 SVG 그래프를 추가로 그린다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendChart, DailyChart, SessionChart } from './charts';

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
  stats?: { total: number; kept: number; dropped: number; dupes: number };
  filtered?: { start: string | null; end: string | null; count: number };
  error?: string;
}

interface CompareResponse {
  players: { polarisId: string; name: string; count: number }[];
  tabs: TabData[];
  filtered?: { start: string | null; end: string | null };
  error?: string;
}

type Mode = 'single' | 'compare';
type PeriodMode = 'all' | 'month' | 'year' | 'custom';

/** 닉네임 검색 결과 항목. */
interface Favorite {
  id: string;
  name: string;
}

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
function toCsv(tab: TabData): string {
  const esc = (v: string | number | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [tab.columns.map(esc).join(',')];
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

type DailyGran = 'day' | 'month' | 'quarter' | 'half' | 'year';

const GRAN_LABEL: Record<DailyGran, string> = {
  day: '일별',
  month: '월별',
  quarter: '분기별',
  half: '반기별',
  year: '연별',
};

function periodKey(date: string, g: DailyGran): string {
  if (g === 'day') return date;
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  if (g === 'month') return date.slice(0, 7);
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  if (g === 'half') return `${y}-H${m <= 6 ? 1 : 2}`;
  return y;
}

/** 일별 데이터가 걸친 범위에 맞는 집계 단위만 제시 (2개 그룹 이상 생길 때만). */
function granOptions(tab: TabData): DailyGran[] {
  const dates = tab.rows.map((r) => String(r[0]));
  const opts: DailyGran[] = ['day'];
  for (const g of ['month', 'quarter', 'half', 'year'] as DailyGran[]) {
    if (new Set(dates.map((d) => periodKey(d, g))).size >= 2) opts.push(g);
  }
  return opts;
}

function rollupDaily(tab: TabData, g: DailyGran): TabData {
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
    const p = periodKey(date, g);
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
}: {
  tab: TabData;
  rowHl?: ((row: (string | number | null)[]) => Set<number>) | null;
}) {
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

  return (
    <>
      {searchable && (
        <div className="table-tools">
          <input
            type="text"
            placeholder="🔍 검색 (이름·캐릭터·날짜…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="hint">
            {query ? `${filtered.length}건 일치 / ` : ''}전체 {tab.rows.length}행
          </span>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {tab.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const hl = rowHl ? rowHl(r) : null;
              return (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td
                      key={j}
                      className={
                        [cellClass(tab.columns[j], v), hl?.has(j) ? 'hl' : undefined]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      {v === null ? '' : v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="row">
          <button className="ghost" onClick={() => setLimit((n) => n + ROW_CHUNK * 2)}>
            더 보기 ({limit} / {filtered.length})
          </button>
        </div>
      )}
      {visible.length === 0 && <p className="hint">표시할 행이 없습니다.</p>}
    </>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('single');
  const [id, setId] = useState('');
  const [ids, setIds] = useState(''); // 비교 모드: 쉼표/공백 구분
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
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

  // 비교 표 우위 하이라이트 on/off
  const [hlOn, setHlOn] = useState(true);

  // 닉네임 → 식별코드 검색
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [results, setResults] = useState<Favorite[]>([]);

  const doSearch = async () => {
    const query = q.trim();
    if (!query) return;
    setSearching(true);
    setSearchMsg('');
    setResults([]);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as {
        results?: Favorite[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const found = data.results ?? [];
      if (found.length === 0) {
        setSearchMsg(`'${query}' 검색 결과가 없습니다.`);
      } else if (found.length === 1) {
        // 한 명이면 바로 식별코드 입력칸에 반영
        pickFav(found[0]);
        setQ('');
        setSearchMsg(`${found[0].name} (${found[0].id}) 입력됨`);
      } else {
        setResults(found); // 여러 명이면 칩으로 골라서 반영
      }
    } catch (e) {
      setSearchMsg((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  // 과거 버전이 저장해둔 값 정리 (입력 ID·관리자 비밀번호는 더 이상 저장하지 않는다)
  useEffect(() => {
    try {
      localStorage.removeItem('tkwavu');
      localStorage.removeItem('tkwavu_admin_pw');
    } catch {
      /* ignore */
    }
  }, []);

  /** 칩 탭 → 모드에 맞게 입력칸에 바로 채운다 (비교 모드는 뒤에 덧붙임). */
  const pickFav = (f: Favorite) => {
    if (mode === 'single') {
      setId(f.id);
    } else {
      setIds((prev) => {
        const list = prev
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.includes(f.id)) return prev;
        return [...list, f.id].join(', ');
      });
    }
  };


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
    }
    return q;
  }, [periodMode, month, year, start, end]);

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'single') {
        const q = periodQuery();
        const res = await fetch(
          `/api/replays/${encodeURIComponent(id.trim())}?${q}`,
        );
        const data = (await res.json()) as PlayerResponse;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setSingle(data);
        setCompare(null);
        setActiveTab(data.tabs[0]?.key ?? '');
      } else {
        const list = ids
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(',');
        const q = periodQuery();
        q.set('ids', list);
        const res = await fetch(`/api/compare?${q}`);
        const data = (await res.json()) as CompareResponse;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setCompare(data);
        setSingle(null);
        setActiveTab(data.tabs[0]?.key ?? '');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, id, ids, periodQuery]);

  const xlsxHref = (() => {
    const q = periodQuery();
    if (mode === 'single' && single) {
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

  // 일별 탭: 조회 범위가 넓으면 월/분기/반기/연 집계 단위 제공
  const dailyOpts = current?.key === 'daily' ? granOptions(current) : null;
  const effGran: DailyGran =
    dailyOpts && dailyOpts.includes(dailyGran) ? dailyGran : 'day';
  const displayTab =
    current?.key === 'daily' ? rollupDaily(current, effGran) : current;

  const baseName =
    mode === 'single'
      ? single?.myName || single?.polarisId || 'tekken'
      : compare?.players.map((p) => p.name).join('_vs_') || 'compare';

  const downloadCsv = () => {
    if (!displayTab) return;
    downloadBlob(
      toCsv(displayTab),
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
      <h1>
        <button className="home-btn" onClick={goHome} title="메인으로">
          철권8 전적 통계
        </button>
      </h1>
      <p className="sub">
        wavu wank 랭크전 데이터 · 식별코드만 넣으면 전체 이력을 집계합니다
      </p>

      <div className="mode-switch">
        <button
          className={mode === 'single' ? 'on' : ''}
          onClick={() => setMode('single')}
        >
          한 명
        </button>
        <button
          className={mode === 'compare' ? 'on' : ''}
          onClick={() => setMode('compare')}
        >
          여러 명 비교
        </button>
      </div>

      <div className="panel">
        {mode === 'single' ? (
          <>
            <label htmlFor="pid">식별코드 (polaris ID)</label>
            <div className="row id-row">
              <input
                id="pid"
                className="id-input"
                type="text"
                placeholder="예: 5m6Lj5Jb6MfQ"
                value={id}
                onChange={(e) => setId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button onClick={run} disabled={loading}>
                {loading ? '수집 중…' : '조회'}
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="pids">식별코드 여러 개 (쉼표/공백 구분, 2~4명)</label>
            <div className="row id-row">
              <input
                id="pids"
                type="text"
                placeholder="예: 5m6Lj5Jb6MfQ, 2e2dtbDNeiTG"
                value={ids}
                onChange={(e) => setIds(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button onClick={run} disabled={loading}>
                {loading ? '수집 중…' : '조회'}
              </button>
            </div>
          </>
        )}

        <label htmlFor="nickq" style={{ marginTop: '0.8rem' }}>
          식별코드를 모르면 — 닉네임으로 검색
        </label>
        <div className="row id-row">
          <input
            id="nickq"
            className="id-input"
            type="text"
            placeholder="예: JackFather"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !searching && doSearch()}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="ghost" onClick={doSearch} disabled={searching}>
            {searching ? '검색 중…' : '검색'}
          </button>
        </div>
        {searchMsg && <p className="hint">{searchMsg}</p>}
        {results.length > 0 && (
          <div className="fav-chips">
            {results.map((r) => (
              <button
                key={r.id}
                className="chip"
                title={r.id}
                onClick={() => {
                  pickFav(r);
                  setResults([]);
                  setQ('');
                }}
              >
                {r.name} <span className="chip-id">{r.id}</span>
              </button>
            ))}
          </div>
        )}

        <label style={{ marginTop: '0.8rem' }}>조회 기간</label>
        <div className="mode-switch period">
          {(
            [
              ['all', '전체'],
              ['month', '월별'],
              ['year', '연별'],
              ['custom', '직접입력'],
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
        {periodMode === 'custom' && (
          <div className="row">
            <span>
              <label htmlFor="start">시작일</label>
              <input
                id="start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </span>
            <span>
              <label htmlFor="end">종료일</label>
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
        <p className="hint">
          첫 조회는 몇 초 걸릴 수 있습니다 (전체 전적을 한 번에 받아옴 · 10분간
          캐시).
        </p>
      </div>

      {single && (
        <p className="meta">
          <b>{single.myName || single.polarisId}</b> · {single.filtered?.count}
          경기
          {single.filtered?.start || single.filtered?.end
            ? ` (${single.filtered?.start ?? ''} ~ ${single.filtered?.end ?? ''}, 전체 ${single.totalCount}건)`
            : ''}
          {single.firstDt ? ` · ${single.firstDt.slice(0, 10)} ~ ${single.lastDt?.slice(0, 10)}` : ''}
          {single.stats && single.stats.dropped > 0
            ? ` · 제외 ${single.stats.dropped}건`
            : ''}
        </p>
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
              <a className="btn-link ghost" href={xlsxHref}>
                📥 엑셀 (전체 탭)
              </a>
            )}
            <button className="ghost" onClick={downloadCsv}>
              📄 CSV (현재 탭)
            </button>
            <button className="ghost" onClick={downloadJson}>
              🧾 JSON (전체)
            </button>
          </div>

          <div className="tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={t.key === (current?.key ?? '') ? 'on' : ''}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
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
                우위 항목 하이라이트
              </label>
              <span className="hl-period">
                기간:{' '}
                {compare?.filtered?.start || compare?.filtered?.end
                  ? `${compare?.filtered?.start ?? '처음'} ~ ${compare?.filtered?.end ?? '오늘'}`
                  : '전체'}
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
                  그래프
                </button>
                <button
                  className={view === 'table' ? 'on' : ''}
                  onClick={() => setView('table')}
                >
                  표
                </button>
                {dailyOpts && dailyOpts.length > 1 && (
                  <>
                    <span className="gran-sep" />
                    {dailyOpts.map((g) => (
                      <button
                        key={g}
                        className={effGran === g ? 'on' : ''}
                        onClick={() => setDailyGran(g)}
                      >
                        {GRAN_LABEL[g]}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {view === 'chart' ? (
                current.key === 'trend' ? (
                  <TrendChart rows={current.rows} />
                ) : current.key === 'daily' ? (
                  <DailyChart rows={displayTab!.rows} />
                ) : (
                  <SessionChart rows={current.rows} />
                )
              ) : (
                <DataTable tab={displayTab ?? current} />
              )}
            </>
          ) : (
            current && (
              <DataTable
                tab={current}
                rowHl={
                  mode === 'compare' && hlOn ? makeRowHighlighter(current) : null
                }
              />
            )
          )}
        </>
      )}


      <footer>
        데이터:{' '}
        <a href="https://wank.wavu.wiki" target="_blank" rel="noreferrer">
          wank.wavu.wiki
        </a>{' '}
        (랭크전만 집계됨) · 이 사이트는 Bandai Namco 와 무관합니다
        <br />
        <span className="byline">by Jeremio, Jinho.ju@live.com</span>
      </footer>
    </main>
  );
}
