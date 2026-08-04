// 성향 시각화 형태 후보를 실제 데이터로 나란히 그려 비교한다 (개발자용 검토 페이지).
//   npx tsx scripts/viz-lab.ts <출력.html> <식별코드×3>
//
// 숫자·좌표는 전부 실제 계산에서 나온다 — 손으로 옮겨 적은 값이 없어야
// 검토하는 사람이 보는 것과 코드가 내는 것이 어긋나지 않는다.

import fs from 'node:fs';
import { getRecords } from '../lib/wavu/cache';
import { hexScores, HEX_AXES, type HexScore } from '../lib/tekken/hexagon';
import { HEX_BASELINE, HEX_BASELINE_N, HEX_RAW } from '../lib/tekken/hexagon-baseline';
import type { MatchRecord } from '../lib/tekken/models';

// 색은 CSS 토큰으로만 낸다. 시리즈 1·2·3 = 파랑·주황·아쿠아 (검증된 순서 — 임의로 바꾸지 말 것).
const HUES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];

interface P {
  name: string;
  records: MatchRecord[];
  scores: HexScore[];
}

/* ── 공통 기하 ── */
const pol = (cx: number, cy: number, r: number, i: number, n: number): [number, number] => {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
};
const f1 = (v: number) => v.toFixed(1);

/* ── A. 레이더 ── */
function radar(p: P, hue: string): string {
  const n = p.scores.length;
  const C = 150;
  const R = 86;
  const ring = (r: number) =>
    Array.from({ length: n }, (_, i) => pol(C, C, R * r, i, n).map(f1).join(',')).join(' ');
  const shape = p.scores
    .map((s, i) => pol(C, C, (R * (s.pct ?? 50)) / 100, i, n).map(f1).join(','))
    .join(' ');
  const grid =
    [0.25, 0.5, 0.75, 1]
      .map(
        (r) =>
          `<polygon points="${ring(r)}" fill="none" stroke="var(--rule)" stroke-width="1"${r < 1 ? ' stroke-dasharray="2 4"' : ''}/>`,
      )
      .join('') +
    Array.from({ length: n }, (_, i) => {
      const [x, y] = pol(C, C, R, i, n);
      return `<line x1="${C}" y1="${C}" x2="${f1(x)}" y2="${f1(y)}" stroke="var(--rule)" stroke-width="1"/>`;
    }).join('');
  const labels = p.scores
    .map((s, i) => {
      const [x, y] = pol(C, C, R * 1.32, i, n);
      const anchor = x < C - 6 ? 'end' : x > C + 6 ? 'start' : 'middle';
      return `<text x="${f1(x)}" y="${f1(y + 4)}" text-anchor="${anchor}" class="ax">${s.label} <tspan class="axv">${s.pct === null ? '—' : Math.round(s.pct)}</tspan></text>`;
    })
    .join('');
  return `<svg viewBox="0 0 300 300" role="img" aria-label="${p.name} 레이더">${grid}
<polygon points="${shape}" fill="${hue}" fill-opacity=".16" stroke="${hue}" stroke-width="2" stroke-linejoin="round"/>${labels}</svg>`;
}

