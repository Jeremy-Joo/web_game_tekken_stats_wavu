// 기능 사용량 이벤트 배선 검사.
//
// 왜 검사가 필요한가: 이벤트 이름을 오타 내도 아무것도 안 깨진다. 타입도 안 잡고
// (문자열이 아니라 FeatureEvent 유니온이라 오타는 잡히지만, 배선을 아예 빠뜨린 건
// 못 잡는다) 화면도 멀쩡하다. GA 관리자 화면에 빈 칸으로 나타나는데, 그게 '아무도
// 안 썼다'인지 '안 붙였다'인지 구분이 안 돼서 며칠 뒤에나 눈치챈다.
//
// 브라우저 자동화가 없어 클릭까지는 못 본다. 대신 "선언한 기능이 전부 배선됐나",
// "성사된 횟수를 세고 있나"를 소스에서 확인한다.

import fs from 'node:fs';
import { FEATURE_NAMES } from '../lib/ga-events';

const FILES = ['app/page.tsx', 'app/RandomPlayer.tsx', 'app/ShareButton.tsx'];
const src = FILES.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const used = [...src.matchAll(/gaEvent\('([^']+)'\)/g)].map((m) => m[1]);

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// 선언한 기능은 정확히 한 곳에서 발사돼야 한다.
// 0 이면 붙이는 걸 잊은 것이고, 2 이상이면 한 동작이 두 번 세어진다.
for (const n of FEATURE_NAMES) {
  const c = used.filter((u) => u === n).length;
  check(`${n} 배선`, c === 1, `${c}곳`);
}

// 반대 방향 — 선언에 없는 이름을 보내고 있으면 관리자 화면 목록에서 통째로 빠진다
// (featureUsage 가 FEATURE_NAMES 로만 걸러 오기 때문이다).
for (const u of new Set(used))
  check(`선언된 이름인가: ${u}`, (FEATURE_NAMES as string[]).includes(u));

// 다운로드는 '눌린 횟수'가 아니라 '실제로 내려받은 횟수'여야 한다.
// 이미 진행 중이거나 대상이 없을 때의 클릭은 가드에서 되돌아가므로,
// 이벤트가 가드보다 앞에 있으면 헛클릭까지 세게 된다.
const page = fs.readFileSync('app/page.tsx', 'utf8');
for (const [ev, guard] of [
  ['download_csv', '!displayTab'],
  ['download_json', '!tabs '],
  ['download_xlsx', '!xlsxHref'],
] as const) {
  const g = page.indexOf(guard);
  const e = page.indexOf(`gaEvent('${ev}')`);
  check(`${ev} 가 가드 뒤에 있다`, g > 0 && e > g, '성사된 횟수를 센다');
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
