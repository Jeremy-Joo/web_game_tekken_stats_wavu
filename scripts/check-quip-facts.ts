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
}

function make(specs: Spec[]): MatchRecord[] {
  const out: MatchRecord[] = [];
  let t = T0;
  let seq = 0;
  let rating = 1500;
  for (const s of specs) {
    if (s.breakDays) t += s.breakDays * 86400;
    let acc = 0;
    for (let i = 0; i < s.n; i++) {
      acc += s.winRate ?? 50;
      const win = acc >= 100;
      if (win) acc -= 100;
      rating += win ? 5 : -5;
      out.push({
        dt: kstFromEpoch(t),
        battleId: `b${seq++}`,
        player: 'ME',
        myPolaris: 'MEMEMEMEMEME',
        myChar: 'Jin',
        myRating: rating,
        myDelta: win ? 5 : -5,
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

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
