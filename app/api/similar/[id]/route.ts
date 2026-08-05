import { NextRequest, NextResponse } from 'next/server';
import { getRecords } from '@/lib/wavu/cache';
import { hexScores } from '@/lib/tekken/hexagon';
import { playerIndex } from '@/lib/tekken/player-index';
import { findSimilar, type Direction, type GamesBand, type Recency } from '@/lib/tekken/similarity';

// 비슷한/반대 유형 찾기. 조회자 본인의 전적은 실시간으로 받고(wavu 캐시 재사용),
// 비교 대상은 player-index 스냅샷(월 1~2회 갱신)에서 고른다.
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const direction = (sp.get('direction') === 'opposite' ? 'opposite' : 'similar') as Direction;
  const gamesBand = ([10, 20, 30, 0].includes(Number(sp.get('band'))) ? Number(sp.get('band')) : 20) as GamesBand;
  const recency = (['month', 'patch', 'all'].includes(sp.get('recency') ?? '') ? sp.get('recency') : 'month') as Recency;

  if (!id) return NextResponse.json({ error: '식별코드가 필요합니다.' }, { status: 400 });

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

    const ix = playerIndex();
    const { results, wouldMatchWithWiderBand } = findSimilar(ix.rows, {
      myGames: records.length,
      myHex,
      direction,
      gamesBand,
      recency,
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
