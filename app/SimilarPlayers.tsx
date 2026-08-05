'use client';

import { useState } from 'react';
import { makeT, type Lang } from './i18n';

// 승률 비슷한/정반대인 사람, 장기전 패턴 찾기. 기본은 접힌 상태 — 사용자가
// 열 때만 요청한다. 육각형 거리 대신 승률(캐릭터별) + 장기전 패턴(계정 전체)을
// 직접 쓴다 — 이유는 lib/tekken/similarity.ts 머리말 참조.
//
// 판수·레이팅 대역: 승률만 보면 실력대가 완전히 다른 사람도 "비슷하다"고 나올
// 수 있다(초심자 55% 와 파괴신 55% 는 같은 숫자지만 같은 실력이 아니다).
// 레이팅은 방향을 안 가리고 대역으로 막는다 — 낮은 쪽만 배제하면 어디까지
// 낮아야 거를지 기준이 애매해진다.

const BRAND = '#ff0060';

type MinCharGames = 20 | 50 | 100 | 200;
type GamesBand = 10 | 20 | 30 | 0;
type RatingBand = 100 | 200 | 300 | 0;

interface Result {
  id: string;
  name: string;
  games: number;
  charGames: number;
  charWinRate: number;
  wrDiff: number;
  rating: number;
  stopAfter: number | null;
  dropPp: number | null;
  riseAfter: number | null;
  risePp: number | null;
  lastPlayed: number;
}

interface Resp {
  count: number;
  indexSize: number;
  indexUpdatedAt: number;
  wouldMatchWithLooserMinGames: number;
  wouldMatchWithLooserGamesBand: number;
  wouldMatchWithLooserRatingBand: number;
  charaId: string;
  charaName: string;
  myCharGames: number;
  myWinRate: number;
  myGames: number;
  myRating: number;
  results: Result[];
  error?: string;
}

const EMPTY_RESP = (error: string): Resp => ({
  error,
  count: 0, indexSize: 0, indexUpdatedAt: 0,
  wouldMatchWithLooserMinGames: 0, wouldMatchWithLooserGamesBand: 0, wouldMatchWithLooserRatingBand: 0,
  charaId: '', charaName: '', myCharGames: 0, myWinRate: 0, myGames: 0, myRating: 0, results: [],
});

const CSS = `
.sp-wrap { margin: 8px 0 14px; }
.sp-toggle {
  width: 100%; background: #16161c; border: 1px solid #2a2a32; color: #ececef;
  padding: 9px; font-size: 13px; font-weight: 700; cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.sp-panel { background: #141418; border: 1px solid #2a2a32; border-top: none; padding: 12px 14px; }
.sp-char { font-size: 12px; color: #8a8a96; margin-bottom: 8px; }
.sp-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.sp-dirbtn {
  flex: 1; min-width: 110px; padding: 7px; font-size: 12px; border-radius: 4px;
  border: 1px solid #2a2a32; background: #16161c; color: #8a8a96; cursor: pointer;
}
.sp-dirbtn.on { background: ${BRAND}; color: #000; border-color: ${BRAND}; font-weight: 700; }
.sp-select {
  flex: 1; min-width: 130px; background: #16161c; border: 1px solid #2a2a32; color: #ececef;
  padding: 7px; font-size: 12px; border-radius: 4px;
}
.sp-caveat {
  font-size: 11px; color: #ffb84d; background: #2a2110; border: 1px solid #4a3a1a;
  border-radius: 4px; padding: 7px 9px; margin-bottom: 10px; line-height: 1.5;
}
.sp-go {
  width: 100%; background: ${BRAND}; color: #000; border: none; padding: 9px;
  font-weight: 700; font-size: 13px; cursor: pointer; border-radius: 4px; margin-bottom: 10px;
}
.sp-go:disabled { opacity: .5; cursor: default; }
.sp-note { font-size: 11px; color: #6f6f7c; margin-bottom: 8px; }
.sp-row {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 10px; border: 1px solid #2a2a32; border-radius: 4px; margin-bottom: 6px;
  background: #16161c; text-decoration: none;
}
.sp-name { font-size: 13px; font-weight: 700; color: #ececef; }
.sp-sub { font-size: 11px; color: #8a8a96; }
.sp-badge { font-size: 10px; padding: 1px 6px; border-radius: 2px; margin-left: 6px; }
.sp-badge.down { background: #3a1a1a; color: #ff8a8a; }
.sp-badge.up { background: #1a3a1a; color: #8aff8a; }
.sp-wr { font-size: 12px; color: ${BRAND}; font-family: Consolas, monospace; white-space: nowrap; text-align: right; }
.sp-diff { font-size: 10px; color: #8a8a96; }
.sp-empty { font-size: 12px; color: #8a8a96; padding: 10px 0; }
@media (max-width: 560px) {
  .sp-controls { gap: 6px; }
  .sp-row { padding: 7px 9px; }
  .sp-name { font-size: 12px; }
  .sp-sub { font-size: 10.5px; }
}
`;