/* ── B. 방사 막대 글리프 — 면적 착시가 없는 심볼형 ── */
function glyph(p: P, hue: string): string {
  const n = p.scores.length;
  const C = 150;
  const R = 92;
  const bars = p.scores
    .map((s, i) => {
      const r = Math.max((R * (s.pct ?? 0)) / 100, 6);
      const [x, y] = pol(C, C, r, i, n);
      return `<line x1="${C}" y1="${C}" x2="${f1(x)}" y2="${f1(y)}" stroke="${s.pct === null ? 'var(--muted)' : hue}" stroke-width="13" stroke-linecap="round"><title>${s.label} ${s.pct === null ? '표본 부족' : `${Math.round(s.pct)}백분위`}</title></line>`;
    })
    .join('');
  const ring = Array.from({ length: n }, (_, i) => pol(C, C, R + 9, i, n).map(f1).join(',')).join(' ');
  const labels = p.scores
    .map((s, i) => {
      const [x, y] = pol(C, C, R + 26, i, n);
      const anchor = x < C - 6 ? 'end' : x > C + 6 ? 'start' : 'middle';
      return `<text x="${f1(x)}" y="${f1(y + 4)}" text-anchor="${anchor}" class="ax">${s.label}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 300 300" role="img" aria-label="${p.name} 글리프"><polygon points="${ring}" fill="none" stroke="var(--rule)" stroke-width="1" stroke-dasharray="2 4"/>${bars}<circle cx="${C}" cy="${C}" r="5" fill="var(--panel)" stroke="var(--rule)"/>${labels}</svg>`;
}

/* ── C. 성향 사분면 — 다양성 × 몰입, 모집단을 배경 점으로 ── */
function quadrant(players: P[]): string {
  const W = 560;
  const H = 400;
  const M = { l: 52, r: 16, t: 30, b: 44 };
  const vs = HEX_RAW.variety;
  const gs = HEX_RAW.grind;
  // 몰입은 위로 긴 꼬리라 상위 몇 명이 축을 다 먹는다 — 95% 지점에서 자르고 표시한다.
  const gmax = [...gs].sort((a, b) => a - b)[Math.floor(gs.length * 0.95)];
  const x = (v: number) => M.l + v * (W - M.l - M.r);
  const y = (g: number) => H - M.b - (Math.min(g, gmax) / gmax) * (H - M.t - M.b);
  const med = (a: number[]) => [...a].sort((x1, y1) => x1 - y1)[Math.floor(a.length / 2)];
  const mv = med(vs);
  const mg = med(gs);

  const pop = vs
    .map(
      (v, i) =>
        `<circle cx="${f1(x(v))}" cy="${f1(y(gs[i]))}" r="3.5" fill="var(--muted)" fill-opacity=".38"><title>모집단 · 다양성 ${v.toFixed(2)} · 하루 ${gs[i].toFixed(1)}판</title></circle>`,
    )
    .join('');
  const dots = players
    .map((p, i) => {
      const v = p.scores.find((s) => s.key === 'variety')!.raw!;
      const g = p.scores.find((s) => s.key === 'grind')!.raw!;
      return `<circle cx="${f1(x(v))}" cy="${f1(y(g))}" r="7" fill="${HUES[i]}" stroke="var(--panel)" stroke-width="2"><title>${p.name} · 다양성 ${v.toFixed(2)} · 하루 ${g.toFixed(1)}판</title></circle>
<text x="${f1(x(v) + 11)}" y="${f1(y(g) + 4)}" class="dot-name">${p.name}</text>`;
    })
    .join('');

  const q = (tx: number, ty: number, t: string, a = 'start') =>
    `<text x="${tx}" y="${ty}" class="quad" text-anchor="${a}">${t}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="성향 사분면">
<line x1="${f1(x(mv))}" y1="${M.t}" x2="${f1(x(mv))}" y2="${H - M.b}" stroke="var(--rule)" stroke-dasharray="4 4"/>
<line x1="${M.l}" y1="${f1(y(mg))}" x2="${W - M.r}" y2="${f1(y(mg))}" stroke="var(--rule)" stroke-dasharray="4 4"/>
${q(M.l + 6, M.t + 14, '한 캐릭 · 몰아서')}${q(W - M.r - 6, M.t + 14, '여러 캐릭 · 몰아서', 'end')}
${q(M.l + 6, H - M.b - 8, '한 캐릭 · 가볍게')}${q(W - M.r - 6, H - M.b - 8, '여러 캐릭 · 가볍게', 'end')}
${pop}${dots}
<text x="${(M.l + W - M.r) / 2}" y="${H - 10}" text-anchor="middle" class="axis-t">다양성 (캐릭터를 고르게 쓰는 정도) →</text>
<text x="14" y="${(M.t + H - M.b) / 2}" text-anchor="middle" class="axis-t" transform="rotate(-90 14 ${(M.t + H - M.b) / 2})">몰입 (하루 판수, 상위 5% 지점에서 자름) →</text>
</svg>`;
}

/* ── D. 활동 지문 — 요일 × 시간 히트맵 (KST) ── */
function fingerprint(p: P): string {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const r of p.records) {
    const t = new Date(r.dt.getTime() + 9 * 3600_000); // KST
    grid[t.getUTCDay()][t.getUTCHours()]++;
  }
  const max = Math.max(...grid.flat(), 1);
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const CW = 17;
  const CH = 15;
  const OX = 26;
  const OY = 18;
  let cells = '';
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++) {
      const v = grid[d][h];
      // 0 은 그리지 않는다(지면색) — '안 했다'가 가장 옅은 색으로 보이면 안 된다.
      if (!v) continue;
      const step = Math.min(5, Math.ceil((v / max) * 5));
      cells += `<rect x="${OX + h * CW}" y="${OY + d * CH}" width="${CW - 2}" height="${CH - 2}" rx="2" class="q${step}"><title>${DAYS[d]} ${h}시 · ${v}판</title></rect>`;
    }
  const dayLabels = DAYS.map(
    (d, i) => `<text x="${OX - 8}" y="${OY + i * CH + 11}" text-anchor="end" class="cell-t">${d}</text>`,
  ).join('');
  const hourLabels = [0, 6, 12, 18, 23]
    .map((h) => `<text x="${OX + h * CW + 7}" y="${OY - 6}" text-anchor="middle" class="cell-t">${h}</text>`)
    .join('');
  return `<svg viewBox="0 0 ${OX + 24 * CW + 6} ${OY + 7 * CH + 4}" role="img" aria-label="${p.name} 활동 지문">${dayLabels}${hourLabels}${cells}</svg>`;
}

