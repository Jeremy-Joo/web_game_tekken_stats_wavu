// 육각형 검토용 페이지를 만든다 (개발자용 — 화면에 붙이기 전에 눈으로 보려는 것).
//   npx tsx scripts/hex-page.ts <출력경로.html> <식별코드> [<식별코드> …]
//
// 숫자를 손으로 옮겨 적지 않는다. 표도 그림도 같은 계산에서 나오게 해서,
// 검토하는 사람이 보는 값과 코드가 내는 값이 어긋날 여지를 없앤다.

import fs from 'node:fs';
import { getRecords } from '../lib/wavu/cache';
import { hexScores, HEX_AXES, type HexScore } from '../lib/tekken/hexagon';
import { HEX_BASELINE, HEX_BASELINE_N } from '../lib/tekken/hexagon-baseline';

const CX = 170;
const CY = 158;
const R = 84;
const RINGS = [0.25, 0.5, 0.75, 1];

function pt(i: number, n: number, r: number): [number, number] {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [CX + Math.cos(a) * R * r, CY + Math.sin(a) * R * r];
}

const ring = (n: number, r: number) =>
  Array.from({ length: n }, (_, i) =>
    pt(i, n, r)
      .map((v) => v.toFixed(1))
      .join(','),
  ).join(' ');

/** 색은 var() 로 낸다 — 인라인 SVG 라 테마 토큰이 그대로 먹는다. */
function hexSvg(scores: HexScore[], hue: string): string {
  const n = scores.length;
  const shape = scores
    .map((s, i) =>
      pt(i, n, (s.pct ?? 50) / 100)
        .map((v) => v.toFixed(1))
        .join(','),
    )
    .join(' ');

  const rings = RINGS.map(
    (r) =>
      `<polygon points="${ring(n, r)}" fill="none" stroke="var(--rule)" stroke-width="1"${
        r === 1 ? '' : ' stroke-dasharray="2 4"'
      } />`,
  ).join('');

  const spokes = Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, n, 1);
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--rule)" stroke-width="1" />`;
  }).join('');

  const dots = scores
    .map((s, i) => {
      const [x, y] = pt(i, n, (s.pct ?? 50) / 100);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${
        s.pct === null ? 'var(--muted)' : hue
      }" />`;
    })
    .join('');

  const labels = scores
    .map((s, i) => {
      const [x, y] = pt(i, n, 1.3);
      const anchor = x < CX - 6 ? 'end' : x > CX + 6 ? 'start' : 'middle';
      const val = s.pct === null ? '—' : Math.round(s.pct);
      return (
        `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" class="ax">${s.label}</text>` +
        `<text x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" text-anchor="${anchor}" class="axv" fill="${
          s.pct === null ? 'var(--muted)' : hue
        }">${val}</text>`
      );
    })
    .join('');

  return `<svg viewBox="0 0 340 300" role="img" aria-label="플레이 성향 육각형">
  ${rings}${spokes}
  <polygon points="${shape}" fill="${hue}" fill-opacity="0.18" stroke="${hue}" stroke-width="2" stroke-linejoin="round" />
  ${dots}${labels}
</svg>`;
}

const HUES = ['var(--p1)', 'var(--p2)', 'var(--p3)'];

/** 축 원값을 사람이 읽는 꼴로. 축마다 단위가 달라서 한 함수로 못 묶는다. */
function rawText(key: string, v: number | null): string {
  if (v === null) return '표본 부족';
  if (key === 'grind') return `하루 ${v.toFixed(1)}판`;
  if (key === 'growth') return `${v > 0 ? '+' : ''}${Math.round(v)}`;
  if (key === 'stamina') return `${(v * 100).toFixed(0)}% 유지`;
  return v.toFixed(3);
}

