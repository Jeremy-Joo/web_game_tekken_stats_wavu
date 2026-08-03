// 관리자 페이지를 검색결과에서 확실히 뺀다.
//
// 왜 layout 인가: page.tsx 가 'use client' 라 metadata 를 내보낼 수 없다.
// 이 layout 은 children 을 그대로 통과시키기만 하고 메타데이터만 얹는다.
//
// ── robots.txt 의 Disallow 로는 부족했던 이유 ─────────────────────
// 예전에는 robots.txt 에 `Disallow: /admin` 만 있었다. 두 가지가 문제였다.
//
//  1. **막으면 noindex 를 못 읽는다.** 크롤러가 페이지를 아예 안 가져가므로
//     "색인하지 말라"는 지시를 볼 기회가 없다. 그런데 robots.txt 로 막힌 URL 도
//     외부 링크만 있으면 주소만으로 검색결과에 뜰 수 있다 — 막았는데 뜨는 상태다.
//  2. **robots.txt 는 공개 파일이다.** 거기에 /admin 을 적는 건 "여기 관리자
//     페이지가 있다"고 알려주는 것이다.
//
// 그래서 반대로 했다: robots.txt 에서 /admin 을 빼서 **크롤링은 허용하고**,
// 여기서 noindex 를 준다. 크롤러가 들어와 지시를 읽고 색인에서 뺀다.
// (페이지 자체는 비밀번호로 막혀 있어 크롤러가 봐도 통계는 안 나온다)

import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
