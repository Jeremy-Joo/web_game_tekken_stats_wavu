// buildQuipFacts 의 단위 테스트. 네트워크를 쓰지 않는다.
//
// 여기서 지키는 것은 **"없는 걸 말하지 않는다"** 하나다. 농담은 틀려도 화면이 멀쩡하다 —
// 표본 가드가 풀리거나 isCurrent 게이트가 빠져도 에러가 안 난다. 대신 지난 시즌을 보는
// 사람에게 "방금 승단하셨군요"가 나간다. 조용히 깨지는 쪽이라 여기에 못박는다.

import { buildQuipFacts } from '../lib/tekken/quip-facts';
import { kstFromEpoch, type MatchRecord } from '../lib/tekken/models';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  기대=${JSON.stringify(want)} 실제=${JSON.stringify(got)}`}`,
  );
};

const T0 = Date.parse('2026-01-01T00:00:00Z') / 1000;
const TODAY = '2026-06-01';

interface Spec {
  n: number;
  winRate?: number;
  /** 경기 간격(분). 기본 3분 — 세션 안 연속. */
  gapMin?: number;
  rank?: number;
  opChar?: string;
  /** 이 묶음 앞에 이만큼 날을 비운다. */
  breakDays?: number;
  /** 라운드 0-3 패배(셧아웃)로 만든다. */
  shutout?: boolean;
  /** 상대 레이팅. 기본 1500 — 실력차 버킷을 만들려면 벌려야 한다. */
  opRating?: number;
  /** 승리 시 레이팅 증가폭(기본 5). 어긋남(divergence) 테스트용 — 승패 비대칭을 만든다. */
  winGain?: number;
  /** 패배 시 레이팅 감소폭(기본 5, 양수로 표기). */
  lossLoss?: number;
}

function make(specs: Spec[], startRating = 1500): MatchRecord[] {
  const out: MatchRecord[] = [];
  let t = T0;
  let seq = 0;
  let rating = startRating;
  for (const s of specs) {
    if (s.breakDays) t += s.breakDays * 86400;
    let acc = 0;
    for (let i = 0; i < s.n; i++) {
      acc += s.winRate ?? 50;
      const win = acc >= 100;
      if (win) acc -= 100;
      const delta = win ? (s.winGain ?? 5) : -(s.lossLoss ?? 5);
      rating += delta;
      out.push({
        dt: kstFromEpoch(t),
        battleId: `b${seq++}`,
        player: 'ME',
        myPolaris: 'MEMEMEMEMEME',
        myChar: 'Jin',
        myRating: rating,
        myDelta: delta,
        myPower: 0,
        myRank: s.rank ?? 25,
        score: win ? '3-1' : s.shutout ? '0-3' : '1-3',
        myRounds: win ? 3 : s.shutout ? 0 : 1,
        oppRounds: win ? 1 : 3,
        result: win ? 'W' : 'L',
        oppName: 'OPP',
        oppPolaris: 'OPPOPPOPPOP1',
        oppChar: s.opChar ?? 'Kazuya',
        oppRating: s.opRating ?? 1500,
        oppDelta: win ? -5 : 5,
        oppPower: 0,
        oppRank: 25,
        season: 'S3',
        gameVersion: 30101,
        stageId: 1,
      });
      t += (s.gapMin ?? 3) * 60;
    }
  }
  return out;
}

const facts = (recs: MatchRecord[], opts?: Partial<Parameters<typeof buildQuipFacts>[0]>) =>
  buildQuipFacts({
    records: recs,
    allRecords: recs,
    today: TODAY,
    tzOffsetMinutes: 9 * 60,
    tzKnown: true,
    ...opts,
  });

// ── 빈 입력 ──────────────────────────────────────────────────────
eq('빈 입력이면 null', facts([]), null);

// ── 마일스톤 ─────────────────────────────────────────────────────
eq('1,000판 직후면 마일스톤', facts(make([{ n: 1010 }]))!.milestone, 1000);
eq('창(60판)을 벗어나면 안 뜬다', facts(make([{ n: 1100 }]))!.milestone, null);
eq('마일스톤 미만이면 아래 단계', facts(make([{ n: 520 }]))!.milestone, 500);

