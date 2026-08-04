// 지역 파싱 + 시간대 추정의 회귀 테스트. 네트워크를 쓰지 않는다.
//
// 지키는 것 두 가지:
//  ① wavu 플레이어 페이지 구조가 바뀌었을 때 **'지역 없음'으로 위장하지 않는다.**
//     (search.ts 와 같은 방침 — 조용한 0건이 가장 나쁜 실패다)
//  ② 시간대 추정이 **지역 범위를 절대 벗어나지 않는다.**
//     곡선만 믿으면 최대 3시간 튄다는 것을 실측으로 확인했고, 그래서 범위로 묶었다.
//     이 성질이 깨지면 외국 유저의 시간대 분석이 조용히 틀려진다.

import {
  parseRegionHtml,
  guessTimezone,
  hourHistogramUtc,
  formatOffset,
  REFERENCE_PROFILE,
  KST_MINUTES,
  MIN_GAMES_FOR_CURVE,
} from '../lib/wavu/region';
import type { Replay } from '../lib/wavu/types';

let failed = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// ── 실제 구조 (2026-08 실측). Steam 링크 옆에 지역 span 이 하나 있다 ──
const PAGE = (regionHtml: string) => `<html><body>
  <div class="player-header">
    <span class="accounts"><a href="https://steamcommunity.com/profiles/765611983">765611983</a></span>
    ${regionHtml}
  </div>
  <div class="player-ratings"><div class="card">Rating</div></div>
</body></html>`;

const ASIA = PAGE('<span class="region"> <a href="/leaderboard/asia"> Asia </a> </span>');
const r1 = parseRegionHtml(ASIA);
check('정상 페이지에서 지역을 뽑는다', r1.ok && r1.region?.code === 'asia');
if (r1.ok && r1.region) check('라벨은 wavu 표기 그대로', r1.region.label === 'Asia', r1.region.label);

for (const [code, label] of [['am', 'America'], ['eu', 'Europe'], ['me', 'Middle East'], ['oce', 'Oceania']]) {
  const r = parseRegionHtml(PAGE(`<span class="region"><a href="/leaderboard/${code}">${label}</a></span>`));
  check(`${label} 을 뽑는다`, r.ok && r.region?.code === code && r.region?.label === label);
}

// ── 지역 표기가 없는 정상 페이지 = '모름'. 고장이 아니다 ──
const r2 = parseRegionHtml(PAGE(''));
check("지역 표기가 없으면 성공 + null ('모름')", r2.ok && r2.region === null);

// ── 없는 식별코드: wavu 는 404 가 아니라 200 + 에러 페이지를 준다(실측) ──
const r3 = parseRegionHtml('<html><head><title>Error • Wavu Wank</title></head><body>없음</body></html>');
check('에러 페이지는 not_player_page (지역 없음으로 위장하지 않는다)',
  !r3.ok && r3.reason === 'not_player_page');

// ── 지역 칸은 있는데 비어 있음 = '모름'. 리더보드에 못 오른 계정 (실측 5am4b7f5hdGd) ──
// 이걸 unknown_shape 로 세면 로그가 '구조 변경'을 가리켜서, 멀쩡한 걸 고치러 가게 된다.
// 실제 응답 그대로 — 줄바꿈과 들여쓰기가 들어 있다(정규식이 \s* 로 넘겨야 하는 부분)
const rEmpty = parseRegionHtml(
  PAGE(`<span class="region">
   <a href="/leaderboard/">

   </a>
</span>`),
);
check("빈 지역 칸은 성공 + null ('모름')", rEmpty.ok && rEmpty.region === null,
  JSON.stringify(rEmpty));

// 빈 칸 처리가 정상 케이스를 삼키지 않는지 — 바로 위 4지역 검사와 겹쳐 보는 회귀 방지
const rStill = parseRegionHtml(PAGE('<span class="region"><a href="/leaderboard/asia">Asia</a></span>'));
check('빈 칸 처리가 정상 지역을 삼키지 않는다', rStill.ok && rStill.region?.code === 'asia');

// ── 구조 변화: 지역 표기는 있는데 링크 형식이 바뀜 ──
const r4 = parseRegionHtml(PAGE('<span class="region"><b>Asia</b></span>'));
check('표기는 있는데 못 뽑으면 unknown_shape', !r4.ok && r4.reason === 'unknown_shape');

