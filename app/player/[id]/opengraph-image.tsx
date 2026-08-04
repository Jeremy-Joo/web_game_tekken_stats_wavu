// /player/<식별코드> 의 공유 카드.
//
// **여기 없어서 그림 없는 링크가 나가고 있었다** — 실측으로 og:image 태그가 0건이었다.
// 조회하면 주소창이 이 주소가 되므로 실제로 제일 많이 오가는 링크인데,
// 카드는 리포트에만 있었다.
//
// 그림 자체는 리포트와 같다(lib/og-card.tsx). 같은 사람을 가리키는 두 주소라
// 다르게 그릴 이유가 없고, 하나로 두면 앞으로도 갈라지지 않는다.

import { renderPlayerCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';

export const runtime = 'nodejs';
export const alt = '철권8 전적 통계';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return renderPlayerCard((await params).id);
}
