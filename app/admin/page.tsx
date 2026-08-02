'use client';

// /admin — 조회 로그 열람 (관리자 전용).
//
// 비밀번호는 화면에 담기지 않는다. 입력값을 서버로 보내 대조하고, 맞을 때만
// 서버가 데이터를 돌려준다. 즉 이 페이지 소스를 열어봐도 통계는 볼 수 없다.
// 비밀번호는 이 브라우저 세션에만 기억한다(탭을 닫으면 사라짐).

import { useEffect, useState } from 'react';

interface PlayerRow {
  id: string;
  name: string;
  count: number;
  last: number;
}
interface SearchRow {
  query: string;
  count: number;
  hits: number;
  last: number;
}
interface Stats {
  total: number;
  today: number;
  uniquePlayers: number;
  players: PlayerRow[];
  searches: SearchRow[];
  days: { date: string; count: number }[];
  error?: string;
}

const PW_KEY = 'tkwavu_admin_pw';

/** epoch(초) → 'MM-DD HH:mm' (KST). */
function fmt(ts: number): string {
  const d = new Date(ts * 1000 + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function AdminPage() {
  const [pw, setPw] = useState('');
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (password: string) => {
    if (!password) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = (await res.json()) as Stats;
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
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
      load(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (n: number) => (data?.total ? ((n * 100) / data.total).toFixed(1) : '0.0');

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
      <p className="sub">방문자가 조회한 플레이어·검색어 기록 (본인만 열람)</p>

      <div className="panel">
        <label htmlFor="pw">관리자 비밀번호</label>
        <div className="row id-row">
          <input
            id="pw"
            className="id-input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && load(pw)}
            autoComplete="current-password"
          />
          <button onClick={() => load(pw)} disabled={busy}>
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
        {err && <p className="error">{err}</p>}
      </div>

      {data && (
        <>
          <div className="sum-card">
            <div className="sum-block">
              <span className="sum-label">총 조회</span>
              <span className="sum-value">{data.total.toLocaleString()}</span>
            </div>
            <div className="sum-block">
              <span className="sum-label">오늘</span>
              <span className="sum-value">{data.today.toLocaleString()}</span>
            </div>
            <div className="sum-block">
              <span className="sum-label">조회된 플레이어</span>
              <span className="sum-value">{data.uniquePlayers.toLocaleString()}</span>
            </div>
          </div>

          <h2 className="admin-h2">조회된 플레이어 ({data.players.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>이름</th>
                  <th>식별코드</th>
                  <th>조회</th>
                  <th>비율</th>
                  <th>마지막</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p, i) => (
                  <tr key={p.id}>
                    <td>{i + 1}</td>
                    <td>
                      <a className="plink" href={`/player/${p.id}`} target="_blank" rel="noreferrer">
                        {p.name}
                      </a>
                    </td>
                    <td>{p.id}</td>
                    <td>{p.count}</td>
                    <td>{pct(p.count)}%</td>
                    <td>{fmt(p.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.players.length === 0 && <p className="hint">아직 기록이 없습니다.</p>}

          <h2 className="admin-h2">닉네임 검색어 ({data.searches.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>검색어</th>
                  <th>횟수</th>
                  <th>결과있음</th>
                  <th>마지막</th>
                </tr>
              </thead>
              <tbody>
                {data.searches.map((s) => (
                  <tr key={s.query}>
                    <td>{s.query}</td>
                    <td>{s.count}</td>
                    <td>{s.hits}</td>
                    <td>{fmt(s.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.searches.length === 0 && <p className="hint">아직 기록이 없습니다.</p>}

          <h2 className="admin-h2">일별 조회</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>조회 수</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <footer>
        <span className="byline">
          이 페이지는 검색엔진에 노출되지 않으며, 비밀번호 없이는 데이터가 전송되지 않습니다.
        </span>
      </footer>
    </main>
  );
}
