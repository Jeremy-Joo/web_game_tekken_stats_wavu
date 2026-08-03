// GET /api/probe — 배포 직후 '조용히 깨지는 것들'을 한 번에 확인한다.
//
// 셋 다 응답은 멀쩡한데 속으로만 죽을 수 있는 것들이라 여기 모아둔다:
//  ① wavu JSON  — Vercel 함수는 가정용 IP 와 대역이 달라 Cloudflare 판정이 다를 수 있다.
//  ② wavu HTML  — 서버 지역(시간대 추정의 입력). JSON 과 다른 경로라 따로 막힐 수 있고,
//                 막히면 화면은 '지역 모름'으로 조용히 굴러간다.
//  ③ 캐시       — 인스턴스 메모리 캐시 현황(참고용). 인스턴스마다 다르므로
//                 '적중률'이 아니라 '이 인스턴스가 지금 뭘 들고 있나'만 보여준다.
//
// 문제가 없으면 지워도 되고, 남겨둬도 해가 없다.

import { NextResponse } from 'next/server';
import { WAVU_BASE, fetchRegion } from '@/lib/wavu/client';
import { cacheStatus } from '@/lib/wavu/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_ID = '5m6Lj5Jb6MfQ'; // wavu 홈 상위에 노출된 공개 플레이어

async function probeWavuJson() {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${WAVU_BASE}/player/${TEST_ID}/replays`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'tekken-stats-wavu (deployment probe)',
      },
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') ?? '';
    let replayCount: number | null = null;
    if (res.ok && contentType.includes('json')) {
      const data = (await res.json()) as unknown[];
      replayCount = Array.isArray(data) ? data.length : null;
    }
    return {
      ok: res.ok && replayCount !== null,
      status: res.status,
      contentType,
      replayCount,
      elapsedMs: Date.now() - startedAt,
      cfMitigated: res.headers.get('cf-mitigated'), // 챌린지에 걸리면 'challenge'
      error: null as string | null,
    };
  } catch (e) {
    return {
      ok: false, status: 0, contentType: '', replayCount: null,
      elapsedMs: Date.now() - startedAt, cfMitigated: null,
      error: (e as Error).message,
    };
  }
}

export async function GET() {
  // wavu 는 "요청을 한 번에 하나씩"이 원칙이라 JSON·HTML 을 순차로 친다.
  const wavu = await probeWavuJson();

  const regionStart = Date.now();
  const region = await fetchRegion(TEST_ID);
  const regionResult = {
    // 지역을 못 읽으면 fetchRegion 이 null 을 준다 — 그게 이 확인이 잡으려는 상태다.
    ok: region !== null,
    value: region,
    elapsedMs: Date.now() - regionStart,
  };

  // 캐시는 '있으면 빠른' 것이지 없으면 고장인 게 아니다 — ok 판정에 넣지 않는다.
  const cache = cacheStatus();

  // 둘 다 통과해야 ok. 하나라도 죽어 있으면 화면은 멀쩡한데 뒤에서 손해를 보는 중이다.
  const ok = wavu.ok && regionResult.ok;

  return NextResponse.json(
    {
      ok,
      wavu,
      region: regionResult,
      cache,
      hint: ok
        ? null
        : [
            !wavu.ok && 'wavu JSON 이 막혔습니다 — 조회 자체가 안 됩니다.',
            !regionResult.ok &&
              '서버 지역을 못 읽습니다 — 시간대는 KST 로 고정되고 외국 유저 시각 분석이 어긋납니다.',
          ].filter(Boolean),
    },
    { status: ok ? 200 : 502 },
  );
}
