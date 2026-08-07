'use client';

// /admin — 조회 기록 열람 (관리자 전용). 데이터 출처는 Google Analytics.
//
// 비밀번호는 화면에 담기지 않는다. 입력값을 서버로 보내 대조하고, 맞을 때만
// 서버가 데이터를 돌려준다. 즉 이 페이지 소스를 열어봐도 통계는 볼 수 없다.
// 비밀번호는 이 브라우저 세션에만 기억한다(탭을 닫으면 사라짐).

import { useEffect, useMemo, useState } from 'react';
import { TAB_LABELS } from '../i18n';
import { FEATURE_EVENTS, type FeatureEvent } from '@/lib/ga-events';
import { ADMIN_RANGES, ADMIN_RANGE_ALL_DAYS, adminRangeLabel } from '@/lib/admin-ranges';

interface PlayerRow {
  id: string;
  name: string;
  /** 실제 조회 건수(player_lookup 이벤트). 2026-08-04 이전 기간은 0 — lib/ga.ts 참조. */
  lookups: number;
  /** 페이지뷰. 탭·필터 조작까지 포함하므로 '탐색 깊이'다. */
  views: number;
  users: number;
  firstDate: string;
  lastDate: string;
  daysSeen: number;
  /**
   * 플레이어 인덱스(lib/tekken/player-index.ts) 기준 메인 캐릭터. 그 인덱스는
   * 500판 이상 수집된 사람만 담으므로, 여기 조회된 사람 전부가 아니라 그중
   * 인덱스 문턱을 넘긴 사람만 값이 있다 — 없으면 표본 미달이라는 뜻(안 뜨면
   * 캐릭터가 없다는 뜻이 아니다).
   */
  mainChar?: string;
  mainCharGames?: number;
  /**
   * 같은 인덱스 기준 레이팅. **인덱스가 마지막 갱신된 시점 스냅샷**이라(매일
   * 자동 갱신이지만) 지금 이 순간 값과는 다를 수 있다 — mainChar 와 마찬가지로
   * 500판 미달이면 없다.
   */
  rating?: number;
  peakRating?: number;
}
interface DayRow {
  date: string;
  views: number;
  users: number;
}
interface SourceRow {
  source: string;
  users: number;
}
interface TabRow {
  key: string;
  views: number;
}
interface BreakdownRow {
  label: string;
  users: number;
}
interface Audience {
  devices: BreakdownRow[];
  countries: BreakdownRow[];
  languages: BreakdownRow[];
}
interface FeatureRow {
  name: FeatureEvent;
  count: number;
  users: number;
}
interface Stats {
  days: number;
  totalViews: number;
  uniquePlayers: number;
  players: PlayerRow[];
  daily: DayRow[];
  sources: SourceRow[];
  /** null = 이 리포트만 실패했다는 뜻. 나머지 화면은 정상이다 (API 라우트 주석 참조). */
  tabs: TabRow[] | null;
  audience: Audience | null;
  features: FeatureRow[] | null;
  reports: { views: number; users: number } | null;
  /**
   * 식별코드별 조회를 UI 언어(ko/en/ja)로 가른 것. null = GA4 맞춤 측정기준
   * (customEvent:ui_lang)을 아직 등록 안 했거나 리포트가 실패했다는 뜻 —
   * 등록 방법은 화면 안내문 참조.
   */
  langByPlayer: Record<string, Record<string, number>> | null;
  error?: string;
  setup?: boolean; // true = 환경변수/권한 등 설정이 덜 된 상태
}

/**
 * 이름 + 가로 막대 목록. 탭·기기·국가·언어가 전부 같은 모양이라 하나로 쓴다.
 * 관리자 전용 화면이라 차트 라이브러리를 들이지 않는다(메인의 DailyBars 와 같은 방침).
 */
