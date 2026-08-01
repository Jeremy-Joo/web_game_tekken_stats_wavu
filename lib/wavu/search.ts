// wavu 플레이어 검색 결과(HTML) 파서.
//
// 이 프로젝트에서 **유일한 HTML 파싱**이다. 전적은 공식 JSON 을 쓰지만
// 검색만은 JSON 변형이 없어(?_format=json 무시) 화면을 읽어야 한다.
//
// 남의 사이트 구조에 얹혀 있으므로 **깨지는 것 자체는 막을 수 없다.**
// 그래서 목표를 바꾼다 — 깨졌을 때 '결과 0건'처럼 보이지 않게 하는 것.
// 조용히 0건이 되면 사용자는 자기 오타를 의심하고, 개발자는 몇 달을 모른 채 지난다.
//
// 실측한 구조 (2026-08 기준):
//   결과 있음: <section id="search-results"> … <table> <tr>…</tr> ×50 </table>
//              한 행에 같은 플레이어 링크가 2개 (닉네임용 + 대시표기 ID용)
//   결과 없음: <section id="search-results"> … "No players found for ⟨질의⟩" (표 없음)
//   wavu 자체 상한이 50건이다.
//
// 순수 함수로 뺀 이유: 네트워크 없이 회귀 테스트를 돌리기 위해서다
// (scripts/check-tokens.ts 와 같은 방침 — 규칙을 표로 고정한다).

export interface SearchHit {
  id: string;
  name: string;
}

export type SearchParse =
  | { ok: true; results: SearchHit[] }
  /**
   * no_section    — 섹션 자체가 없다. 페이지가 통째로 바뀌었거나 에러 페이지.
   * unknown_shape — 섹션은 있는데 결과도 '없음' 표시도 못 찾았다. 행 구조 변경.
   */
  | { ok: false; reason: 'no_section' | 'unknown_shape' };

const SECTION = 'search-results';
const EMPTY_MARK = /No players found/i;

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
};

/**
 * HTML 엔티티 복원. 이걸 안 하면 닉네임의 `&` 가 `&amp;` 로 남아
 * 화면에도 이상하게 뜨고 이름 필터(includes)도 어긋난다.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp =
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function parseSearchHtml(html: string): SearchParse {
  const i = html.indexOf(SECTION);
  if (i < 0) return { ok: false, reason: 'no_section' };

  const rest = html.slice(i);
  const end = rest.indexOf('</table>');

  // 표가 없다 → 결과 0건이거나 구조 변화. 둘을 반드시 구분한다.
  if (end < 0) {
    if (EMPTY_MARK.test(rest)) return { ok: true, results: [] };
    return { ok: false, reason: 'unknown_shape' };
  }

  // ★ 표 끝까지만 본다. 예전에는 문서 끝까지 훑어서, wavu 가 결과 아래에
  //   다른 플레이어 링크(추천·인기 목록 등)를 넣으면 검색 결과에 섞일 구조였다.
  const sec = rest.slice(0, end);

  const seen = new Set<string>();
  const results: SearchHit[] = [];
  for (const m of sec.matchAll(
    /href="\/player\/([A-Za-z0-9]+)"[^>]*>\s*([^<]+?)\s*</g,
  )) {
    const id = m[1];
    // 한 행에 링크가 둘(닉네임, 대시표기 ID)이라 먼저 나온 닉네임만 남긴다.
    if (seen.has(id)) continue;
    const name = decodeEntities(m[2]).trim();
    if (!name) continue;
    seen.add(id);
    results.push({ id, name });
  }

  // 표는 있는데 한 건도 못 뽑았다 = 행 구조가 바뀐 것. 0건으로 위장하지 않는다.
  if (results.length === 0) return { ok: false, reason: 'unknown_shape' };
  return { ok: true, results };
}
