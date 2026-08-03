// sessionAdvice 의 mood 판정 단위 테스트. 네트워크를 쓰지 않는다.
//
// 왜 여기에 붙이나: **mood 가 틀려도 화면은 멀쩡하다.** 농담 한 줄이 상황과 어긋날 뿐
// 에러도 안 나고 숫자도 안 깨진다. CLAUDE.md 가 "조용히 깨지는 곳"에 테스트를 붙이라고
// 정해둔 부류다.
//
// 고정하는 규칙 셋:
//  (1) 기준선은 통산이 아니라 **직전 200판**이다 — 성장/하락한 사람의 mood 가
//      옛 자신과의 비교로 밀리지 않아야 한다.
//  (2) 기준선에서 최근 20판을 뺀다 — 재는 대상이 기준선에 섞이면 편차가 0 으로 눌린다.
//  (3) 오래 쉰 사람의 mood 는 단정하지 않는다(steady).

import { sessionAdvice } from '../lib/tekken/advice';
import { kstFromEpoch, type MatchRecord } from '../lib/tekken/models';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  기대=${JSON.stringify(want)} 실제=${JSON.stringify(got)}`}`,
  );
};

/**
 * 승패 패턴으로 이력을 만든다.
 *
 * 경기 간격은 세션 경계(120분)보다 짧게 두어 구간 분석이 정상 동작하게 하고,
 * 결과는 **결정론적으로** 배치한다 — 난수를 쓰면 임계값 근처에서 테스트가 흔들린다.
 */
function history(spec: { n: number; winRate: number }[], gapMin = 10): MatchRecord[] {
  const out: MatchRecord[] = [];
  let t = Date.parse('2024-01-01T00:00:00Z') / 1000;
  let seq = 0;
  for (const { n, winRate } of spec) {
    // 목표 승률에 맞춰 승리를 고르게 흩뿌린다 (몰아주면 연승/연패가 생겨 mood 가 오염된다)
    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += winRate;
      const win = acc >= 100;
      if (win) acc -= 100;
      out.push({
        dt: kstFromEpoch(t),
        battleId: `b${seq++}`,
        player: 'ME',
        myPolaris: 'MEMEMEMEMEME',
        myChar: 'Jin',
        myRating: 1500,
        myDelta: win ? 5 : -5,
        myPower: 0,
        myRank: 25,
        score: win ? '3-0' : '0-3',
        myRounds: win ? 3 : 0,
        oppRounds: win ? 0 : 3,
        result: win ? 'W' : 'L',
        oppName: 'OPP',
        oppPolaris: 'OPPOPPOPPOP1',
        oppChar: 'Kazuya',
        oppRating: 1500,
        oppDelta: win ? -5 : 5,
        oppPower: 0,
        oppRank: 25,
        season: 'S2',
        gameVersion: 20101,
        stageId: 1,
      });
      t += gapMin * 60;
    }
  }
  return out;
}

const moodOf = (recs: MatchRecord[], days = 0) => sessionAdvice(recs, undefined, days)?.mood;

// ── (1) 성장한 사람 — 통산과 비교하면 hot 로 밀린다 ──────────────
// 초반 4,000판을 30%, 그 뒤 400판을 55% 로 친다.
// 통산은 약 32% 라 최근 20판(55%)과의 차이가 +23%p → 옛 로직이면 영구 hot.
// 직전 200판도 55% 이므로 편차 0 → steady 가 맞다.
{
  const recs = history([
    { n: 4000, winRate: 30 },
    { n: 400, winRate: 55 },
  ]);
  const a = sessionAdvice(recs)!;
  eq('성장한 사람 — mood', a.mood, 'steady');
  eq('성장한 사람 — 기준선은 직전 200판(통산 아님)', a.formBaseline > 50, true);
  eq('성장한 사람 — 통산은 따로 남아 있다', a.baselineWinRate < 40, true);
  eq('성장한 사람 — 편차가 0 근처', Math.abs(a.recentDeltaPp) < 7, true);
}

// ── (2) 전성기가 지난 사람 — 통산과 비교하면 cold 로 밀린다 ──────
{
  const recs = history([
    { n: 4000, winRate: 70 },
    { n: 400, winRate: 45 },
  ]);
  const a = sessionAdvice(recs)!;
  eq('하락한 사람 — mood', a.mood, 'steady');
  eq('하락한 사람 — 기준선은 직전 200판', a.formBaseline < 50, true);
  eq('하락한 사람 — 통산은 따로 남아 있다', a.baselineWinRate > 60, true);
}

// ── (3) 진짜로 물이 올랐으면 hot 이어야 한다 ─────────────────────
// 기준선 구간(직전 200판)은 40%, 마지막 20판은 75%. 차이 +35%p.
{
  const recs = history([
    { n: 1000, winRate: 40 },
    { n: 20, winRate: 75 },
  ]);
  eq('실제 상승 — hot', moodOf(recs), 'hot');
}

// ── (4) 진짜로 식었으면 cold 여야 한다 ───────────────────────────
{
  const recs = history([
    { n: 1000, winRate: 60 },
    { n: 20, winRate: 25 },
  ]);
  eq('실제 하락 — cold', moodOf(recs), 'cold');
}

// ── (5) 기준선에 최근 20판이 섞이면 안 된다 ─────────────────────
// 섞였다면 마지막 20판이 기준선을 끌어올려 편차가 줄고 hot 을 놓친다.
{
  const recs = history([
    { n: 300, winRate: 45 },
    { n: 20, winRate: 90 },
  ]);
  const a = sessionAdvice(recs)!;
  eq('기준선에서 recent 제외 — 기준선은 45% 근처', Math.abs(a.formBaseline - 45) < 3, true);
  eq('기준선에서 recent 제외 — hot', a.mood, 'hot');
}

// ── (6) 오래 쉰 사람은 단정하지 않는다 ───────────────────────────
{
  const recs = history([
    { n: 1000, winRate: 40 },
    { n: 20, winRate: 75 },
  ]);
  eq('30일 이내면 그대로', moodOf(recs, 30), 'hot');
  eq('31일 지나면 steady 로 내린다', moodOf(recs, 31), 'steady');
  eq('반년 쉬었으면 steady', moodOf(recs, 180), 'steady');
}

// ── (7) 표본이 200 판에 못 미치면 통산으로 떨어진다 ──────────────
// 입구 조건이 100 판이라 formBase 는 최소 80 판이 보장된다. 폴백은 방어용.
{
  const recs = history([{ n: 120, winRate: 50 }]);
  const a = sessionAdvice(recs)!;
  eq('표본 부족 — formBaseline 은 계산된다', typeof a.formBaseline, 'number');
  eq('표본 부족 — 여전히 판정은 나온다', typeof a.mood, 'string');
}

// ── (8) 입구 조건 ────────────────────────────────────────────────
eq('99판이면 아예 말하지 않는다', sessionAdvice(history([{ n: 99, winRate: 50 }])), null);

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
