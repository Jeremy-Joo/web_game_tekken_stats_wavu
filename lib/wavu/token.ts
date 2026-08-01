// 사용자가 입력한 한 토큰이 '식별코드 표기'인지 판정한다.
//
// 왜 별도 파일인가: 이 판정이 틀리면 닉네임 조회가 통째로 404 로 죽는다(아래 참조).
// 화면(page.tsx)과 회귀 테스트(scripts/check-tokens.ts)가 **같은 함수**를 보게 하려고
// 뺐다. 의존성 없음 — 클라이언트 번들에 들어가도 무해해야 하므로 client.ts 와 섞지 않는다.
//
// 실제 사고: 'HATE_THIS_GAME' 닉네임이 조회되지 않았다.
//   예전 판정은 영숫자만 남긴 뒤 12자인지 봤다 → 'HATETHISGAME'(12자) → 식별코드로 오인
//   → 검색을 건너뛰고 /api/replays/HATETHISGAME → 404.
//   밑줄·공백·점·하이픈이 든 닉네임이면 언제든 재발하는 구조였다.
//
// 규칙: **구분자를 지우기 전 원문으로 판정한다.** wavu 가 실제 쓰는 식별코드 표기는
// 연속 12자와 4-4-4 대시 두 가지뿐이고, 그 둘만 통과시킨다.

/** 연속 12자 영숫자 — 예: 53deQ2dmLday */
export const ID_PLAIN = /^[A-Za-z0-9]{12}$/;

/** 4-4-4 대시 표기 — 예: 53de-Q2dm-Lday (wavu 사이트가 쓰는 형태) */
export const ID_DASHED = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;

/**
 * 식별코드 표기면 true. 아니면 닉네임으로 취급한다.
 *
 * 주의 — 이 판정은 **추정이다.** 12자 영숫자 닉네임(예: 'HATETHISGAME')은
 * 식별코드와 표기가 완전히 겹쳐 사전 판별이 원리적으로 불가능하다.
 * 따라서 호출부는 true 를 최종 결론으로 쓰지 말고, 그 경로가 404 로 실패하면
 * 닉네임 해석으로 되돌릴 수 있어야 한다. (page.tsx 의 guess/forceSearch)
 */
export function looksLikeId(token: string): boolean {
  return ID_PLAIN.test(token) || ID_DASHED.test(token);
}

/** 식별코드 표기에서 구분자를 떼어 API 에 쓸 형태로. */
export function toPolarisId(token: string): string {
  return token.replace(/-/g, '');
}