// ── 누적 시간 ────────────────────────────────────────────────────
{
  // 3분 간격 300판 → 중앙 3분 × 300 = 900분 = 15시간
  eq('누적 시간 = 간격 중앙값 × 경기수', facts(make([{ n: 300, gapMin: 3 }]))!.hoursPlayed, 15);
  // 간격 표본이 100 미만이면 말하지 않는다
  eq('간격 표본 부족이면 null', facts(make([{ n: 60 }]))!.hoursPlayed, null);
  // 세션 사이 공백(며칠)이 평균에 섞이면 안 된다
  const split = make([{ n: 200, gapMin: 3 }, { n: 200, gapMin: 3, breakDays: 40 }]);
  eq('세션 사이 공백은 간격 표본에서 빠진다', facts(split)!.hoursPlayed, 20);
}

// ── 최고 레이팅 ──────────────────────────────────────────────────
{
  // 계속 이기면 마지막이 최고점
  const up = make([{ n: 200, winRate: 100 }]);
  eq('계속 이기면 최고는 0판 전', facts(up)!.peakGamesAgo, 0);
  eq('그러면 방금 갱신', facts(up)!.peakFresh, true);
  // 올랐다가 내려오면 최고점이 뒤에 남는다
  const down = make([{ n: 200, winRate: 100 }, { n: 100, winRate: 0 }]);
  eq('내려오면 최고는 100판 전', facts(down)!.peakGamesAgo, 100);
  eq('그러면 방금 갱신 아님', facts(down)!.peakFresh, false);
}

// ── 최저점 대비 회복 ─────────────────────────────────────────────
// make() 는 승리 +5 / 패배 -5 로 레이팅을 움직인다. 최고점(+500) → 낙폭 →
// 회복 폭을 판수로 만들어 경계(RECOVERY_DIP=150, RECOVERY_UP=100)를 못박는다.
{
  // 상승 100판(+500, 최고 2000) → 하락 40판(-200, 최저 1800) → 회복 30판(+150, 현재 1950)
  const v = make([
    { n: 100, winRate: 100 },
    { n: 40, winRate: 0 },
    { n: 30, winRate: 100 },
  ]);
  const r = facts(v)!.recovery;
  eq('V자면 회복이 잡힌다 (최저점)', r?.troughRating, 1800);
  eq('  올라온 폭', r?.up, 150);
  eq('  최고점까지 남은 폭', r?.toPeak, 50);

  // 낙폭이 150 미만이면(-100) 회복이라 부르지 않는다
  const shallowDip = make([
    { n: 100, winRate: 100 },
    { n: 20, winRate: 0 },
    { n: 30, winRate: 100 },
  ]);
  eq('낙폭이 작으면 null', facts(shallowDip)!.recovery, null);

  // 바닥에서 100 미만(+50) 올라온 건 회복이 아니다
  const smallUp = make([
    { n: 100, winRate: 100 },
    { n: 40, winRate: 0 },
    { n: 10, winRate: 100 },
  ]);
  eq('회복 폭이 작으면 null', facts(smallUp)!.recovery, null);

  // 최고점을 넘어서면 recovery 는 침묵하고 peakFresh 가 이어받는다
  const surpassed = make([
    { n: 100, winRate: 100 },
    { n: 40, winRate: 0 },
    { n: 60, winRate: 100 },
  ]);
  eq('최고점을 넘으면 null', facts(surpassed)!.recovery, null);
  eq('  그 순간은 peakFresh 가 잡는다', facts(surpassed)!.peakFresh, true);

  // '올라오는 중'은 현재형 — 지난 범위를 보면(isCurrent=false) 말하지 않는다
  const past = facts(v.slice(0, 150), { allRecords: v });
  eq('isCurrent 아니면 null', past!.recovery, null);

  // 최저점이 오래됐으면(200판 초과) 회복이 아니라 세월이다 — 실측 100% 발화 사고의 재발 방지
  const staleTrough = make([
    { n: 100, winRate: 100 },
    { n: 40, winRate: 0 },
    { n: 30, winRate: 100 },
    { n: 300, winRate: 50 }, // 회복 후 오래 평탄 — 바닥이 330판 전으로 밀려난다
  ]);
  eq('최저점이 오래되면 null', facts(staleTrough)!.recovery, null);
}

