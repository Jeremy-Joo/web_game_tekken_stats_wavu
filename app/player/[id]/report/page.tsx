// /player/<식별코드>/report — 한 장짜리 종합 리포트.
//
// 왜 별도 페이지인가: 결과 화면은 탭이 16개다. 데이터가 부족한 게 아니라 많아서
// 처음 온 사람이 어디를 볼지 모른다. 리포트는 **새로 계산하지 않고** 이미 있는 값을
// "이 사람은 이런 플레이어다" 한 흐름으로 재배치한다.
//
// 서버 컴포넌트인 이유: 완성된 HTML 로 나가야 공유 링크·인쇄(PDF)·검색엔진에 그대로 쓰인다.
// 클라이언트로 넘기는 건 추이 그래프의 점들뿐이다.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRecords } from '@/lib/wavu/cache';
import { computeFromRecords } from '@/lib/tekken/compute';
import { sessionAdvice } from '@/lib/tekken/advice';
import ReportChart, { type TrendPoint } from './ReportChart';
import ShareBar from './ShareBar';
import './report.css';

interface Props {
  params: Promise<{ id: string }>;
}

const normalize = (raw: string) => decodeURIComponent(raw).replace(/[^A-Za-z0-9]/g, '');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = normalize((await params).id);
  let name = id;
  try {
    const { myName } = await getRecords(id);
    if (myName) name = myName;
  } catch {
    /* 이름을 못 얻어도 페이지는 나간다 */
  }
  return {
    title: `${name} 리포트 — 철권8 전적 통계`,
    description: `${name} 의 철권8 랭크전 종합 리포트 — 캐릭터별 성적, 강점·약점 매치업, 레이팅 추이, 플레이 패턴.`,
    alternates: { canonical: `/player/${id}/report` },
    openGraph: {
      title: `${name} 리포트 — 철권8 전적 통계`,
      description: `${name} 의 랭크전 종합 리포트`,
      url: `/player/${id}/report`,
    },
  };
}

