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
const eq = (name: string, got: unknown, want: unknown, extra = '') => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  기대=${JSON.stringify(want)} 실제=${JSON.stringify(got)} ${extra}`}`,
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
  // +35%p 라 blazing 이다. hot 은 아래 케이스에서 따로 본다.
  eq('큰 상승 — blazing', moodOf(recs), 'blazing');
  eq(
    '중간 상승 — hot',
    moodOf(history([{ n: 1000, winRate: 40 }, { n: 20, winRate: 50 }])),
    'hot',
  );
}

// ── (4) 진짜로 식었으면 cold 여야 한다 ───────────────────────────
{
  const recs = history([
    { n: 1000, winRate: 60 },
    { n: 20, winRate: 25 },
  ]);
  // -35%p 라 frozen 이다. cold 는 편차를 줄여 따로 본다.
  eq('큰 하락 — frozen', moodOf(recs), 'frozen');
  eq(
    '중간 하락 — cold',
    moodOf(history([{ n: 1000, winRate: 60 }, { n: 20, winRate: 45 }])),
    'cold',
  );
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
  // 섞였다면 편차가 눌려 blazing 까지 못 올라간다 — 그게 이 테스트의 요지다.
  eq('기준선에서 recent 제외 — blazing', a.mood, 'blazing');
}