// ── 단 변화 ──────────────────────────────────────────────────────
{
  const recent = make([{ n: 200, rank: 24 }, { n: 5, rank: 25 }]);
  eq('최근 승단이면 잡힌다', facts(recent)!.rankChange?.up, true);
  eq('몇 판 전인지', facts(recent)!.rankChange?.gamesAgo, 4);
  // 표본이 양쪽 50 이상이라 전후 비교가 나온다
  eq('전후 비교는 표본 부족이면 null', facts(recent)!.rankChange?.deltaPp, null);

  const old = make([{ n: 200, rank: 24 }, { n: 40, rank: 25 }]);
  eq('오래된 단 변화는 안 잡는다(12판 초과)', facts(old)!.rankChange, null);

  // rank 가 0(값 없음)이면 변화로 세지 않는다
  const missing = make([{ n: 100, rank: 0 }, { n: 5, rank: 25 }]);
  eq('rank 0 은 변화로 안 센다', facts(missing)!.rankChange, null);
}

// ── 연승 ─────────────────────────────────────────────────────────
{
  // winRate 0 이면 전패라 앞 블록이 확실히 패배로 끝난다 (50 은 L,W,L,W… 라 승리로 끝난다)
  const f = facts(make([{ n: 200, winRate: 0 }, { n: 7, winRate: 100 }]))!;
  eq('현재 연승', f.winStreak, 7);
  eq('최장 연승은 그 이상', f.bestWinStreak >= 7, true);
  eq('마지막이 패배면 연승 0', facts(make([{ n: 200, winRate: 0 }]))!.winStreak, 0);
}

// ── 복귀 ─────────────────────────────────────────────────────────
{
  eq('30일 이상 쉬고 오면 복귀', facts(make([{ n: 200 }, { n: 20, breakDays: 69 }]))!.comebackDays, 69);
  eq('짧은 공백은 복귀가 아니다', facts(make([{ n: 200 }, { n: 20, breakDays: 3 }]))!.comebackDays, null);
}

// ── 시간대 가드 (제일 중요) ──────────────────────────────────────
{
  const recs = make([{ n: 200 }]);
  eq('시간대를 모르면 clock 은 null', facts(recs, { tzKnown: false })!.clock, null);
  eq('알면 값이 있다', typeof facts(recs, { tzKnown: true })!.clock?.hour, 'number');
  // 오프셋이 다르면 시각도 달라야 한다
  const kst = facts(recs, { tzOffsetMinutes: 9 * 60 })!.clock!.hour;
  const utc = facts(recs, { tzOffsetMinutes: 0 })!.clock!.hour;
  eq('오프셋이 9시간 차이면 시각도 9 차이', (kst - utc + 24) % 24, 9);
}

// ── 실력차 ───────────────────────────────────────────────────────
{
  // 내 레이팅은 1500 근처를 오가므로, 상대를 2000/1000 으로 두면 위/아래가 갈린다
  const f = facts(
    make([
      { n: 100, winRate: 20, opRating: 2000 }, // 나보다 훨씬 위
      { n: 100, winRate: 80, opRating: 1000 }, // 나보다 훨씬 아래
    ]),
  )!;
  eq('나보다 위 버킷이 잡힌다', f.vsUp?.games, 100);
  eq('나보다 아래 버킷이 잡힌다', f.vsDown?.games, 100);
  eq('위쪽 승률이 아래쪽보다 낮다', f.vsUp!.wr < f.vsDown!.wr, true);
  // 표본이 적으면 null (버킷당 50 미만)
  eq('표본 부족이면 null', facts(make([{ n: 110, opRating: 2000 }]))!.vsDown, null);
}

