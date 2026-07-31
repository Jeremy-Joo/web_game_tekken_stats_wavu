// GET /api/replays/<식별코드>?start=yyyy-MM-dd&end=yyyy-MM-dd
//
// wavu 에서 전체 이력을 받아 정규화·집계까지 서버에서 끝내고 탭 데이터를 돌려준다.
// 원본 replay(489KB)를 클라이언트로 흘리지 않는 이유: 모바일 회선에서 무겁고,
// 집계 로직이 서버/클라 두 벌로 갈라질 이유가 없다.
//
// 캐시: 같은 식별코드 요청을 10분간 Vercel Data Cache 에 태운다.
// 전체 이력이 한 번에 오는 구조라 wavu 에는 요청을 아낄수록 좋고
// (문서상 "한 번에 하나씩이면 레이트리밋에 안 걸린다"),
// 기간 필터는 받아온 뒤 서버 메모리에서 하므로 캐시 키를 오염시키지 않는다.

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchReplays, normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { normalizeReplays, filterByDate } from '@/lib/wavu/normalize';
import { computeFromRecords } from '@/lib/tekken/compute';

export const runtime = 'nodejs';
// wavu 전체 이력(수천 경기)을 받는 데 수 초 걸릴 수 있다. Hobby 기본 10초보다 여유를 둔다.
export const maxDuration = 30;

const CACHE_SECONDS = 600;

const getReplaysCached = (id: string) =>
  unstable_cache(() => fetchReplays(id), ['wavu-replays', id], {
    revalidate: CACHE_SECONDS,
  })();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const id = normalizePolarisId(rawId);
  if (!id) {
    return NextResponse.json({ error: '식별코드가 비었습니다.' }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;

  try {
    const replays = await getReplaysCached(id);
    const { records, myName, stats } = normalizeReplays(replays, id);

    if (records.length === 0) {
      return NextResponse.json(
        { error: '경기 기록이 없습니다. 식별코드를 확인하세요.', stats },
        { status: 404 },
      );
    }

    const filtered = filterByDate(records, start, end);
    const result = computeFromRecords(filtered, id, myName);

    return NextResponse.json({
      ...result,
      stats,
      filtered: { start: start ?? null, end: end ?? null, count: filtered.length },
    });
  } catch (e) {
    if (e instanceof WavuError) {
      const status = e.kind === 'not_found' ? 404 : e.kind === 'blocked' ? 503 : 502;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json(
      { error: `처리 중 오류: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
