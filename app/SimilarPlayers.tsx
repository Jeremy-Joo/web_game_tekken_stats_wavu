'use client';

import { useState } from 'react';
import { makeT, type Lang } from './i18n';

// 비슷한/반대 유형 찾기. 기본은 접힌 상태 — 조회할 때마다 부르는 게 아니라
// 사용자가 열 때만 요청한다(player-index 는 가볍지만, 굳이 매번 계산할 필요는 없다).

const BRAND = '#ff0060';

interface Result {
  id: string;
  name: string;
  games: number;
  wrOverall: number;
  wrRecent200: number;
  rating: number;
  mainChar: string;
  distance: number;
  sharedAxes: number;
  lastPlayed: number;
}

interface Resp {
  count: number;
  indexSize: number;
  indexUpdatedAt: number;
  wouldMatchWithWiderBand: number;
  results: Result[];
  error?: string;
}

const CSS = `
.sp-wrap { margin: 8px 0 14px; }
.sp-toggle {
  width: 100%; background: #16161c; border: 1px solid #2a2a32; color: #ececef;
  padding: 9px; font-size: 13px; font-weight: 700; cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.sp-panel { background: #141418; border: 1px solid #2a2a32; border-top: none; padding: 12px 14px; }
.sp-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.sp-dirbtn {
  flex: 1; min-width: 90px; padding: 7px; font-size: 12px; border-radius: 4px;
  border: 1px solid #2a2a32; background: #16161c; color: #8a8a96; cursor: pointer;
}
.sp-dirbtn.on { background: ${BRAND}; color: #000; border-color: ${BRAND}; font-weight: 700; }
.sp-select {
  flex: 1; min-width: 110px; background: #16161c; border: 1px solid #2a2a32; color: #ececef;
  padding: 7px; font-size: 12px; border-radius: 4px;
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
.sp-dist { font-size: 11px; color: ${BRAND}; font-family: Consolas, monospace; white-space: nowrap; }
.sp-empty { font-size: 12px; color: #8a8a96; padding: 10px 0; }
@media (max-width: 560px) {
  .sp-controls { gap: 6px; }
  .sp-row { padding: 7px 9px; }
  .sp-name { font-size: 12px; }
  .sp-sub, .sp-dist { font-size: 10.5px; }
}
`;

export default function SimilarPlayers({ polarisId, lang }: { polarisId: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'similar' | 'opposite'>('similar');
  const [band, setBand] = useState<10 | 20 | 30 | 0>(20);
  const [recency, setRecency] = useState<'month' | 'patch' | 'all'>('month');
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<Resp | null>(null);
  const t = makeT(lang);

  async function search() {
    setBusy(true);
    try {
      const q = new URLSearchParams({ direction, band: String(band), recency });
      const res = await fetch(`/api/similar/${encodeURIComponent(polarisId)}?${q}`);
      const json = await res.json();
      setResp(res.ok ? json : { error: json.error, count: 0, indexSize: 0, indexUpdatedAt: 0, wouldMatchWithWiderBand: 0, results: [] });
    } catch (e) {
      setResp({ error: e instanceof Error ? e.message : String(e), count: 0, indexSize: 0, indexUpdatedAt: 0, wouldMatchWithWiderBand: 0, results: [] });
    } finally {
      setBusy(false);
    }
  }

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
            <button
              className={`sp-dirbtn ${direction === 'similar' ? 'on' : ''}`}
              onClick={() => setDirection('similar')}
            >
              {t('spDirSimilar')}
            </button>
            <button
              className={`sp-dirbtn ${direction === 'opposite' ? 'on' : ''}`}
              onClick={() => setDirection('opposite')}
            >
              {t('spDirOpposite')}
            </button>
          </div>

          <div className="sp-controls">
            <select className="sp-select" value={band} onChange={(e) => setBand(Number(e.target.value) as 10 | 20 | 30 | 0)}>
              <option value={10}>{t('spBandLabel')} ±10%</option>
              <option value={20}>{t('spBandLabel')} ±20%</option>
              <option value={30}>{t('spBandLabel')} ±30%</option>
              <option value={0}>{t('spBandLabel')}: {t('spBandUnlimited')}</option>
            </select>
            <select className="sp-select" value={recency} onChange={(e) => setRecency(e.target.value as 'month' | 'patch' | 'all')}>
              <option value="month">{t('spRecencyLabel')}: {t('spRecencyMonth')}</option>
              <option value="patch">{t('spRecencyLabel')}: {t('spRecencyPatch')}</option>
              <option value="all">{t('spRecencyLabel')}: {t('spRecencyAll')}</option>
            </select>
          </div>

          <button className="sp-go" onClick={search} disabled={busy}>
            {busy ? t('spSearching') : t('spSearch')}
          </button>

          {resp?.error && <div className="sp-empty">{resp.error}</div>}

          {resp && !resp.error && (
            <>
              <div className="sp-note">{t('spIndexNote')(resp.indexSize, Math.round((Date.now() / 1000 - resp.indexUpdatedAt) / 86400))}</div>

              {resp.results.length === 0 ? (
                <div className="sp-empty">
                  {t('spEmpty')(resp.indexSize)}
                  {resp.wouldMatchWithWiderBand > 0 && <> {t('spWiderHint')(resp.wouldMatchWithWiderBand)}</>}
                </div>
              ) : (
                resp.results.map((r) => (
                  <a key={r.id} className="sp-row" href={`/player/${r.id}`} target="_blank" rel="noreferrer">
                    <div>
                      <div className="sp-name">{r.name}</div>
                      <div className="sp-sub">
                        {r.mainChar} · {r.games.toLocaleString()}
                        {t('spGamesShort')} · {r.wrOverall}% · {r.rating.toLocaleString()}
                      </div>
                    </div>
                    <div className="sp-dist">Δ{r.distance}</div>
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