/* ── E. 축별 분포 스트립 — 표를 그림으로 ── */
function strips(players: P[]): string {
  return HEX_AXES.map((ax, ai) => {
    const raw = HEX_RAW[ax.key] ?? [];
    if (!raw.length) return '';
    const sorted = [...raw].sort((a, b) => a - b);
    // 성장·몰입은 꼬리가 길다 — 2~98% 로 창을 잡아 본체가 뭉개지지 않게 한다.
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.ceil(sorted.length * 0.98) - 1];
    const X = (v: number) => 4 + (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo || 1) * 92;
    const pop = raw
      .map((v) => `<circle cx="${(X(v)).toFixed(2)}%" cy="22" r="3" fill="var(--muted)" fill-opacity=".3"/>`)
      .join('');
    const marks = players
      .map((p, i) => {
        const s = p.scores[ai];
        if (s.raw === null) return '';
        return `<g><line x1="${X(s.raw).toFixed(2)}%" x2="${X(s.raw).toFixed(2)}%" y1="8" y2="36" stroke="${HUES[i]}" stroke-width="3"><title>${p.name} · ${s.pct === null ? '' : Math.round(s.pct) + '백분위'}</title></line></g>`;
      })
      .join('');
    return `<div class="strip-row">
  <div class="strip-h"><b>${ax.label}</b><span>${ax.desc}</span></div>
  <svg viewBox="0 0 100 44" preserveAspectRatio="none" class="strip-svg" role="img" aria-label="${ax.label} 분포">${pop}${marks}</svg>
</div>`;
  }).join('\n');
}