// ── (6) 오래 쉰 사람은 단정하지 않는다 ───────────────────────────
{
  const recs = history([
    { n: 1000, winRate: 40 },
    { n: 20, winRate: 75 },
  ]);
  eq('30일 이내면 그대로', moodOf(recs, 30), 'blazing');
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

// ── 판정 갈래 (docs/advice-text.md) ─────────────────────────────
//
// 분석문은 **틀려도 화면이 멀쩡하다** — 문장은 나오는데 내용이 데이터와 안 맞는다.
// 특히 stopAfter===0 은 falsy 라 조건식에서 조용히 반대편으로 떨어졌었다.

/**
 * 세션 길이를 지정해 이력을 만든다.
 * 세션 안 순번별 승률을 다르게 주려면 세션 경계(120분)를 넘겨 끊어야 한다.
 */
function sessions(count: number, perSession: number, wrAt: (pos: number) => number): MatchRecord[] {
  const out: MatchRecord[] = [];
  let t = Date.parse('2024-01-01T00:00:00Z') / 1000;
  let seq = 0;
  const acc: number[] = [];
  for (let s = 0; s < count; s++) {
    for (let i = 0; i < perSession; i++) {
      const pos = i + 1;
      acc[pos] = (acc[pos] ?? 0) + wrAt(pos);
      const win = acc[pos] >= 100;
      if (win) acc[pos] -= 100;
      out.push({
        dt: kstFromEpoch(t),
        battleId: `s${seq++}`,
        player: 'ME', myPolaris: 'MEMEMEMEMEME', myChar: 'Jin',
        myRating: 1500, myDelta: win ? 5 : -5, myPower: 0, myRank: 25,
        score: win ? '3-1' : '1-3', myRounds: win ? 3 : 1, oppRounds: win ? 1 : 3,
        result: win ? 'W' : 'L',
        oppName: 'OPP', oppPolaris: 'OPPOPPOPPOP1', oppChar: 'Kazuya',
        oppRating: 1500, oppDelta: win ? -5 : 5, oppPower: 0, oppRank: 25,
        season: 'S2', gameVersion: 20101, stageId: 1,
      });
      t += 10 * 60; // 세션 안: 10분 간격
    }
    t += 5 * 3600; // 세션 사이: 5시간 (경계 120분 초과)
  }
  return out;
}

// ④ 첫 구간부터 평균 이하 — 예전에는 "꺾이는 지점이 없었습니다"가 나갔다
{
  const recs = sessions(40, 30, (pos) => (pos <= 5 ? 20 : 70));
  const a = sessionAdvice(recs)!;
  eq('첫 구간부터 나쁨 — dropsFromStart', a.dropsFromStart, true);
  eq('첫 구간부터 나쁨 — stopAfter 는 0', a.stopAfter, 0);
  eq('첫 구간부터 나쁨 — 폭이 계산된다', typeof a.dropPp, 'number');
  eq('첫 구간부터 나쁨 — goodUpTo 는 null', a.goodUpTo, null);
}

// ① 꺾이는 폭 — 완만/급락이 갈리는가
{
  const mild = sessionAdvice(sessions(40, 30, (pos) => (pos <= 20 ? 60 : 55)))!;
  eq('완만한 하락은 폭이 작다', mild.dropPp != null && mild.dropPp < 6, true, `dropPp=${mild.dropPp}`);
  const sharp = sessionAdvice(sessions(40, 30, (pos) => (pos <= 20 ? 70 : 25)))!;
  eq('급락은 폭이 크다', sharp.dropPp != null && sharp.dropPp >= 6, true, `dropPp=${sharp.dropPp}`);
  eq('급락도 첫 구간부터는 아니다', sharp.dropsFromStart, false);
}

// 꺾이는 지점이 없으면 폭도 없다
{
  const flat = sessionAdvice(sessions(40, 30, () => 55))!;
  eq('평탄하면 stopAfter 없음', flat.stopAfter, null);
  eq('평탄하면 dropPp 도 null', flat.dropPp, null);
  eq('평탄하면 dropsFromStart 아님', flat.dropsFromStart, false);
}

// ⑥ 표본 부족의 이유가 갈리는가
{
  const short = sessionAdvice(sessions(63, 8, () => 50))!;
  eq('짧게 자주 하면 reliable=false', short.reliable, false);
  eq('  → 사유는 short (표본 부족 아님)', short.thinReason, 'short');
  const few = sessionAdvice(sessions(20, 6, () => 50))!;
  eq('경기가 적으면 사유는 few', few.thinReason, 'few');
  eq('충분하면 사유 없음', sessionAdvice(sessions(40, 30, () => 55))!.thinReason, null);
}

// ⑤ avgDelta — 이기는데 레이팅이 안 붙는 구간
{
  // 11~15판째만 **승률이 평균보다 높고** 레이팅은 안 붙는 구간으로 만든다.
  // 전 구간 승률이 같으면 '평균 초과'가 없어서 이 갈래가 아예 안 열린다 —
  // 그게 의도한 동작이다(레이팅이 전반적으로 내려가는 사람에게 배경 소음이 되지 않게).
  const recs = sessions(40, 30, (pos) => (pos >= 11 && pos <= 15 ? 80 : 55));
  let pos = 0;
  for (let i = 0; i < recs.length; i++) {
    if (i > 0 && recs[i].dt.getTime() - recs[i - 1].dt.getTime() > 120 * 60_000) pos = 0;
    pos++;
    if (pos >= 11 && pos <= 15) recs[i].myDelta = recs[i].result === 'W' ? 0 : -6;
  }
  const a = sessionAdvice(recs)!;
  eq(
    '이겨도 레이팅이 안 붙는 구간을 잡는다',
    a.noGainBands.some((b) => b.from === 11 && b.to === 15),
    true,
    JSON.stringify(a.noGainBands),
  );
}

// ── 6단계 mood 경계 ─────────────────────────────────────────────
//
// 경계가 조용히 밀리면 최상위/최하위 등급이 안 나오거나 남발된다. 화면은 멀쩡하다.
{
  // 기준선 40%, 최근 20판을 바꿔가며 각 등급이 나오는지 본다.
  const at = (recentWr: number) =>
    sessionAdvice(history([{ n: 1000, winRate: 40 }, { n: 20, winRate: recentWr }]))!.mood;

  eq('+25%p → blazing', at(65), 'blazing');
  eq('+15%p → hot (blazing 아님)', at(55), 'hot');
  eq('+5%p → steady', at(45), 'steady');
  eq('-10%p → cooling', at(30), 'cooling');
  eq('-15%p → cold', at(25), 'cold');
  eq('-25%p → frozen', at(15), 'frozen');

  // 연패도 한 단계씩 끌어내린다 (승률 편차와 무관하게)
  const streak = (n: number) =>
    sessionAdvice(history([{ n: 1000, winRate: 50 }, { n, winRate: 0 }]))!.mood;
  eq('3연패 → cooling', streak(3), 'cooling');
  eq('5연패 → cold', streak(5), 'cold');
  eq('7연패 → frozen', streak(7), 'frozen');

  // 오래 쉬면 등급을 단정하지 않는다 — 양 끝도 예외가 아니다
  const recs = history([{ n: 1000, winRate: 40 }, { n: 20, winRate: 65 }]);
  eq('blazing 도 31일 지나면 steady', sessionAdvice(recs, undefined, 31)!.mood, 'steady');
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
