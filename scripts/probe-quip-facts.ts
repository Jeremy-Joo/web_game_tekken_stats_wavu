// buildQuipFacts 를 **실데이터**로 돌려 값을 눈으로 검증한다.
// (npm run probe:facts -- <식별코드> [<식별코드> ...])
//
// scripts/check-quip-facts.ts 는 합성 입력으로 규칙을 못박는 단위 테스트고,
// 이쪽은 "진짜 사람 기록에서 말이 되는 숫자가 나오는가"를 본다. 둘 다 필요하다 —
// 단위 테스트는 내가 상상한 입력만 보고, 실데이터는 내가 상상 못 한 입력을 준다.

import { fetchReplays } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import { buildQuipFacts } from '../lib/tekken/quip-facts';

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('식별코드를 하나 이상 주세요.');
  process.exit(1);
}

const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

async function main() {
  for (const id of ids) {
    const replays = await fetchReplays(id);
    const { records, myName } = normalizeReplays(replays, id);
    const f = buildQuipFacts({
      records,
      allRecords: records,
      today,
      tzOffsetMinutes: 9 * 60,
      tzKnown: true, // 프로브라 켠다. 실제 화면은 guessTimezone 결과를 따른다.
    });
    console.log(`\n=== ${myName || id} (${records.length}판) ===`);
    if (!f) {
      console.log('  facts=null');
      continue;
    }
    console.log(`  마일스톤     ${f.milestone ?? '-'} (통산 ${f.totalGames})`);
    console.log(`  누적시간     ${f.hoursPlayed ?? '-'}시간`);
    console.log(
      `  레이팅       현재 ${f.currentRating} / 최고 ${f.peakRating} (${f.currentRating - f.peakRating}), ` +
        `최고는 ${f.peakGamesAgo}판 전, 방금갱신=${f.peakFresh}`,
    );
    console.log(
      `  회복         ${
        f.recovery
          ? `최저 ${f.recovery.troughRating} → +${f.recovery.up} (최고까지 ${f.recovery.toPeak})`
          : '-'
      }`,
    );
    console.log(
      `  단 변화      ${
        f.rankChange
          ? `${f.rankChange.up ? '승단' : '강등'} ${f.rankChange.gamesAgo}판 전, ` +
            `${f.rankChange.visits}번째, 전후차 ${f.rankChange.deltaPp ?? '표본부족'}`
          : '최근 없음'
      }`,
    );
    console.log(`  연승         현재 ${f.winStreak} / 최장 ${f.bestWinStreak}`);
    console.log(`  복귀         ${f.comebackDays ? `${f.comebackDays}일 만` : '-'}`);
    console.log(`  현지시각     ${f.clock ? `${f.clock.hour}시 dow=${f.clock.dow}` : 'null(모름)'}`);
    console.log(
      `  실력차       위 ${f.vsUp ? `${f.vsUp.wr}%(${f.vsUp.games})` : '-'} / ` +
        `아래 ${f.vsDown ? `${f.vsDown.wr}%(${f.vsDown.games})` : '-'} / 전체 ${f.overallWr}%`,
    );
    console.log(`  셧아웃 패    ${f.shutoutLossPct ?? '-'}%`);
    console.log(
      `  약점 매치업  ${f.worstMatchup ? `${f.worstMatchup.opp} ${f.worstMatchup.wr}%(${f.worstMatchup.games})` : '없음'}`,
    );
    console.log(`  마지막세션   ${f.lastSessionGames}판`);
    console.log(
      `  오늘 몰림    ${f.todaySameChar ? `${f.todaySameChar.opp} ${f.todaySameChar.count}회` : '-'}`,
    );
    console.log(
      `  어긋남       ${f.divergence ? `${f.divergence.kind} (${f.divergence.wins}승${f.divergence.losses}패, 순변화 ${f.divergence.net})` : '-'}`,
    );
    await new Promise((r) => setTimeout(r, 900)); // wavu 예의
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
