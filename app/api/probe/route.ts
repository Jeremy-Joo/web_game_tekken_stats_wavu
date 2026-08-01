// GET /api/probe — 배포 직후 '조용히 깨지는 것들'을 한 번에 확인한다.
//
// 셋 다 응답은 멀쩡한데 속으로만 죽을 수 있는 것들이라 여기 모아둔다:
//  ① wavu JSON  — Vercel 함수는 가정용 IP 와 대역이 달라 Cloudflare 판정이 다를 수 있다.
//  ② wavu HTML  — 서버 지역(시간대 추정의 입력). JSON 과 다른 경로라 따로 막힐 수 있고,
//                 막히면 화면은 '지역 모름'으로 조용히 굴러간다.
//  ③ Blob       — 전적 캐시 저장소. 안 붙어 있어도 조회는 정상이라 티가 안 나는데,
//                 실제로는 조회할 때마다 wavu 에서 최대 15MB 를 새로 받게 된다.
//                 (몇 달 모르고 지난 적이 있다. 그래서 여기 넣었다)
//
// 문제가 없으면 지워도 되고, 남겨둬도 해가 없다.

import { NextResponse } from 'next/server';
import { WAVU_BASE, fetchRegion } from '@/lib/wavu/client';
import { probeBlob } from '@/lib/wavu/cache';

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

/**
 * Blob 이 안 될 때 **무엇을 해야 하는지** 한 문장으로. 상태마다 조치가 다르다.
 * 뭉뚱그리면 probe 를 볼 이유가 없어진다 — 실제로 '읽기/쓰기가 안 됩니다'로 묶어뒀다가
 * 읽기는 되는데 쓰기만 막힌 상황을 틀리게 설명했다.
 */
function blobHint(b: Awaited<ReturnType<typeof probeBlob>>): string {
  if (!b.hasToken)
    return (
      'Blob 스토어가 프로젝트에 연결돼 있지 않습니다(BLOB_READ_WRITE_TOKEN 없음). ' +
      '캐시가 통째로 없는 상태라 조회할 때마다 wavu 를 새로 때립니다. ' +
      'Vercel → Storage 에서 Blob 스토어를 만들어 프로젝트에 연결하세요.'
    );

  if (/suspend/i.test(b.error ?? ''))
    return (
      '스토어가 정지됐습니다. 대개 무료 한도 초과이고, 먼저 터지는 쪽은 용량이 아니라 ' +
      '**Advanced Operations(2,000/월 — put·copy·list)** 입니다. ' +
      'Vercel → Storage 에서 어느 항목이 빨간지 확인하세요. ' +
      '한도 초과라면 30일 뒤 자동으로 풀리고, Pro 트라이얼로 즉시 올릴 수도 있습니다.'
    );

  if (b.canRead && !b.canWrite)
    return (
      '읽기는 되는데 **쓰기만** 막혔습니다. 캐시는 쓰기에 달려 있어 이 상태로는 ' +
      `동작하지 않습니다. 원인: ${b.error ?? '알 수 없음'}`
    );

  return `Blob 을 쓸 수 없습니다: ${b.error ?? '원인 불명'}`;
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

  const blob = await probeBlob();

  // 전부 통과해야 ok. 하나라도 죽어 있으면 화면은 멀쩡한데 뒤에서 손해를 보는 중이다.
  const ok = wavu.ok && regionResult.ok && blob.ok;

  return NextResponse.json(
    {
      ok,
      wavu,
      region: regionResult,
      blob,
      hint: ok
        ? null
        : [
            !wavu.ok && 'wavu JSON 이 막혔습니다 — 조회 자체가 안 됩니다.',
            !regionResult.ok &&
              '서버 지역을 못 읽습니다 — 시간대는 KST 로 고정되고 외국 유저 시각 분석이 어긋납니다.',
            !blob.ok && blobHint(blob),
          ].filter(Boolean),
    },
    { status: ok ? 200 : 502 },
  );
}
