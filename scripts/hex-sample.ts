// 육각형 샘플 이미지를 그린다 (개발자용 — 화면 컴포넌트를 만들기 전에 눈으로 보려는 것).
//   npx tsx scripts/hex-sample.ts <식별코드> [<식별코드> …]

import fs from 'node:fs';
import { getRecords } from '../lib/wavu/cache';
import { hexScores, type HexScore } from '../lib/tekken/hexagon';


const CARD_W = 340; // 라벨이 바깥으로 뻗어서 300 이면 옆 카드와 붙는다
const R = 92; // 바깥 육각형 반지름
const CX = 150;
const CY = 132;
const RINGS = [0.25, 0.5, 0.75, 1];

/** 꼭짓점 좌표. 12시부터 시계방향 — 첫 축이 맨 위에 오는 게 읽기 편하다. */
function pt(i: number, n: number, r: number): [number, number] {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [CX + Math.cos(a) * R * r, CY + Math.sin(a) * R * r];
}

const poly = (n: number, r: number) =>
  Array.from({ length: n }, (_, i) => pt(i, n, r).map((v) => v.toFixed(1)).join(',')).join(' ');

function card(name: string, games: number, scores: HexScore[], color: string): string {
  const n = scores.length;
  // 못 내는 축은 0 이 아니라 중앙(50)으로 둔다 — 0 으로 그리면 '바닥'으로 읽힌다.
  const shape = scores
    .map((s, i) =>
      pt(i, n, (s.value ?? 50) / 100)
        .map((v) => v.toFixed(1))
        .join(','),
    )
    .join(' ');

  const rings = RINGS.map(
    (r) =>
      `<polygon points="${poly(n, r)}" fill="none" stroke="#2a2f3a" stroke-width="1"${
        r === 1 ? '' : ' stroke-dasharray="2 3"'
      }/>`,
  ).join('');

  const spokes = Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, n, 1);
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(
      1,
    )}" stroke="#2a2f3a" stroke-width="1"/>`;
  }).join('');

  const labels = scores
    .map((s, i) => {
      const [x, y] = pt(i, n, 1.24);
      const anchor = x < CX - 6 ? 'end' : x > CX + 6 ? 'start' : 'middle';
      const val = s.value === null ? '—' : Math.round(s.value);
      return (
        `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" ` +
        `font-size="11" fill="#e6e8ec">${s.label}` +
        `<tspan fill="${s.value === null ? '#6b7280' : color}" font-size="10"> ${val}</tspan></text>`
      );
    })
    .join('');

  const dots = scores
    .map((s, i) => {
      const [x, y] = pt(i, n, (s.value ?? 50) / 100);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${
        s.value === null ? '#6b7280' : color
      }"/>`;
    })
    .join('');

  return `<g>
  <text x="${CX}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#e6e8ec">${name}</text>
  <text x="${CX}" y="33" text-anchor="middle" font-size="10" fill="#9aa1ad">${games.toLocaleString()}경기</text>
  ${rings}${spokes}
  <polygon points="${shape}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
  ${dots}${labels}
</g>`;
}

const COLORS = ['#6ea8fe', '#70ad47', '#ed7d31', '#c77dff'];

async function main() {
  const ids = process.argv.slice(2);
  const cards: string[] = [];
  const notes: string[] = [];

  for (const [i, id] of ids.entries()) {
    const { records, myName } = await getRecords(id);
    const scores = hexScores(records);
    cards.push(
      `<g transform="translate(${i * CARD_W},0)">${card(
        myName || id,
        records.length,
        scores,
        COLORS[i % COLORS.length],
      )}</g>`,
    );
    notes.push(
      `${(myName || id).padEnd(14)} ` +
        scores
          .map((s) => `${s.label} ${s.value === null ? '—' : Math.round(s.value)}`)
          .join('  '),
    );
  }

  const W = ids.length * CARD_W;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="290" viewBox="0 0 ${W} 290" font-family="system-ui, sans-serif">
<rect width="${W}" height="290" fill="#12151c"/>
${cards.join('\n')}
<text x="12" y="280" font-size="10" fill="#6b7280">숫자 = 축 눈금 위 위치 (0~100). 이 사람의 전적만으로 정해지며 남과 비교하지 않는다.</text>
</svg>`;

  fs.writeFileSync('hex-sample.svg', svg, 'utf8');
  console.log(notes.join('\n'));
  console.log('\nhex-sample.svg 생성');
}

main();
