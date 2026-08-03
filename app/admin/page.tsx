'use client';

// /admin — 조회 기록 열람 (관리자 전용). 데이터 출처는 Google Analytics.
//
// 비밀번호는 화면에 담기지 않는다. 입력값을 서버로 보내 대조하고, 맞을 때만
// 서버가 데이터를 돌려준다. 즉 이 페이지 소스를 열어봐도 통계는 볼 수 없다.
// 비밀번호는 이 브라우저 세션에만 기억한다(탭을 닫으면 사라짐).

import { useEffect, useState } from 'react';

interface PlayerRow {
  id: string;
  name: string;
  views: number;
  users: number;
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
interface Stats {
  days: number;
  totalViews: number;
  uniquePlayers: number;
  players: PlayerRow[];
  daily: DayRow[];
  sources: SourceRow[];
  error?: string;
  setup?: boolean; // true = 환경변수/권한 등 설정이 덜 된 상태
}

const PW_KEY = 'tkwavu_admin_pw';
const RANGES = [7, 28, 90, 365];

/** CSV 한 칸 이스케이프 (쉼표·따옴표·줄바꿈이 든 닉네임 대비). */
function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(content: BlobPart, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** KST 기준 파일명 도장. */
function stamp(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
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
    const lines = ['#,이름,식별코드,조회수,비율(%),사용자'];
    data.players.forEach((p, i) => {
      lines.push(
        [i + 1, p.name || '', p.id, p.views, pct(p.views), p.users].map(csvCell).join(','),
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
                  <th>조회수</th>
                  <th>비율</th>
                  <th>사용자</th>
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
                    <td>{p.views}</td>
                    <td>{pct(p.views)}%</td>
                    <td>{p.users}</td>
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
