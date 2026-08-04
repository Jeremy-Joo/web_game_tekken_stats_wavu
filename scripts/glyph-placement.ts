// 방사 막대 글리프를 '프로필 옆'에 놓으면 어떻게 보이는지 — 배치 샘플 (개발자용).
//   npx tsx scripts/glyph-placement.ts <출력.html> <식별코드×2>
//
// 사이트의 요약 카드(sum-card)를 그대로 재현하고 그 옆에 글리프를 놓는다.
// 목업이지만 숫자·모양은 전부 실제 계산이다 — 배치를 보는 자리에서 가짜 값을
// 보여주면 크기 감각이 어긋난다.

import fs from 'node:fs';
import { getRecords } from '../lib/wavu/cache';
import { hexScores, type HexScore } from '../lib/tekken/hexagon';

import type { MatchRecord } from '../lib/tekken/models';

const pol = (c: number, r: number, i: number, n: number): [number, number] => {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [c + Math.cos(a) * r, c + Math.sin(a) * r];
};
const f1 = (v: number) => v.toFixed(1);

/**
 * 글리프 한 개. size 로 두 급을 만든다:
 *   'full'  라벨 포함 — 카드 옆에 놓는 본판
 *   'mini'  막대만 — 이름 옆 아이콘 크기에서도 모양이 성립하는지 보는 용
 */
function glyph(scores: HexScore[], size: 'full' | 'mini'): string {
  const n = scores.length;
  const C = size === 'full' ? 110 : 50;
  const R = size === 'full' ? 66 : 40;
  const SW = size === 'full' ? 11 : 8;
  const bars = scores
    .map((s, i) => {
      const r = Math.max((R * (s.value ?? 0)) / 100, 4);
      const [x, y] = pol(C, r, i, n);
      return `<line x1="${C}" y1="${C}" x2="${f1(x)}" y2="${f1(y)}" stroke="${
        s.value === null ? 'var(--muted)' : 'var(--accent)'
      }" stroke-width="${SW}" stroke-linecap="round"><title>${s.label} ${
        s.value === null ? '표본 부족' : Math.round(s.value) + '백분위'
      }</title></line>`;
    })
    .join('');
  const ringPts = Array.from({ length: n }, (_, i) => pol(C, R + 7, i, n).map(f1).join(',')).join(' ');
  const labels =
    size === 'full'
      ? scores
          .map((s, i) => {
            const [x, y] = pol(C, R + 22, i, n);
            const anchor = x < C - 5 ? 'end' : x > C + 5 ? 'start' : 'middle';
            return `<text x="${f1(x)}" y="${f1(y + 3.5)}" text-anchor="${anchor}" class="gx">${s.label} <tspan class="gv">${s.value === null ? '—' : Math.round(s.value)}</tspan></text>`;
          })
          .join('')
      : '';
  const V = C * 2;
  return `<svg viewBox="0 0 ${V} ${V}" class="glyph-${size}" role="img" aria-label="플레이 성향">${
    size === 'full' ? `<polygon points="${ringPts}" fill="none" stroke="var(--border)" stroke-dasharray="2 4"/>` : ''
  }${bars}<circle cx="${C}" cy="${C}" r="4" fill="var(--panel)" stroke="var(--border)"/>${labels}</svg>`;
}

function stat(records: MatchRecord[]) {
  const w = records.filter((r) => r.result === 'W').length;
  const last = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime())[records.length - 1];
  return {
    games: records.length,
    wr: ((w / records.length) * 100).toFixed(1),
    w,
    l: records.length - w,
    rating: last.myRating,
    lastDt: last.dt.toISOString().slice(0, 10),
  };
}

