import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '철권8 전적 통계 (wavu)',
  description:
    'wavu wank 데이터로 보는 철권8 랭크전 통계 — 캐릭터/매치업/세션/레이팅 추이, 비교 리포트, 엑셀 다운로드',
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
      <body>{children}</body>
    </html>
  );
}