export default function SimilarPlayers({ polarisId, lang }: { polarisId: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'similar' | 'opposite'>('similar');
  const [minGames, setMinGames] = useState<MinCharGames>(20);
  const [gamesBand, setGamesBand] = useState<GamesBand>(20);
  const [ratingBand, setRatingBand] = useState<RatingBand>(200);
  const [trend, setTrend] = useState<'any' | 'declining' | 'rising'>('any');
  const [recency, setRecency] = useState<'month' | 'patch' | 'all'>('month');
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<Resp | null>(null);
  const t = makeT(lang);

  async function search() {
    setBusy(true);
    try {
      const q = new URLSearchParams({
        direction, minGames: String(minGames), gamesBand: String(gamesBand),
        ratingBand: String(ratingBand), trend, recency,
      });
      const res = await fetch(`/api/similar/${encodeURIComponent(polarisId)}?${q}`);
      const json = await res.json();
      setResp(res.ok ? json : EMPTY_RESP(json.error));
    } catch (e) {
      setResp(EMPTY_RESP(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  // 완화 힌트 중 가장 값이 큰 것 하나만 보여준다 — 셋 다 나열하면 오히려 뭘
  // 눌러야 할지 더 헷갈린다.
  const looserHints = resp
    ? [
        { n: resp.wouldMatchWithLooserMinGames, key: 'minGames' as const },
        { n: resp.wouldMatchWithLooserGamesBand, key: 'gamesBand' as const },
        { n: resp.wouldMatchWithLooserRatingBand, key: 'ratingBand' as const },
      ].sort((a, b) => b.n - a.n)[0]
    : null;

  return (
    <div className="sp-wrap">
      <style>{CSS}</style>
      <button className="sp-toggle" onClick={() => setOpen(!open)}>
        {t('spToggle')}
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="sp-panel">
          <div className="sp-controls">
            <button className={`sp-dirbtn ${direction === 'similar' ? 'on' : ''}`} onClick={() => setDirection('similar')}>
              {t('spDirSimilar')}
            </button>
            <button className={`sp-dirbtn ${direction === 'opposite' ? 'on' : ''}`} onClick={() => setDirection('opposite')}>
              {t('spDirOpposite')}
            </button>
          </div>

          <div className="sp-controls">
            <select className="sp-select" value={minGames} onChange={(e) => setMinGames(Number(e.target.value) as MinCharGames)}>
              <option value={20}>{t('spMinGamesLabel')}: 20+</option>
              <option value={50}>{t('spMinGamesLabel')}: 50+</option>
              <option value={100}>{t('spMinGamesLabel')}: 100+</option>
              <option value={200}>{t('spMinGamesLabel')}: 200+</option>
            </select>
            <select className="sp-select" value={recency} onChange={(e) => setRecency(e.target.value as 'month' | 'patch' | 'all')}>
              <option value="month">{t('spRecencyLabel')}: {t('spRecencyMonth')}</option>
              <option value="patch">{t('spRecencyLabel')}: {t('spRecencyPatch')}</option>
              <option value="all">{t('spRecencyLabel')}: {t('spRecencyAll')}</option>
            </select>
          </div>

          <div className="sp-controls">
            <select className="sp-select" value={gamesBand} onChange={(e) => setGamesBand(Number(e.target.value) as GamesBand)}>
              <option value={10}>{t('spGamesBandLabel')}: ±10%</option>
              <option value={20}>{t('spGamesBandLabel')}: ±20%</option>
              <option value={30}>{t('spGamesBandLabel')}: ±30%</option>
              <option value={0}>{t('spGamesBandLabel')}: {t('spBandUnlimited')}</option>
            </select>
            <select className="sp-select" value={ratingBand} onChange={(e) => setRatingBand(Number(e.target.value) as RatingBand)}>
              <option value={100}>{t('spRatingBandLabel')}: ±100</option>
              <option value={200}>{t('spRatingBandLabel')}: ±200</option>
              <option value={300}>{t('spRatingBandLabel')}: ±300</option>
              <option value={0}>{t('spRatingBandLabel')}: {t('spBandUnlimited')}</option>
            </select>
          </div>

          <div className="sp-controls">
            <select className="sp-select" value={trend} onChange={(e) => setTrend(e.target.value as 'any' | 'declining' | 'rising')} style={{ flex: '1 1 100%' }}>
              <option value="any">{t('spTrendLabel')}: {t('spTrendAny')}</option>
              <option value="declining">{t('spTrendDeclining')}</option>
              <option value="rising">{t('spTrendRising')}</option>
            </select>
          </div>

          {trend === 'rising' && <div className="sp-caveat">{t('spTrendRisingCaveat')}</div>}

          <button className="sp-go" onClick={search} disabled={busy}>
            {busy ? t('spSearching') : t('spSearch')}
          </button>

          {resp?.error && <div className="sp-empty">{resp.error}</div>}

          {resp && !resp.error && (
            <>
              <div className="sp-char">
                {t('spCharLabel')(resp.charaName)} · {t('spMyWinRate')(resp.myWinRate, resp.myCharGames)}
                {' · '}
                {t('spMyGamesRating')(resp.myGames, resp.myRating)}
              </div>
              <div className="sp-note">{t('spIndexNote')(resp.indexSize, Math.round((Date.now() / 1000 - resp.indexUpdatedAt) / 86400))}</div>

              {resp.results.length === 0 ? (
                <div className="sp-empty">
                  {t('spEmpty')(resp.indexSize)}
                  {looserHints && looserHints.n > 0 && <> {t('spLooserHintFor')[looserHints.key](looserHints.n)}</>}
                </div>
              ) : (
                resp.results.map((r) => (
                  <a key={r.id} className="sp-row" href={`/player/${r.id}`} target="_blank" rel="noreferrer">
                    <div>
                      <div className="sp-name">
                        {r.name}
                        {r.dropPp != null && r.stopAfter != null && (
                          <span className="sp-badge down">{t('spDecliningBadge')(r.stopAfter, r.dropPp)}</span>
                        )}
                        {r.risePp != null && r.riseAfter != null && (
                          <span className="sp-badge up">{t('spRisingBadge')(r.riseAfter, r.risePp)}</span>
                        )}
                      </div>
                      <div className="sp-sub">{t('spResultSub')(r.charGames, r.games, r.rating)}</div>
                    </div>
                    <div>
                      <div className="sp-wr">{r.charWinRate}%</div>
                      <div className="sp-diff">Δ{r.wrDiff}%p</div>
                    </div>
                  </a>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