// ── 셧아웃 ───────────────────────────────────────────────────────
{
  const f = facts(make([{ n: 200, winRate: 0, shutout: true }]))!;
  eq('전부 0-3 패면 셧아웃 100%', f.shutoutLossPct, 100);
  eq('표본 부족이면 null', facts(make([{ n: 40 }]))!.shutoutLossPct, null);
}

// ── 약점 매치업 ──────────────────────────────────────────────────
{
  // Kazuya 상대 50%, Lili 상대 0% → Lili 가 약점
  const f = facts(make([{ n: 200, winRate: 50 }, { n: 30, winRate: 0, opChar: 'Lili' }]))!;
  eq('약점 매치업을 지목한다', f.worstMatchup?.opp, 'Lili');
  // 이름을 모르는 캐릭(#42)은 지목하지 않는다
  const unk = facts(make([{ n: 200, winRate: 50 }, { n: 30, winRate: 0, opChar: '#42' }]))!;
  eq('이름 모르는 캐릭은 지목 안 함', unk.worstMatchup, null);
  // 전체 승률과 비슷하면 약점이 아니다
  const flat = facts(make([{ n: 200, winRate: 50 }, { n: 30, winRate: 50, opChar: 'Lili' }]))!;
  eq('승률이 비슷하면 약점 아님', flat.worstMatchup, null);
}

// ── isCurrent 게이트 (두 번째로 중요) ────────────────────────────
{
  const all = make([{ n: 300 }, { n: 100, breakDays: 60 }]);
  const scoped = all.slice(0, 300); // 지난 구간만 보는 상황
  const f = buildQuipFacts({
    records: scoped,
    allRecords: all,
    today: TODAY,
    tzOffsetMinutes: 9 * 60,
    tzKnown: true,
  })!;
  eq('범위가 과거면 isCurrent=false', f.isCurrent, false);
  eq('  → 마일스톤 안 뜬다', f.milestone, null);
  eq('  → 단 변화 안 뜬다', f.rankChange, null);
  eq('  → 연승 0', f.winStreak, 0);
  eq('  → 복귀 안 뜬다', f.comebackDays, null);
  eq('  → 시각 안 뜬다', f.clock, null);
  eq('  → 최고 갱신 아님', f.peakFresh, false);
  // 특성 계열은 범위를 설명하는 값이라 그대로 나온다
  eq('  → 셧아웃은 그대로 계산', typeof f.shutoutLossPct, 'number');
  eq('  → 전체 승률도 그대로', typeof f.overallWr, 'number');

  const cur = buildQuipFacts({
    records: all,
    allRecords: all,
    today: TODAY,
    tzOffsetMinutes: 9 * 60,
    tzKnown: true,
  })!;
  eq('범위가 현재까지면 isCurrent=true', cur.isCurrent, true);
}

// ── 오늘 몰림 ────────────────────────────────────────────────────
{
  // TODAY 와 겹치게 만들려면 날짜를 맞춰야 한다 — 합성 데이터는 2026-01-01 부터라
  // 오늘과 겹치지 않는다. 겹치지 않으면 null 이어야 한다.
  eq('오늘 경기가 없으면 null', facts(make([{ n: 200 }]))!.todaySameChar, null);
}

