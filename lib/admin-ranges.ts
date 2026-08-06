// 관리자 페이지(app/admin)의 조회 기간 옵션.
//
// 클라이언트(app/admin/page.tsx)와 서버 라우트(api/admin/stats, api/admin/xlsx)
// 양쪽이 같은 허용 목록을 써야 한다 — 하나만 바뀌면 화면 버튼과 서버 검증이
// 어긋나 특정 기간만 조용히 28일로 떨어진다. lib/ga.ts 는 node:crypto 를 물고
// 있어 클라이언트 번들에 못 들어가므로, 값만 이 파일로 따로 뗀다.

/**
 * "전체"의 실제 구현 — GA4 Data API 의 dateRanges 는 상대 일수(NdaysAgo)나
 * 실제 날짜만 받고 "전부"라는 키워드가 없다. 사이트 나이(2024년 초 서비스 시작)
 * 보다 넉넉히 큰 값을 상대 일수로 흉내낸다 — 하드코딩된 시작일 없이, 사이트가
 * 몇 년이 지나도 자동으로 다 덮는다(10년보다 오래되면 그때 늘리면 된다).
 */
export const ADMIN_RANGE_ALL_DAYS = 3650;

export const ADMIN_RANGES = [7, 28, 90, 365, 730, 1095, 1825, ADMIN_RANGE_ALL_DAYS] as const;

export type AdminRangeDays = (typeof ADMIN_RANGES)[number];

export function isAdminRangeDays(n: number): n is AdminRangeDays {
  return (ADMIN_RANGES as readonly number[]).includes(n);
}

/** 버튼·표에 쓰는 표시 문구. 365 의 배수는 '~년'으로, 그 외는 '~일'로. */
export function adminRangeLabel(days: number): string {
  if (days === ADMIN_RANGE_ALL_DAYS) return '전체';
  if (days % 365 === 0) return `${days / 365}년`;
  return `${days}일`;
}
