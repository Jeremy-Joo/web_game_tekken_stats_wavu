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
  error?: string;
}

type Mode = 'single' | 'compare';
type PeriodMode = 'all' | 'month' | 'year' | 'custom';

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

function DataTable({ tab }: { tab: TabData }) {
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
            {visible.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className={cellClass(tab.columns[j], v)}>
                    {v === null ? '' : v}
                  </td>
                ))}
              </tr>
            ))}
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

  // 마지막 조회 조건 기억 (재방문 시 편의)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tkwavu');
      if (saved) {
        const s = JSON.parse(saved) as { id?: string; ids?: string };
        if (s.id) setId(s.id);
        if (s.ids) setIds(s.ids);
      }
    } catch {
      /* ignore */
    }
  }, []);

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
        localStorage.setItem('tkwavu', JSON.stringify({ id: id.trim(), ids }));
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
        localStorage.setItem('tkwavu', JSON.stringify({ id, ids }));
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

  const baseName =
    mode === 'single'
      ? single?.myName || single?.polarisId || 'tekken'
      : compare?.players.map((p) => p.name).join('_vs_') || 'compare';

  const downloadCsv = () => {
    if (!current) return;
    downloadBlob(
      toCsv(current),
      'text/csv;charset=utf-8',
      `${baseName}_${current.key}.csv`,
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

  return (
    <main>
      <h1>철권8 전적 통계</h1>
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
            <div className="row">
              <input
                id="pid"
                type="text"
                placeholder="예: 5m6Lj5Jb6MfQ"
                value={id}
                onChange={(e) => setId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </>
        ) : (
          <>
            <label htmlFor="pids">식별코드 여러 개 (쉼표/공백 구분, 2~4명)</label>
            <div className="row">
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
            </div>
          </>
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

        <div className="row">
          <button onClick={run} disabled={loading}>
            {loading ? '수집 중…' : '조회'}
          </button>
        </div>
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
        <p className="meta">
          {compare.players.map((p, i) => (
            <span key={p.polarisId}>
              {i > 0 && ' vs '}
              <b>{p.name}</b> ({p.count})
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
              </div>
              {view === 'chart' ? (
                current.key === 'trend' ? (
                  <TrendChart rows={current.rows} />
                ) : current.key === 'daily' ? (
                  <DailyChart rows={current.rows} />
                ) : (
                  <SessionChart rows={current.rows} />
                )
              ) : (
                <DataTable tab={current} />
              )}
            </>
          ) : (
            current && <DataTable tab={current} />
          )}
        </>
      )}

      <footer>
        데이터:{' '}
        <a href="https://wank.wavu.wiki" target="_blank" rel="noreferrer">
          wank.wavu.wiki
        </a>{' '}
        (랭크전만 집계됨) · 이 사이트는 Bandai Namco 와 무관합니다
      </footer>
    </main>
  );
}
