// 사이트 주소 한 곳.
//
// 예전에는 `https://tekken8stats.vercel.app` 이 여섯 파일에 흩어져 있었다
// (layout·robots·sitemap·리포트 OG 카드·리포트 꼬리말 3개 언어).
// 도메인을 바꾸면 그중 하나만 놓쳐도 **화면은 멀쩡한데** canonical 이 옛 주소를
// 가리키거나 sitemap 이 다른 사이트를 알려준다 — 조용히 깨지는 부류라 한 곳에 모은다.
//
// 환경변수로 덮을 수 있게 둔 이유: 프리뷰 배포는 주소가 매번 다르고, 저장소를
// 복제해 쓰는 사람도 자기 주소를 넣을 수 있어야 한다.
// (NEXT_PUBLIC_ 접두사가 필요하다 — 클라이언트 번들에서도 읽는다)

const FALLBACK = 'https://tekkenstats.com';

/** 'https://example.com' — 끝에 슬래시 없음. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK).replace(/\/+$/, '');

/** 'tekkenstats.com' — 화면에 보여줄 때(리포트 꼬리말·OG 카드) 쓴다. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

/** 절대 주소를 만든다. `abs('/player/x')` → 'https://tekkenstats.com/player/x' */
export const abs = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
