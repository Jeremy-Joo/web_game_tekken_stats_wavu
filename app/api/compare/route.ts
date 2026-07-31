// GET /api/compare?ids=aaa,bbb,ccc&start=&end=
// 2명 이상을 받아 비교 리포트 탭을 돌려준다.
//
// wavu 레이트리밋 지침("요청을 한 번에 하나만")에 맞춰 **순차**로 가져온다.
// Promise.all 로 바꾸지 말 것 — 동시 요청이 차단을 부를 수 있다.

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchReplays, normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { normalizeReplays, filterByDate } from '@/lib/wavu/normalize';
import { computeCompare, type ComparePlayer } from '@/lib/tekken/compare';

export const runtime = 'nodejs';
// 순차 수집이라 인원수만큼 시간이 는다. 4명 × 수 초 대비.
export const maxDuration = 60;

const CACHE_SECONDS = 600;
const MAX_PLAYERS = 4;

const getReplaysCached = (id: string) =>
  unstable_cache(() => fetchReplays(id), ['wavu-replays', id], {
    revalidate: CACHE_SECONDS,
  })();

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get('ids') ?? '')
    .split(',')
    .map(normalizePolarisId)
    .filter(Boolean);
  const uniq = [...new Set(ids)];
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;

  if (uniq.length < 2) {
    return NextResponse.json(
      { error: '비교하려면 식별코드가 2개 이상 필요합니다. (?ids=a,b)' },
      { status: 400 },
    );
  }
  if (uniq.length > MAX_PLAYERS) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_PLAYERS}명까지 비교할 수 있습니다.` },
      { status: 400 },
    );
  }

  const players: ComparePlayer[] = [];
  try {
    for (const id of uniq) {
      // 의도적 순차 — 주석 참조
      const replays = await getReplaysCached(id);
      const { records, myName } = normalizeReplays(replays, id);
      players.push({
        polarisId: id,
        name: myName || id,
        records: filterByDate(records, start, end),
      });
    }
  } catch (e) {
    if (e instanceof WavuError) {
      const status = e.kind === 'not_found' ? 404 : e.kind === 'blocked' ? 503 : 502;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json(
      { error: `수집 중 오류: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const empty = players.filter((p) => p.records.length === 0);
  if (empty.length) {
    return NextResponse.json(
      {
        error: `기록이 없는 식별코드: ${empty.map((p) => p.polarisId).join(', ')}`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    players: players.map((p) => ({
      polarisId: p.polarisId,
      name: p.name,
      count: p.records.length,
    })),
    tabs: computeCompare(players),
    filtered: { start: start ?? null, end: end ?? null },
  });
}
