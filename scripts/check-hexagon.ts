// 글리프 눈금 자가검증 (네트워크 없음).
//
// 여기가 지키는 것은 **조용히 깨지는 것들**이다 — 셋 다 화면은 멀쩡하고 숫자만 틀린다.
//  1. hexScores() 가 다시 남의 전적을 받게 되는 것. 백분위로 되돌아가면 조회자가
//     한 판도 안 쳤는데 모양이 바뀐다(lib/tekken/hexagon.ts 머리말 참조).
//  2. 눈금 밖 값이 막대를 넘치게 하는 것.
//  3. 중립값이 지표 정의가 아니라 관례에서 오는 것 — 기준선은 "여기가 본전"이라는
//     단언이라 근거가 없으면 그리면 안 된다.

import { readFileSync } from 'node:fs';
import { hexScores, HEX_AXES, EXPECTED_VS_STRONGER } from '../lib/tekken/hexagon';
import type { MatchRecord } from '../lib/tekken/models';

let fail = 0;
const ok = (m: string) => console.log(`ok    ${m}`);
const bad = (m: string, d: string) => {
  console.error(`FAIL  ${m}\n      ${d}`);
  fail++;
};

/** 최소한의 합성 레코드. 필요한 필드만 채운다. */
function rec(o: Partial<MatchRecord> & { dt: Date; result: 'W' | 'L' }): MatchRecord {
  return {
    battleId: Math.random().toString(36).slice(2),
    player: 'p',
    myPolaris: 'x',
    myChar: 'Jack-8',
    myRating: 1500,
    myDelta: 0,
    myPower: 0,
    myRank: 1,
    score: '3-0',
    myRounds: o.result === 'W' ? 3 : 0,
    oppRounds: o.result === 'W' ? 0 : 3,
    oppName: 'o',
    oppPolaris: 'y',
    oppChar: 'Paul',
    oppRating: 1500,
    oppDelta: 0,
    oppPower: 0,
    oppRank: 1,
    season: 'S3',
    ...o,
  } as MatchRecord;
}

// ── 1. 계약: 인자가 하나뿐인가 ────────────────────────────────
{
  hexScores.length === 1
    ? ok('hexScores(records) — 인자 하나')
    : bad('hexScores 인자', `${hexScores.length}개다. 남의 전적이 다시 들어왔는지 확인할 것`);

  const src = readFileSync('lib/tekken/hexagon.ts', 'utf8');
  const body = src.slice(src.indexOf('export function hexScores'));
  /baseline|BASELINE|percentile/i.test(body)
    ? bad('hexScores 본문', '모집단(baseline/percentile)을 참조한다 — 절대 눈금 계약 위반')
    : ok('hexScores 본문에 모집단 참조 없음');
}

// ── 2. 눈금 자체가 성립하는가 ────────────────────────────────
for (const ax of HEX_AXES) {
  ax.min < ax.max
    ? ok(`${ax.label} 눈금 ${ax.min} < ${ax.max}`)
    : bad(`${ax.label} 눈금`, `min(${ax.min}) >= max(${ax.max})`);
  if (ax.neutral !== null) {
    ax.neutral > ax.min && ax.neutral < ax.max
      ? ok(`${ax.label} 중립 ${ax.neutral} 이 눈금 안`)
      : bad(`${ax.label} 중립`, `${ax.neutral} 이 눈금 ${ax.min}~${ax.max} 밖이라 기준선을 못 그린다`);
  }
  ax.scaleWhy.length > 10
    ? ok(`${ax.label} 눈금 근거 있음`)
    : bad(`${ax.label} scaleWhy`, '근거가 비었다 — 눈금을 바꿀 때 고칠 문장이 없다');
}

// ── 3. 중립은 지표 정의에서 와야 한다 ────────────────────────
// 관례로 고른 값을 기준선으로 그리면 "여기가 본전"이라고 거짓 단언하게 된다.
const NEUTRAL_EXPECT: Record<string, number | null> = {
  skill: 0.5,                       // 라운드는 이기거나 진다
  variety: null,                    // 고르게 쓰는 정도에 본전은 없다
  grind: null,                      // 하루 몇 판에 본전은 없다
  growth: 0,                        // 변화 없음
  stamina: 1,                       // 초반과 같음
  giantkill: EXPECTED_VS_STRONGER,  // Elo 기대승률
};
for (const ax of HEX_AXES) {
  const want = NEUTRAL_EXPECT[ax.key];
  const got = ax.neutral;
  const same = want === null ? got === null : got !== null && Math.abs(got - want) < 1e-9;
  same
    ? ok(`${ax.label} 중립 = ${want === null ? '없음' : want.toFixed(4)}`)
    : bad(`${ax.label} 중립`, `기대 ${want}, 실제 ${got}. 지표 정의에서 나온 값인지 확인할 것`);
}

// Elo 기대승률이 진짜 그 값인가 (상수를 손으로 바꿔 넣는 사고 방지)
Math.abs(EXPECTED_VS_STRONGER - 0.428537) < 1e-5
  ? ok(`Elo 기대승률(Δ=50) = ${EXPECTED_VS_STRONGER.toFixed(5)}`)
  : bad('EXPECTED_VS_STRONGER', `${EXPECTED_VS_STRONGER} — 1/(1+10^(50/400)) 이어야 한다`);

