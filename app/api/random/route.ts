// GET /api/random?region=ko — 볼 만한 플레이어 하나를 뽑아 식별코드만 돌려준다.
//
// 조회 자체는 하지 않는다. 식별코드만 주면 화면이 평소 경로(/api/replays)로 조회하므로
// 캐시·집계·멘트가 전부 그대로 동작한다. 여기서 결과까지 만들면 같은 일을 두 벌 짜게 된다.
//
// ── 왜 그냥 아무나 주지 않는가 ────────────────────────────────────
// 피드에는 8판짜리 신규 계정도 섞여 있다. 그런 사람을 보여주면 리포트가 '표본 부족'
// 으로 도배돼서 볼 게 없다. 그래서 뽑은 뒤 **실제로 전적을 받아 판수를 확인**하고,
// 모자라면 버리고 다시 뽑는다.
//
// 기준을 1,000판으로 잡은 근거(실측 16명):
//     0~ 100판   리포트 섹션 0/5 채움
//   300~ 600판           4.0/5   ← 레이팅대 버킷이 빈다
//   600~1500판           5.0/5
//   1500판 이상          4.9/5
// 600판이 경계지만 여유를 둔다. 피드 표본 16명 중 11명이 1,500판 이상이라
// 1,000판으로 잡아도 후보가 넉넉하다.

import { NextRequest, NextResponse } from 'next/server';
import { getRecords } from '@/lib/wavu/cache';
import { filterPool, getPool, parseRegion, type PoolEntry } from '@/lib/wavu/pool';

export const runtime = 'nodejs';
// 전적을 최대 몇 벌 받을 수 있어서 넉넉히 준다(수만 경기짜리가 걸릴 수 있다).
export const maxDuration = 30;
// 매번 다른 사람이 나와야 하므로 응답을 캐시하면 안 된다.
export const dynamic = 'force-dynamic';

/** 이만큼은 있어야 리포트가 채워진다. 위 주석의 실측 근거 참조. */
const MIN_GAMES = 1000;
/**
 * 재추첨 횟수. 한 번이 전적 한 벌(수 MB)이라 무한정 돌릴 수 없다.
 * 실측상 피드의 2/3 가 기준을 넘어서 5회면 실패 확률이 1% 아래다.
 */
const MAX_TRIES = 5;

/** 배열에서 하나 뽑는다. 뽑힌 건 후보에서 빼서 같은 사람을 두 번 시도하지 않는다. */
function take(pool: PoolEntry[]): PoolEntry | null {
  if (!pool.length) return null;
  const i = Math.floor(Math.random() * pool.length);
  return pool.splice(i, 1)[0];
}

export async function GET(req: NextRequest) {
  const region = parseRegion(req.nextUrl.searchParams.get('region'));

  let candidates: PoolEntry[];
  try {
    candidates = filterPool(await getPool(), region).slice();
  } catch {
    return NextResponse.json(
      { error: '지금은 추천 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503 },
    );
  }
  if (!candidates.length) {
    return NextResponse.json(
      { error: '이 지역에서 찾은 플레이어가 없습니다.' },
      { status: 404 },
    );
  }

  const tried: string[] = [];
  for (let i = 0; i < MAX_TRIES; i++) {
    const pick = take(candidates);
    if (!pick) break;
    tried.push(pick.id);
    try {
      // getRecords 는 10분 캐시를 공유한다 — 뽑힌 사람을 화면이 곧바로 다시
      // 조회하므로, 여기서 받아둔 게 그대로 재사용된다(요청이 두 번 나가지 않는다).
      const { records, myName } = await getRecords(pick.id);
      if (records.length >= MIN_GAMES) {
        return NextResponse.json({
          id: pick.id,
          name: myName || null,
          games: records.length,
          region,
          tries: i + 1,
        });
      }
    } catch {
      /* 조회 실패한 사람은 그냥 버리고 다음을 뽑는다 */
    }
  }

  return NextResponse.json(
    {
      error: `조건에 맞는 플레이어를 못 찾았습니다(${MAX_TRIES}회 시도). 다시 눌러 주세요.`,
      tried: tried.length,
    },
    { status: 404 },
  );
}
