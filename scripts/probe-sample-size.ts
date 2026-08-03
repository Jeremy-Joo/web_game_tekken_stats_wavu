// 랜덤 조회에 쓸 최소 판수 기준을 정하기 위한 프로브.
// (npm run probe:sample)
//
// "300판이면 충분한가"에 답하려면 **리포트의 각 섹션이 실제로 채워지는지**를 봐야 한다.
// 섹션마다 요구하는 표본이 다르다:
//   sessionAdvice   100판 (입구)
//   formBaseline    220판 (최근 20 + 직전 200)
//   reliable        구간 3개 × 50판 — 세션이 15판 이상이어야 셋째 구간이 찬다
//   레이팅대 버킷   위/아래 각 50판
//   약점 매치업     한 캐릭 상대 20판
//   시간대          한 칸 10판
//
// 공개 피드에서 실제 플레이어를 뽑아 판수별로 몇 개가 차는지 센다.

import { fetchReplays } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import { sessionAdvice } from '../lib/tekken/advice';
import { buildQuipFacts } from '../lib/tekken/quip-facts';
import { computeFromRecords } from '../lib/tekken/compute';

const FEED = 'https://wank.wavu.wiki/api/replays';
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

interface Row {
  id: string;
  games: number;
  advice: boolean;
  reliable: boolean;
  gap: boolean;
  matchup: boolean;
  seasons: number;
  filled: number;
}

async function main() {
  const res = await fetch(FEED, { headers: { Accept: 'application/json' } });
  const feed = (await res.json()) as Record<string, unknown>[];

  // 피드에서 고유 식별코드를 모은다 (한 경기에 두 명)
  const ids = new Set<string>();
  for (const b of feed) {
    for (const k of ['p1_polaris_id', 'p2_polaris_id']) {
      const v = b[k];
      if (typeof v === 'string' && v.length === 12) ids.add(v);
    }
  }
  const pool = [...ids];
  console.log(`피드 고유 플레이어 ${pool.length}명 — 그중 ${process.argv[2] ?? 14}명 표본\n`);

  const n = Number(process.argv[2] ?? 14);
  const rows: Row[] = [];
  // 앞에서부터 순서대로 (피드 순서는 경기 시각이라 실력과 무관하다)
  for (const id of pool.slice(0, n)) {
    try {
      const { records, myName } = normalizeReplays(await fetchReplays(id), id);
      if (!records.length) continue;
      const a = sessionAdvice(records);
      const f = buildQuipFacts({
        records,
        allRecords: records,
        today,
        tzOffsetMinutes: 9 * 60,
        tzKnown: true,
      });
      const r = computeFromRecords(records, id, myName, { matchesLimit: 0 });
      const seasons = new Set(records.map((x) => x.season)).size;
      const row: Row = {
        id,
        games: records.length,
        advice: a != null,
        reliable: a?.reliable ?? false,
        gap: !!(f?.vsUp && f?.vsDown),
        matchup: (r.tabs.find((t) => t.key === 'weak')?.rows.length ?? 0) > 0,
        seasons,
        filled: 0,
      };
      row.filled = [row.advice, row.reliable, row.gap, row.matchup, seasons > 1].filter(Boolean).length;
      rows.push(row);
      console.log(
        `${String(row.games).padStart(6)}판  ` +
          `흐름 ${row.advice ? 'O' : 'X'}  ` +
          `권장판수 ${row.reliable ? 'O' : 'X'}  ` +
          `레이팅대 ${row.gap ? 'O' : 'X'}  ` +
          `약점매치업 ${row.matchup ? 'O' : 'X'}  ` +
          `시즌 ${seasons}개  → ${row.filled}/5`,
      );
    } catch {
      /* 조회 실패는 건너뛴다 */
    }
    await new Promise((r) => setTimeout(r, 900)); // wavu 예의
  }

  console.log('\n── 판수 구간별 충족도 ──');
  for (const [lo, hi] of [[0, 100], [100, 300], [300, 600], [600, 1500], [1500, 1e9]]) {
    const g = rows.filter((r) => r.games >= lo && r.games < hi);
    if (!g.length) continue;
    const avg = (g.reduce((s, r) => s + r.filled, 0) / g.length).toFixed(1);
    console.log(
      `  ${String(lo).padStart(5)}~${hi === 1e9 ? '  +' : String(hi).padStart(5)}판  ` +
        `${String(g.length).padStart(2)}명  평균 ${avg}/5 채움`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
