// 육각형 축의 모집단 기준값을 만든다. **개발자가 손으로 돌리는 스크립트다.**
//
// 조회할 때마다 남의 전적을 받아 백분위를 낼 수는 없다 — 느리고 wavu 에도 부담이다.
// 그래서 한 번 계산해서 lib/tekken/hexagon-baseline.ts 에 박아 둔다.
//
// 표본은 wavu 공개 피드(/api/replays)에서 뽑는다. 리더보드가 아니라 피드인 이유는
// 랜덤 기능과 같다 — 리더보드는 상위권만 있어서 기준값이 통째로 위로 밀린다
// (lib/wavu/pool.ts 주석 참조).
//
//   npx tsx scripts/build-hex-baseline.ts [표본수]

import fs from 'node:fs';
import { getRecords } from '../lib/wavu/cache';
// getPool 을 쓰지 않는다 — unstable_cache 로 감싸여 있어 Next 런타임 밖에서는 던진다.
// 어차피 이 스크립트는 한 번 돌리고 마는 것이라 캐시가 필요 없다.
async function feedIds(): Promise<{ id: string }[]> {
  const res = await fetch('https://wank.wavu.wiki/api/replays', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`wavu feed ${res.status}`);
  const feed = (await res.json()) as Record<string, unknown>[];
  const seen = new Set<string>();
  for (const b of feed)
    for (const side of ['p1', 'p2']) {
      const id = b[`${side}_polaris_id`];
      if (typeof id === 'string' && /^[A-Za-z0-9]{12}$/.test(id)) seen.add(id);
    }
  return [...seen].map((id) => ({ id }));
}
import { HEX_AXES } from '../lib/tekken/hexagon';

/** 이만큼은 있어야 축이 대부분 계산된다(성장 축이 400판을 요구한다). */
const MIN_GAMES = 500;
const TARGET = Number(process.argv[2]) || 60;
const QUANTILES = 21; // 0·5·…·100%

async function main() {
  const pool = await feedIds();
  // 섞는다 — 피드 순서는 최근 경기 순이라 그대로 쓰면 활동량 많은 쪽으로 쏠린다.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const vals: Record<string, number[]> = {};
  for (const ax of HEX_AXES) vals[ax.key] = [];
  let used = 0;
  let tried = 0;

  for (const p of pool) {
    if (used >= TARGET) break;
    tried++;
    let records;
    try {
      ({ records } = await getRecords(p.id));
    } catch {
      continue;
    }
    if (records.length < MIN_GAMES) continue;
    used++;
    for (const ax of HEX_AXES) {
      const v = ax.calc(records);
      if (v !== null && Number.isFinite(v)) vals[ax.key].push(v);
    }
    if (used % 10 === 0) console.log(`  ${used}명 (시도 ${tried})`);
  }

  const baseline: Record<string, number[]> = {};
  const report: string[] = [];
  for (const ax of HEX_AXES) {
    const s = vals[ax.key].sort((a, b) => a - b);
    const q: number[] = [];
    for (let i = 0; i < QUANTILES; i++) {
      // 0·5·…·100% 지점. 선형보간으로 뽑는다.
      const pos = (i / (QUANTILES - 1)) * (s.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      q.push(Math.round((s[lo] + (s[hi] - s[lo]) * (pos - lo)) * 10000) / 10000);
    }
    baseline[ax.key] = q;
    report.push(
      `//   ${ax.label.padEnd(4)} n=${String(s.length).padStart(3)}  ` +
        `하위25% ${q[5]}  중앙 ${q[10]}  상위25% ${q[15]}`,
    );
  }

  const out = `// 육각형 축의 모집단 기준값 — **자동 생성. 손으로 고치지 말 것.**
//
//   npx tsx scripts/build-hex-baseline.ts <표본수>
//
// 표본 ${used}명 (wavu 공개 피드에서 ${MIN_GAMES}판 이상, 후보 ${tried}명 중).
// 값은 축마다 0·5·…·100% 분위수 21개다.
//
${report.join('\n')}
//
// 시즌이 바뀌면 다시 돌린다 — 레이팅 분포가 통째로 움직이면 기준값이 낡는다.

import type { HexBaseline } from './hexagon';

export const HEX_BASELINE: HexBaseline = ${JSON.stringify(baseline, null, 2)};

/** 이 기준값이 몇 명에게서 나왔는가. 화면에 표본 크기를 밝히는 데 쓴다. */
export const HEX_BASELINE_N = ${used};

/**
 * 모집단 원값 (익명 — 값만 있고 누구인지는 없다).
 * 사분면·분포 스트립이 배경 점으로 쓴다. 분위수로는 개별 점을 못 그린다.
 */
export const HEX_RAW: Record<string, number[]> = ${JSON.stringify(
    Object.fromEntries(
      HEX_AXES.map((ax) => [
        ax.key,
        vals[ax.key].map((v) => Math.round(v * 10000) / 10000),
      ]),
    ),
  )};
`;

  fs.writeFileSync('lib/tekken/hexagon-baseline.ts', out, 'utf8');
  console.log(`\n표본 ${used}명 (후보 ${tried}명 시도)`);
  console.log(report.join('\n').replace(/\/\/ {3}/g, '  '));
  console.log('\nlib/tekken/hexagon-baseline.ts 갱신');
}

main();
