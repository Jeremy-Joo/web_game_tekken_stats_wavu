// 집계 계산의 단위 테스트. 네트워크를 쓰지 않는다.
//
// `npm run validate` 는 실데이터로 '합계가 맞는지'만 본다. 계산 규칙 자체
// (은행가 반올림 · 세션 분할 경계 · 접전/셧아웃 판정 · 연속 기록)는 검증되지 않았다.
// 이 프로젝트는 WPF/py 결과물과 **숫자가 같아야** 하는 게 요구사항이라, 그 규칙들을
// 고정된 입력으로 못박아 둔다.

import {
  roundTo, wr, pct, avg,
  buildTotal, buildRound, buildSessions, buildH2h, buildDaily,
  buildVsRating, buildFlow, buildTimePatterns, buildRankHistory,
  buildRatingTrend, widenTrend,
} from '../lib/tekken/aggregations';
import { seasonOf, kstFromEpoch, dateKey, type MatchRecord } from '../lib/tekken/models';
import { seasonSpans, mergeSeasonSpans } from '../lib/tekken/seasons';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  기대=${JSON.stringify(want)} 실제=${JSON.stringify(got)}`}`);
};

/** KST 'yyyy-MM-ddTHH:mm' → epoch 초. (kstFromEpoch 가 +9h 하므로 UTC 로 되돌려 넣는다) */
const at = (kst: string): number => Date.parse(kst + ':00Z') / 1000 - 9 * 3600;

let seq = 0;
function rec(o: Partial<MatchRecord> & { kst: string; result: 'W' | 'L' }): MatchRecord {
  const { kst, ...rest } = o;
  return {
    dt: kstFromEpoch(at(kst)),
    battleId: `b${seq++}`,
    player: 'ME', myPolaris: 'MEMEMEMEMEME', myChar: 'Jin',
    myRating: 1500, myDelta: 0, myPower: 0, myRank: 25,
    score: '3-0', myRounds: 3, oppRounds: 0,
    oppName: 'OPP', oppPolaris: 'OPPOPPOPPOP1', oppChar: 'Kazuya',
    oppRating: 1500, oppDelta: 0, oppPower: 0, oppRank: 25,
    season: 'S2', gameVersion: 20101, stageId: 1,
    ...rest,
  } as MatchRecord;
}

// ── 반올림: C#/py 와 같은 은행가 반올림(half-to-even) ──
eq('roundTo 0.5 → 짝수쪽(0)', roundTo(0.5, 0), 0);
eq('roundTo 1.5 → 짝수쪽(2)', roundTo(1.5, 0), 2);
eq('roundTo 2.5 → 짝수쪽(2)', roundTo(2.5, 0), 2);
eq('roundTo 2.675 소수 2자리', roundTo(2.675, 2), 2.68);
eq('wr 1/3', wr(1, 3), 33.33);
eq('wr 0경기', wr(0, 0), 0);
eq('pct 1/8', pct(1, 8), 12.5);
eq('avg 7/2', avg(7, 2), 3.5);

// ── 시즌 판정: game_version 만 자리 ──
eq('seasonOf 10201', seasonOf(10201), 'S1');
eq('seasonOf 30101', seasonOf(30101), 'S3');
eq('seasonOf 40000 (미래 시즌도 자동)', seasonOf(40000), 'S4');
eq('seasonOf 0', seasonOf(0), '?');

// ── 캐릭터별 합계 + ALL 행 ──
{
  const df = [
    rec({ kst: '2026-01-01T10:00', result: 'W' }),
    rec({ kst: '2026-01-01T10:10', result: 'L' }),
    rec({ kst: '2026-01-01T10:20', result: 'W', myChar: 'Law' }),
  ];
  const t = buildTotal(df);
  eq('buildTotal 마지막 행은 ALL', t.rows[t.rows.length - 1][0], 'ALL');
  eq('buildTotal ALL 경기수', t.rows[t.rows.length - 1][1], 3);
  eq('buildTotal Jin 승률 50%', t.rows[0].slice(0, 5), ['Jin', 2, 1, 1, 50]);
}

// ── 세션 분할: 120분 '초과'로 벌어질 때만 새 세션 ──
{
  const mk = (kst: string) => rec({ kst, result: 'W' });
  const exactly120 = buildSessions([mk('2026-01-01T10:00'), mk('2026-01-01T12:00')]);
  eq('정확히 120분 간격은 같은 세션', exactly120.rows.length, 1);
  const over120 = buildSessions([mk('2026-01-01T10:00'), mk('2026-01-01T12:01')]);
  eq('120분 초과면 세션 분리', over120.rows.length, 2);
  const games = over120.rows.reduce((s, r) => s + (r[4] as number), 0);
  eq('세션 경기 합 = 전체', games, 2);
}