async function main() {
  const [out, ...ids] = process.argv.slice(2);
  const players: { name: string; games: number; scores: HexScore[] }[] = [];
  for (const id of ids) {
    const { records, myName } = await getRecords(id);
    players.push({
      name: myName || id,
      games: records.length,
      scores: hexScores(records, HEX_BASELINE),
    });
  }

  const cards = players
    .map(
      (p, i) => `<figure class="card">
  <header class="card-head">
    <h3>${p.name}</h3>
    <span class="games">${p.games.toLocaleString()}경기</span>
  </header>
  ${hexSvg(p.scores, HUES[i % HUES.length])}
</figure>`,
    )
    .join('\n');

  // 비교표 — 그림에서 읽기 어려운 '누가 더 높은가'를 숫자로 받쳐 준다.
  const rows = HEX_AXES.map((ax, i) => {
    const cells = players
      .map((p) => {
        const s = p.scores[i];
        const pct = s.pct;
        return `<td>${
          pct === null
            ? '<span class="na">—</span>'
            : `<span class="bar" style="--v:${pct}%"></span><b>${Math.round(pct)}</b>`
        }<em>${rawText(ax.key, s.raw)}</em></td>`;
      })
      .join('');
    return `<tr><th scope="row">${ax.label}<span>${ax.desc}</span></th>${cells}</tr>`;
  }).join('\n');

  const baseRows = HEX_AXES.map((ax) => {
    const q = HEX_BASELINE[ax.key];
    return `<tr><th scope="row">${ax.label}</th><td>${rawText(ax.key, q[5])}</td><td>${rawText(
      ax.key,
      q[10],
    )}</td><td>${rawText(ax.key, q[15])}</td></tr>`;
  }).join('\n');

  const html = `<title>플레이 성향 육각형 — 설계 검토</title>
<style>
/* 사이트(globals.css)의 어두운 팔레트를 기준으로 삼고, 밝은 테마를 같은 무게로 짠다.
   중립색은 순회색이 아니라 지면 바탕(#0f1219)의 푸른 기운을 조금 섞어 맞췄다. */
:root {
  --ground: #0f1219;
  --panel: #161a23;
  --ink: #e8eaef;
  --muted: #949cab;
  --rule: #272c38;
  --accent: #6ea8fe;
  --p1: #6ea8fe;
  --p2: #7cc45c;
  --p3: #f08d43;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
}
@media (prefers-color-scheme: light) {
  :root {
    --ground: #f7f8fa; --panel: #ffffff; --ink: #171b23; --muted: #616a7a;
    --rule: #dfe3ea; --accent: #2f6fd0; --p1: #2f6fd0; --p2: #3f8f2c; --p3: #c4661d;
  }
}
:root[data-theme="light"] {
  --ground: #f7f8fa; --panel: #ffffff; --ink: #171b23; --muted: #616a7a;
  --rule: #dfe3ea; --accent: #2f6fd0; --p1: #2f6fd0; --p2: #3f8f2c; --p3: #c4661d;
}
:root[data-theme="dark"] {
  --ground: #0f1219; --panel: #161a23; --ink: #e8eaef; --muted: #949cab;
  --rule: #272c38; --accent: #6ea8fe; --p1: #6ea8fe; --p2: #7cc45c; --p3: #f08d43;
}

body { background: var(--ground); color: var(--ink); font-family: var(--sans); line-height: 1.6; }
.wrap { max-width: 62rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; display: flex; flex-direction: column; gap: 2.75rem; }

.eyebrow { font-family: var(--mono); font-size: .7rem; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin: 0 0 .6rem; }
h1 { font-size: clamp(1.7rem, 4vw, 2.5rem); line-height: 1.15; margin: 0 0 .8rem; text-wrap: balance; letter-spacing: -.02em; }
.deck { max-width: 42rem; color: var(--muted); margin: 0; }
h2 { font-size: 1.05rem; margin: 0 0 .2rem; letter-spacing: -.01em; }
h2 + .note { margin-top: 0; }
.note { color: var(--muted); font-size: .88rem; max-width: 46rem; margin: 0 0 1rem; }

/* 육각형 — 좁으면 한 장씩 쌓인다 */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
.card { margin: 0; background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 1rem .5rem .5rem; }
.card-head { display: flex; flex-direction: column; align-items: center; gap: .1rem; }
.card-head h3 { margin: 0; font-size: 1rem; }
.games { font-family: var(--mono); font-size: .72rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.card svg { width: 100%; height: auto; display: block; }
.ax { font-size: 11px; fill: var(--ink); font-family: var(--sans); }
.axv { font-size: 12px; font-family: var(--mono); font-weight: 700; font-variant-numeric: tabular-nums; }

.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .85rem; }
th, td { text-align: left; padding: .6rem .7rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
thead th { font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; white-space: nowrap; }
tbody th { font-weight: 600; white-space: nowrap; }
tbody th span { display: block; font-weight: 400; font-size: .74rem; color: var(--muted); white-space: normal; max-width: 17rem; }
td { font-variant-numeric: tabular-nums; }
td b { font-family: var(--mono); font-size: .95rem; }
td em { display: block; font-style: normal; font-size: .72rem; color: var(--muted); font-family: var(--mono); }
.na { color: var(--muted); }
/* 백분위 막대 — 숫자 뒤에 깔아 한눈에 비교되게 */
.bar { display: block; height: 4px; border-radius: 2px; background: var(--rule); margin-bottom: .3rem; max-width: 7rem; position: relative; }
.bar::after { content: ""; position: absolute; inset: 0 auto 0 0; width: var(--v); background: var(--accent); border-radius: 2px; }
tbody tr td:nth-child(2) .bar::after { background: var(--p1); }
tbody tr td:nth-child(3) .bar::after { background: var(--p2); }
tbody tr td:nth-child(4) .bar::after { background: var(--p3); }

.reads { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; list-style: none; padding: 0; margin: 0; }
.reads li { border-left: 2px solid var(--rule); padding-left: .9rem; }
.reads b { display: block; font-size: .95rem; margin-bottom: .2rem; }
.reads li:nth-child(1) { border-color: var(--p1); }
.reads li:nth-child(2) { border-color: var(--p2); }
.reads li:nth-child(3) { border-color: var(--p3); }
.reads p { margin: 0; font-size: .85rem; color: var(--muted); }

.drop { font-family: var(--mono); font-size: .8rem; }
.drop li { margin-bottom: .5rem; }
.open { border: 1px solid var(--rule); border-radius: 10px; padding: 1rem 1.1rem; background: var(--panel); }
.open h3 { margin: 0 0 .3rem; font-size: .95rem; }
.open p { margin: 0 0 1rem; color: var(--muted); font-size: .87rem; }
.open p:last-child { margin-bottom: 0; }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">설계 검토 · 철권8 전적 통계</p>
    <h1>플레이 성향 육각형</h1>
    <p class="deck">축 후보 10개를 실제 전적으로 재보고 여섯을 골랐습니다. 기준은 하나였습니다 —
      <strong>축이 서로 독립이어야 모양이 생긴다.</strong> 승률과 같이 움직이는 축만 모으면
      잘하는 사람은 큰 육각형, 못하는 사람은 작은 육각형이 되어 결국 승률 하나를 여섯 번 그린 것이 됩니다.</p>
  </header>

  <section>
    <h2>실제 플레이어 세 명</h2>
    <p class="note">숫자는 백분위입니다. 전체 플레이어 ${HEX_BASELINE_N}명 기준으로, 100에 가까울수록 그 항목이 남들보다 높습니다.</p>
    <div class="cards">
${cards}
    </div>
  </section>

  <section>
    <h2>읽는 법</h2>
    <ul class="reads">
      <li><b>${players[0]?.name}</b><p>실력·몰입이 나란히 상위권입니다. 한 번 잡으면 오래 돌리는 쪽이고, 다양성만 중간이라 그 방향이 눌린 모양이 됩니다.</p></li>
      <li><b>${players[1]?.name}</b><p>다양성이 0이라 그 지점에서 중심까지 꺾여 들어갑니다. 한 캐릭만 씁니다. 상승세는 최상위인데 지구력이 바닥이라, 짧게 치고 빠지는 유형입니다.</p></li>
      <li><b>${players[2]?.name}</b><p>실력은 아래쪽인데 지구력이 상위권입니다. 오래 해도 안 무너지지만 역상성이 최하위라 위 등급 상대는 거의 못 잡습니다.</p></li>
    </ul>
  </section>

  <section>
    <h2>축별 비교</h2>
    <p class="note">굵은 숫자가 백분위, 아래 작은 글씨가 원래 값입니다. 백분위만 보여주면 무엇을 재는지 감추게 되므로 둘 다 냅니다.</p>
    <div class="scroll">
      <table>
        <thead><tr><th>축</th>${players.map((p) => `<th>${p.name}</th>`).join('')}</tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>왜 백분위로 환산하나</h2>
    <p class="note">모집단 ${HEX_BASELINE_N}명의 원값 분포입니다. 범위가 이렇게 좁아서, 원값을 그대로 0~100 축에 얹으면 세 사람이 거의 같은 모양이 됩니다.</p>
    <div class="scroll">
      <table>
        <thead><tr><th>축</th><th>하위 25%</th><th>중앙</th><th>상위 25%</th></tr></thead>
        <tbody>
${baseRows}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>버린 축</h2>
    <p class="note">실측 13명 기준 상관계수입니다.</p>
    <ul class="drop">
      <li><strong>공격 · 수비 · 접전 · 라운드 획득률</strong> — 서로 +0.74 ~ +0.95, 승률과 +0.83 ~ +0.99.
        넷이 사실상 한 축이라 <strong>라운드 획득률</strong> 하나만 남겼습니다.</li>
      <li><strong>도전 (상위 상대와 붙은 비율)</strong> — 승률과 <strong>−0.97</strong>.
        도전 정신이 아니라 “내가 약해서 위쪽 상대밖에 없다”를 재고 있었습니다. 이름과 반대되는 것을 재는 축은 없느니만 못합니다.</li>
    </ul>
  </section>

  <section class="open">
    <h3>남은 판단 1 — 표본 ${HEX_BASELINE_N}명은 적습니다</h3>
    <p>특히 역상성은 하위 25%와 상위 25%의 차이가 0.03밖에 안 됩니다. 표본이 흔들리면 백분위가 크게 튑니다.
      200~300명으로 올리는 편이 안전합니다. ${HEX_BASELINE_N}명에 약 5분 걸렸으니 300명이면 25분, 한 번만 돌리면 되는 작업입니다.</p>
    <h3>남은 판단 2 — 역상성을 뺄지</h3>
    <p>원값 폭이 가장 좁아서, 백분위로 늘려놓으면 작은 차이를 크게 보이게 만드는 면이 있습니다.
      대신 넣을 만한 후보가 마땅치 않아, 뺀다면 오각형이 됩니다.</p>
  </section>
</div>
`;

  fs.writeFileSync(out, html, 'utf8');
  console.log(`${out} (${html.length.toLocaleString()}바이트)`);
  for (const p of players)
    console.log(
      `  ${p.name.padEnd(12)} ` +
        p.scores.map((s) => `${s.label} ${s.pct === null ? '—' : Math.round(s.pct)}`).join('  '),
    );
}

main();
