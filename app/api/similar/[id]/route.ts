import { NextRequest, NextResponse } from 'next/server';
import { getRecords } from '@/lib/wavu/cache';
import { hexScores } from '@/lib/tekken/hexagon';
import { fetchPlayerIndex, currentVersionOf } from '@/lib/tekken/player-index';
import { findSimilar, type Direction, type GamesBand, type Recency } from '@/lib/tekken/similarity';

// 비슷한/반대 유형 찾기. 조회자 본인의 전적은 실시간으로 받고(wavu 캐시 재사용),
// 비교 대상은 player-index 스냅샷을 GitHub raw 에서 런타임에 받아온다(최대 1시간
// 캐시 — player-index.ts 머리말: 빌드 타임 import 였다가 배포 이력이 매일 갱신마다
// 지저분해져서 바꿨다). fetch 실패는 조용히 빈 결과로 넘기지 않고 502 로 알린다 —
// 유사도 검색은 선택 기능이라 이 라우트가 실패해도 사이트의 다른 기능은 멀쩡하다.
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const direction = (sp.get('direction') === 'opposite' ? 'opposite' : 'similar') as Direction;
  const gamesBand = ([10, 20, 30, 0].includes(Number(sp.get('band'))) ? Number(sp.get('band')) : 20) as GamesBand;
  const recency = (['month', 'patch', 'all'].includes(sp.get('recency') ?? '') ? sp.get('recency') : 'month') as Recency;

  if (!id) return NextResponse.json({ error: '식별코드가 필요합니다.' }, { status: 400 });

  let ix;
  try {
    ix = await fetchPlayerIndex();
  } catch (e) {
    // 인덱스를 못 받아온 것과 조회자 전적을 못 받아온 것을 구분한다 — 원인이 다르다
    // (GitHub raw 장애 vs wavu 장애). 502 로 상류 문제임을 알린다.
    return NextResponse.json(
      { error: '비교 대상 목록을 지금 불러오지 못했습니다.', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  try {
    const { records } = await getRecords(id);
    if (records.length < 100) {
      return NextResponse.json(
        { error: '전적이 너무 적어(100판 미만) 육각형 성향을 잴 수 없습니다.' },
        { status: 422 },
      );
    }

    const myHex: Record<string, number | null> = {};
    for (const s of hexScores(records)) myHex[s.key] = s.value;

    const { results, wouldMatchWithWiderBand } = findSimilar(ix.rows, {
      myGames: records.length,
      myHex,
      direction,
      gamesBand,
      recency,
      currentVersion: currentVersionOf(ix),
      excludeId: id,
    });

    return NextResponse.json({
      direction,
      gamesBand,
      recency,
      myGames: records.length,
      indexSize: ix.rows.length,
      indexUpdatedAt: ix.updatedAt,
      count: results.length,
      wouldMatchWithWiderBand,
      results: results.slice(0, 12).map((r) => ({
        id: r.row.id,
        name: r.row.name,
        games: r.row.games,
        wrOverall: r.row.wrOverall,
        wrRecent200: r.row.wrRecent200,
        rating: r.row.rating,
        mainChar: r.row.mainChar,
        distance: Math.round(r.distance * 10) / 10,
        sharedAxes: r.sharedAxes,
        lastPlayed: r.row.lastPlayed,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: '조회 실패', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
