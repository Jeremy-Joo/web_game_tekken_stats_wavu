import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/', // 데이터 API 는 크롤링 대상이 아니다
    },
    sitemap: 'https://tekken8stats.vercel.app/sitemap.xml',
  };
}
