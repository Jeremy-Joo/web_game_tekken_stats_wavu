import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

// SEO: 검색엔진이 사이트 성격을 파악하도록 제목·설명·키워드·OG 를 채운다.
// 실제 콘텐츠는 조회형(클라이언트)이라, 랜딩 텍스트가 크롤러에게 주는 정보가 전부다.
export const metadata: Metadata = {
  metadataBase: new URL('https://tekken8stats.vercel.app'),
  title: {
    default: '철권8 전적 통계 — Tekken 8 Match Stats',
    template: '%s | Tekken 8 Stats',
  },
  description:
    '철권8 랭크전 전적 검색·통계 사이트. 식별코드나 닉네임만 넣으면 캐릭터별 승률, 매치업, 레이팅 추이, 세션 분석, 여러 명 비교까지. Tekken 8 ranked match statistics: win rates, matchups, rating trends and player comparison.',
  keywords: [
    '철권8', '철권8 전적', '철권8 전적검색', '철권8 승률', '철권8 통계',
    'Tekken 8', 'Tekken 8 stats', 'Tekken 8 match history', 'Tekken 8 win rate',
    '鉄拳8', '鉄拳8 戦績', 'polaris id', 'wavu wank',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    title: '철권8 전적 통계 — Tekken 8 Match Stats',
    description:
      '식별코드/닉네임으로 철권8 랭크전 전체 이력을 집계 — 캐릭터별 승률·매치업·레이팅 추이·비교 리포트',
    url: 'https://tekken8stats.vercel.app',
    siteName: 'Tekken 8 Stats',
    locale: 'ko_KR',
    type: 'website',
  },
  robots: { index: true, follow: true },
  // 검색엔진 소유권 확인 — 값은 코드가 아니라 Vercel 환경변수로 관리한다.
  // (GSC/네이버에서 받은 content 값을 GOOGLE_SITE_VERIFICATION / NAVER_SITE_VERIFICATION 에 넣으면 됨)
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NAVER_SITE_VERIFICATION
      ? { other: { 'naver-site-verification': process.env.NAVER_SITE_VERIFICATION } }
      : {}),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
