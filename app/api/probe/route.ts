// GET /api/probe — Vercel(데이터센터 IP)에서 wavu JSON 엔드포인트가 열리는지 확인용.
//
// 로컬(가정용 IP)에서는 전부 200 이 확인됐지만, Vercel 함수는 다른 IP 대역이라
// Cloudflare 가 다르게 판정할 가능성이 남아 있다. 배포 직후 이 라우트부터 열어볼 것.
// 문제가 없으면 지워도 되고, 남겨둬도 해가 없다(수집 1회 + 소량 응답).

import { NextResponse } from 'next/server';
import { WAVU_BASE } from '@/lib/wavu/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_ID = '5m6Lj5Jb6MfQ'; // wavu 홈 상위에 노출된 공개 플레이어

export async function GET() {
  const url = `${WAVU_BASE}/player/${TEST_ID}/replays`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'tekken-stats-wavu (deployment probe)',
      },
      cache: 'no-store',
    });
    const ctype = res.headers.get('content-type') ?? '';
    let count: number | null = null;
    if (res.ok && ctype.includes('json')) {
      const data = (await res.json()) as unknown[];
      count = Array.isArray(data) ? data.length : null;
    }
    return NextResponse.json({
      ok: res.ok && count !== null,
      status: res.status,
      contentType: ctype,
      replayCount: count,
      elapsedMs: Date.now() - startedAt,
      cfMitigated: res.headers.get('cf-mitigated'), // 챌린지에 걸리면 'challenge'
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, elapsedMs: Date.now() - startedAt },
      { status: 502 },
    );
  }
}
