'use client';

// 단일 화면: 식별코드(1명 or 여러 명) + 기간 → /api/replays | /api/compare → 탭 + 표.
// 표 렌더는 서버가 준 TabData 를 그대로 그린다(집계는 전부 서버).

import { useCallback, useEffect, useState } from 'react';

interface TabData {
  key: string;
  label: string;
  columns: string[];
  rows: (string | number | null)[][];
}

interface PlayerResponse {
  polarisId: string;
  myName: string;
  recordCount: number;
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

const WIN_LOSS_COLS = new Set(['result', 'result_for_a']);

function cellClass(col: string, v: string | number | null): string | undefined {
  if (!WIN_LOSS_COLS.has(col)) return undefined;
  if (v === 'W') return 'win';
  if (v === 'L') return 'loss';
  return undefined;
}

function DataTable({ tab }: { tab: TabData }) {
  // 레이팅 추이(와이드 표)는 행이 수천 개일 수 있어 최근 500행만 그린다.
  // 전체가 필요하면 엑셀로 받는 쪽이 낫다.
  const LIMIT = 500;
  const rows =
    tab.key === 'trend' && tab.rows.length > LIMIT
      ? tab.rows.slice(-LIMIT)
      : tab.rows;
  return (
    <>
      {tab.key === 'trend' && tab.rows.length > rows.length && (
        <p className="hint">
          최근 {LIMIT}경기만 표시 (전체 {tab.rows.length}건은 엑셀 다운로드로)
        </p>
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
            {rows.map((r, i) => (
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
      {rows.length === 0 && <p className="hint">표시할 행이 없습니다.</p>}
    </>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('single');
  const [id, setId] = useState('');
  const [ids, setIds] = useState(''); // 비교 모드: 쉼표/공백 구분
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [single, setSingle] = useState<PlayerResponse | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [activeTab, setActiveTab] = useState('');

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

  const period = useCallback(() => {
    const q = new URLSearchParams();
    if (start) q.set('start', start);
    if (end) q.set('end', end);
    return q;
  }, [start, end]);

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'single') {
        const q = period();
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
        const q = period();
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
  }, [mode, id, ids, period]);

  const xlsxHref = (() => {
    const q = period();
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

        <div className="row">
          <button onClick={run} disabled={loading}>
            {loading ? '수집 중…' : '조회'}
          </button>
          {xlsxHref && (
            <a className="btn-link ghost" href={xlsxHref}>
              📥 엑셀 다운로드
            </a>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <p className="hint">
          기간을 비우면 전체 이력. 첫 조회는 몇 초 걸릴 수 있습니다 (전체 전적을
          한 번에 받아옴 · 10분간 캐시).
        </p>
      </div>

      {single && (
        <p className="meta">
          <b>{single.myName || single.polarisId}</b> · {single.filtered?.count}
          경기
          {single.filtered?.start || single.filtered?.end
            ? ` (${single.filtered?.start ?? ''} ~ ${single.filtered?.end ?? ''}, 전체 ${single.recordCount}건)`
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
          {current && <DataTable tab={current} />}
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
