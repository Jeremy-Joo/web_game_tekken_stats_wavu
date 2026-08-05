import { NextResponse } from 'next/server';
import { fetchReplays, normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { estimateRankPoints, type RankMatch } from '@/lib/tekken/rankpoint';
import { rankName } from '@/lib/wavu/ranks';
import { charName } from '@/lib/wavu/chars';

// 랭크 포인트 추정. wavu 데이터만 쓴다 — 외부 사이트를 거치지 않는다.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const polarisId = normalizePolarisId(id ?? '');

  if (!polarisId) {
    return NextResponse.json({ error: '식별코드가 필요합니다.' }, { status: 400 });
  }

  try {
    const replays = await fetchReplays(polarisId);
    if (replays.length === 0) {
      return NextResponse.json({ error: '전적이 없습니다.', polarisId }, { status: 404 });
    }

    // 캐릭터별로 '나' 관점 경기만 모은다. 단은 캐릭터마다 따로다.
    const byChara = new Map<number, RankMatch[]>();
    let playerName: string | null = null;

    for (const r of replays) {
      const meIsP1 = r.p1_polaris_id === polarisId;
      const chara = meIsP1 ? r.p1_chara_id : r.p2_chara_id;
      const rank = meIsP1 ? r.p1_rank : r.p2_rank;
      if (chara == null || rank == null) continue;

      playerName ??= (meIsP1 ? r.p1_name : r.p2_name) ?? null;

      const list = byChara.get(chara) ?? [];
      list.push({
        battleAt: r.battle_at,
        charaId: chara,
        rank,
        won: r.winner === (meIsP1 ? 1 : 2),
      });
      byChara.set(chara, list);
    }

    const characters = [...byChara.entries()]
      .map(([charaId, matches]) => {
        const est = estimateRankPoints(matches);
        return {
          charaId,
          charaName: charName(charaId),
          matches: matches.length,
          lastPlayed: Math.max(...matches.map((m) => m.battleAt)),
          rankName: rankName(est.rankId),
          ...est,
        };
      })
      .sort((a, b) => b.lastPlayed - a.lastPlayed || b.matches - a.matches);

    return NextResponse.json({ polarisId, playerName, characters });
  } catch (e) {
    if (e instanceof WavuError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: '추정 실패', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
