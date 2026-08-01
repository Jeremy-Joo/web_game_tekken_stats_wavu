// wavu 검색 HTML 파서의 회귀 테스트. 네트워크를 쓰지 않는다.
//
// 스니펫은 실제 응답(2026-08 실측)에서 구조만 남기고 줄인 것이다.
// 여기 케이스가 깨지면 검색이 조용히 0건이 되기 전에 먼저 알 수 있다.

import { parseSearchHtml, decodeEntities } from '../lib/wavu/search';

let failed = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// ── 실제 구조: 한 행에 같은 플레이어 링크가 2개 (닉네임용 + 대시표기 ID용) ──
const ROW = (id: string, dashed: string, name: string) => `
  <tr><td>
    <div><a href="/player/${id}"> ${name} </a></div>
    <div><a href="/player/${id}"> ${dashed} </a></div>
  </td></tr>`;

const OK_HTML = `<html><body><section id="search-results"><div class="container"><table><tbody>
  ${ROW('55Ji8DFQER8f', '55Ji-8DFQ-ER8f', 'Jerry')}
  ${ROW('5jrfdqYLhGr6', '5jrf-dqYL-hGr6', 'HATE_THIS_GAME')}
  ${ROW('2Gg9EHJbYhnE', '2Gg9-EHJb-YhnE', 'A&amp;B &#39;quoted&#39;')}
</tbody></table></div></section>
<footer><a href="/player/9999BADBAD99"> 푸터에 섞인 링크 </a></footer></body></html>`;

const r1 = parseSearchHtml(OK_HTML);
check('정상 응답을 파싱한다', r1.ok);
if (r1.ok) {
  check('행 수가 3건이다 (한 행의 중복 링크는 합쳐짐)', r1.results.length === 3, `${r1.results.length}건`);
  check('닉네임을 쓴다 (대시표기 ID 가 아니라)', r1.results[0].name === 'Jerry', r1.results[0].name);
  check('밑줄 닉네임이 온전하다', r1.results[1].name === 'HATE_THIS_GAME', r1.results[1].name);
  check("HTML 엔티티를 복원한다", r1.results[2].name === "A&B 'quoted'", r1.results[2].name);
  check(
    '★ 표 바깥(푸터)의 플레이어 링크는 섞이지 않는다',
    !r1.results.some((x) => x.id === '9999BADBAD99'),
  );
}

// ── 진짜 0건: 표가 없고 'No players found' 가 있다 ──
const EMPTY_HTML = `<section id="search-results"><div class="container">
  <div style="margin-bottom: 1em"> No players found for ⟨zzqq⟩ </div></div></section>`;
const r2 = parseSearchHtml(EMPTY_HTML);
check('진짜 0건은 성공 + 빈 목록', r2.ok && r2.results.length === 0);

// ── 구조 변화 1: 섹션 자체가 사라짐 ──
const r3 = parseSearchHtml('<html><body><p>완전히 다른 페이지</p></body></html>');
check("섹션이 없으면 no_section", !r3.ok && r3.reason === 'no_section');

// ── 구조 변화 2: 섹션은 있는데 표도 '없음' 표시도 없다 ──
const r4 = parseSearchHtml('<section id="search-results"><div>결과가 여기 있었는데</div></section>');
check("모양을 모르면 unknown_shape (0건으로 위장하지 않는다)", !r4.ok && r4.reason === 'unknown_shape');

// ── 구조 변화 3: 표는 있는데 링크 형식이 바뀜 ──
const r5 = parseSearchHtml(
  '<section id="search-results"><table><tr><td><span data-player="55Ji8DFQER8f">Jerry</span></td></tr></table></section>',
);
check('표만 있고 못 뽑으면 unknown_shape', !r5.ok && r5.reason === 'unknown_shape');

// ── 엔티티 디코더 단위 확인 ──
check('&amp;amp; → &', decodeEntities('A&amp;B') === 'A&B');
check('숫자 엔티티 &#39; → 따옴표', decodeEntities('&#39;x&#39;') === "'x'");
check('16진 엔티티 &#x41; → A', decodeEntities('&#x41;') === 'A');
check('모르는 엔티티는 그대로 둔다', decodeEntities('&bogus;') === '&bogus;');

if (failed > 0) {
  console.error(`\nFAIL: ${failed}건`);
  process.exit(1);
}
console.log('\nPASS');
