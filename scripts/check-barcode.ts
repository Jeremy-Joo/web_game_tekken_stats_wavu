// 승패 바코드 검사.
import { buildBarcodeSeq, BARCODE_GAMES } from '../lib/tekken/barcode';
import type { MatchRecord } from '../lib/tekken/models';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const rec = (minAfterEpoch: number, result: 'W' | 'L'): MatchRecord =>
  ({ dt: new Date(minAfterEpoch * 60_000), result } as MatchRecord);

// 기본형: 정렬 + 세션 경계
const seq = buildBarcodeSeq([
  rec(0, 'W'), rec(10, 'L'),
  rec(500, 'W'), // 490분 공백 → 새 세션
  rec(510, 'W'),
]);
check('세션 경계에 | 가 박힌다', seq === 'WL|WW', seq);

// 입력 순서와 무관하게 시간순
const shuffled = buildBarcodeSeq([rec(510, 'W'), rec(0, 'W'), rec(500, 'W'), rec(10, 'L')]);
check('입력 순서를 섞어도 같다', shuffled === seq, shuffled);

// 정확히 120분 공백은 같은 세션 (경계는 '초과'다 — 흐름 탭 세션 정의와 동일해야 한다)
check('120분 공백은 같은 세션', buildBarcodeSeq([rec(0, 'W'), rec(120, 'L')]) === 'WL');
check('121분 공백은 새 세션', buildBarcodeSeq([rec(0, 'W'), rec(121, 'L')]) === 'W|L');

// 최근 N 판만 — 오래된 쪽이 잘린다
const many = Array.from({ length: BARCODE_GAMES + 30 }, (_, i) =>
  rec(i * 5, i === 0 ? 'L' : 'W'),
);
const cut = buildBarcodeSeq(many);
check(`${BARCODE_GAMES}판으로 자른다`, cut.replace(/\|/g, '').length === BARCODE_GAMES);
check('잘리는 쪽은 과거다 (첫 판의 L 이 사라짐)', !cut.includes('L'));

// 빈 입력
check('빈 입력은 빈 문자열', buildBarcodeSeq([]) === '');

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
