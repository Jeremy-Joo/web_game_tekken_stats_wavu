import type { MetadataRoute } from 'next';

// PWA: 폰 홈 화면에 앱처럼 설치할 수 있게 하는 선언.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '철권8 전적 통계 — Tekken 8 Stats',
    short_name: 'T8 Stats',
    description: '철권8 랭크전 전적 검색·통계',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1115',
    theme_color: '#0f1115',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