async function main() {
  const [out, ...ids] = process.argv.slice(2);
  const ps: { name: string; s: ReturnType<typeof stat>; scores: HexScore[] }[] = [];
  for (const id of ids) {
    const { records, myName } = await getRecords(id);
    ps.push({ name: myName || id, s: stat(records), scores: hexScores(records) });
  }

  const sumCard = (p: (typeof ps)[0]) => `
      <div class="sum-card">
        <div class="sum-block"><span class="sum-label">승률</span><span class="sum-value">${p.s.wr}% <span class="sum-sub"><b class="sw">${p.s.w}승</b> <b class="sl">${p.s.l}패</b></span></span></div>
        <div class="sum-block"><span class="sum-label">경기</span><span class="sum-value">${p.s.games.toLocaleString()}</span></div>
        <div class="sum-block"><span class="sum-label">레이팅</span><span class="sum-value">${p.s.rating.toLocaleString()}</span></div>
        <div class="sum-block"><span class="sum-label">마지막</span><span class="sum-value sum-date">${p.s.lastDt}</span></div>
      </div>`;

  const html = `<title>글리프 배치 샘플 — 프로필 옆</title>
<style>
/* 사이트(globals.css)의 실제 토큰을 그대로 가져왔다 — 배치 샘플이 실물과 다른
   색을 쓰면 판단이 어긋난다. 사이트가 다크 단일 테마라 여기서도 다크로 고정한다. */
:root {
  --bg:#0f1115; --panel:#171a21; --border:#2a2f3a; --text:#e6e8ec; --muted:#9aa1ad;
  --accent:#6ea8fe; --win:#4ade80; --loss:#f87171;
}
body { background:var(--bg); color:var(--text); font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif; font-size:15px; line-height:1.55; }
.wrap { max-width:1100px; margin:0 auto; padding:1.5rem 1rem 4rem; display:flex; flex-direction:column; gap:2.4rem; }
h1 { font-size:1.25rem; margin:0; }
.hint { color:var(--muted); font-size:.85rem; max-width:44rem; margin:.3rem 0 0; }
h2 { font-size:1rem; margin:0 0 .6rem; }
h2 small { color:var(--muted); font-weight:400; font-size:.78rem; margin-left:.5rem; }

/* ── 사이트 요약 카드 재현 ── */
.sum-card { display:flex; gap:1.4rem; flex-wrap:wrap; align-items:baseline; background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:.7rem 1rem; }
.sum-block { display:flex; align-items:baseline; gap:.5rem; }
.sum-label { color:var(--muted); font-size:.8rem; }
.sum-value { font-size:1.25rem; font-weight:700; font-variant-numeric:tabular-nums; }
.sum-sub { color:var(--muted); font-size:.85rem; font-weight:500; }
.sum-value.sum-date { font-size:1rem; }
.sw { color:var(--win); } .sl { color:var(--loss); }

/* ── 배치안 A: 요약 카드 오른쪽 ── */
.layoutA { display:grid; grid-template-columns:1fr 15rem; gap:1rem; align-items:stretch; }
.glyph-card { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:.5rem .4rem .2rem; display:flex; flex-direction:column; align-items:center; }
.glyph-card figcaption { font-size:.72rem; color:var(--muted); }
.glyph-full { width:100%; max-width:15rem; height:auto; display:block; }
.gx { font-size:11.5px; fill:var(--text); }
.gv { font-family:ui-monospace,Menlo,Consolas,monospace; font-weight:700; fill:var(--accent); }
@media (max-width:640px){ .layoutA { grid-template-columns:1fr; } }

/* ── 배치안 B: 이름 줄 옆 미니 글리프 ── */
.name-row { display:flex; align-items:center; gap:.8rem; background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:.7rem 1rem; }
.name-row h3 { margin:0; font-size:1.15rem; }
.name-row .pid { color:var(--muted); font-size:.78rem; font-family:ui-monospace,Menlo,Consolas,monospace; }
.glyph-mini { width:52px; height:52px; flex:none; }
.mini-note { margin-left:auto; color:var(--muted); font-size:.75rem; }

figure { margin:0; }
.baseline-note { color:var(--muted); font-size:.75rem; }
</style>
<div class="wrap">
  <header>
    <h1>방사 막대 글리프 — 프로필 옆 배치 샘플</h1>
    <p class="hint">사이트의 요약 카드를 그대로 재현하고 옆에 글리프를 놓았습니다.
    숫자·모양은 전부 이 사람의 전적만으로 계산됩니다 (절대 눈금 — 남과 비교하지 않습니다).</p>
  </header>

${ps
  .map(
    (p, pi) => `  <section>
    <h2>배치안 A — 요약 카드 오른쪽 <small>${p.name} · 데스크톱은 나란히, 모바일은 아래로 내려옴</small></h2>
    <div class="layoutA">
      ${sumCard(p)}
      <figure class="glyph-card">${glyph(p.scores, 'full')}<figcaption>플레이 성향 (백분위)</figcaption></figure>
    </div>
  </section>

  <section>
    <h2>배치안 B — 이름 줄 옆 미니 글리프 <small>${p.name} · 라벨 없이 모양만, 누르면 A 로 펼치는 용도</small></h2>
    <div class="name-row">
      ${glyph(p.scores, 'mini')}
      <div><h3>${p.name}</h3><span class="pid">${ids[pi]}</span></div>
      <span class="mini-note">← 아이콘 크기(52px)에서도 모양이 성립하는지 확인</span>
    </div>
  </section>
`,
  )
  .join('\n')}

  <p class="baseline-note">두 사람을 나란히 둔 이유: 배치가 아니라 "사람마다 모양이 다른가"까지 한 화면에서 보려는 것.
  위(다양성 0 · 상승세 최상위)와 아래(지구력 상위 · 역상성 최하위)가 첫눈에 갈리면 성공입니다.</p>
</div>
`;

  fs.writeFileSync(out, html, 'utf8');
  console.log(`${out} (${html.length.toLocaleString()}바이트)`);
}

main();
