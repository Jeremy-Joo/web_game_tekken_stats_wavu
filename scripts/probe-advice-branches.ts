// advice-text.md 가 제안한 '판정 갈래'가 실데이터에서 실제로 갈리는지 잰다.
// (npm run probe:advice -- <식별코드> ...)
//
// 문서는 "갈래를 늘리면 문장이 다양해진다"고 했지만, 갈래가 갈리지 않으면
// 문장만 늘고 화면은 그대로다. 넣기 전에 확인할 것:
//   ① 꺾이는 폭이 사람마다 다른가
//   ② 꺾이는 시점이 다른가
//   ③ goodUpTo ↔ stopAfter 간격이 벌어지는 사람이 있는가
//   ④ 첫 구간부터 나쁜 사람이 있는가
//   ⑤ avgDelta 가 음수인 구간이 실제로 있는가 (이기는데 레이팅은 제자리)
//   ⑥ reliable=false 인데 경기는 많은 사람이 있는가 (짧게 자주 하는 유형)
//   ⑦ 꺾였다가 다시 올라오는(U자) 사람이 있는가

import { fetchReplays } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import { sessionAdvice } from '../lib/tekken/advice';

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('식별코드를 하나 이상 주세요.');
  process.exit(1);
}

async function main() {
  for (const id of ids) {
    const replays = await fetchReplays(id);
    const { records, myName } = normalizeReplays(replays, id);
    const a = sessionAdvice(records);
    console.log(`\n=== ${myName || id} (${records.length}판) ===`);
    if (!a) {
      console.log('  advice=null (100판 미만)');
      continue;
    }

    const usable = a.bands.filter((b) => b.enough);
    console.log(
      `  reliable=${a.reliable} (표본 충분 구간 ${usable.length}/${a.bands.length})  ` +
        `통산 ${a.baselineWinRate}%  goodUpTo=${a.goodUpTo} stopAfter=${a.stopAfter}`,
    );

    // ⑥ 경기는 많은데 reliable=false 인가
    if (!a.reliable)
      console.log(
        `  ⑥ 경기 ${records.length}판인데 reliable=false → ` +
          `${records.length >= 300 ? '**짧게 자주 하는 유형**(표본 부족 아님)' : '진짜 표본 부족'}`,
      );

    // ① 꺾이는 폭 / ② 시점 / ③ 간격
    if (a.stopAfter != null) {
      const dropBand = usable.find((b) => b.from - 1 === a.stopAfter);
      const dropPp = dropBand ? Math.round((a.baselineWinRate - dropBand.winRate) * 10) / 10 : null;
      console.log(
        `  ①폭 ${dropPp ?? '-'}%p  ②시점 ${a.stopAfter}판  ` +
          `③간격 goodUpTo(${a.goodUpTo}) → stopAfter(${a.stopAfter}) = ${
            a.goodUpTo != null ? a.stopAfter - a.goodUpTo : '-'
          }`,
      );
      // ④ 첫 구간부터 나쁨
      if (a.stopAfter === 0) console.log(`  ④ 첫 구간부터 평균 이하`);
    }

    // ⑤ avgDelta — 승률은 괜찮은데 레이팅이 안 오르는 구간
    const noGain = usable.filter((b) => b.winRate >= a.baselineWinRate - 2 && b.avgDelta <= 0);
    console.log(
      `  ⑤ avgDelta: ${usable.map((b) => `${b.from}-${b.to}:${b.avgDelta}`).join(' ')}`,
    );
    if (noGain.length)
      console.log(
        `     → 이기는데 레이팅이 안 붙는 구간 ${noGain.map((b) => `${b.from}-${b.to}`).join(', ')}`,
      );

    // ⑦ U자 — 꺾인 뒤 다시 평균 위로 올라오는 구간이 있는가
    if (a.stopAfter != null) {
      const after = usable.filter((b) => b.from > a.stopAfter!);
      const rebound = after.find((b) => b.winRate >= a.baselineWinRate);
      console.log(`  ⑦ 꺾인 뒤 반등 ${rebound ? `있음 (${rebound.from}-${rebound.to})` : '없음'}`);
    }

    await new Promise((r) => setTimeout(r, 900));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
