// 표 묶음·순서 정의가 실제 표와 어긋나지 않는지.
//
// 표를 새로 만들면 tabs 배열에는 넣으면서 SHEET_ORDER·TAB_GROUP 에 넣는 건 잊기 쉽다.
// 그래도 아무것도 안 깨진다 — 엑셀에서 색이 없고 자리가 밀릴 뿐이라, 파일을 열어보기
// 전까지 모른다. 여기서 잡는다.

import { computeFromRecords, SHEET_ORDER, TAB_GROUP } from '../lib/tekken/compute';
import type { MatchRecord } from '../lib/tekken/models';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// 최소한의 합성 전적 — 표가 전부 만들어질 만큼만.
const CHARS = ['Jin', 'Kazuya', 'Law'];
const records: MatchRecord[] = Array.from({ length: 400 }, (_, i) => ({
  dt: new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 8), (i % 8) * 3)),
  myChar: CHARS[i % 3],
  oppChar: CHARS[(i + 1) % 3],
  oppName: `opp${i % 7}`,
  oppPolaris: `oppid${String(i % 7).padStart(7, '0')}`,
  result: i % 3 === 0 ? 'L' : 'W',
  myRating: 1500 + i,
  oppRating: 1500 + ((i * 37) % 400) - 200,
  myRounds: i % 3 === 0 ? 1 : 3,
  oppRounds: i % 3 === 0 ? 3 : 1,
  season: i < 200 ? 'S1' : 'S2',
  // 시즌 안에서 한 번 더 갈린다 — 버전별 표가 실제로 여러 행이 되도록.
  gameVersion: i < 200 ? 10301 : i < 300 ? 20001 : 20500,
  myRank: 20,
  oppRank: 20,
  myPower: 100000,
} as MatchRecord));

const result = computeFromRecords(records, 'testtesttest', 'tester', { tzShiftMinutes: -540 });

// 화면에 나오는 표는 전부 자리와 묶음이 있어야 한다
const extra = [
  result.roundByOpp,
  result.seasonByVersion,
  result.totalBySeason,
  result.totalByVersion,
  result.strongBySeason,
  result.strongByVersion,
  result.weakBySeason,
  result.weakByVersion,
  result.stageBySeason,
  result.stageByVersion,
  result.pivotBySeason,
  result.pivotByVersion,
  result.vsRatingBySeason,
  result.vsRatingByVersion,
  result.roundBySeason,
  result.roundByVersion,
  ...(result.localTime ? [result.localTime] : []),
];
const allKeys = [...result.tabs.map((t) => t.key), ...extra.map((t) => t.key)];

for (const k of allKeys) {
  check(`${k} — SHEET_ORDER 에 있다`, SHEET_ORDER.includes(k));
  check(`${k} — TAB_GROUP 에 있다`, k in TAB_GROUP);
}

// 반대 방향 — 정의에만 있고 실제로 안 만들어지는 키
for (const k of SHEET_ORDER)
  check(`SHEET_ORDER 의 ${k} 가 실제 표다`, allKeys.includes(k));

check('SHEET_ORDER 에 중복이 없다', new Set(SHEET_ORDER).size === SHEET_ORDER.length);
check('흐름이 첫 표다 (화면 기본 탭)', result.tabs[0]?.key === 'flow', result.tabs[0]?.key);
check('SHEET_ORDER 도 흐름이 먼저다', SHEET_ORDER[0] === 'flow');
check('원자료(전적 목록)가 맨 뒤다', SHEET_ORDER[SHEET_ORDER.length - 1] === 'matches');

// 묶음은 흩어지면 안 된다 — 같은 묶음이 연속으로 나와야 색 덩어리가 생긴다
const groups = SHEET_ORDER.map((k) => TAB_GROUP[k]);
const runs = groups.filter((g, i) => g !== groups[i - 1]);
check('묶음이 흩어지지 않는다', runs.length === new Set(runs).size, runs.join(' → '));

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
