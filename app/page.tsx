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
  type Lang,
} from './i18n';

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
  lang = 'ko',
}: {
  tab: TabData;
  rowHl?: ((row: (string | number | null)[]) => Set<number>) | null;
  lang?: Lang;
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
                <th key={c}>{c}</th>
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
                          <a
                            className="plink"
                            href={`/?id=${encodeURIComponent(pol)}`}
                            target="_blank"
                            rel="noreferrer"
                            title={pol}
                          >
                            {v}
                          </a>
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

  // 방문자 카운터 (세션당 1회만 증가)
  const [visits, setVisits] = useState<{ total: number; today: number } | null>(null);

  // 과거 버전이 저장해둔 값 정리 (입력 ID·관리자 비밀번호는 더 이상 저장하지 않는다)
  useEffect(() => {
    try {
      localStorage.removeItem('tkwavu');
      localStorage.removeItem('tkwavu_admin_pw');
      const l = localStorage.getItem(LANG_KEY) as Lang | null;
      if (l && ['ko', 'en', 'ja'].includes(l)) setLangState(l);
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
   * 12자리 영숫자(대시 허용)면 식별코드로 보고, 아니면 닉네임으로 wavu 검색.
   * 검색 결과가 정확히 1명이면 그 식별코드, 여러 명이면 후보를 돌려준다.
   */
  const resolveToken = async (
    tok: string,
  ): Promise<
    | { id: string; name?: string }
    | { choices: Favorite[] }
    | { error: string }
  > => {
    const stripped = tok.replace(/[^A-Za-z0-9]/g, '');
    if (/^[A-Za-z0-9]{12}$/.test(stripped)) return { id: stripped };
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

  /**
   * 조회. 입력칸의 각 항목(식별코드 또는 닉네임)을 resolveToken 으로 해석한 뒤 실행.
   * 닉네임이 여러 명과 일치하면 칩을 띄우고 멈춘다 — 칩 선택 시 해당 항목만 바꿔 재실행.
   * setState 반영 전에 재실행할 수 있도록 override 인자를 받는다.
   */
  const run = useCallback(
    async (overrideId?: string, overrideIds?: string, overrideChar?: string) => {
      const inputId = overrideId ?? id;
      const inputIds = overrideIds ?? ids;
      const charFilter = overrideChar !== undefined ? overrideChar : charSel;
      setLoading(true);
      setError('');
      setResults([]);
      setSearchMsg('');
      try {
        if (mode === 'single') {
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
          const res = await fetch(`/api/replays/${encodeURIComponent(r.id)}?${q}`);
          const data = (await res.json()) as PlayerResponse;
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setSingle(data);
          setCompare(null);
          setActiveTab((prev) => prev || (data.tabs[0]?.key ?? ''));
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
          setActiveTab(data.tabs[0]?.key ?? '');
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

  // 다른 창에서 /?id=<식별코드> 로 열렸을 때 자동 조회 (상대전적의 상대 클릭 등)
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const qid = new URLSearchParams(window.location.search).get('id');
    if (qid) {
      setId(qid);
      run(qid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <p className="hint">{t('firstHint')}</p>
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
              <a className="btn-link ghost" href={xlsxHref}>
                {t('xlsxBtn')}
              </a>
            )}
            <button className="ghost" onClick={downloadCsv}>
              {t('csvBtn')}
            </button>
            <button className="ghost" onClick={downloadJson}>
              {t('jsonBtn')}
            </button>
          </div>

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
              <DataTable
                tab={current}
                lang={lang}
                rowHl={
                  mode === 'compare' && hlOn ? makeRowHighlighter(current) : null
                }
              />
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
