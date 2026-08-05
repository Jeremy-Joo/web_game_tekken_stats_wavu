'use client';

import { useEffect, useState } from 'react';
import { roundForDisplay, type Precision, type ReasonCode } from '@/lib/tekken/rankpoint';
import { makeT, type Lang } from './i18n';

// 랭크 포인트 카드. wavu 데이터만으로 복원한 추정값이다(외부 사이트 안 거침).
// 단은 캐릭터마다 따로라 카드도 캐릭터별이다. 기본은 메인 + 최근 둘만 보여주고
// 나머지는 접어둔다. 둘이 같으면 카드 하나.

const BRAND = '#ff0060';

interface CharRow {
  charaId: number;
  charaName: string;
  matches: number;
  lastPlayed: number;
  rankId: number;
  rankName: string;
  band: { id: number; min: number; max: number };
  score: number | null;
  toNext: number | null;
  progress: number | null;
  errorMargin: number | null;
  confidence: 'exact' | 'good' | 'rough' | 'none';
  sinceAnchor: { matches: number; wins: number; losses: number } | null;
  reasonCode?: ReasonCode;
}

/** 값 + 자릿수 → 언어별 표기. 접두사와 단위가 언어마다 다르다. */
function showScore(n: number, precision: Precision, lang: Lang): string {
  if (precision === 'exact') return n.toLocaleString();
  const approx = lang === 'ko' ? '약 ' : lang === 'ja' ? '約' : '≈';
  if (precision === 'thousand') return approx + n.toLocaleString();
  if (lang === 'en') return `${approx}${Math.round(n / 1000)}K`;
  const man = Math.round(n / 1000) / 10;
  return `${approx}${man}${lang === 'ja' ? '万' : '만'}`;
}

