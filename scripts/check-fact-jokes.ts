// 우선순위 사다리와 축별 발화 조건의 단위 테스트. 네트워크를 쓰지 않는다.
//
// 왜 필요한가: 사다리가 뒤집혀도 **에러가 안 난다.** 그냥 10,000판 달성한 사람에게
// "금요일 밤입니다"가 나갈 뿐이다. 조용히 깨지는 쪽이라 여기서 못박는다.

import { factPools } from '../app/fact-jokes';
import { pickJoke } from '../app/jokes';
import { pickWeekdayJoke, type WeekdayTheme } from '../app/weekday-jokes';
import type { QuipFacts } from '../lib/tekken/quip-facts';

let failed = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : `  ${extra}`}`);
};
const has = (arr: string[], needle: string) => arr.some((s) => s.includes(needle));

/** 아무 축도 안 열리는 기본값. 여기에 하나씩 켜면서 본다. */
const base: QuipFacts = {
  isCurrent: true,
  milestone: null,
  totalGames: 1234,
  hoursPlayed: null,
  peakRating: 1800,
  currentRating: 1600,
  peakGamesAgo: 10,
  peakFresh: false,
  recovery: null,
  rankChange: null,
  winStreak: 0,
  bestWinStreak: 9,
  comebackDays: null,
  clock: null,
  vsUp: null,
  vsDown: null,
  overallWr: 50,
  shutoutLossPct: null,
  worstMatchup: null,
  lastSessionGames: 20,
  todaySameChar: null,
  divergence: null,
  sixState: null,
};
const f = (over: Partial<QuipFacts>): QuipFacts => ({ ...base, ...over });

// ── 아무것도 안 열리면 조용하다 ──────────────────────────────────
{
  const p = factPools(base, 'ko', 'steady');
  ok('아무 축도 없으면 events 비어 있다', p.events.length === 0);
  ok('rankChange 도 비어 있다', p.rankChange.length === 0);
  ok('traits 도 비어 있다', p.traits.length === 0);
  ok('facts 가 null 이면 둘 다 빈다', factPools(null, 'ko', 'steady').events.length === 0);
}

// ── 우선순위 (이 파일의 핵심) ────────────────────────────────────
{
  // 전부 동시에 켠다(연승·오늘 몰림은 2026-08-07부로 완전히 뺐으므로 fixture에서도
  // 뺐다 — factPools 가 그 필드들을 아예 안 읽는다). 마일스톤이 이겨야 한다.
  const all = f({
    milestone: 10_000,
    hoursPlayed: 540,
    peakFresh: true,
    rankChange: { up: true, gamesAgo: 1, visits: 3, deltaPp: null },
    comebackDays: 60,
    clock: { hour: 3, dow: 1 },
  });
  const top = factPools(all, 'ko', 'cold').events[0];
  ok('전부 켜지면 마일스톤이 이긴다', has(top, '10,000판'), JSON.stringify(top[0]));

  // 승단·강등은 2026-08-06부터 events 가 아니라 별도 필드다(확률 게이트, jokes.ts
  // RANKCHANGE_EVERY 참조) — events 사다리와 무관하게 항상 채워져 있어야 한다.
  ok('rankChange 는 events 와 별개로 항상 채워진다', has(factPools(all, 'ko', 'cold').rankChange, '승급'));

  // 마일스톤을 끄면 최고 갱신
  const noMile = factPools(f({ ...all, milestone: null }), 'ko', 'cold').events[0];
  ok('마일스톤 없으면 최고 갱신', has(noMile, '최고 레이팅'), JSON.stringify(noMile[0]));

  // 그 다음 복귀 (승단·강등, 연승, 오늘 몰림은 이 사다리에 없다)
  const noPeak = factPools(f({ ...all, milestone: null, peakFresh: false }), 'ko', 'cold').events[0];
  ok('그 다음은 복귀', has(noPeak, '60일'), JSON.stringify(noPeak[0]));

  // 복귀까지 끄면 남는 건 시각뿐인데, 시각도 2026-08-06부터 events 사다리에 없다
  // (확률 게이트, jokes.ts CLOCK_EVERY 참조) — events 는 완전히 비어야 한다.
  const clockOnly = factPools(f({ ...all, milestone: null, peakFresh: false, comebackDays: null }), 'ko', 'cold');
  ok('시각만 남으면 events 는 빈다', clockOnly.events.length === 0);
  ok('시각은 별도 필드로 채워진다', has(clockOnly.clock, '새벽'));
}

// ── 시각 축 — 시간대를 모르면 침묵 (제1 규칙) ─── (2026-08-06: 별도 필드로 이동) ──
{
  ok('clock 이 null 이면 시각 축 없음', factPools(f({ clock: null }), 'ko', 'cold').clock.length === 0);
  ok('새벽 3시는 열린다', factPools(f({ clock: { hour: 3, dow: 1 } }), 'ko', 'cold').clock.length > 0);
  ok(
    '일요일 밤 열린다',
    has(factPools(f({ clock: { hour: 22, dow: 0 } }), 'ko', 'cold').clock, '일요일'),
  );
  ok(
    '금요일 밤 hot 은 다른 문구',
    has(factPools(f({ clock: { hour: 22, dow: 5 } }), 'ko', 'hot').clock, '주말이 위험'),
  );
  ok(
    '점심시간 열린다',
    has(factPools(f({ clock: { hour: 12, dow: 3 } }), 'ko', 'cold').clock, '점심'),
  );
  ok(
    '평일 저녁 8시는 아무것도 안 연다',
    factPools(f({ clock: { hour: 20, dow: 3 } }), 'ko', 'cold').clock.length === 0,
  );
}

// 연승·오늘 몰림 단위 테스트는 2026-08-07 기능 제거와 함께 삭제했다 —
// winStreak()·todaySameChar() 함수 자체가 fact-jokes.ts 에 더 이상 없다.

// ── 승단·강등 — events 가 아니라 별도 필드다(2026-08-06, 확률 게이트) ────
// "없는 걸 말하지 않는다" 규칙 자체는 그대로다 — 필드만 옮겼다.
{
  // 재방문이 적으면 '문지방' 문구가 없어야 한다
  const few = factPools(f({ rankChange: { up: true, gamesAgo: 1, visits: 2, deltaPp: null } }), 'ko', 'steady').rankChange;
  ok('재방문이 적으면 문지방 문구 없음', !has(few, '문지방'));
  const many = factPools(f({ rankChange: { up: true, gamesAgo: 1, visits: 9, deltaPp: null } }), 'ko', 'steady').rankChange;
  ok('재방문이 많으면 횟수를 그대로 말한다', has(many, '9번째'));
  // 전후 비교가 null 이면 그 문구가 없어야 한다
  ok('deltaPp 가 null 이면 승률 하락 문구 없음', !has(many, '%p 떨어졌'));
  const withDelta = factPools(
    f({ rankChange: { up: true, gamesAgo: 1, visits: 2, deltaPp: -12 } }),
    'ko',
    'steady',
  ).rankChange;
  ok('deltaPp 가 있으면 인용한다', has(withDelta, '12%p 떨어졌'));
  // 하락이 작으면 말하지 않는다 (노이즈)
  const small = factPools(
    f({ rankChange: { up: true, gamesAgo: 1, visits: 2, deltaPp: -1 } }),
    'ko',
    'steady',
  ).rankChange;
  ok('하락이 작으면 인용 안 함', !has(small, '%p 떨어졌'));
  // 강등은 다른 문구
  ok(
    '강등은 강등이라고 말한다',
    has(factPools(f({ rankChange: { up: false, gamesAgo: 0, visits: 2, deltaPp: null } }), 'ko', 'steady').rankChange, '강등'),
  );
  ok('rankChange 없으면 필드가 빈다', factPools(base, 'ko', 'steady').rankChange.length === 0);

  // 2026-08-07 실사고 — 레이팅 1447(중하위권) 유저가 승단만 하면 "프로 무대에
  // 입성했습니다"를 받았다. 프로/감독 소재는 COACH_HIGH_MIN_RATING(1950) 이상일
  // 때만 후보여야 한다. base.currentRating 은 1600 이라 게이트 아래다.
  const lowRatingUp = factPools(
    f({ rankChange: { up: true, gamesAgo: 8, visits: 3, deltaPp: null } }),
    'ko',
    'cooling',
  ).rankChange;
  ok('레이팅 낮으면 승단 문구에 프로 소재 없음', !has(lowRatingUp, '프로 무대'));
  ok('레이팅 낮으면 승단 문구에 상위 리그 소재 없음', !has(lowRatingUp, '상위 리그'));
  const highRatingUp = factPools(
    f({ currentRating: 2000, rankChange: { up: true, gamesAgo: 8, visits: 3, deltaPp: null } }),
    'ko',
    'cooling',
  ).rankChange;
  ok('레이팅 높으면 승단 문구에 프로 소재 후보로 들어간다', has(highRatingUp, '프로 무대'));
  const lowRatingDown = factPools(
    f({ rankChange: { up: false, gamesAgo: 0, visits: 2, deltaPp: null } }),
    'ko',
    'cooling',
  ).rankChange;
  ok('레이팅 낮으면 강등 문구에 감독 소재 없음', !has(lowRatingDown, '감독'));
  const highRatingDown = factPools(
    f({ currentRating: 2000, rankChange: { up: false, gamesAgo: 0, visits: 2, deltaPp: null } }),
    'ko',
    'cooling',
  ).rankChange;
  ok('레이팅 높으면 강등 문구에 감독 소재 후보로 들어간다', has(highRatingDown, '감독'));
}

// ── 마일스톤 — 시간 값이 없으면 시간 얘기를 안 한다 ──────────────
{
  const noHours = factPools(f({ milestone: 10_000, hoursPlayed: null }), 'ko', 'steady').events[0];
  ok('시간을 모르면 시간 문구 없음', !has(noHours, '시간'));
  ok('그래도 마일스톤은 말한다', has(noHours, '10,000판'));
  const withHours = factPools(f({ milestone: 10_000, hoursPlayed: 540 }), 'ko', 'steady').events[0];
  ok('시간을 알면 근무일까지 환산', has(withHours, '근무일로 68일'));
  ok('과소 추정이라 "대략"을 붙인다', has(withHours, '대략'));
}

// ── 특성 ─────────────────────────────────────────────────────────
{
  ok('실력차가 없으면 특성 없음', factPools(base, 'ko', 'cold').traits.length === 0);

  const t = factPools(
    f({ vsUp: { games: 200, wr: 36.2 }, vsDown: { games: 200, wr: 60.1 }, overallWr: 47 }),
    'ko',
    'cold',
  ).traits;
  ok('실력차 숫자를 인용한다', has(t, '36.2%'));
  ok('전체 승률이 후하다고 짚는다', has(t, '47%'));
  ok('역전형이 아니면 그 문구는 없다', !has(t, '긴장을 해야'));

  const rev = factPools(
    f({ vsUp: { games: 200, wr: 58 }, vsDown: { games: 200, wr: 41 }, overallWr: 49 }),
    'ko',
    'cold',
  ).traits;
  ok('역전형이면 따로 말한다', has(rev, '긴장을 해야'));

  // 셧아웃은 15% 이상만
  ok('셧아웃 낮으면 침묵', !has(factPools(f({ shutoutLossPct: 9 }), 'ko', 'cold').traits, '3-0'));
  ok('셧아웃 높으면 말한다', has(factPools(f({ shutoutLossPct: 22 }), 'ko', 'cold').traits, '3-0'));

  // 약점 매치업
  ok(
    '약점 매치업을 인용한다',
    has(factPools(f({ worstMatchup: { opp: 'Lili', wr: 31, games: 29 } }), 'ko', 'cold').traits, 'Lili'),
  );

  // 최고 대비는 오래됐을 때만
  ok('최고가 최근이면 침묵', !has(factPools(f({ peakGamesAgo: 10 }), 'ko', 'cold').traits, '최고점보다'));
  ok(
    '최고가 오래됐으면 말한다',
    has(factPools(f({ peakGamesAgo: 500, peakRating: 1800, currentRating: 1600 }), 'ko', 'cold').traits, '200 낮습니다'),
  );

  // 회복(recovery)이 있으면 한탄 대신 회복을 말한다 — 같은 곡선에 두 톤이 같이 나오면 안 된다
  const rec = factPools(
    f({
      recovery: { troughRating: 1450, up: 135, toPeak: 205 },
      peakGamesAgo: 500,
      peakRating: 1790,
      currentRating: 1585,
    }),
    'ko',
    'cold',
  ).traits;
  ok('회복 중이면 회복을 말한다', has(rec, '올라왔습니다'));
  ok('회복 중이면 한탄은 침묵', !has(rec, '그때가 좋았죠'));
  ok('숫자를 그대로 인용한다', has(rec, '135'));
}

// ── 어긋남 상태 (diverge-jokes.ts) ───────────────────────────────
{
  const kinds = ['winNoGain', 'loseButGain', 'flatEven'] as const;
  for (const kind of kinds) {
    const d = { kind, wins: kind === 'winNoGain' ? 18 : 11, losses: kind === 'winNoGain' ? 7 : 14,
      net: kind === 'winNoGain' ? -22 : kind === 'loseButGain' ? 48 : 3 };
    for (const lang of ['ko', 'en', 'ja'] as const) {
      const p = factPools(f({ divergence: d }), lang, 'steady');
      // 50개를 약속했다. 세 언어가 같은 개수여야 한다 — "죽는 건 번역이 아니라 재탕이다".
      ok(`${kind}/${lang} 풀이 50개다`, p.state.length === 50, String(p.state.length));
      ok(`${kind}/${lang} 빈 문자열이 없다`, p.state.every((s) => s.trim().length > 0));
      // 강등은 단이 실제로 떨어졌을 때만 rankChange 가 말한다. 상태 풀이 쓰면 거짓말이다.
      ok(
        `${kind}/${lang} '강등' 계열 단어가 없다`,
        !p.state.some((s) => s.includes('강등') || s.includes('降格') || s.toLowerCase().includes('demot')),
      );
    }
  }
  // 상태는 사건이 아니다 — events 로 새면 사다리에서 무조건 우선하게 된다.
  const p = factPools(f({ divergence: { kind: 'winNoGain', wins: 18, losses: 7, net: -22 } }), 'ko', 'steady');
  ok('상태가 events 로 새지 않는다', p.events.length === 0);
  ok('상태 없음이면 state 가 빈다', factPools(base, 'ko', 'steady').state.length === 0);
  // 숫자 보간 확인 — 실측값(w·l·net)이 문장에 실제로 박힌다.
  ok('승패 숫자가 문장에 들어간다', has(p.state, '18승') && has(p.state, '7패'));
}

// ── 3개 언어 모두 나온다 ─────────────────────────────────────────
{
  const all = f({
    milestone: 10_000,
    hoursPlayed: 540,
    vsUp: { games: 200, wr: 36 },
    vsDown: { games: 200, wr: 60 },
  });
  for (const lang of ['ko', 'en', 'ja'] as const) {
    const p = factPools(all, lang, 'cold');
    ok(`${lang} 사건 문구가 있다`, p.events[0]?.length > 0);
    ok(`${lang} 특성 문구가 있다`, p.traits.length > 0);
    ok(`${lang} 빈 문자열이 없다`, [...p.events.flat(), ...p.traits].every((s) => s.trim().length > 0));
  }
}

// ── 요일 테마 (pickJoke 통합) — 2026-08-09 ──────────────────────────
// factPools 가 아니라 pickJoke 자체를 부른다. 요일 테마는 사다리 안에서
// "상태" 티어와 "기본" 티어 두 자리를 갈아끼우는 구조라, factPools 단위
// 테스트로는 안 잡히고 pickJoke 통합 테스트가 필요하다.
{
  const sixStateFacts = f({
    sixState: { kind: 'winNoGain', wins: 14, losses: 11, net: -20 },
  });

  // seed 가 짝수(STATE_EVERY=2)면 "상태" 티어에서 요일 테마가 먼저 잡는다.
  // 문구 내용을 하드코딩하지 않는다 — 풀에 줄이 여러 개면 seed 마다 다른 줄이
  // 나오므로, pickWeekdayJoke 직접 호출과 **같은 결과인지**만 확인한다
  // (두 삽입 지점이 같은 함수·같은 seed 로 위임한다는 게 이 테스트의 핵심).
  const atState = pickJoke('steady', 'ko', 2, 0, 0, null, sixStateFacts, 'movie' as WeekdayTheme);
  ok('6상태 테마 — 상태 티어에서 잡히면 source=state', atState.source === 'state', atState.source);
  ok(
    '6상태 테마 — 상태 티어 문구가 pickWeekdayJoke 직접 호출과 같다',
    atState.text === pickWeekdayJoke('movie', 'winNoGain', 'steady', 'ko', 2),
    atState.text,
  );

  // seed 가 홀수면 상태 티어 확률에 안 걸려 "기본" 티어까지 내려간다. seed가
  // 다르면 풀 안에서 고르는 줄도 달라질 수 있으므로(줄이 여럿이라), **그 seed로
  // pickWeekdayJoke 를 직접 불렀을 때와 같은지**로 검증한다 — 상태 티어 결과와
  // 문자열이 같은지는 더 이상 안 본다(다양성 보강 이후 우연의 일치였을 뿐이다).
  const atBase = pickJoke('steady', 'ko', 3, 0, 0, null, sixStateFacts, 'movie' as WeekdayTheme);
  ok('6상태 테마 — 기본 티어까지 내려가면 source=base', atBase.source === 'base', atBase.source);
  ok(
    '6상태 테마 — 기본 티어 문구도 pickWeekdayJoke 직접 호출과 같다',
    atBase.text === pickWeekdayJoke('movie', 'winNoGain', 'steady', 'ko', 3),
    atBase.text,
  );

  // movieQuote 는 mood 기반이라 상태 티어를 건드리지 않는다 — sixState가 있어도,
  // seed가 STATE_EVERY에 걸려도 상태 티어는 조용해야(divergence가 없으니 원래도
  // 비어 있다) 하고, 문구는 기본 티어에서만 나와야 한다.
  const movieQuote = pickJoke('hot', 'ko', 2, 0, 0, null, sixStateFacts, 'movieQuote' as WeekdayTheme);
  ok('영화대사 — 기본 티어에서만 나온다', movieQuote.source === 'base', movieQuote.source);
  ok('영화대사 — 출처 표기가 붙는다', movieQuote.text.includes('(영화'), movieQuote.text);

  // frozen은 의도적으로 영화대사 풀이 없다 — "여기서는 놀리지 않는다" 원칙
  // (app/jokes.ts frozen 섹션 머리말) 때문에 요일 테마가 끼어들면 안 된다.
  const frozenQuote = pickJoke('frozen', 'ko', 2, 0, 0, null, sixStateFacts, 'movieQuote' as WeekdayTheme);
  ok(
    'frozen — 영화대사가 안 끼어들고 기존 진지한 풀로 떨어진다',
    !frozenQuote.text.includes('(영화'),
    frozenQuote.text,
  );

  // 주말(weekdayTheme=null)은 기존 동작 그대로 — 요일 테마가 전혀 안 끼어든다.
  // '영화' 풀이 같은 seed·같은 sixState로 냈을 문구와 달라야 한다(우연히 같은
  // 문장을 기본 JOKES 풀이 낼 가능성은 사실상 0이라 다르면 안 끼어든 것으로 본다).
  const weekend = pickJoke('steady', 'ko', 2, 0, 0, null, sixStateFacts, null);
  ok(
    '주말(테마 없음) — sixState가 있어도 요일 테마 문구는 안 나온다',
    weekend.text !== pickWeekdayJoke('movie', 'winNoGain', 'steady', 'ko', 2),
    weekend.text,
  );
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
