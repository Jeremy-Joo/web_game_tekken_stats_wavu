// 우선순위 사다리와 축별 발화 조건의 단위 테스트. 네트워크를 쓰지 않는다.
//
// 왜 필요한가: 사다리가 뒤집혀도 **에러가 안 난다.** 그냥 10,000판 달성한 사람에게
// "금요일 밤입니다"가 나갈 뿐이다. 조용히 깨지는 쪽이라 여기서 못박는다.

import { factPools } from '../app/fact-jokes';
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
};
const f = (over: Partial<QuipFacts>): QuipFacts => ({ ...base, ...over });

// ── 아무것도 안 열리면 조용하다 ──────────────────────────────────
{
  const p = factPools(base, 'ko', 'steady');
  ok('아무 축도 없으면 events 비어 있다', p.events.length === 0);
  ok('traits 도 비어 있다', p.traits.length === 0);
  ok('facts 가 null 이면 둘 다 빈다', factPools(null, 'ko', 'steady').events.length === 0);
}

// ── 우선순위 (이 파일의 핵심) ────────────────────────────────────
{
  // 전부 동시에 켠다. 마일스톤이 이겨야 한다.
  const all = f({
    milestone: 10_000,
    hoursPlayed: 540,
    peakFresh: true,
    rankChange: { up: true, gamesAgo: 1, visits: 3, deltaPp: null },
    comebackDays: 60,
    winStreak: 9,
    todaySameChar: { opp: 'Bryan', count: 6 },
    clock: { hour: 3, dow: 1 },
  });
  const top = factPools(all, 'ko', 'cold').events[0];
  ok('전부 켜지면 마일스톤이 이긴다', has(top, '10,000판'), JSON.stringify(top[0]));

  // 마일스톤을 끄면 최고 갱신
  const noMile = factPools(f({ ...all, milestone: null }), 'ko', 'cold').events[0];
  ok('마일스톤 없으면 최고 갱신', has(noMile, '최고 레이팅'), JSON.stringify(noMile[0]));

  // 그 다음 승단
  const noPeak = factPools(f({ ...all, milestone: null, peakFresh: false }), 'ko', 'cold').events[0];
  ok('그 다음은 승단', has(noPeak, '승급'), JSON.stringify(noPeak[0]));

  // 그 다음 복귀
  const noRank = factPools(
    f({ ...all, milestone: null, peakFresh: false, rankChange: null }),
    'ko',
    'cold',
  ).events[0];
  ok('그 다음은 복귀', has(noRank, '60일'), JSON.stringify(noRank[0]));

  // 그 다음 연승
  const noComeback = factPools(
    f({ ...all, milestone: null, peakFresh: false, rankChange: null, comebackDays: null }),
    'ko',
    'cold',
  ).events[0];
  ok('그 다음은 연승', has(noComeback, '9연승'), JSON.stringify(noComeback[0]));

  // 그 다음 오늘 몰림
  const noStreak = factPools(
    f({
      ...all,
      milestone: null,
      peakFresh: false,
      rankChange: null,
      comebackDays: null,
      winStreak: 0,
    }),
    'ko',
    'cold',
  ).events[0];
  ok('그 다음은 오늘 몰림', has(noStreak, 'Bryan'), JSON.stringify(noStreak[0]));

  // 마지막이 시각
  const onlyClock = factPools(f({ clock: { hour: 3, dow: 1 } }), 'ko', 'cold').events[0];
  ok('마지막은 시각', has(onlyClock, '새벽'), JSON.stringify(onlyClock[0]));
}

// ── 시각 축 — 시간대를 모르면 침묵 (제1 규칙) ────────────────────
{
  ok('clock 이 null 이면 시각 축 없음', factPools(f({ clock: null }), 'ko', 'cold').events.length === 0);
  ok('새벽 3시는 열린다', factPools(f({ clock: { hour: 3, dow: 1 } }), 'ko', 'cold').events.length === 1);
  ok(
    '일요일 밤 열린다',
    has(factPools(f({ clock: { hour: 22, dow: 0 } }), 'ko', 'cold').events[0] ?? [], '일요일'),
  );
  ok(
    '금요일 밤 hot 은 다른 문구',
    has(factPools(f({ clock: { hour: 22, dow: 5 } }), 'ko', 'hot').events[0] ?? [], '주말이 위험'),
  );
  ok(
    '점심시간 열린다',
    has(factPools(f({ clock: { hour: 12, dow: 3 } }), 'ko', 'cold').events[0] ?? [], '점심'),
  );
  ok(
    '평일 저녁 8시는 아무것도 안 연다',
    factPools(f({ clock: { hour: 20, dow: 3 } }), 'ko', 'cold').events.length === 0,
  );
}

// ── 연승은 5부터 ─────────────────────────────────────────────────
{
  ok('4연승은 소재가 아니다', factPools(f({ winStreak: 4 }), 'ko', 'hot').events.length === 0);
  ok('5연승부터 열린다', factPools(f({ winStreak: 5 }), 'ko', 'hot').events.length === 1);
  // 개인 최고와 같으면 문구가 달라진다
  ok(
    '최고 기록 타이면 그렇게 말한다',
    has(factPools(f({ winStreak: 9, bestWinStreak: 9 }), 'ko', 'hot').events[0], '개인 최고 기록'),
  );
  ok(
    '아니면 최고를 알려준다',
    has(factPools(f({ winStreak: 5, bestWinStreak: 12 }), 'ko', 'hot').events[0], '개인 최고는 12'),
  );
}

// ── 승단 — 없는 걸 말하지 않는다 ─────────────────────────────────
{
  // 재방문이 적으면 '문지방' 문구가 없어야 한다
  const few = factPools(f({ rankChange: { up: true, gamesAgo: 1, visits: 2, deltaPp: null } }), 'ko', 'steady').events[0];
  ok('재방문이 적으면 문지방 문구 없음', !has(few, '문지방'));
  const many = factPools(f({ rankChange: { up: true, gamesAgo: 1, visits: 9, deltaPp: null } }), 'ko', 'steady').events[0];
  ok('재방문이 많으면 횟수를 그대로 말한다', has(many, '9번째'));
  // 전후 비교가 null 이면 그 문구가 없어야 한다
  ok('deltaPp 가 null 이면 승률 하락 문구 없음', !has(many, '%p 떨어졌'));
  const withDelta = factPools(
    f({ rankChange: { up: true, gamesAgo: 1, visits: 2, deltaPp: -12 } }),
    'ko',
    'steady',
  ).events[0];
  ok('deltaPp 가 있으면 인용한다', has(withDelta, '12%p 떨어졌'));
  // 하락이 작으면 말하지 않는다 (노이즈)
  const small = factPools(
    f({ rankChange: { up: true, gamesAgo: 1, visits: 2, deltaPp: -1 } }),
    'ko',
    'steady',
  ).events[0];
  ok('하락이 작으면 인용 안 함', !has(small, '%p 떨어졌'));
  // 강등은 다른 문구
  ok(
    '강등은 강등이라고 말한다',
    has(factPools(f({ rankChange: { up: false, gamesAgo: 0, visits: 2, deltaPp: null } }), 'ko', 'steady').events[0], '강등'),
  );
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

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