function BarList({
  rows,
  unit,
}: {
  rows: { label: string; value: number }[];
  unit: string;
}) {
  if (!rows.length) return <p className="hint">데이터가 없습니다.</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div className="barlist-row" key={r.label}>
          <span className="barlist-label" title={r.label}>
            {r.label}
          </span>
          <span className="barlist-track">
            <span className="barlist-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="barlist-num">
            {r.value.toLocaleString()}
            {unit}
          </span>
          <span className="barlist-pct">
            {total ? ((r.value * 100) / total).toFixed(1) : '0.0'}%
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 정렬 기준을 바꾸는 표 헤더. 누르면 그 열 기준으로 정렬하고, 이미 그 열이면
 * 방향만 뒤집는다 — 화살표(▲▼)로 지금 기준·방향을 보여준다.
 */
function SortTh<K extends string>({
  sortKey,
  label,
  title,
  current,
  dir,
  onSort,
}: {
  sortKey: K;
  label: string;
  title?: string;
  current: K;
  dir: 'asc' | 'desc';
  onSort: (key: K) => void;
}) {
  const active = sortKey === current;
  return (
    <th
      className={`sortable${active ? ' sort-active' : ''}`}
      title={title}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (dir === 'asc' ? ' ▲' : ' ▼')}
    </th>
  );
}

const PW_KEY = 'tkwavu_admin_pw';

/** GA4 deviceCategory 값. 그 외 값이 오면 원문 그대로 보여준다. */
const DEVICE_KO: Record<string, string> = {
  mobile: '모바일',
  desktop: 'PC',
  tablet: '태블릿',
  smart_tv: 'TV',
};

/** CSV 한 칸 이스케이프 (쉼표·따옴표·줄바꿈이 든 닉네임 대비). */
function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 파일 내려받기.
 *
 * 예전 방식(앵커를 문서에 붙이지 않고 click 직후 revoke)은 브라우저가 아직 URL 을
 * 읽는 중에 그 URL 을 없애서, 클릭해도 아무 일이 안 일어나고 다시 누르게 만든다.
 * 메인 화면에서 같은 코드로 "다운로드 누르면 다운된다"는 제보를 받아 고쳤는데,
 * 이 화면에는 그대로 남아 있었다. app/page.tsx 의 downloadBlob 과 같은 방식으로 맞춘다.
 */
function download(content: BlobPart, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // 넉넉히 기다렸다 치운다 — 큰 파일은 브라우저가 읽는 데 시간이 걸린다.
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
}