// ── 라운드: 접전(1라운드차)·셧아웃 판정 ──
{
  const df = [
    rec({ kst: '2026-01-01T10:00', result: 'W', myRounds: 3, oppRounds: 2 }), // 접전 승
    rec({ kst: '2026-01-01T10:10', result: 'L', myRounds: 2, oppRounds: 3 }), // 접전 패
    rec({ kst: '2026-01-01T10:20', result: 'W', myRounds: 3, oppRounds: 0 }), // 완승
    rec({ kst: '2026-01-01T10:30', result: 'L', myRounds: 0, oppRounds: 3 }), // 완패
  ];
  const all = buildRound(df).rows.at(-1)!;
  eq('접전 경기 수', all[7], 2);
  eq('접전 승', all[9], 1);
  eq('접전 패', all[11], 1);
  eq('완승(셧아웃) 1', all[13], 1);
  eq('완패(당한 셧아웃) 1', all[15], 1);
}

// ── 상대전적: 최소 경기수 미만은 빠진다 ──
{
  const df = [
    rec({ kst: '2026-01-01T10:00', result: 'W', oppPolaris: 'AAAAAAAAAAAA', oppName: 'A' }),
    rec({ kst: '2026-01-01T10:10', result: 'W', oppPolaris: 'AAAAAAAAAAAA', oppName: 'A' }),
    rec({ kst: '2026-01-01T10:20', result: 'L', oppPolaris: 'BBBBBBBBBBBB', oppName: 'B' }),
  ];
  const t = buildH2h(df); // 기본 최소 2경기
  eq('h2h 2경기 이상만 남는다', t.rows.length, 1);
  eq('h2h 상대 식별코드', t.rows[0][1], 'AAAAAAAAAAAA');
}

// ── 일별: KST 날짜 경계 (UTC 로 밀리면 안 된다) ──
{
  const df = [
    rec({ kst: '2026-01-01T23:30', result: 'W' }), // KST 1일
    rec({ kst: '2026-01-02T00:30', result: 'L' }), // KST 2일
  ];
  const t = buildDaily(df);
  eq('일별 두 날로 갈린다', t.rows.length, 2);
  eq('최신 날짜 우선', t.rows[0][0], '2026-01-02');
  eq('dateKey 는 KST', dateKey(kstFromEpoch(at('2026-01-01T23:30'))), '2026-01-01');
}

// ── 레이팅대: 경기 '직전' 레이팅으로 판단, 레이팅 없는 경기는 제외 ──
{
  const df = [
    // 내 직전 1500(1520-20), 상대 직전 1800(1790+10) → 차 +300 → 최상위 구간
    rec({ kst: '2026-01-01T10:00', result: 'W', myRating: 1520, myDelta: 20, oppRating: 1780, oppDelta: -20 }),
    // 비슷한 상대
    rec({ kst: '2026-01-01T10:10', result: 'L', myRating: 1490, myDelta: -10, oppRating: 1510, oppDelta: 10 }),
    // 레이팅 미부여(0) — 제외돼야 한다
    rec({ kst: '2026-01-01T10:20', result: 'W', myRating: 0, myDelta: 0, oppRating: 0, oppDelta: 0 }),
  ];
  const t = buildVsRating(df);
  const total = t.rows.reduce((s, r) => s + (r[1] as number), 0);
  eq('레이팅 없는 경기는 제외', total, 2);
  eq('비중 합 100%', t.rows.reduce((s, r) => s + (r[6] as number), 0), 100);
}

// ── 흐름: 연속 기록 ──
{
  const R = (result: 'W' | 'L', i: number) =>
    rec({ kst: `2026-01-01T${String(10 + i).padStart(2, '0')}:00`, result });
  // W W W L L  → 최장 연승 3, 최장 연패 2, 현재 2연패
  const df = [R('W', 0), R('W', 1), R('W', 2), R('L', 3), R('L', 4)];
  const t = buildFlow(df);
  eq('흐름 표에 구분 열이 없다', t.columns[0], 'Bucket');
  const find = (b: string) => t.rows.find((r) => r[0] === b)!;
  eq('최장 연승 3', find('최장 연승')[1], 3);
  eq('최장 연패 2', find('최장 연패')[1], 2);
  eq('현재 2연패', find('현재 연패')[1], 2);
  // 각 경기는 1시간 간격이라 전부 한 세션(120분 이내) → 1~5번째에 5경기
  eq('세션 1~5번째에 5경기', find('세션 1~5번째')[1], 5);
  eq('라벨만 보고 기준을 알 수 있다', t.rows.every((r) => String(r[0]).length > 2), true);
}

