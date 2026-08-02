// GET /api/compare?ids=aaa,bbb,ccc&start=&end=
// 2명 이상을 받아 비교 리포트 탭을 돌려준다.
//
// wavu 레이트리밋 지침("요청을 한 번에 하나만")에 맞춰 **순차**로 가져온다.
// Promise.all 로 바꾸지 말 것 — 동시 요청이 차단을 부를 수 있다.

import { NextRequest, NextResponse } from 'next/server';
import { normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { getReplays } from '@/lib/wavu/cache';
import { normalizeReplays, filterByDate } from '@/lib/wavu/normalize';
import { computeCompare, type ComparePlayer } from '@/lib/tekken/compare';
import { seasonSpans, mergeSeasonSpans, type SeasonSpan } from '@/lib/tekken/seasons';

export const runtime = 'nodejs';
// 순차 수집이라 인원수만큼 시간이 는다. 4명 × 수 초 대비.
export const maxDuration = 60;

const MAX_PLAYERS = 4;

/**
 * 수집에 쓸 시간 상한. maxDuration(60초)에서 집계·직렬화 몫을 남겨둔 값이다.
 *
 * 왜 필요한가: 순차 수집이라 인원수만큼 시간이 는다. 실측으로 4명(149,593경기)이
 * 캐시가 전부 빈 상태에서 36.7초 걸렸다 — 60초를 넘길 여지가 있고, 넘기면
 * 사용자는 1분을 기다린 끝에 원인 모를 504 를 본다.
 *
 * 대신 여기서 멈추고 이유를 말한다. 이미 받아온 사람들은 Blob 에 저장돼 있으므로
 * **다시 시도하면 그만큼 빨라진다** — 재시도가 실제로 효과 있는 안내가 된다.
 */
const COLLECT_BUDGET_MS = 45_000;

/**
 * 비교에 쓸 수 있는 **전체 경기 수** 상한.
 *
 * 시간이 아니라 메모리 때문에 필요하다. 비교는 참가자 전원의 레코드를 동시에 들고
 * h2h·공통 상대를 교차 계산해야 해서, 큰 사람이 끼면 함수가 그냥 죽는다.
 * 죽으면 500 + **본문 0바이트**가 나가고 화면에는 "Unexpected end of JSON input"만
 * 뜬다 — 사용자는 원인을 알 길이 없다.
 *
 * 실측 경계:
 *   30,233 + 44,306 =  74,539  →  7.4초, 정상
 *   21,190 + 138,560 = 159,750 →  14.1초, HTTP 500 (본문 없음)
 * 확인된 정상치와 사고치 사이에서 잡았다. 넘으면 죽는 대신 이유를 말한다.
 *
 * 한 명 조회는 138,560경기도 잘 돌아간다(14.1초, 7.6MB) — 그래서 안내에 그 길을 알려준다.
 */
const MAX_TOTAL_GAMES = 100_000;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get('ids') ?? '')
    .split(',')
    .map(normalizePolarisId)
    .filter(Boolean);
  const uniq = [...new Set(ids)];
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;
  const season = sp.get('season') ?? undefined; // 날짜가 아닌 season 키로 거른다

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
  const spans: SeasonSpan[][] = []; // 시즌 버튼용 — 사람별 요약만 모은다(레코드 아님)
  let anyStale = false;
  let totalGames = 0;
  try {
    const startedAt = Date.now();
    for (const id of uniq) {
      // 남은 사람을 더 받다가는 함수 시간 제한에 걸린다 — 여기서 끊고 이유를 말한다.
      if (players.length > 0 && Date.now() - startedAt > COLLECT_BUDGET_MS) {
        return NextResponse.json(
          {
            error:
              `수집이 오래 걸려 중단했습니다 (${players.length}/${uniq.length}명 완료). ` +
              `받아둔 기록은 저장돼 있으니 잠시 후 다시 시도하면 훨씬 빠릅니다.`,
          },
          { status: 503 },
        );
      }
      // 의도적 순차 — 주석 참조
      const { replays, stale } = await getReplays(id);
      if (stale) anyStale = true;
      const { records, myName } = normalizeReplays(replays, id);

      // 이 사람까지 더하면 감당이 안 되는가. 계산에 들어가기 **전에** 막는다 —
      // 들어간 뒤에 죽으면 본문 없는 500 이 나가서 원인을 알 수 없다.
      totalGames += records.length;
      if (totalGames > MAX_TOTAL_GAMES) {
        return NextResponse.json(
          {
            error:
              `비교하기엔 전적이 너무 많습니다 (합계 ${totalGames.toLocaleString()}경기, ` +
              `상한 ${MAX_TOTAL_GAMES.toLocaleString()}경기). ` +
              `'${myName || id}' 님만 ${records.length.toLocaleString()}경기입니다. ` +
              `한 명씩 조회하면 정상 동작합니다.`,
          },
          { status: 413 },
        );
      }

      players.push({
        polarisId: id,
        name: myName || id,
        records: season
          ? records.filter((r) => r.season === season)
          : filterByDate(records, start, end),
      });
      spans.push(seasonSpans(records));
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
    seasons: mergeSeasonSpans(spans),
    filtered: { start: start ?? null, end: end ?? null, season: season ?? null },
    cache: { stale: anyStale },
  });
}