// ── 4. 표본이 모자란 축은 null 이어야 한다 ───────────────────
{
  const day = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n * 3));
  const few = [rec({ dt: day(0), result: 'W' }), rec({ dt: day(1), result: 'L' })];
  const s = hexScores(few);
  const byKey = Object.fromEntries(s.map((x) => [x.key, x]));
  byKey.growth.value === null
    ? ok('400판 미만 → 상승세 null (0 으로 안 채움)')
    : bad('상승세', `표본 2판인데 ${byKey.growth.value} 가 나왔다`);
  byKey.stamina.value === null
    ? ok('세션 표본 부족 → 지구력 null')
    : bad('지구력', `표본 2판인데 ${byKey.stamina.value} 가 나왔다`);
  byKey.skill.value !== null
    ? ok('실력은 2판으로도 계산됨')
    : bad('실력', '라운드가 있는데 null 이다');
}

// ── 5. 눈금 밖 값이 0~100 을 안 넘는가 ───────────────────────
{
  const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + Math.floor(n / 20), 0, (n % 20) * 3));
  // 전승 → 라운드 승률 1.0 (눈금 위끝 0.65 를 넘는다)
  const allWin = Array.from({ length: 40 }, (_, i) => rec({ dt: day(i), result: 'W' }));
  const s = hexScores(allWin);
  const skill = s.find((x) => x.key === 'skill')!;
  skill.value === 100
    ? ok('눈금 위끝 초과 → 100 에서 멈춤')
    : bad('실력 클램프', `전승인데 value=${skill.value} (100 이어야)`);
  s.every((x) => x.value === null || (x.value >= 0 && x.value <= 100))
    ? ok('모든 축 value 가 0~100 안')
    : bad('value 범위', '0~100 밖의 값이 있다');
  s.every((x) => x.neutral === null || (x.neutral >= 0 && x.neutral <= 100))
    ? ok('모든 축 neutral 이 0~100 안')
    : bad('neutral 범위', '0~100 밖의 기준선이 있다');
}

// ── 5-B. 다양성 = 실질 캐릭터 수 ─────────────────────────────
// 사고 이력: 정규화 엔트로피(h/log n)를 쓰다가 **두 캐릭 반반과 열 캐릭 고르게가
// 둘 다 1.00** 이 되는 걸 발견해 exp(h) 로 바꿨다. 그게 다시 뒤집히지 않게 막는다.
{
  const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + Math.floor(n / 20), 0, (n % 20) * 3));
  const variety = (chars: string[]) => {
    const rs = chars.map((c, i) => rec({ dt: day(i), result: 'W', myChar: c }));
    return hexScores(rs).find((x) => x.key === 'variety')!;
  };
  const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.05;

  const one = variety(Array.from({ length: 40 }, () => 'Jack-8'));
  near(one.raw, 1)
    ? ok('한 캐릭만 → 실질 1.0캐릭')
    : bad('다양성 단일', `raw=${one.raw} (1 이어야)`);

  const two = variety(Array.from({ length: 40 }, (_, i) => (i % 2 ? 'Jack-8' : 'Paul')));
  near(two.raw, 2)
    ? ok('두 캐릭 반반 → 실질 2.0캐릭')
    : bad('다양성 2캐릭', `raw=${two.raw} (2 여야)`);

  const ten = variety(Array.from({ length: 40 }, (_, i) => `C${i % 10}`));
  near(ten.raw, 10)
    ? ok('열 캐릭 고르게 → 실질 10.0캐릭')
    : bad('다양성 10캐릭', `raw=${ten.raw} (10 이어야)`);

  // 핵심: 둘이 **달라야** 한다. 정규화 엔트로피였다면 둘 다 1.00 이었다.
  two.raw !== null && ten.raw !== null && ten.raw > two.raw + 1
    ? ok('두 캐릭 반반 < 열 캐릭 고르게 (폭을 잰다)')
    : bad('다양성 폭', `2캐릭 ${two.raw} vs 10캐릭 ${ten.raw} — 정규화 엔트로피로 되돌아갔는지 확인할 것`);

  // 주력 편중이 반영되는가: 10캐릭이지만 하나가 압도적이면 실질은 작아야 한다.
  const skew = variety(Array.from({ length: 100 }, (_, i) => (i < 91 ? 'Jack-8' : `C${i % 9}`)));
  skew.raw !== null && skew.raw < 3
    ? ok(`주력 91% + 9캐릭 → 실질 ${skew.raw.toFixed(1)}캐릭 (캐릭 수가 아니라 편중을 본다)`)
    : bad('다양성 편중', `raw=${skew.raw} — 주력 편중이 반영 안 됐다`);

  one.rawText && one.rawText.includes('캐릭')
    ? ok(`단위 표기 있음 (${one.rawText})`)
    : bad('다양성 단위', `rawText=${one.rawText} — 무단위 숫자는 읽을 수 없다`);
}

// ── 6. 같은 입력이면 같은 결과 (남의 데이터에 안 흔들린다) ───
{
  const day = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n * 3));
  const rs = Array.from({ length: 40 }, (_, i) => rec({ dt: day(i), result: i % 3 ? 'W' : 'L' }));
  const a = JSON.stringify(hexScores(rs).map((x) => [x.key, x.value]));
  const b = JSON.stringify(hexScores([...rs]).map((x) => [x.key, x.value]));
  a === b ? ok('같은 전적 → 같은 점수') : bad('결정성', '같은 입력에 다른 결과가 나왔다');
}

console.log(fail === 0 ? '\n전부 통과' : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
