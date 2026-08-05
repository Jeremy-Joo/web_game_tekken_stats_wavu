import { NextRequest, NextResponse } from 'next/server';
import { getRecords } from '@/lib/wavu/cache';
import { fetchPlayerIndex, currentVersionOf } from '@/lib/tekken/player-index';
import {
  findSimilar,
  type CharGamesBand,
  type Direction,
  type GamesBand,
  type RatingBand,
  type Recency,
  type SessionTrend,
} from '@/lib/tekken/similarity';

// 승률 비슷한/정반대인 사람, 장기전 패턴 찾기. 조회자 본인의 전적은 실시간으로
// 받고(wavu 캐시 재사용), 비교 대상은 player-index 스냅샷을 GitHub raw 에서
// 런타임에 받아온다(최대 1시간 캐시). fetch 실패는 조용히 빈 결과로 넘기지
// 않고 502 로 알린다 — 이 기능은 선택 기능이라 실패해도 사이트의 다른 기능은
// 멀쩡하다.
export const runtime = 'nodejs';
export const maxDuration = 30;

const CHAR_GAMES_BAND_VALUES = [10, 20, 30, 0];
const GAMES_BAND_VALUES = [10, 20, 30, 0];
const RATING_BAND_VALUES = [100, 200, 300, 0];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const direction = (sp.get('direction') === 'opposite' ? 'opposite' : 'similar') as Direction;
  const charGamesBand = (CHAR_GAMES_BAND_VALUES.includes(Number(sp.get('charGamesBand')))
    ? Number(sp.get('charGamesBand'))
    : 20) as CharGamesBand;
  const recency = (['month', 'patch', 'all'].includes(sp.get('recency') ?? '')
    ? sp.get('recency')
    : 'month') as Recency;
  const sessionTrend = (['any', 'declining', 'rising'].includes(sp.get('trend') ?? '')
    ? sp.get('trend')
    : 'any') as SessionTrend;
  const gamesBand = (GAMES_BAND_VALUES.includes(Number(sp.get('gamesBand')))
    ? Number(sp.get('gamesBand'))
    : 20) as GamesBand;
  const ratingBand = (RATING_BAND_VALUES.includes(Number(sp.get('ratingBand')))
    ? Number(sp.get('ratingBand'))
    : 200) as RatingBand;
  // 기준 캐릭터를 직접 지정할 수도 있다(예: 메인이 아니라 부캐로 비교하고 싶을 때).
  // 안 주면 최근에 쓴 캐릭터로 정한다.
  const charaParam = sp.get('char');

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
    if (records.length < 20) {
      return NextResponse.json(
        { error: '전적이 너무 적어(20판 미만) 캐릭터별 승률을 잴 수 없습니다.' },
        { status: 422 },
      );
    }

    const ord = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
    const charaId = charaParam || ord[ord.length - 1].myChar; // 최근 캐릭터

    const myCharRecords = ord.filter((r) => r.myChar === charaId);
    if (myCharRecords.length < 20) {
      // myChar 는 이미 표시용 이름 문자열이다(정규화 단계에서 변환됨) — 그대로 쓴다.
      return NextResponse.json(
        {
          error: `${charaId}(으)로 20판 미만이라 그 캐릭터 기준 승률을 잴 수 없습니다.`,
          charaId,
          charaName: charaId,
        },
        { status: 422 },
      );
    }
    const recentMine = myCharRecords.slice(-100);
    const myWinRate =
      Math.round(
        (recentMine.filter((r) => r.result === 'W').length * 1000) / recentMine.length,
      ) / 10;
    // 계정 전체 기준 — 캐릭터별이 아니라 '경험치'·'실력대' 비교용이다.
    const myGames = ord.length;
    const myRating = ord[ord.length - 1].myRating;

    const myCharGames = myCharRecords.length;

    const {
      results,
      wouldMatchWithLooserCharGamesBand,
      wouldMatchWithLooserGamesBand,
      wouldMatchWithLooserRatingBand,
    } = findSimilar(ix.rows, {
      charaId,
      myWinRate,
      myCharGames,
      myGames,
      myRating,
      direction,
      charGamesBand,
      gamesBand,
      ratingBand,
      sessionTrend,
      recency,
      currentVersion: currentVersionOf(ix),
      excludeId: id,
    });

    return NextResponse.json({
      direction,
      charGamesBand,
      gamesBand,
      ratingBand,
      recency,
      sessionTrend,
      charaId,
      charaName: charaId,
      myCharGames,
      myWinRate,
      myGames,
      myRating,
      indexSize: ix.rows.length,
      indexUpdatedAt: ix.updatedAt,
      count: results.length,
      wouldMatchWithLooserCharGamesBand,
      wouldMatchWithLooserGamesBand,
      wouldMatchWithLooserRatingBand,
      results: results.slice(0, 12).map((r) => ({
        id: r.row.id,
        name: r.row.name,
        games: r.row.games,
        charGames: r.charGames,
        charWinRate: r.charWinRate,
        wrDiff: r.wrDiff,
        rating: r.row.rating,
        stopAfter: r.row.stopAfter,
        dropPp: r.row.dropPp,
        riseAfter: r.row.riseAfter,
        risePp: r.row.risePp,
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