/** 표에서 컬럼명으로 값을 꺼낸다 (컬럼 순서가 바뀌어도 안전하게). */
function pick(
  tab: { columns: string[]; rows: (string | number | null)[][] } | undefined,
  col: string,
) {
  const i = tab?.columns.indexOf(col) ?? -1;
  return (row: (string | number | null)[]) => (i >= 0 ? row[i] : null);
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export default async function ReportPage({ params }: Props) {
  const id = normalize((await params).id);
  if (!id) notFound();

  let data;
  try {
    data = await getRecords(id);
  } catch {
    notFound();
  }
  const { records, myName } = data;
  if (!records.length) notFound();

  const result = computeFromRecords(records, id, myName, { matchesLimit: 0 });
  const tabs = Object.fromEntries(result.tabs.map((t) => [t.key, t]));
  const advice = sessionAdvice(records);

  // ── 헤드라인 수치 ──────────────────────────────────────────────
  const total = tabs.total;
  const allRow = total?.rows.find((r) => r[0] === 'ALL');
  const gTotal = pick(total, 'Total');
  const gW = pick(total, 'W');
  const gL = pick(total, 'L');
  const gWr = pick(total, 'WinRate(%)');

  const games = allRow ? num(gTotal(allRow)) : records.length;
  const wins = allRow ? num(gW(allRow)) : 0;
  const losses = allRow ? num(gL(allRow)) : 0;
  const winRate = allRow ? num(gWr(allRow)) : 0;

  // 캐릭터별 (ALL 제외, 경기 수 순)
  const charRows = (total?.rows ?? [])
    .filter((r) => r[0] !== 'ALL')
    .map((r) => ({
      name: String(r[0]),
      games: num(gTotal(r)),
      wins: num(gW(r)),
      losses: num(gL(r)),
      wr: num(gWr(r)),
    }))
    .sort((a, b) => b.games - a.games);
  const mainChar = charRows[0];

  // 최신 경기 = 현재 레이팅·단
  const latest = [...records].sort((a, b) => b.dt.getTime() - a.dt.getTime())[0];
  const peakRating = Math.max(...records.map((r) => r.myRating));
  const peakPower = Math.max(...records.map((r) => r.myPower));

  // ── 매치업 ────────────────────────────────────────────────────
  const mkMatchups = (key: 'strong' | 'weak') => {
    const t = tabs[key];
    const g = pick(t, 'Games');
    const w = pick(t, 'W');
    const wr = pick(t, 'WinRate(%)');
    return (t?.rows ?? [])
      .map((r) => ({
        opp: String(r[0]),
        games: num(g(r)),
        wins: num(w(r)),
        wr: num(wr(r)),
      }))
      .slice(0, 3);
  };
  const strong = mkMatchups('strong');
  const weak = mkMatchups('weak');

  // ── 레이팅 추이 (그래프용 점) ──────────────────────────────────
  // 경기가 수만 건일 수 있어 그대로 넘기면 페이지가 무거워진다. 캐릭터별로 고르게 솎는다.
  const MAX_POINTS = 1200;
  const stride = Math.max(1, Math.ceil(records.length / MAX_POINTS));
  const ordered = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const points: TrendPoint[] = ordered
    .map((r, i) => ({ i, t: r.dt.getTime(), y: r.myRating, c: r.myChar }))
    .filter((_, i) => i % stride === 0 || i === ordered.length - 1);
  const trendChars = charRows.slice(0, 6).map((c) => c.name);

  // ── 라운드 지표 ───────────────────────────────────────────────
  const round = tabs.round;
  const rAll = round?.rows.find((r) => r[0] === 'ALL');
  const roundWr = rAll ? num(pick(round, 'RoundWR(%)')(rAll)) : 0;
  const closeWr = rAll
    ? (() => {
        const cw = num(pick(round, 'CloseWins')(rAll));
        const cl = num(pick(round, 'CloseLosses')(rAll));
        return cw + cl > 0 ? Math.round((cw * 1000) / (cw + cl)) / 10 : 0;
      })()
    : 0;
  const shutoutWin = rAll ? num(pick(round, 'ShutoutWin(%)')(rAll)) : 0;

  const period =
    result.firstDt && result.lastDt
      ? `${result.firstDt.slice(0, 10)} ~ ${result.lastDt.slice(0, 10)}`
      : '';

  // 표본이 이보다 적으면 수치를 확정처럼 보여주지 않는다.
  // (라운드·완승 비율 같은 파생 지표는 더 심하게 흔들린다 — 8경기짜리에서
  //  '완승 비율 25%'가 크게 떠 있는 걸 보고 넣었다)
  const THIN_GAMES = 30;
  const thin = games < THIN_GAMES;

  const moodLabel: Record<string, string> = {
    hot: '물이 올랐다',
    steady: '평소만큼',
    cooling: '내려가는 중',
    cold: '많이 식었다',
  };

  return (
    <main className="report">
      {/* ── 표지 ── */}
      <header className="rp-hero">
        <div className="rp-hero-top">
          <a className="rp-back" href={`/player/${id}`}>
            ← 전체 통계
          </a>
          <ShareBar name={myName || id} />
        </div>

        <h1 className="rp-name">{myName || id}</h1>
        <p className="rp-sub">
          <span className="rp-code">{id}</span>
          {mainChar && (
            <>
              <span className="rp-dot">·</span>
              <b>{mainChar.name}</b> 주력
            </>
          )}
          {period && (
            <>
              <span className="rp-dot">·</span>
              {period}
            </>
          )}
        </p>

        <div className="rp-hero-stats">
          <div className="rp-stat rp-stat-lead">
            <span className="rp-stat-label">승률</span>
            <span className="rp-stat-value">{winRate.toFixed(1)}%</span>
            <span className="rp-stat-note">
              <b className="sw">{wins.toLocaleString()}승</b>{' '}
              <b className="sl">{losses.toLocaleString()}패</b>
            </span>
          </div>
          <div className="rp-stat">
            <span className="rp-stat-label">총 경기</span>
            <span className="rp-stat-value">{games.toLocaleString()}</span>
          </div>
          <div className="rp-stat">
            <span className="rp-stat-label">현재 레이팅</span>
            <span className="rp-stat-value">{latest.myRating.toLocaleString()}</span>
            <span className="rp-stat-note">최고 {peakRating.toLocaleString()}</span>
          </div>
          <div className="rp-stat">
            <span className="rp-stat-label">텍켄파워</span>
            <span className="rp-stat-value">{latest.myPower.toLocaleString()}</span>
            <span className="rp-stat-note">최고 {peakPower.toLocaleString()}</span>
          </div>
        </div>

        {/* 승률 미터 — 같은 계열의 옅은 트랙 위에 채운다 */}
        <div className="rp-meter" aria-label={`승률 ${winRate.toFixed(1)}%`}>
          <div
            className={`rp-meter-fill ${winRate >= 50 ? 'good' : 'bad'}`}
            style={{ width: `${Math.max(0, Math.min(100, winRate))}%` }}
          />
          <span className="rp-meter-mid" />
        </div>
        <p className="rp-meter-cap">
          가운데 선이 50%입니다. {winRate >= 50 ? '이 선보다 위입니다.' : '이 선보다 아래입니다.'}
        </p>

        {thin && (
          <p className="rp-thin">
            경기가 {games}판뿐입니다. 아래 수치는 표본이 적어 크게 흔들립니다 — 한두 판
            결과로도 승률이 몇 %씩 움직이는 구간이라 확정된 실력으로 읽지 마세요.
          </p>
        )}
      </header>

      {/* ── 최근 폼 ── */}
      {!advice && (
        <section className="rp-sec">
          <h2 className="rp-h2">최근 흐름</h2>
          <p className="rp-empty">
            흐름을 판단하려면 경기가 더 필요합니다. 지금은 {games}판이라
            &ldquo;물이 올랐다/식었다&rdquo;를 말할 근거가 없습니다.
          </p>
        </section>
      )}
      {advice && (
        <section className="rp-sec">
          <h2 className="rp-h2">최근 흐름</h2>
          <div className={`rp-form rp-mood-${advice.mood}`}>
            <div className="rp-form-head">
              <span className="rp-form-mood">{moodLabel[advice.mood] ?? advice.mood}</span>
              <span className="rp-form-delta">
                최근 20판이 평균 대비{' '}
                <b>
                  {advice.recentDeltaPp > 0 ? '+' : ''}
                  {advice.recentDeltaPp.toFixed(1)}%p
                </b>
              </span>
            </div>
            <p className="rp-form-body">
              {advice.reliable && advice.goodUpTo
                ? advice.stopAfter
                  ? `한 세션 ${advice.goodUpTo}판까지는 평균 이상이었고, ${advice.stopAfter}판을 넘기면 성적이 꺾였습니다.`
                  : `${advice.goodUpTo}판까지 봐도 성적이 꺾이는 지점이 없었습니다.`
                : '권장 판수를 말하기엔 표본이 부족합니다.'}
              {advice.losingStreak >= 3 && ` 지금 ${advice.losingStreak}연패 중입니다.`}
            </p>
          </div>
        </section>
      )}

      {/* ── 레이팅 추이 ── */}
      {points.length > 1 && (
        <section className="rp-sec">
          <h2 className="rp-h2">레이팅 추이</h2>
          <div className="rp-card">
            <ReportChart points={points} chars={trendChars} />
          </div>
        </section>
      )}

      {/* ── 캐릭터별 ── */}
      {charRows.length > 0 && (
        <section className="rp-sec">
          <h2 className="rp-h2">캐릭터별 성적</h2>
          {/* 막대를 0~100% 로 그리면 승률이 55~66% 로 몰릴 때 길이가 다 비슷해
              '어느 캐릭이 유독 좋은가'가 안 보인다. 50% 를 가운데 두고 편차만 그린다. */}
          <div className="rp-bars">
            {charRows.slice(0, 8).map((c) => {
              const dev = c.wr - 50; // %p
              const half = Math.min(50, Math.abs(dev)); // 한쪽 최대 50%p
              return (
                <div key={c.name} className="rp-bar-row">
                  <span className="rp-bar-name">{c.name}</span>
                  <span className="rp-bar-track rp-bar-dev">
                    <span className="rp-bar-mid" />
                    <span
                      className={`rp-bar-fill ${dev >= 0 ? 'good' : 'bad'}`}
                      style={{
                        left: dev >= 0 ? '50%' : `${50 - half}%`,
                        width: `${Math.max(0.6, half)}%`,
                      }}
                    />
                  </span>
                  <span className={`rp-bar-wr ${dev >= 0 ? 'good' : 'bad'}`}>
                    {c.wr.toFixed(1)}%
                  </span>
                  <span className="rp-bar-games">{c.games.toLocaleString()}판</span>
                </div>
              );
            })}
          </div>
          <p className="rp-note">가운데가 50%입니다. 오른쪽으로 길수록 잘 쓰는 캐릭터입니다.</p>
        </section>
      )}

      {/* ── 매치업 ── */}
      {strong.length === 0 && weak.length === 0 && (
        <section className="rp-sec">
          <h2 className="rp-h2">매치업</h2>
          <p className="rp-empty">
            같은 캐릭터를 5판 이상 만난 기록이 아직 없습니다. 상대별 유불리는
            표본이 쌓여야 의미가 생깁니다.
          </p>
        </section>
      )}
      {(strong.length > 0 || weak.length > 0) && (
        <section className="rp-sec">
          <h2 className="rp-h2">매치업</h2>
          <div className="rp-mu">
            <div className="rp-mu-col">
              <h3 className="rp-mu-title good">강한 상대</h3>
              {strong.length ? (
                strong.map((m) => (
                  <div key={m.opp} className="rp-mu-item">
                    <span className="rp-mu-opp">{m.opp}</span>
                    <span className="rp-mu-wr good">{m.wr.toFixed(1)}%</span>
                    <span className="rp-mu-games">{m.games}판</span>
                  </div>
                ))
              ) : (
                <p className="rp-mu-empty">표본이 쌓이면 표시됩니다</p>
              )}
            </div>
            <div className="rp-mu-col">
              <h3 className="rp-mu-title bad">까다로운 상대</h3>
              {weak.length ? (
                weak.map((m) => (
                  <div key={m.opp} className="rp-mu-item">
                    <span className="rp-mu-opp">{m.opp}</span>
                    <span className="rp-mu-wr bad">{m.wr.toFixed(1)}%</span>
                    <span className="rp-mu-games">{m.games}판</span>
                  </div>
                ))
              ) : (
                <p className="rp-mu-empty">표본이 쌓이면 표시됩니다</p>
              )}
            </div>
          </div>
          <p className="rp-note">5판 이상 붙어본 상대 캐릭터 기준입니다.</p>
        </section>
      )}

      {/* ── 세부 지표 ── */}
      <section className="rp-sec">
        <h2 className="rp-h2">세부 지표</h2>
        <div className="rp-grid">
          <div className="rp-cell">
            <span className="rp-cell-label">라운드 승률</span>
            <span className="rp-cell-value">{roundWr.toFixed(1)}%</span>
          </div>
          <div className="rp-cell">
            <span className="rp-cell-label">접전 승률</span>
            <span className="rp-cell-value">{closeWr.toFixed(1)}%</span>
            <span className="rp-cell-note">1라운드 차 승부</span>
          </div>
          <div className="rp-cell">
            <span className="rp-cell-label">완승 비율</span>
            <span className="rp-cell-value">{shutoutWin.toFixed(1)}%</span>
            <span className="rp-cell-note">3-0 승리</span>
          </div>
          <div className="rp-cell">
            <span className="rp-cell-label">사용 캐릭터</span>
            <span className="rp-cell-value">{charRows.length}</span>
          </div>
        </div>
      </section>

      <footer className="rp-footer">
        <a className="rp-cta" href={`/player/${id}`}>
          전체 통계 16개 항목 보기 →
        </a>
        <p className="rp-credit">
          데이터: wank.wavu.wiki (랭크전) · tekken8stats.vercel.app
        </p>
      </footer>
    </main>
  );
}
