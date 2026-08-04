// 리포트 공유 카드.
//
// 그림은 lib/og-card.tsx 에 있다 — /player/<식별코드> 와 같은 카드를 쓴다.
// 예전에는 이 파일이 그림을 직접 들고 있었고, 그래서 플레이어 페이지 쪽에는
// 카드가 아예 없었다(og:image 실측 0건). 하나로 합쳐 그 상태를 막는다.

import { renderPlayerCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';

export const runtime = 'nodejs';
export const alt = '철권8 전적 리포트';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return renderPlayerCard((await params).id);
}
