import type { MetadataRoute } from 'next';
import { abs } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      /**
       * API 만 막는다. JSON 응답이라 meta 태그를 실을 수 없어서, 색인을 막을
       * 방법이 robots.txt 밖에 없다.
       *
       * 관리자 페이지는 **일부러 여기 안 적는다.** 예전에는 적혀 있었는데 두 가지가
       * 문제였다 — (1) 막으면 크롤러가 페이지를 안 가져가므로 noindex 지시를 볼
       * 기회가 없고, robots.txt 로 막힌 URL 도 외부 링크가 있으면 주소만으로
       * 검색결과에 뜬다. (2) robots.txt 는 공개 파일이라 여기 적는 것 자체가
       * "관리자 페이지가 있다"는 안내가 된다.
       * 지금은 app/admin/layout.tsx 가 noindex 를 준다 — 그쪽이 확실한 방법이다.
       */
      disallow: ['/api/'],
    },
    sitemap: abs('/sitemap.xml'),
  };
}