// ── 승률·레이팅 어긋남(divergence) — 구간별 손익분기(breakevenWinRate) ──────
// 2026-08-07 실측(docs/rating-threshold-research.md)으로 60%/48% 고정값을
// 구간별 값으로 바꿨다 — 여기서 못박는 건 "같은 승률·순변화라도 레이팅 구간이
// 다르면 판정이 달라진다"는 것 자체다(고정값 시절엔 있을 수 없던 동작).
{
  // 25판 중 14승(56%) — 옛 고정 HI(60%)보다 낮아 옛 시스템이면 어느 구간에서도
  // winNoGain 이 안 열렸을 승률. winGain=1/lossLoss=5 로 순변화를 마이너스로 만든다.
  const pattern = [{ n: 25, winRate: 56, winGain: 1, lossLoss: 5 }];

  // 저구간(750~999, 손익분기 17.5%대라 문턱이 낮다): 여기선 14승이 문턱을 넘는다.
  const low = facts(make(pattern, 900))!;
  eq('저구간 — 56% 승률이면 winNoGain (문턱이 낮다)', low.divergence?.kind, 'winNoGain');
  eq('저구간 — sixState도 같은 계산이라 winNoGain', low.sixState?.kind, 'winNoGain');

  // 고구간(2250~2499, 손익분기 64%대라 문턱이 높다): 같은 55%대 승률로는 안 열린다.
  const high = facts(make(pattern, 2450))!;
  eq('고구간 — 같은 56% 승률은 winNoGain 안 열림 (문턱이 높다)', high.divergence, null);
  // divergence는 여기서 침묵하지만(winNoGain/loseButGain/flatEven 어디에도 안 들어맞음),
  // sixState는 같은 계산에서 '정상 패배'(승률도 못 미치고 순변화도 뚜렷이 마이너스)까지
  // 담아낸다 — 이게 요일 테마가 상태 축에서 새로 얻는 정보다(weekday-jokes.ts 참조).
  eq('고구간 — divergence가 버리는 정상패배를 sixState는 잡아낸다', high.sixState?.kind, 'normalLose');
}
{
  // loseButGain — 저승률(20%)인데 순변화가 뚜렷이 양수(+15 이상).
  const f = facts(make([{ n: 25, winRate: 20, winGain: 10, lossLoss: 1 }], 1470))!;
  eq('중구간 — 저승률+순변화 양수는 loseButGain', f.divergence?.kind, 'loseButGain');
  eq('중구간 — sixState도 같은 계산이라 loseButGain', f.sixState?.kind, 'loseButGain');
}
{
  // flatEven — 저승률(20%)인데 순변화가 거의 0.
  const f = facts(make([{ n: 25, winRate: 20, winGain: 3, lossLoss: 1 }], 1505))!;
  eq('중구간 — 저승률+순변화 거의 0은 flatEven', f.divergence?.kind, 'flatEven');
  eq('중구간 — sixState도 같은 계산이라 flatEven', f.sixState?.kind, 'flatEven');
}

// ── sixState 전용 — divergence가 일부러 버리는 세 상태(요일 테마 전용) ──────
// 같은 창·같은 손익분기 계산에서 나온다는 걸 보장하려고 quip-facts.ts 안에서
// 같이 만든다(weekday-jokes.ts 머리말 참조) — 여기서 그 여섯 칸이 서로 안
// 겹치고 전부 채워지는지 못박는다.
{
  // normalWin — 손익분기 뚜렷이 위(승수 15/25, 문턱 14) + 순변화 양수.
  const f = facts(make([{ n: 25, winRate: 60, winGain: 5, lossLoss: 1 }], 1505))!;
  eq('정상승리 — 손익분기 위 + 순변화 양수는 normalWin', f.sixState?.kind, 'normalWin');
  eq('정상승리는 divergence 축에는 안 잡힌다(정상은 mood가 맡는다)', f.divergence, null);
}
{
  // near — 손익분기 근방(승수 12/25, 문턱 10~14 사이)이라 방향이 뚜렷하지 않다.
  const f = facts(make([{ n: 25, winRate: 48, winGain: 5, lossLoss: 5 }], 1505))!;
  eq('애매 — 손익분기 근방(뚜렷하지 않음)은 near', f.sixState?.kind, 'near');
  eq('애매도 divergence 축에는 안 잡힌다', f.divergence, null);
}
{
  // normalLose — 손익분기 뚜렷이 아래(승수 5/25, 문턱 10) + 순변화가 뚜렷이 마이너스.
  const f = facts(make([{ n: 25, winRate: 20, winGain: 1, lossLoss: 10 }], 1505))!;
  eq('정상패배 — 손익분기 아래 + 순변화 마이너스는 normalLose', f.sixState?.kind, 'normalLose');
  eq('정상패배도 divergence 축에는 안 잡힌다', f.divergence, null);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
