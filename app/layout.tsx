import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

/**
 * Google Analytics 4 측정 ID.
 *
 * 코드에 박지 않고 환경변수로 받는다 — 저장소를 복제해도 남의 통계에 섞이지 않고,
 * 값이 없으면 스크립트 자체를 안 넣어서 로컬 개발이 통계를 오염시키지 않는다.
 * (형제 저장소 web_game_tekken8_tube 는 하드코딩인데, 그래서 그쪽 ID 를 여기 쓰면
 *  두 사이트 데이터가 한 속성에 섞인다. 반드시 이 사이트용 속성을 따로 만들 것.)
 *
 * Vercel → Settings → Environment Variables 에 NEXT_PUBLIC_GA_ID = G-XXXXXXXXXX
 * 을 넣고 재배포하면 켜진다. Vercel Analytics 와 함께 켜둬도 서로 간섭하지 않는다.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

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
        {GA_ID && (
          <>
            {/* afterInteractive: 첫 화면 렌더를 막지 않는다 */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
