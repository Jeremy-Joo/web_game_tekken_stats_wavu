// Blob 작업 횟수 규칙의 회귀 테스트. 네트워크를 쓰지 않는다 — 소스를 읽어 확인한다.
//
// 지키는 것: **읽기 경로에서 list() 를 부르지 않는다.**
//
// 왜 테스트까지 두나 — 이건 깨져도 아무 증상이 없기 때문이다. list() 를 한 줄
// 되살려도 화면은 똑같이 동작하고, 응답도 정상이고, 에러도 안 난다. 그러다
// 월 한도 2,000 이 소진되는 순간 스토어가 정지되고 캐시·방문 카운터가 함께 죽는다.
// 실제로 그렇게 이틀 만에 정지됐다(lib/wavu/blob.ts 의 사고 이력).
//
// Vercel 과금 기준:
//   Advanced Operations = put() · copy() · list()   무료 2,000/월
//   Simple Operations   = URL 접근 캐시 MISS · head()  무료 10,000/월
// put() 은 쓰기라 어쩔 수 없다. list() 는 **없앨 수 있고 없애야 한다.**

import { readFileSync } from 'node:fs';

let failed = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/** 주석·문자열을 지운다 — 주석에 적힌 list() 를 호출로 오인하지 않게. */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

const read = (p: string) => stripCommentsAndStrings(readFileSync(p, 'utf8'));

// ── ① 요청마다 지나가는 파일에는 list() 호출이 없어야 한다 ──
const HOT_PATHS = [
  'lib/wavu/cache.ts', // 전적 조회 전부가 지나간다
  'app/api/visit/route.ts', // 페이지 방문 전부가 지나간다
];
for (const p of HOT_PATHS) {
  const src = read(p);
  check(`${p} 에 list() 호출이 없다`, !/\blist\s*\(/.test(src));
  check(`${p} 가 @vercel/blob 에서 list 를 import 하지 않는다`,
    !/import\s*\{[^}]*\blist\b[^}]*\}\s*from\s*['"`]?@vercel\/blob/.test(src));
}

// ── ② list() 는 blob.ts 의 마지막 수단 한 곳에만 있어야 한다 ──
const blobSrc = read('lib/wavu/blob.ts');
const listCalls = (blobSrc.match(/\blist\s*\(/g) ?? []).length;
check('lib/wavu/blob.ts 의 list() 는 딱 한 곳(마지막 수단)', listCalls === 1, `${listCalls}곳`);

// ── ③ 모든 put() 은 addRandomSuffix:false — URL 이 경로에서 결정돼야 한다 ──
// 이게 없으면 임의 접미사가 붙어 URL 을 알 수 없고, 결국 list() 로 되돌아가게 된다.
const PUT_FILES = ['lib/wavu/cache.ts', 'app/api/visit/route.ts'];
for (const p of PUT_FILES) {
  const src = read(p);
  const puts = [...src.matchAll(/\bput\s*\(/g)];
  check(`${p} 에 put() 이 있다`, puts.length > 0, `${puts.length}곳`);
  // put( 부터 짝이 맞는 닫는 괄호까지 잘라 옵션을 본다
  for (const m of puts) {
    let depth = 0, end = m.index!;
    for (let i = m.index! + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    const call = src.slice(m.index!, end + 1);
    check(
      `${p} 의 put() 이 addRandomSuffix:false 를 쓴다`,
      /addRandomSuffix\s*:\s*false/.test(call),
      call.slice(0, 60).replace(/\s+/g, ' '),
    );
  }
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