export default function RankPointCards({ polarisId, lang }: { polarisId: string; lang: Lang }) {
  const [rows, setRows] = useState<CharRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const t = makeT(lang);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setFailed(false);
    setOpen(false);

    fetch(`/api/rankpoint/${encodeURIComponent(polarisId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setRows(d.characters ?? []))
      .catch(() => alive && setFailed(true));

    return () => {
      alive = false;
    };
  }, [polarisId]);

  // 추정이 실패해도 페이지의 다른 기능은 그대로 굴러가야 한다 — 조용히 사라진다.
  if (failed || (rows && rows.length === 0)) return null;
  if (!rows) return <div style={S.loading}>{t('rpLoading')}</div>;

  const usable = rows.filter((c) => c.matches >= 20);
  if (usable.length === 0) return null;

  // 최근 = 마지막으로 플레이한 캐릭터, 메인 = 경기 수가 가장 많은 캐릭터.
  const recent = [...usable].sort((a, b) => b.lastPlayed - a.lastPlayed)[0];
  const main = [...usable].sort((a, b) => b.matches - a.matches)[0];
  const same = main.charaId === recent.charaId;

  const shown = same ? [main] : [main, recent];
  const shownIds = new Set(shown.map((c) => c.charaId));
  const rest = usable.filter((c) => !shownIds.has(c.charaId));

  return (
    <div style={S.wrap}>
      {shown.map((c) => (
        <Card
          key={c.charaId}
          c={c}
          lang={lang}
          tag={same ? t('rpTagBoth') : c.charaId === main.charaId ? t('rpTagMain') : t('rpTagRecent')}
        />
      ))}

      {rest.length > 0 && (
        <>
          {open && rest.map((c) => <Card key={c.charaId} c={c} lang={lang} tag="" />)}
          <button style={S.toggle} onClick={() => setOpen(!open)}>
            {open ? t('rpFold') : t('rpMore')(rest.length)}
            <span style={{ marginLeft: 6 }}>{open ? '▲' : '▼'}</span>
          </button>
        </>
      )}

      <p style={S.disclaimer}>{t('rpDisclaimer')}</p>
    </div>
  );
}

function Card({ c, tag, lang }: { c: CharRow; tag: string; lang: Lang }) {
  const t = makeT(lang);
  const width = c.band.max - c.band.min + 1;
  const pct = c.progress ?? 0;
  const marginPct = c.errorMargin ? c.errorMargin / width : 0;

  return (
    <section style={S.card}>
      <div style={S.head}>
        <div>
          {tag && <span style={S.tag}>{tag}</span>}
          <span style={S.rank}>{c.rankName}</span>
          <span style={S.rankNo}> ({c.rankId})</span>
        </div>
        <span style={S.chara}>
          {c.charaName} · {c.matches.toLocaleString()}
          {t('rpGamesSuffix')}
        </span>
      </div>

      {c.score === null || c.errorMargin === null ? (
        <div style={S.unknown}>
          <div style={S.big}>
            {t('rpBandOnly')(c.band.min.toLocaleString(), (c.band.max + 1).toLocaleString())}
          </div>
          {c.reasonCode && <div style={S.note}>{t('rpWhy')[c.reasonCode]}</div>}
        </div>
      ) : (
        <>
          <div style={S.stats}>
            <div>
              <div style={S.label}>{t('rpScore')}</div>
              <div style={{ ...S.big, color: BRAND }}>
                {(() => {
                  const r = roundForDisplay(c.score, c.errorMargin);
                  return showScore(r.value, r.precision, lang);
                })()}{' '}
                P
              </div>
            </div>
            <div>
              <div style={S.label}>{t('rpToNext')}</div>
              <div style={S.big}>
                {c.toNext === null
                  ? t('rpTopRank')
                  : (() => {
                      const r = roundForDisplay(c.toNext, c.errorMargin!);
                      return `${showScore(r.value, r.precision, lang)} P`;
                    })()}
              </div>
            </div>
            <div>
              <div style={S.label}>{t('rpProgress')}</div>
              <div style={S.big}>{Math.round(pct * 100)}%</div>
            </div>
          </div>

          <div style={S.barZone}>
            <div style={S.track}>
              <div style={{ ...S.fill, width: `${pct * 100}%` }} />
              {/* 불확실 구간을 흐린 띠로 겹친다 — 딱 떨어지는 눈금보다 정직하다 */}
              <div
                style={{
                  ...S.fuzz,
                  left: `${Math.max(0, (pct - marginPct) * 100)}%`,
                  width: `${Math.min(1, marginPct * 2) * 100}%`,
                }}
              />
            </div>
            <div style={S.axis}>
              <span>{c.band.min.toLocaleString()}</span>
              <span>{(c.band.max + 1).toLocaleString()}</span>
            </div>
          </div>
        </>
      )}

      {c.score !== null && c.reasonCode && (
        <div style={S.warn}>{t('rpWhy')[c.reasonCode]}</div>
      )}

      {c.sinceAnchor && (
        <div style={S.foot}>
          {t('rpSince')(c.sinceAnchor.matches, c.sinceAnchor.wins, c.sinceAnchor.losses)}
          {c.errorMargin != null && ` · ${t('rpMargin')(c.errorMargin.toLocaleString())}`}
        </div>
      )}
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { margin: '10px 0 16px' },
  loading: { fontSize: 12, color: '#8a8a96', margin: '10px 0' },
  card: { background: '#141418', border: '1px solid #2a2a32', marginBottom: 8, borderRadius: 4 },
  head: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '11px 16px', borderBottom: '1px solid #2a2a32', background: '#16161c',
  },
  tag: {
    fontSize: 10, background: BRAND, color: '#000', fontWeight: 700,
    padding: '2px 7px', marginRight: 8, borderRadius: 2, letterSpacing: 0.5,
  },
  rank: { fontSize: 15, fontWeight: 700, color: '#ececef' },
  rankNo: { fontSize: 12, color: '#8a8a96', fontFamily: 'Consolas, monospace' },
  chara: { fontSize: 12, color: '#8a8a96' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '15px 16px 3px' },
  label: { fontSize: 11, color: '#8a8a96', letterSpacing: 1, marginBottom: 4 },
  big: { fontSize: 21, fontWeight: 800, fontFamily: 'Consolas, monospace', color: '#ececef' },
  barZone: { padding: '9px 16px 14px' },
  track: { position: 'relative', height: 12, background: '#22222a', overflow: 'hidden', borderRadius: 2 },
  fill: { position: 'absolute', inset: 0, background: `linear-gradient(90deg,#b30043,${BRAND})` },
  fuzz: {
    position: 'absolute', top: 0, bottom: 0,
    background: `linear-gradient(90deg, transparent, ${BRAND}55, transparent)`,
  },
  axis: {
    display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8a8a96',
    fontFamily: 'Consolas, monospace', marginTop: 5,
  },
  unknown: { padding: '15px 16px' },
  note: { fontSize: 12, color: '#8a8a96', marginTop: 6 },
  foot: { fontSize: 11, color: '#6f6f7c', padding: '0 16px 12px' },
  warn: { fontSize: 11, color: '#c9a227', padding: '0 16px 8px' },
  disclaimer: { fontSize: 11, color: '#6f6f7c', margin: '8px 2px 0', lineHeight: 1.5 },
  toggle: {
    width: '100%', background: '#16161c', border: '1px solid #2a2a32', color: '#8a8a96',
    padding: '8px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
  },
};