/** KST 기준 파일명 도장. */
function stamp(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/**
 * 일별 조회수 막대. 관리자 전용 화면이라 외부 차트 없이 최소 SVG 로 그린다
 * (본문 차트와 색·두께 규칙은 맞춰둔다 — 승색 계열 대신 강조색 한 가지).
 */
function DailyBars({ rows }: { rows: DayRow[] }) {
  if (!rows.length) return <p className="hint">표시할 날짜가 없습니다.</p>;
  const asc = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const max = Math.max(...asc.map((d) => d.views), 1);
  const W = 720;
  const H = 160;
  const PAD = { l: 40, r: 10, t: 10, b: 24 };
  const band = (W - PAD.l - PAD.r) / asc.length;
  const barW = Math.min(24, Math.max(2, band - 2));
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const labelEvery = Math.max(1, Math.ceil(asc.length / 6));

  return (
    <div className="chart-root">
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label="일별 조회수">
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#2c2c2a" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#898781">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {asc.map((d, i) => {
          const x = PAD.l + i * band + (band - barW) / 2;
          const top = y(d.views);
          const rr = Math.min(3, barW / 2);
          return (
            <g key={d.date}>
              <path
                d={`M ${x} ${H - PAD.b} L ${x} ${top + rr}
                    Q ${x} ${top} ${x + rr} ${top}
                    L ${x + barW - rr} ${top}
                    Q ${x + barW} ${top} ${x + barW} ${top + rr}
                    L ${x + barW} ${H - PAD.b} Z`}
                fill="#3987e5"
              />
              <title>{`${d.date} · 조회 ${d.views} · 사용자 ${d.users}`}</title>
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="#898781">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function AdminPage() {
  const [pw, setPw] = useState('');
  const [days, setDays] = useState(28);
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  const [setupHelp, setSetupHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);

  const load = async (password: string, range: number) => {
    if (!password) return;
    setBusy(true);
    setErr('');
    setSetupHelp(false);
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, days: range }),
      });
      const d = (await res.json()) as Stats;
      if (!res.ok) {
        setSetupHelp(!!d.setup);
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setData(d);
      sessionStorage.setItem(PW_KEY, password);
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  // 세션 안에서 새로고침해도 다시 입력하지 않게
  useEffect(() => {
    const saved = sessionStorage.getItem(PW_KEY);
    if (saved) {
      setPw(saved);
      load(saved, 28);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = () => `tekken8stats_admin_${data?.days ?? days}d_${stamp()}`;

  const downloadCsv = () => {
    if (!data) return;
    const lines = [
      '#,마지막 조회,이름,메인,레이팅,식별코드,조회,페이지뷰,깊이,비율(%),사용자,첫 조회,조회일 수,패턴,언어',
    ];
    data.players.forEach((p, i) => {
      lines.push(
        [
          i + 1, p.lastDate, p.name || '', p.mainChar || '', p.rating ?? '', p.id, p.lookups,
          p.views, depth(p), pct(p.views), p.users, p.firstDate, p.daysSeen, pattern(p),
          langLabel(p.id),
        ].map(csvCell).join(','),
      );
    });
    // BOM: 엑셀에서 한글이 깨지지 않게
    download('﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8', `${base()}.csv`);
  };

  const downloadJson = () => {
    if (!data) return;
    download(JSON.stringify(data, null, 1), 'application/json', `${base()}.json`);
  };

  /** 엑셀은 서버에서 만든다 (exceljs). 비밀번호가 URL 에 남지 않게 POST 로 받는다. */
  const downloadXlsx = async () => {
    if (!data) return;
    setDlBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, days: data.days }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      download(await res.arrayBuffer(), res.headers.get('Content-Type') ?? '', `${base()}.xlsx`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDlBusy(false);
    }
  };

  const pickRange = (r: number) => {
    setDays(r);
    if (data || pw) load(pw, r);
  };

  const pct = (n: number) =>
    data?.totalViews ? ((n * 100) / data.totalViews).toFixed(1) : '0.0';

  /**
   * 조회 1건당 화면을 몇 번 만졌나로 ID 를 세 갈래로 나눈다.
   * 조회 수가 0 인 ID(이벤트 이전 기간)는 나눌 수가 없어 통째로 뺀다 —
   * 0 을 '얕게 봤다'로 세면 과거 기간이 전부 이탈로 보인다.
   */
  const depthBands = (() => {
    const rows = (data?.players ?? []).filter((p) => p.lookups > 0);
    let shallow = 0;
    let mid = 0;
    let deep = 0;
    for (const p of rows) {
      const d = p.views / p.lookups;
      if (d < 3) shallow++;
      else if (d < 10) mid++;
      else deep++;
    }
    return { shallow, mid, deep, total: rows.length };
  })();

  /**
   * 조회 패턴 추정. 조회된 ID 가 방문자 본인인지 남인지는 알 수 없지만,
   * '몇 명이 봤는지'가 갈라주는 신호가 된다 — 확정이 아니라 추정임을 라벨로 드러낸다.
   */
  const pattern = (p: PlayerRow): string => {
    if (p.users >= 3) return '여러 명';
    if (p.users >= 2) return '2명';
    // 조회는 한 번인데 화면을 여러 번 만졌으면 '반복'이 아니라 '깊게 봤다'가 맞다.
    if (p.lookups >= 2) return '1명 반복';
    if (p.views >= 10) return '1명 정독';
    return '1회성';
  };

  /** 조회 1건당 화면을 몇 번 만졌나. 조회 수가 0(과거 기간)이면 낼 수 없다. */
  const depth = (p: PlayerRow): string =>
    p.lookups > 0 ? (p.views / p.lookups).toFixed(1) : '—';

  /**
   * 이 ID 가 어느 UI 언어로 조회됐는지. 언어별 조회 수를 큰 순서로 나열한다
   * (예: "ko 3 · en 1"). langByPlayer 가 null 이면(맞춤 측정기준 미등록)
   * 표 전체가 '—'로 남는다 — 위 안내문이 이유를 설명한다.
   */
  const langLabel = (id: string): string => {
    const rec = data?.langByPlayer?.[id];
    if (!rec) return '—';
    const entries = Object.entries(rec).sort((a, b) => b[1] - a[1]);
    return entries.length ? entries.map(([l, c]) => `${l} ${c}`).join(' · ') : '—';
  };

  // ── 표 정렬 ──────────────────────────────────────────────────────
  // 여러 방법으로 훑어보고 싶다는 요청 — 헤더를 눌러 기준을 바꾼다.
  // 기본값(마지막 조회 · 내림차순)은 지금까지의 화면과 같다.
  const sortableColumns = [
    'lastDate', 'name', 'mainChar', 'rating', 'id', 'lookups', 'depth', 'pct', 'users',
    'firstDate', 'daysSeen', 'pattern',
  ] as const;
  type SortKey = (typeof sortableColumns)[number];
  const [sortKey, setSortKey] = useState<SortKey>('lastDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      // 대부분은 '큰 게 먼저'가 자연스럽다(조회 많은 순·최근 순 …).
      // 이름·식별코드·메인 캐릭터만 가나다순이 자연스러워 오름차순으로 시작한다.
      setSortDir(key === 'name' || key === 'id' || key === 'mainChar' ? 'asc' : 'desc');
    }
  };

  // 문자열이 아닌 열(패턴·깊이)은 정렬용 숫자값이 따로 필요하다.
  // pattern() 이 뱉는 라벨 자체는 순서가 없으므로, '더 눈에 띄는 패턴'이
  // 위로 오도록 그 함수가 판정하는 순서(여러 명 → … → 1회성)를 그대로 등급화한다.
  const PATTERN_RANK: Record<string, number> = {
    '여러 명': 4,
    '2명': 3,
    '1명 반복': 2,
    '1명 정독': 1,
    '1회성': 0,
  };
  const depthNum = (p: PlayerRow) => (p.lookups > 0 ? p.views / p.lookups : -1);

  const sortedPlayers = useMemo(() => {
    const rows = data?.players ?? [];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = (a.name || a.id).localeCompare(b.name || b.id);
          break;
        // 표본 미달로 값이 없는 행은 방향과 무관하게 늘 뒤로 보낸다 — 오름차순일 때
        // 빈 문자열이 맨 앞으로 오면 "메인 캐릭터 없음"이 1등처럼 보인다. 아래 return 에서
        // cmp * dir 을 곱하므로, 여기서 dir 을 미리 곱해둬야 그 반전을 상쇄해서 항상
        // 같은 쪽(끝)으로 간다.
        case 'mainChar': {
          if (!a.mainChar && !b.mainChar) cmp = 0;
          else if (!a.mainChar) cmp = dir;
          else if (!b.mainChar) cmp = -dir;
          else cmp = a.mainChar.localeCompare(b.mainChar);
          break;
        }
        // 레이팅도 mainChar 와 같은 표본(500판 이상)이라 값 없는 행이 있다 —
        // 같은 방식으로 방향 무관 뒤로 보낸다. 숫자 0 을 "값 없음"과 헷갈리지
        // 않게 undefined 로만 판정한다(레이팅 0은 실제로 안 나오지만 원칙상).
        case 'rating': {
          if (a.rating == null && b.rating == null) cmp = 0;
          else if (a.rating == null) cmp = dir;
          else if (b.rating == null) cmp = -dir;
          else cmp = a.rating - b.rating;
          break;
        }
        case 'id':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'lookups':
          cmp = a.lookups - b.lookups;
          break;
        case 'depth':
          cmp = depthNum(a) - depthNum(b);
          break;
        // pct 는 views ÷ totalViews 라 totalViews 가 같은 모든 행에서 views 와
        // 순서가 늘 같다 — 그대로 views 로 비교한다.
        case 'pct':
          cmp = a.views - b.views;
          break;
        case 'users':
          cmp = a.users - b.users;
          break;
        case 'firstDate':
          cmp = a.firstDate < b.firstDate ? -1 : a.firstDate > b.firstDate ? 1 : 0;
          break;
        case 'lastDate':
          cmp = a.lastDate < b.lastDate ? -1 : a.lastDate > b.lastDate ? 1 : 0;
          break;
        case 'daysSeen':
          cmp = a.daysSeen - b.daysSeen;
          break;
        case 'pattern':
          cmp = (PATTERN_RANK[pattern(a)] ?? 0) - (PATTERN_RANK[pattern(b)] ?? 0);
          break;
      }
      return cmp * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sortKey, sortDir]);

  const sortProps = { current: sortKey, dir: sortDir, onSort: toggleSort };

  return (
    <main>
      <div className="titlebar">
        <h1>
          <a className="home-btn" href="/">
            철권8 전적 통계
          </a>{' '}
          <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>관리자</span>
        </h1>
      </div>

      <div className="panel">
        <label htmlFor="pw">관리자 비밀번호</label>
        <div className="row id-row">
          <input
            id="pw"
            className="id-input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && load(pw, days)}
            autoComplete="current-password"
          />
          <button onClick={() => load(pw, days)} disabled={busy}>
            {busy ? '불러오는 중…' : '열람'}
          </button>
          {data && (
            <button
              className="ghost"
              onClick={() => {
                sessionStorage.removeItem(PW_KEY);
                setData(null);
                setPw('');
              }}
            >
              잠금
            </button>
          )}
        </div>

        <label style={{ marginTop: '0.8rem' }}>기간</label>
        <div className="mode-switch period">
          {ADMIN_RANGES.map((r) => (
            <button key={r} className={days === r ? 'on' : ''} onClick={() => pickRange(r)}>
              {adminRangeLabel(r)}
            </button>
          ))}
        </div>
        {days === ADMIN_RANGE_ALL_DAYS && (
          <p className="hint" style={{ marginTop: '0.3rem' }}>
            &lsquo;전체&rsquo;는 최근 10년을 불러옵니다 — 사이트 나이보다 넉넉히 커서
            사실상 서비스 시작부터입니다. 기간이 넓을수록 응답이 느릴 수 있습니다.
          </p>
        )}

        {err && <p className="error">{err}</p>}
        {setupHelp && (
          <div className="hint" style={{ lineHeight: 1.7 }}>
            Google Analytics 연결이 필요합니다:
            <br />
            1. Google Cloud Console → <b>Google Analytics Data API</b> 사용 설정
            <br />
            2. 서비스 계정 생성 → JSON 키 발급
            <br />
            3. GA4 → 관리 → <b>속성 액세스 관리</b> → 그 서비스 계정 이메일을 <b>뷰어</b>로 추가
            <br />
            4. Vercel 환경변수에 <code>GA_PROPERTY_ID</code>(숫자 속성 ID) 와{' '}
            <code>GA_SERVICE_ACCOUNT</code>(JSON 전체) 등록
          </div>
        )}
      </div>

      {data && (
        <>
          <div className="sum-card">
            <div className="sum-block">
              <span className="sum-label">조회수</span>
              <span className="sum-value">{data.totalViews.toLocaleString()}</span>
            </div>
            <div className="sum-block">
              <span className="sum-label">조회된 플레이어</span>
              <span className="sum-value">{data.uniquePlayers.toLocaleString()}</span>
            </div>
            <div className="sum-block">
              <span className="sum-label">기간</span>
              <span className="sum-value sum-date">
                {data.days === ADMIN_RANGE_ALL_DAYS
                  ? '전체 기간'
                  : `최근 ${adminRangeLabel(data.days)}`}
              </span>
            </div>
          </div>

          <h2 className="admin-h2">일별 유입</h2>
          <DailyBars rows={data.daily} />

          {/* ── 얼마나 파고드나 ──────────────────────────────────────
              조회만 세면 "왔다"까지밖에 모른다. 조회 한 건당 화면을 몇 번 만졌는지로
              나누면 그냥 결과만 보고 나간 쪽과 끝까지 판 쪽이 갈린다. */}
          <h2 className="admin-h2">얼마나 파고드나</h2>
          {depthBands.total > 0 ? (
            <>
              <BarList
                rows={[
                  { label: '1~2회 (결과만 보고 나감)', value: depthBands.shallow },
                  { label: '3~9회 (탭 몇 개 열어봄)', value: depthBands.mid },
                  { label: '10회 이상 (끝까지 팜)', value: depthBands.deep },
                ]}
                unit="명"
              />
              <p className="hint">
                조회된 ID {depthBands.total.toLocaleString()}개 기준. 값은 페이지뷰 ÷ 조회라서,
                조회 수가 쌓이기 시작한 2026-08-04 이후 기간에서만 뜻이 있습니다.
              </p>
            </>
          ) : (
            <p className="hint">
              조회 수(player_lookup)가 아직 없는 기간입니다 — 2026-08-04 배포부터 쌓입니다.
            </p>
          )}

          {/* ── 어느 탭을 여나 ────────────────────────────────────────
              탭이 15개다. 아무도 안 여는 게 있으면 지울 근거가 되고, 늘 열리는 게
              있으면 기본으로 열어줄 근거가 된다. */}
          <h2 className="admin-h2">어느 탭을 여나</h2>
          {data.tabs === null ? (
            <p className="hint">이 리포트만 실패했습니다 (나머지 수치는 정상입니다).</p>
          ) : (
            <BarList
              rows={data.tabs.map((t) => ({
                label: TAB_LABELS[t.key]?.ko ?? t.key,
                value: t.views,
              }))}
              unit=""
            />
          )}

          {/* ── 어느 기능을 쓰나 ─────────────────────────────────────
              탭 열람은 위에서 보지만, 버튼으로 들어가는 기능(무작위·리포트·공유·
              내려받기)은 주소가 안 바뀌어서 페이지뷰로는 잡히지 않는다.
              한 번도 안 쓰인 기능도 0 으로 남긴다 — 목록에서 사라지면 '안 쓰인다'는
              사실 자체가 안 보인다. */}
          <h2 className="admin-h2">어느 기능을 쓰나</h2>
          {/* 리포트만 따로 먼저 보여준다 — 별도 페이지라서 페이지뷰로 이미 쌓여 있고,
              그래서 이벤트를 붙이기 전 기간에도 값이 나온다. 아래 이벤트 목록은
              이번 배포부터라 둘을 나란히 두면 '왜 하나만 0 인가'로 헷갈린다. */}
          {data.reports && (
            <p className="hint" style={{ marginTop: 0 }}>
              <b>리포트 열람 {data.reports.views.toLocaleString()}회</b>
              {data.reports.users > 0 && ` · 최소 ${data.reports.users.toLocaleString()}명`} —
              별도 페이지라 페이지뷰로 세며 <b>과거 기간도 나옵니다</b>. 공유 링크로 바로
              들어오거나 새로고침한 것까지 포함하므로, 아래 &lsquo;리포트 보기&rsquo;
              (버튼을 누른 횟수)보다 큽니다. 둘의 차이가 링크를 타고 온 사람입니다.
            </p>
          )}
          {data.features === null ? (
            <p className="hint">이 리포트만 실패했습니다 (나머지 수치는 정상입니다).</p>
          ) : data.features.every((f) => f.count === 0) ? (
            <p className="hint">
              아직 기록이 없습니다. 이 이벤트는 2026-08-04 배포부터 쌓이므로, 그 이전
              기간을 보고 있다면 0 이 정상입니다 (안 쓰였다는 뜻이 아닙니다).
            </p>
          ) : (
            <>
              <BarList
                rows={data.features.map((f) => ({
                  label: FEATURE_EVENTS[f.name],
                  value: f.count,
                }))}
                unit="회"
              />
              <p className="hint">
                쓴 사람 수:{' '}
                {data.features
                  .filter((f) => f.users > 0)
                  .map((f) => `${FEATURE_EVENTS[f.name]} ${f.users}명`)
                  .join(' · ') || '없음'}
              </p>
            </>
          )}

          {/* ── 누가 보나 ────────────────────────────────────────────
              모바일 비중과 나라·언어. 레이아웃과 번역을 어디에 맞출지의 근거다. */}
          <h2 className="admin-h2">누가 보나</h2>
          {data.audience === null ? (
            <p className="hint">이 리포트만 실패했습니다 (나머지 수치는 정상입니다).</p>
          ) : (
            <div className="aud-grid">
              <div>
                <h3 className="admin-h3">기기</h3>
                <BarList
                  rows={data.audience.devices.map((r) => ({
                    label: DEVICE_KO[r.label] ?? r.label,
                    value: r.users,
                  }))}
                  unit="명"
                />
              </div>
              <div>
                <h3 className="admin-h3">국가</h3>
                <BarList
                  rows={data.audience.countries.map((r) => ({ label: r.label, value: r.users }))}
                  unit="명"
                />
              </div>
              <div>
                <h3 className="admin-h3">브라우저 언어</h3>
                <BarList
                  rows={data.audience.languages.map((r) => ({ label: r.label, value: r.users }))}
                  unit="명"
                />
                <p className="hint">
                  브라우저 설정값이라 이 사이트에서 고른 언어와 다를 수 있습니다.
                </p>
              </div>
            </div>
          )}

          <div className="row dl-row">
            <button className="ghost" onClick={downloadCsv}>
              📄 CSV (플레이어 목록)
            </button>
            <button className="ghost" onClick={downloadJson}>
              🧾 JSON (전체)
            </button>
            <button className="ghost" onClick={downloadXlsx} disabled={dlBusy}>
              {dlBusy ? '만드는 중…' : '📥 엑셀 (전체 시트)'}
            </button>
          </div>

          <h2 className="admin-h2">
            조회된 플레이어 ({data.players.length})
            <span className="hint" style={{ marginLeft: '0.5rem', fontWeight: 400 }}>
              헤더를 누르면 그 기준으로 정렬됩니다
            </span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <SortTh sortKey="lastDate" label="마지막" {...sortProps} />
                  <SortTh sortKey="name" label="이름" {...sortProps} />
                  <SortTh
                    sortKey="mainChar"
                    label="메인"
                    title="플레이어 인덱스 기준 메인 캐릭터 — 500판 이상 수집된 사람만 있음(없으면 표본 미달)"
                    {...sortProps}
                  />
                  <SortTh
                    sortKey="rating"
                    label="레이팅"
                    title="플레이어 인덱스 스냅샷 기준 레이팅 — 메인 캐릭터와 같은 표본·같은 시점(없으면 표본 미달, 지금 이 순간 값이 아님)"
                    {...sortProps}
                  />
                  <SortTh sortKey="id" label="식별코드" {...sortProps} />
                  <SortTh
                    sortKey="lookups"
                    label="조회"
                    title="player_lookup 이벤트 — 실제로 조회된 횟수"
                    {...sortProps}
                  />
                  <SortTh
                    sortKey="depth"
                    label="깊이"
                    title="페이지뷰 ÷ 조회 — 조회 한 번에 화면을 몇 번 만졌나"
                    {...sortProps}
                  />
                  <SortTh sortKey="pct" label="비율" {...sortProps} />
                  <SortTh sortKey="users" label="사용자" {...sortProps} />
                  <SortTh sortKey="firstDate" label="첫 조회" {...sortProps} />
                  <SortTh sortKey="daysSeen" label="조회일" {...sortProps} />
                  <SortTh sortKey="pattern" label="패턴" {...sortProps} />
                  <th title="어느 UI 언어(한국어/English/日本語)로 조회했나 — 언어별 조회 수, 많은 순">
                    언어
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td>{p.lastDate?.slice(5) ?? ''}</td>
                    <td>
                      <a
                        className="plink"
                        href={`/player/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {p.name}
                      </a>
                    </td>
                    <td title={p.mainCharGames ? `${p.mainCharGames.toLocaleString()}판` : undefined}>
                      {p.mainChar ?? '—'}
                    </td>
                    <td title={p.peakRating ? `최고 ${p.peakRating.toLocaleString()}` : undefined}>
                      {p.rating != null ? p.rating.toLocaleString() : '—'}
                    </td>
                    <td>{p.id}</td>
                    <td>{p.lookups || '—'}</td>
                    <td>{depth(p)}</td>
                    <td>{pct(p.views)}%</td>
                    <td>{p.users}</td>
                    <td>{p.firstDate?.slice(5) ?? ''}</td>
                    <td>{p.daysSeen}</td>
                    <td>{pattern(p)}</td>
                    <td>{langLabel(p.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.players.length === 0 && (
            <p className="hint">이 기간에 조회된 플레이어가 없습니다.</p>
          )}
          {data.langByPlayer === null && (
            <p className="hint" style={{ lineHeight: 1.7 }}>
              &lsquo;언어&rsquo; 열은 GA4 맞춤 측정기준을 등록해야 나옵니다:
              <br />
              GA4 → 관리 → 맞춤 정의 → 맞춤 측정기준 → 만들기 — 측정기준 이름은
              자유(예: UI Language), 범위는 <b>이벤트</b>, 이벤트 매개변수는{' '}
              <code>ui_lang</code>로 등록하세요.
              <br />
              등록한 시점부터 쌓이는 조회만 반영됩니다(예전 기록은 소급되지 않습니다).
            </p>
          )}

          <h2 className="admin-h2">유입 경로</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>출처 / 매체</th>
                  <th>사용자</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.source}>
                    <td>{s.source}</td>
                    <td>{s.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="admin-h2">일별</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>조회수</th>
                  <th>사용자</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.views}</td>
                    <td>{d.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <footer>
        <span className="byline">
          데이터 출처: Google Analytics · 비밀번호 없이는 전송되지 않으며 검색엔진에도 노출되지 않습니다.
        </span>
      </footer>
    </main>
  );
}