// ── 새 지역이 생겨도 죽지 않는다 (신캐가 '#숫자'로 드러나는 것과 같은 방침) ──
const r5 = parseRegionHtml(PAGE('<span class="region"><a href="/leaderboard/af">Africa</a></span>'));
check('모르는 지역도 그대로 담는다', r5.ok && r5.region?.code === 'af' && r5.region?.label === 'Africa');

// ── 시간대 추정 ────────────────────────────────────────────────────────────
console.log('');

/** 기준 프로필을 offsetHours 만큼 UTC 로 되돌린 가짜 전적. (그 시간대 사람의 하루) */
const fakeReplays = (offsetHours: number, games: number): Replay[] => {
  const total = REFERENCE_PROFILE.reduce((a, b) => a + b, 0);
  const out: Replay[] = [];
  for (let localH = 0; localH < 24; localH++) {
    const n = Math.round((REFERENCE_PROFILE[localH] / total) * games);
    const utcH = (((localH - offsetHours) % 24) + 24) % 24;
    for (let i = 0; i < n; i++) {
      // 1970-01-02 의 해당 UTC 시각 (날짜는 상관없다 — 시각만 본다).
      // i 를 3600 으로 감싸 경기가 많아도 다음 시간대로 새지 않게 한다.
      out.push({ battle_at: 86400 + utcH * 3600 + (i % 3600) } as Replay);
    }
  }
  return out;
};

const guessFor = (code: string, offsetHours: number, games = 5000) =>
  guessTimezone({ code, label: code }, hourHistogramUtc(fakeReplays(offsetHours, games)));

// 지역을 모르면 추정하지 않는다 — KST 그대로, source='default'
const g0 = guessTimezone(null, hourHistogramUtc(fakeReplays(-7, 5000)));
check('지역을 모르면 추정하지 않고 KST', g0.offsetMinutes === KST_MINUTES && g0.source === 'default');

// asia 는 고정 — 곡선이 뭐라 하든 +9
const gAsiaOdd = guessFor('asia', 5);
check('asia 는 곡선과 무관하게 KST 고정',
  gAsiaOdd.offsetMinutes === KST_MINUTES && gAsiaOdd.source === 'region',
  formatOffset(gAsiaOdd.offsetMinutes));

// 곡선이 맞으면 그 시간대를 찾아낸다
for (const [code, off] of [['am', -7], ['am', -4], ['eu', 1], ['eu', 3], ['oce', 10]] as [string, number][]) {
  const g = guessFor(code, off);
  check(`${code} UTC${off >= 0 ? '+' : ''}${off} 를 곡선으로 찾아낸다`,
    g.offsetMinutes === off * 60 && g.source === 'curve',
    `${formatOffset(g.offsetMinutes)} fit=${g.fit}`);
}

// ★ 핵심 성질 — 어떤 입력이 와도 지역 범위 밖으로 나가지 않는다
const RANGE: Record<string, [number, number]> = {
  am: [-8, -3], eu: [0, 3], me: [3, 4], oce: [8, 13],
};
let escaped = 0;
for (const code of Object.keys(RANGE)) {
  for (let trueOff = -11; trueOff <= 13; trueOff++) {
    const h = guessFor(code, trueOff).offsetMinutes / 60;
    if (h < RANGE[code][0] || h > RANGE[code][1]) escaped++;
  }
}
check('★ 추정이 지역 범위를 절대 벗어나지 않는다 (25개 시간대 × 4지역)', escaped === 0, `이탈 ${escaped}건`);

// 표본이 적으면 곡선을 쓰지 않는다
const gFew = guessFor('am', -7, MIN_GAMES_FOR_CURVE - 100);
check('경기가 적으면 곡선을 쓰지 않고 지역 대표값', gFew.source === 'region' && gFew.fit === null);

// 사람의 하루로 안 보이면(24시간 균등) 곡선을 포기한다
const flat: Replay[] = [];
for (let h = 0; h < 24; h++) for (let i = 0; i < 200; i++) flat.push({ battle_at: 86400 + h * 3600 + i } as Replay);
const gFlat = guessTimezone({ code: 'am', label: 'America' }, hourHistogramUtc(flat));
check('분포가 평평하면 곡선을 포기한다', gFlat.source === 'region' && gFlat.fit === null);

// 표기
check('오프셋 표기', formatOffset(540) === 'UTC+9' && formatOffset(-360) === 'UTC-6' && formatOffset(0) === 'UTC+0',
  `${formatOffset(540)} ${formatOffset(-360)} ${formatOffset(0)}`);

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