// ── 시간대·요일: KST 로 버킷팅 ──
{
  const df = [rec({ kst: '2026-01-01T02:30', result: 'W' })]; // 2026-01-01 은 목요일
  const t = buildTimePatterns(df);
  const hour = t.rows.find((r) => r[0] === '시간대' && r[1] === '02시');
  eq('02시 버킷에 들어간다 (UTC 로 밀리지 않음)', hour?.[2], 1);
  const dow = t.rows.find((r) => r[0] === '요일' && r[1] === '목');
  eq('목요일 버킷', dow?.[2], 1);
}

// ── 승단 이력: 오름/내림 둘 다, 최신 우선 ──
{
  const df = [
    rec({ kst: '2026-01-01T10:00', result: 'W', myRank: 30 }),
    rec({ kst: '2026-01-02T10:00', result: 'L', myRank: 30 }),
    rec({ kst: '2026-01-03T10:00', result: 'W', myRank: 31 }), // 30 → 31 승단
    rec({ kst: '2026-01-04T10:00', result: 'L', myRank: 31 }),
    rec({ kst: '2026-01-05T10:00', result: 'L', myRank: 30 }), // 31 → 30 강등
  ];
  const rk = buildRankHistory(df);
  eq('단이 바뀐 횟수만큼 행', rk.rows.length, 2);
  eq('최신 사건이 위', rk.rows[0][0], '2026-01-05 10:00');
  eq('★ 강등도 기록된다', rk.rows[0].slice(1, 4), [31, 30, '▼ 강등']);
  eq('승단도 기록된다', rk.rows[1].slice(1, 4), [30, 31, '▲ 승단']);
  // 30단에서 2경기 1승 1패 → 50%. 승단을 만든 그 경기는 새 단 몫이라 안 센다.
  eq('직전 단 성적 (경기/승률)', rk.rows[1].slice(6), [2, 50]);
  // 31단 구간은 승단을 만든 경기(1/03 승)부터 강등 직전(1/04 패)까지 2경기 → 50%
  eq('강등 전 31단은 2경기 50%', rk.rows[0].slice(6), [2, 50]);
}
// 단 정보가 없으면 빈 표 (숫자 0 을 단으로 오인하지 않는다)
eq(
  '단 기록이 없으면 빈 표',
  buildRankHistory([]).rows.length,
  0,
);

// ── 레이팅 추이: 좁은 포맷 / 엑셀용 와이드 전개 ──
{
  const df = [
    rec({ kst: '2026-01-01T10:00', result: 'W', myChar: 'Jin', myRating: 1500 }),
    rec({ kst: '2026-01-01T10:10', result: 'L', myChar: 'Law', myRating: 1490 }),
  ];
  const { table, chars } = buildRatingTrend(df);
  eq('좁은 포맷은 4칸', table.columns.length, 4);
  eq('null 이 없다', table.rows.flat().filter((v) => v === null).length, 0);
  const wide = widenTrend(table, chars);
  eq('와이드는 4 + 캐릭터수', wide.columns.length, 4 + chars.length);
  eq('와이드 첫 행: 자기 캐릭터 칸에만 값', wide.rows[0].slice(4), [1500, null]);
}

// ── 시즌 구간 파생 ──
{
  const df = [
    rec({ kst: '2026-01-01T10:00', result: 'W', season: 'S2' }),
    rec({ kst: '2026-03-20T10:00', result: 'W', season: 'S3' }),
    rec({ kst: '2026-05-01T10:00', result: 'L', season: 'S3' }),
  ];
  const s = seasonSpans(df);
  eq('최신 시즌 우선', s.map((x) => x.key), ['S3', 'S2']);
  eq('S3 구간', [s[0].start, s[0].end, s[0].games], ['2026-03-20', '2026-05-01', 2]);
  const merged = mergeSeasonSpans([s, seasonSpans([rec({ kst: '2026-02-01T10:00', result: 'W', season: 'S2' })])]);
  eq('합칠 때 구간이 넓어진다', merged.find((x) => x.key === 'S2')!.end, '2026-02-01');
  eq('합칠 때 경기수 누적', merged.find((x) => x.key === 'S2')!.games, 2);
}

if (failed > 0) {
  console.error(`\nFAIL: ${failed}건`);
  process.exit(1);
}
console.log('\nPASS');
