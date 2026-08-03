import type { MetadataRoute } from 'next';
import { abs } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 데이터 API 와 관리자 페이지는 크롤링 대상이 아니다
      disallow: ['/api/', '/admin'],
    },
    sitemap: abs('/sitemap.xml'),
  };
}
