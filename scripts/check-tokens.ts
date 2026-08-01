// 입력 토큰 해석 규칙의 회귀 테스트. 네트워크를 쓰지 않는다 (npm run check).
//
// 이 판정이 조용히 틀리면 증상이 '검색이 안 된다'로만 나타나고 원인이 안 보인다.
// 실제로 'HATE_THIS_GAME' 이 그렇게 죽었다 — 영숫자만 남기면 12자가 되어
// 식별코드로 오인됐고, 검색을 건너뛴 채 404 가 났다.
// 그래서 규칙을 표로 고정한다. 판정을 손대면 여기가 먼저 깨져야 한다.

import { looksLikeId, toPolarisId } from '../lib/wavu/token';

interface Case {
  token: string;
  isId: boolean;
  why: string;
}

const CASES: Case[] = [
  // ── 식별코드로 봐야 하는 것 ──
  { token: '53deQ2dmLday', isId: true, why: '연속 12자 (표준 표기)' },
  { token: '5m6Lj5Jb6MfQ', isId: true, why: '연속 12자 (실존 플레이어)' },
  { token: '53de-Q2dm-Lday', isId: true, why: '4-4-4 대시 (wavu 사이트 표기)' },
  { token: '000000000000', isId: true, why: '숫자만이어도 12자면 식별코드 표기' },

  // ── 닉네임으로 넘겨야 하는 것 (여기가 이번 사고 지점) ──
  { token: 'HATE_THIS_GAME', isId: false, why: '★사고 재현: 밑줄 제거 시 12자가 된다' },
  { token: 'The Quickster', isId: false, why: '★공백 제거 시 12자 — 실존 닉네임' },
  { token: 'ABCD_EFGH_IJKL', isId: false, why: '밑줄 — 지우면 12자' },
  { token: 'ab.cd.ef.gh.ij.kl', isId: false, why: '점 — 지우면 12자' },
  { token: 'Jerry', isId: false, why: '짧은 닉네임' },
  { token: 'HATETHISGAM', isId: false, why: '11자 — 길이 미달' },
  { token: 'HATETHISGAMES', isId: false, why: '13자 — 길이 초과' },
  { token: '철권최강자입니다', isId: false, why: '비영숫자' },
  { token: '53d-eQ2dm-Lday', isId: false, why: '3-5-4 — 대시 묶음이 4-4-4 가 아니다' },
  { token: '', isId: false, why: '빈 입력' },

  // ── 남는 모호성: 표기만으로는 원리적으로 못 가른다 ──
  // 아래 둘은 '식별코드'로 판정되는 게 맞다. 표기가 실제 식별코드와 완전히 같기 때문이다.
  // 이 경우까지 표기 판정으로 막으려 하면 진짜 식별코드가 막힌다.
  // 대신 조회가 404 로 돌아오면 page.tsx 가 닉네임 해석으로 되돌린다(guess/forceSearch).
  { token: 'HATETHISGAME', isId: true, why: '구분자 없는 12자 닉네임 — 폴백이 처리' },
  { token: 'HATE-THIS-GAME', isId: true, why: '우연히 4-4-4 — 폴백이 처리' },
];

// toPolarisId: 대시만 떼고 그 외에는 손대지 않는다
const NORMALIZE: [string, string][] = [
  ['53deQ2dmLday', '53deQ2dmLday'],
  ['53de-Q2dm-Lda3', '53deQ2dmLda3'],
];

let failed = 0;

for (const c of CASES) {
  const got = looksLikeId(c.token);
  const ok = got === c.isId;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${JSON.stringify(c.token).padEnd(20)} ` +
      `기대=${c.isId ? '식별코드' : '닉네임  '} 실제=${got ? '식별코드' : '닉네임  '}  ${c.why}`,
  );
}

for (const [input, want] of NORMALIZE) {
  const got = toPolarisId(input);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  toPolarisId(${input}) → ${got}`);
}

if (failed > 0) {
  console.error(`\nFAIL: ${failed}건`);
  process.exit(1);
}
console.log(`\nPASS (${CASES.length + NORMALIZE.length}건)`);
