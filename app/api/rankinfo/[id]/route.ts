import { NextResponse } from 'next/server';
import { fetchReplays, normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { rankName } from '@/lib/wavu/ranks';
import { charName } from '@/lib/wavu/chars';

// 캐릭터별 현재 단. **추정이 없다** — wavu 가 준 값을 그대로 센다.
//   단은 캐릭터마다 따로라 캐릭터 단위로 묶는다.
//   '현재 단'은 그 캐릭터의 가장 최근 경기에 찍힌 단이다.
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
      return NextResponse.json({ polarisId, characters: [] });
    }

    const acc = new Map<number, { matches: number; lastAt: number; lastRank: number }>();

    for (const r of replays) {
      const meIsP1 = r.p1_polaris_id === polarisId;
      const chara = meIsP1 ? r.p1_chara_id : r.p2_chara_id;
      const rank = meIsP1 ? r.p1_rank : r.p2_rank;
      if (chara == null || rank == null) continue;

      const cur = acc.get(chara);
      if (!cur) {
        acc.set(chara, { matches: 1, lastAt: r.battle_at, lastRank: rank });
      } else {
        cur.matches += 1;
        if (r.battle_at >= cur.lastAt) {
          cur.lastAt = r.battle_at;
          cur.lastRank = rank;
        }
      }
    }

    const characters = [...acc.entries()]
      .map(([charaId, v]) => ({
        charaId,
        charaName: charName(charaId),
        matches: v.matches,
        lastPlayed: v.lastAt,
        rankId: v.lastRank,
        rankName: rankName(v.lastRank),
      }))
      .sort((a, b) => b.lastPlayed - a.lastPlayed || b.matches - a.matches);

    return NextResponse.json({ polarisId, characters });
  } catch (e) {
    if (e instanceof WavuError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: '조회 실패', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
