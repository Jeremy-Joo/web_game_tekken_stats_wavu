// /player/<식별코드> — wavu wank·tknow.gg 와 같은 URL 형식.
//
// 메인 화면과 같은 컴포넌트를 그대로 렌더한다(리다이렉트 없음 — 주소가 튀지 않음).
// 조회는 클라이언트 부트 로직이 pathname 에서 식별코드를 읽어 자동 실행한다.
// 여기서는 플레이어별 제목/설명만 서버에서 붙여 공유 링크·검색결과에 이름이 뜨게 한다.

import type { Metadata } from 'next';
import Home from '../../page';
import { getRecords } from '@/lib/wavu/cache';

interface Props {
  params: Promise<{ id: string }>;
}

/** wavu 는 대시 포함 표기(53de-Q2dm-Lday)도 쓰므로 영숫자만 남긴다. */
const normalize = (raw: string) =>
  decodeURIComponent(raw).replace(/[^A-Za-z0-9]/g, '');

/**
 * 링크 미리보기·검색결과용 이름. 실패해도 조회 자체엔 영향이 없다.
 *
 * 예전에는 여기서 wavu 를 직접 불렀다. 그런데 이 페이지는 크롤러도 여는 데다,
 * 곧이어 클라이언트가 /api/replays 로 같은 데이터를 또 받는다 —
 * 즉 페이지 1회 열람에 wavu 원본(30,233경기면 15.2MB)이 **두 번** 나갔다.
 * 게다가 next.revalidate 도 2MB 한도에 걸려 실질적으로 안 걸렸다.
 * 공용 캐시(Blob)를 쓰면 사본 한 벌을 나눠 쓰고, 이 호출이 그 사본을 데워준다.
 *
 * 이름은 캐시가 이미 들고 있다 — 정규화 때 '가장 최근 경기의 내 이름'으로 정해진다
 * (normalize.ts). 원본을 뒤질 필요가 없다.
 */
async function fetchName(id: string): Promise<string | null> {
  try {
    const { myName } = await getRecords(id);
    return myName || null;
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
