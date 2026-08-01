// /player/<식별코드> — wavu wank·tknow.gg 와 같은 URL 형식.
//
// 메인 화면과 같은 컴포넌트를 그대로 렌더한다(리다이렉트 없음 — 주소가 튀지 않음).
// 조회는 클라이언트 부트 로직이 pathname 에서 식별코드를 읽어 자동 실행한다.
// 여기서는 플레이어별 제목/설명만 서버에서 붙여 공유 링크·검색결과에 이름이 뜨게 한다.

import type { Metadata } from 'next';
import Home from '../../page';
import { WAVU_BASE } from '@/lib/wavu/client';

interface Props {
  params: Promise<{ id: string }>;
}

/** wavu 는 대시 포함 표기(53de-Q2dm-Lday)도 쓰므로 영숫자만 남긴다. */
const normalize = (raw: string) =>
  decodeURIComponent(raw).replace(/[^A-Za-z0-9]/g, '');

/** 링크 미리보기·검색결과용 이름. 실패해도 조회 자체엔 영향이 없다. */
async function fetchName(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${WAVU_BASE}/player/${encodeURIComponent(id)}/replays`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'tekken-stats-wavu (personal stats viewer)',
      },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as {
      p1_polaris_id: string | null;
      p1_name: string | null;
      p2_name: string | null;
    }[];
    const b = arr[0];
    if (!b) return null;
    return (b.p1_polaris_id === id ? b.p1_name : b.p2_name) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = normalize((await params).id);
  const name = await fetchName(id);
  const who = name ? `${name} (${id})` : id;
  return {
    title: `${who} — 철권8 전적 통계`,
    description: `${who} 의 철권8 랭크전 전적 · 캐릭터별 승률, 매치업, 레이팅 추이, 세션 분석.`,
    alternates: { canonical: `/player/${id}` },
    openGraph: {
      title: `${who} — 철권8 전적 통계`,
      description: `${who} 의 철권8 랭크전 전적·승률·레이팅 추이`,
      url: `/player/${id}`,
    },
  };
}

export default function PlayerPage() {
  return <Home />;
}
