'use client';

// /admin — 조회 기록 열람 (관리자 전용). 데이터 출처는 Google Analytics.
//
// 비밀번호는 화면에 담기지 않는다. 입력값을 서버로 보내 대조하고, 맞을 때만
// 서버가 데이터를 돌려준다. 즉 이 페이지 소스를 열어봐도 통계는 볼 수 없다.
// 비밀번호는 이 브라우저 세션에만 기억한다(탭을 닫으면 사라짐).

import { useEffect, useState } from 'react';
import { TAB_LABELS } from '../i18n';

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

const PW_KEY = 'tkwavu_admin_pw';
const RANGES = [7, 28, 90, 365];

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
      '#,이름,식별코드,조회,페이지뷰,깊이,비율(%),사용자,첫 조회,마지막 조회,조회일 수,패턴',
    ];
    data.players.forEach((p, i) => {
      lines.push(
        [
          i + 1, p.name || '', p.id, p.lookups, p.views, depth(p), pct(p.views), p.users,
          p.firstDate, p.lastDate, p.daysSeen, pattern(p),
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
          {RANGES.map((r) => (
            <button key={r} className={days === r ? 'on' : ''} onClick={() => pickRange(r)}>
              {r === 365 ? '1년' : `${r}일`}
            </button>
          ))}
        </div>

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
                최근 {data.days === 365 ? '1년' : `${data.days}일`}
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

          <h2 className="admin-h2">조회된 플레이어 ({data.players.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>이름</th>
                  <th>식별코드</th>
                  <th title="player_lookup 이벤트 — 실제로 조회된 횟수">조회</th>
                  <th title="페이지뷰 ÷ 조회 — 조회 한 번에 화면을 몇 번 만졌나">깊이</th>
                  <th>비율</th>
                  <th>사용자</th>
                  <th>첫 조회</th>
                  <th>마지막</th>
                  <th>조회일</th>
                  <th>패턴</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
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
                    <td>{p.id}</td>
                    <td>{p.lookups || '—'}</td>
                    <td>{depth(p)}</td>
                    <td>{pct(p.views)}%</td>
                    <td>{p.users}</td>
                    <td>{p.firstDate?.slice(5) ?? ''}</td>
                    <td>{p.lastDate?.slice(5) ?? ''}</td>
                    <td>{p.daysSeen}</td>
                    <td>{pattern(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.players.length === 0 && (
            <p className="hint">이 기간에 조회된 플레이어가 없습니다.</p>
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