/* ── F. 승패 바코드 — 최근 240판의 리듬 ── */
function barcode(p: P): string {
  const recent = [...p.records].sort((a, b) => a.dt.getTime() - b.dt.getTime()).slice(-240);
  const W = 240 * 2.4;
  const bars = recent
    .map(
      (r, i) =>
        `<rect x="${(i * 2.4).toFixed(1)}" y="${r.result === 'W' ? 0 : 15}" width="1.9" height="13" class="${r.result === 'W' ? 'bw' : 'bl'}"/>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${W} 28" preserveAspectRatio="none" class="code-svg" role="img" aria-label="${p.name} 최근 240판 승패">${bars}</svg>`;
}

async function main() {
  const [out, ...ids] = process.argv.slice(2);
  const players: P[] = [];
  for (const id of ids) {
    const { records, myName } = await getRecords(id);
    players.push({ name: myName || id, records, scores: hexScores(records, HEX_BASELINE) });
  }

  const trio = (fn: (p: P, hue: string) => string, cls = '') =>
    players
      .map(
        (p, i) => `<figure class="v-card ${cls}"><figcaption><i style="background:${HUES[i]}"></i>${p.name}</figcaption>${fn(p, HUES[i])}</figure>`,
      )
      .join('\n');

  const html = `<title>성향 시각화 — 형태 비교</title>
<style>
:root {
  --ground:#0f1219; --panel:#161a23; --ink:#e8eaef; --muted:#949cab; --rule:#272c38;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70;
  --h1:#184f95; --h2:#1c5cab; --h3:#256abf; --h4:#3987e5; --h5:#86b6ef;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;
}
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {
  --ground:#f7f8fa; --panel:#ffffff; --ink:#171b23; --muted:#5d6675; --rule:#dfe3ea;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a;
  --h1:#cde2fb; --h2:#9ec5f4; --h3:#6da7ec; --h4:#3987e5; --h5:#1c5cab;
} }
:root[data-theme="light"] {
  --ground:#f7f8fa; --panel:#ffffff; --ink:#171b23; --muted:#5d6675; --rule:#dfe3ea;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a;
  --h1:#cde2fb; --h2:#9ec5f4; --h3:#6da7ec; --h4:#3987e5; --h5:#1c5cab;
}
:root[data-theme="dark"] {
  --ground:#0f1219; --panel:#161a23; --ink:#e8eaef; --muted:#949cab; --rule:#272c38;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70;
  --h1:#184f95; --h2:#1c5cab; --h3:#256abf; --h4:#3987e5; --h5:#86b6ef;
}
body { background:var(--ground); color:var(--ink); font-family:var(--sans); line-height:1.6; }
.wrap { max-width:64rem; margin:0 auto; padding:2.6rem 1.25rem 5rem; display:flex; flex-direction:column; gap:3rem; }
.eyebrow { font-family:var(--mono); font-size:.7rem; letter-spacing:.16em; text-transform:uppercase; color:var(--s1); margin:0 0 .5rem; }
h1 { font-size:clamp(1.6rem,4vw,2.3rem); margin:0 0 .7rem; letter-spacing:-.02em; text-wrap:balance; }
.deck { max-width:44rem; color:var(--muted); margin:0; }
section > h2 { font-size:1.02rem; margin:0 0 .15rem; }
.tag { font-family:var(--mono); font-size:.68rem; color:var(--muted); letter-spacing:.08em; }
.note { color:var(--muted); font-size:.87rem; max-width:46rem; margin:.3rem 0 1rem; }
.verdict { font-size:.85rem; border-left:3px solid var(--rule); padding:.15rem 0 .15rem .8rem; margin-top:1rem; color:var(--muted); max-width:46rem; }
.verdict b { color:var(--ink); }

.trio { display:grid; grid-template-columns:repeat(auto-fit,minmax(14rem,1fr)); gap:1rem; }
.v-card { margin:0; background:var(--panel); border:1px solid var(--rule); border-radius:10px; padding:.8rem .5rem .4rem; }
.v-card figcaption { display:flex; align-items:center; justify-content:center; gap:.45rem; font-size:.85rem; font-weight:600; margin-bottom:.3rem; }
.v-card i { width:.62rem; height:.62rem; border-radius:50%; display:inline-block; }
.v-card svg { width:100%; height:auto; display:block; }
.ax { font-size:11.5px; fill:var(--ink); }
.axv { font-family:var(--mono); font-weight:700; fill:var(--muted); }
.quad { font-size:11px; fill:var(--muted); font-family:var(--mono); }
.dot-name { font-size:11px; fill:var(--ink); font-weight:600; paint-order:stroke; stroke:var(--panel); stroke-width:3; }
.axis-t { font-size:11px; fill:var(--muted); }
.cell-t { font-size:9.5px; fill:var(--muted); font-family:var(--mono); }
.q1{fill:var(--h1)} .q2{fill:var(--h2)} .q3{fill:var(--h3)} .q4{fill:var(--h4)} .q5{fill:var(--h5)}

.wide { background:var(--panel); border:1px solid var(--rule); border-radius:10px; padding:1rem; }
.strip-row { display:grid; grid-template-columns:minmax(9rem,15rem) 1fr; gap:1rem; align-items:center; padding:.35rem 0; border-bottom:1px solid var(--rule); }
.strip-row:last-child { border-bottom:0; }
.strip-h b { display:block; font-size:.88rem; }
.strip-h span { font-size:.72rem; color:var(--muted); display:block; line-height:1.4; }
.strip-svg { width:100%; height:44px; display:block; }
.code-svg { width:100%; height:30px; display:block; }
.bw { fill:var(--s1); } .bl { fill:var(--s2); }
.legend { display:flex; gap:1.1rem; font-size:.78rem; color:var(--muted); margin:.5rem 0 0; flex-wrap:wrap; }
.legend i { width:.6rem; height:.6rem; border-radius:2px; display:inline-block; margin-right:.35rem; vertical-align:-1px; }
.code-row { display:grid; grid-template-columns:7rem 1fr; gap:.8rem; align-items:center; padding:.3rem 0; }
.code-row b { font-size:.85rem; }
.pick { border:1px solid var(--rule); background:var(--panel); border-radius:10px; padding:1.1rem 1.2rem; }
.pick h2 { margin:0 0 .5rem; font-size:1rem; }
.pick p { margin:0 0 .8rem; font-size:.88rem; color:var(--muted); }
.pick p:last-child { margin:0; }
@media (max-width:560px){ .strip-row{grid-template-columns:1fr;gap:.2rem} .code-row{grid-template-columns:1fr} }
</style>
<div class="wrap">
<header>
  <p class="eyebrow">설계 검토 2 · 철권8 전적 통계</p>
  <h1>같은 세 사람, 여섯 가지 형태</h1>
  <p class="deck">육각형 하나로 정하기 전에, 같은 데이터를 다른 형태로 그려 나란히 놓았습니다.
  숫자·좌표는 전부 실제 전적 계산에서 나옵니다. 모집단은 wavu 공개 피드에서 뽑은 ${HEX_BASELINE_N}명(500판 이상)입니다.</p>
</header>

<section>
  <h2>A. 레이더 <span class="tag">현행 후보</span></h2>
  <p class="note">여섯 축 백분위를 면으로 잇습니다. 게임 UI 문법이라 철권 유저에게 익숙합니다.</p>
  <div class="trio">${trio(radar)}</div>
  <p class="verdict"><b>장점</b> 한눈에 "모양"이 읽히고 게임의 오각형과 문법이 같다. <b>약점</b> 면적이 실제 값보다 과장되고(두 축이 크면 그 사이 면이 통째로 커짐), 축 순서에 따라 인상이 달라진다.</p>
</section>

<section>
  <h2>B. 방사 막대 글리프 <span class="tag">심볼형</span></h2>
  <p class="note">같은 값을 면 없이 막대 여섯 개로만 그립니다. 아이콘처럼 작게 줄여도 성립합니다.</p>
  <div class="trio">${trio(glyph)}</div>
  <p class="verdict"><b>장점</b> 면적 착시가 없어 값이 정직하고, 프로필 옆에 붙일 '심볼'로 쓸 수 있다. <b>약점</b> 레이더보다 낯설어서 처음 보면 읽는 법을 한 번 배워야 한다.</p>
</section>

<section>
  <h2>C. 성향 사분면 <span class="tag">두 축만</span></h2>
  <p class="note">퍼짐이 가장 큰 두 축(다양성 × 몰입)만 남기고, 나머지 ${HEX_BASELINE_N}명을 회색 점으로 깔았습니다. 점선은 모집단 중앙값입니다.</p>
  <div class="wide">${quadrant(players)}</div>
  <p class="verdict"><b>장점</b> "남들 속 어디쯤"이 그대로 보인다 — 백분위 숫자가 필요 없다. 유형 이름을 붙이기도 자연스럽다. <b>약점</b> 두 축밖에 못 담는다. 실력·상승세는 버려진다.</p>
</section>

<section>
  <h2>D. 활동 지문 <span class="tag">요일 × 시간</span></h2>
  <p class="note">언제 치는지를 요일×시간 격자로. 색이 짙을수록 그 칸에 판수가 많습니다(각자 자기 최대값 기준, KST).</p>
  <div class="trio">${players.map((p, i) => `<figure class="v-card"><figcaption><i style="background:${HUES[i]}"></i>${p.name}</figcaption>${fingerprint(p)}</figure>`).join('')}</div>
  <p class="verdict"><b>장점</b> 정말로 '지문'처럼 사람마다 다르고, 위조가 안 되는 실데이터다. <b>약점</b> 성향 축과는 다른 이야기(생활 패턴)를 한다 — 육각형의 대체가 아니라 별도 카드감.</p>
</section>

<section>
  <h2>E. 축별 분포 스트립 <span class="tag">표의 시각화</span></h2>
  <p class="note">비교표를 그림으로 바꾼 것입니다. 회색 점이 모집단 ${HEX_BASELINE_N}명, 색 막대가 세 사람의 위치입니다(각 축 2~98% 구간).</p>
  <div class="wide">
${strips(players)}
  <p class="legend">${players.map((p, i) => `<span><i style="background:${HUES[i]}"></i>${p.name}</span>`).join('')}<span><i style="background:var(--muted);opacity:.4"></i>모집단</span></p>
  </div>
  <p class="verdict"><b>장점</b> 모집단이 실제로 어떻게 뭉쳐 있는지까지 보인다 — 역상성 축이 왜 위험한지(다닥다닥 붙어 있음)가 그림에서 바로 드러난다. <b>약점</b> '한 사람의 인상'이 아니라 '축의 해부'라 프로필용은 아니다.</p>
</section>

<section>
  <h2>F. 승패 바코드 <span class="tag">리듬</span></h2>
  <p class="note">최근 240판을 시간 순서로. 위 줄이 승, 아래 줄이 패 — 연승·연패가 띠의 결로 보입니다.</p>
  <div class="wide">
${players.map((p, i) => `<div class="code-row"><b><i style="background:${HUES[i]};width:.55rem;height:.55rem;border-radius:50%;display:inline-block;margin-right:.4rem"></i>${p.name}</b>${barcode(p)}</div>`).join('')}
  <p class="legend"><span><i style="background:var(--s1)"></i>승 (위)</span><span><i style="background:var(--s2)"></i>패 (아래)</span><span>← 과거 · 최근 →</span></p>
  </div>
  <p class="verdict"><b>장점</b> 연승·연패의 리듬이 질감으로 보이고 만들기 가장 싸다. <b>약점</b> 성향 요약이 아니라 최근사(史)다. 무드 멘트 옆에 붙이면 어울린다.</p>
</section>

<section class="pick">
  <h2>정리 — 형태마다 답하는 질문이 다릅니다</h2>
  <p><b>"나는 어떤 유형인가"</b> → A 레이더 또는 B 글리프. 같은 데이터고, 레이더는 익숙함·글리프는 정직함이 강점입니다.</p>
  <p><b>"남들 속 어디쯤인가"</b> → C 사분면(두 축 요약) 또는 E 스트립(여섯 축 전부).</p>
  <p><b>"나는 언제·어떤 리듬으로 치는가"</b> → D 지문, F 바코드. 성향 축과 별개의 이야기라 대체가 아니라 보완입니다.</p>
  <p>추천 조합: 프로필 상단에 <b>A(또는 B) 하나</b> + 펼치면 <b>E 스트립</b>으로 근거를 보여주고, D·F는 별도 카드로. 하나만 고른다면 — 익숙함이 중요하면 A, 정직함이 중요하면 B입니다.</p>
</section>
</div>
`;

  fs.writeFileSync(out, html, 'utf8');
  console.log(`${out} (${html.length.toLocaleString()}바이트)`);
}

main();
