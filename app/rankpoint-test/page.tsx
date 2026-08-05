'use client';

import { useState } from 'react';
import { formatScore } from '@/lib/tekken/rankpoint';

const BRAND = '#ff0060';

interface CharRow {
  charaId: number;
  charaName: string;
  matches: number;
  rankId: number;
  rankName: string;
  band: { id: number; min: number; max: number };
  score: number | null;
  toNext: number | null;
  progress: number | null;
  errorMargin: number | null;
  confidence: 'exact' | 'good' | 'rough' | 'none';
  sinceAnchor: { matches: number; wins: number; losses: number } | null;
  reason?: string;
}

export default function RankPointTestPage() {
  const [id, setId] = useState('63EimirEqjfj');
  const [data, setData] = useState<{ playerName: string | null; characters: CharRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/rankpoint/${encodeURIComponent(id.trim())}`);
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? '실패');
        setData(null);
      } else setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.h1}>랭크 포인트 (wavu 데이터로 복원 · 실험)</h1>
        <p style={S.sub}>
          외부 사이트를 거치지 않습니다. 단 변동 시점을 기준점으로 잡고 이후 전적으로 추정합니다.
        </p>

        <div style={S.row}>
          <input
            style={S.input}
            value={id}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="식별코드"
            spellCheck={false}
          />
          <button style={S.btn} onClick={load} disabled={busy || !id.trim()}>
            {busy ? '수집 중…' : '조회'}
          </button>
        </div>

        {err && <div style={S.err}>{err}</div>}

        {data && (
          <>
            <div style={S.player}>{data.playerName ?? id}</div>
            {data.characters
              .filter((c) => c.matches >= 20)
              .slice(0, 4)
              .map((c) => (
                <RankCard key={c.charaId} c={c} />
              ))}
          </>
        )}
      </div>
    </main>
  );
}

function RankCard({ c }: { c: CharRow }) {
  const width = c.band.max - c.band.min + 1;
  const pct = c.progress ?? 0;
  const marginPct = c.errorMargin ? c.errorMargin / width : 0;

  return (
    <section style={S.card}>
      <div style={S.head}>
        <div>
          <span style={S.rank}>{c.rankName}</span>
          <span style={S.rankNo}> ({c.rankId})</span>
        </div>
        <span style={S.chara}>
          {c.charaName} · {c.matches.toLocaleString()}경기
        </span>
      </div>

      {c.score === null ? (
        <div style={S.unknown}>
          <div style={S.big}>
            {c.band.min.toLocaleString()} ─ {(c.band.max + 1).toLocaleString()} 구간
          </div>
          <div style={S.note}>{c.reason ?? '이 구간 안 위치는 추정 불가'}</div>
        </div>
      ) : (
        <>
          <div style={S.stats}>
            <div>
              <div style={S.label}>랭크 포인트</div>
              <div style={{ ...S.big, color: BRAND }}>
                {formatScore(c.score, c.errorMargin ?? 0)} P
              </div>
            </div>
            <div>
              <div style={S.label}>다음 단까지</div>
              <div style={S.big}>
                {c.toNext === null ? '최고 단' : `${formatScore(c.toNext, c.errorMargin ?? 0)} P`}
              </div>
            </div>
            <div>
              <div style={S.label}>구간 진행</div>
              <div style={S.big}>{Math.round(pct * 100)}%</div>
            </div>
          </div>

          {/* 불확실 구간을 흐린 띠로 겹쳐 보여준다 — 딱 떨어지는 눈금보다 정직하다 */}
          <div style={S.barZone}>
            <div style={S.track}>
              <div style={{ ...S.fill, width: `${pct * 100}%` }} />
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

      {c.sinceAnchor && (
        <div style={S.foot}>
          단 변동 후 {c.sinceAnchor.matches}경기 ({c.sinceAnchor.wins}승 {c.sinceAnchor.losses}패)
          {c.errorMargin != null && ` · 추정 오차 ±${c.errorMargin.toLocaleString()} P`}
        </div>
      )}
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0b0b0d', color: '#ececef', padding: '40px 20px',
    fontFamily: "'Malgun Gothic', system-ui, sans-serif" },
  wrap: { maxWidth: 720, margin: '0 auto' },
  h1: { fontSize: 21, fontWeight: 800, margin: 0 },
  sub: { color: '#8a8a96', fontSize: 13, margin: '8px 0 20px' },
  row: { display: 'flex', gap: 8, marginBottom: 20 },
  input: { flex: 1, background: '#1b1b21', border: '1px solid #2a2a32', color: '#ececef',
    padding: '10px 12px', fontSize: 14, fontFamily: 'Consolas, monospace', outline: 'none' },
  btn: { background: BRAND, color: '#000', border: 'none', padding: '10px 22px',
    fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  err: { background: '#2a1216', border: '1px solid #5b1f28', color: '#ffb4bd',
    padding: '12px 14px', fontSize: 13, marginBottom: 16 },
  player: { fontSize: 16, fontWeight: 700, margin: '0 0 12px' },
  card: { background: '#141418', border: '1px solid #2a2a32', marginBottom: 12 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '13px 18px', borderBottom: '1px solid #2a2a32', background: '#16161c' },
  rank: { fontSize: 16, fontWeight: 700 },
  rankNo: { fontSize: 12, color: '#8a8a96', fontFamily: 'Consolas, monospace' },
  chara: { fontSize: 12, color: '#8a8a96' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, padding: '18px 18px 4px' },
  label: { fontSize: 11, color: '#8a8a96', letterSpacing: 1, marginBottom: 5 },
  big: { fontSize: 24, fontWeight: 800, fontFamily: 'Consolas, monospace' },
  barZone: { padding: '10px 18px 16px' },
  track: { position: 'relative', height: 14, background: '#22222a', overflow: 'hidden' },
  fill: { position: 'absolute', inset: 0, background: `linear-gradient(90deg,#b30043,${BRAND})` },
  fuzz: { position: 'absolute', top: 0, bottom: 0,
    background: `linear-gradient(90deg, transparent, ${BRAND}55, transparent)` },
  axis: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a8a96',
    fontFamily: 'Consolas, monospace', marginTop: 6 },
  unknown: { padding: '18px' },
  note: { fontSize: 12, color: '#8a8a96', marginTop: 8 },
  foot: { fontSize: 11, color: '#6f6f7c', padding: '0 18px 14px' },
};
