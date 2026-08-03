// 계절 판정 + 계절 문구 pool 자가검증 (네트워크 없음).
//
// 여기가 지키는 것은 **조용히 깨지는 두 가지**다.
//  1. `seasonOf` 가 getMonth() 로 되돌아가면 보는 사람 시간대가 끼어들어
//     연말·연초에 계절이 하루씩 어긋난다. 화면은 멀쩡하고 문구만 틀린다.
//  2. en pool 이 채워지면 남반구(호주·브라질) 유저에게 1월 "손이 곱을 텐데"가 나간다.
//     시간대에서 겪은 사고와 같은 종류다 — 반구 근거 없이 계절을 말하면 안 된다.

import { seasonOf, seasonPool, type Season } from '../app/season-jokes';

let fail = 0;
const ok = (label: string) => console.log(`ok    ${label}`);
const bad = (label: string, detail: string) => {
  console.error(`FAIL  ${label}\n      ${detail}`);
  fail++;
};

/** KST 벽시계를 UTC 필드에 담는 규약(lib/tekken/models.ts)대로 Date 를 만든다. */
const kst = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ── 1. 열두 달이 전부 제자리인가 ─────────────────────────────
const EXPECT: Record<number, Season> = {
  1: 'winter', 2: 'winter', 12: 'winter',
  3: 'spring', 4: 'spring', 5: 'spring',
  6: 'summer', 7: 'summer', 8: 'summer',
  9: 'autumn', 10: 'autumn', 11: 'autumn',
};
for (const [m, want] of Object.entries(EXPECT)) {
  const mm = String(m).padStart(2, '0');
  const got = seasonOf(kst(`2026-${mm}-15`));
  got === want ? ok(`${mm}월 → ${want}`) : bad(`${mm}월`, `기대 ${want}, 실제 ${got}`);
}

// ── 2. 경계 (12↔1, 2↔3, 5↔6, 8↔9) ───────────────────────────
const EDGES: [string, Season][] = [
  ['2025-12-01', 'winter'],
  ['2026-02-28', 'winter'],
  ['2026-03-01', 'spring'],
  ['2026-05-31', 'spring'],
  ['2026-06-01', 'summer'],
  ['2026-08-31', 'summer'],
  ['2026-09-01', 'autumn'],
  ['2026-11-30', 'autumn'],
];
for (const [d, want] of EDGES) {
  const got = seasonOf(kst(d));
  got === want ? ok(`경계 ${d} → ${want}`) : bad(`경계 ${d}`, `기대 ${want}, 실제 ${got}`);
}

// ── 3. getUTCMonth() 를 쓰고 있는가 ──────────────────────────
// 한국(UTC+9)에서 getMonth() 로 읽으면 이 값은 12월로 밀린다.
// 규약상 이 Date 는 'KST 2027-01-01 00:00' 을 뜻하므로 winter 가 맞지만,
// 3월 1일 00:00 으로 같은 실수를 하면 2월(winter)로 밀려 봄을 놓친다.
{
  const got = seasonOf(new Date('2026-03-01T00:00:00Z'));
  got === 'spring'
    ? ok('시간대 오염 없음 (3/1 00:00 → spring)')
    : bad('시간대 오염', `getUTCMonth() 대신 getMonth() 를 쓰고 있다 — 실제 ${got}`);
}

// ── 4. 남반구 가드: en 은 비어 있어야 한다 ───────────────────
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
for (const s of SEASONS) {
  for (const tone of ['up', 'down'] as const) {
    const en = seasonPool(s, tone, 'en');
    en.length === 0
      ? ok(`en/${s}/${tone} 비어 있음 (남반구 가드)`)
      : bad(
          `en/${s}/${tone}`,
          `${en.length}건 들어 있다. en 은 반구를 가를 수 없다 — ` +
            `남반구 유저에게 계절이 반대로 나간다. app/season-jokes.ts 머리말 참조.`,
        );
  }
}

// ── 5. ko·ja 는 모든 칸이 채워져 있어야 한다 ─────────────────
// 빈 칸이 있으면 그 계절에만 조용히 기본 농담으로 떨어져서 눈치채기 어렵다.
for (const s of SEASONS) {
  for (const tone of ['up', 'down'] as const) {
    for (const lang of ['ko', 'ja'] as const) {
      const n = seasonPool(s, tone, lang).length;
      n > 0
        ? ok(`${lang}/${s}/${tone} ${n}건`)
        : bad(`${lang}/${s}/${tone}`, '비어 있다 — 이 계절만 조용히 기본 농담으로 떨어진다');
    }
  }
}

// ── 6. 문구에 계절이 어긋나 섞이지 않았는가 (오타 방지) ──────
// 겨울 pool 에 '벚꽃', 여름 pool 에 '눈 오는 날' 같은 게 들어가면 읽자마자 이상하다.
const WRONG: Record<Season, string[]> = {
  spring: ['열대야', '단풍', '연말정산', '붕어빵'],
  summer: ['벚꽃', '단풍', '눈 오는 날', '난방비'],
  autumn: ['벚꽃', '열대야', '난방비', '새해 결심'],
  winter: ['벚꽃', '열대야', '단풍', '장마'],
};
for (const s of SEASONS) {
  for (const tone of ['up', 'down'] as const) {
    const text = seasonPool(s, tone, 'ko').join('\n');
    const hit = WRONG[s].filter((w) => text.includes(w));
    hit.length === 0
      ? ok(`ko/${s}/${tone} 계절 소재 섞임 없음`)
      : bad(`ko/${s}/${tone}`, `다른 계절 소재가 있다: ${hit.join(', ')}`);
  }
}

console.log(fail === 0 ? '\n전부 통과' : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
