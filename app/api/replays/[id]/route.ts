// GET /api/replays/<식별코드>?start=yyyy-MM-dd&end=yyyy-MM-dd
//
// wavu 에서 전체 이력을 받아 정규화·집계까지 서버에서 끝내고 탭 데이터를 돌려준다.
// 원본 replay(489KB)를 클라이언트로 흘리지 않는 이유: 모바일 회선에서 무겁고,
// 집계 로직이 서버/클라 두 벌로 갈라질 이유가 없다.
//
// 캐시: 같은 식별코드 요청을 10분간 Vercel Blob 에 gzip 으로 보관한다(lib/wavu/cache.ts).
// 전체 이력이 한 번에 오는 구조라 wavu 에는 요청을 아낄수록 좋고
// (문서상 "한 번에 하나씩이면 레이트리밋에 안 걸린다"),
// 기간 필터는 받아온 뒤 서버 메모리에서 하므로 캐시 키를 오염시키지 않는다.

import { NextRequest, NextResponse } from 'next/server';
import { normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { getRecords } from '@/lib/wavu/cache';
import { filterByDate } from '@/lib/wavu/normalize';
import { computeFromRecords } from '@/lib/tekken/compute';
import { buildBarcodeSeq } from '@/lib/tekken/barcode';
import { seasonSpans } from '@/lib/tekken/seasons';
import { sessionAdvice } from '@/lib/tekken/advice';
import { dateKey, type MatchRecord } from '@/lib/tekken/models';
import { buildQuipFacts } from '@/lib/tekken/quip-facts';
import {
  guessTimezone,
  hourHistogramUtcFromRecords,
  formatOffset,
  KST_MINUTES,
} from '@/lib/wavu/region';

/**
 * 마지막 경기로부터 지난 날짜 (KST 날짜끼리).
 *
 * 시각 규약은 models.ts 한 곳에 있고 레코드의 dt 는 이미 KST 로 shift 된 Date 다.
 * 여기서는 그 규약을 따라 '오늘(KST)'만 만들어 날짜 문자열끼리 뺀다.
 */
function daysSinceLast(records: MatchRecord[]): number {
  if (!records.length) return 0;
  const last = records.reduce((a, b) => (a.dt > b.dt ? a : b)).dt;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return Math.max(
    0,
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dateKey(last)}T00:00:00Z`)) / 86_400_000),
  );
}

export const runtime = 'nodejs';
// wavu 전체 이력(수천~수만 경기)을 받는 데 수 초 걸릴 수 있다. Hobby 기본 10초보다 여유를 둔다.
export const maxDuration = 30;

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
  const char = sp.get('char') ?? undefined; // 캐릭터별 상세: 이 캐릭터 경기만 집계
  // 시즌 필터는 날짜가 아니라 season 키로 받는다 — game_version 판정이 유일한 정답이라
  // 시즌 경계 날짜를 어디에도 적어둘 필요가 없다(새 시즌도 자동으로 동작).
  const season = sp.get('season') ?? undefined;

  try {
    const { records, myName, stats, fetchedAt, stale, region } = await getRecords(id);

    // 시간대 추정은 **전체 이력**으로 한다 — 기간 필터를 좁혀도 추정이 흔들리면
    // 같은 사람의 시간축이 조회할 때마다 달라진다.
    const tz = guessTimezone(region, hourHistogramUtcFromRecords(records));
    const tzShiftMinutes = tz.offsetMinutes - KST_MINUTES;

    if (records.length === 0) {
      return NextResponse.json(
        { error: '경기 기록이 없습니다. 식별코드를 확인하세요.', stats },
        { status: 404 },
      );
    }

    // 시즌 필터와 날짜 필터는 화면에서 서로 배타적인 선택지다.
    const dated = season
      ? records.filter((r) => r.season === season)
      : filterByDate(records, start, end);

    // 캐릭터 칩용: 기간 필터까지 적용된 시점의 캐릭터별 경기 수 (사용량 내림차순).
    // char 필터 '이전' 값이어야 칩 목록이 선택과 무관하게 안정적으로 유지된다.
    const counts = new Map<string, number>();
    for (const r of dated) counts.set(r.myChar, (counts.get(r.myChar) ?? 0) + 1);
    const charCounts = [...counts.entries()]
      .map(([name, games]) => ({ name, games }))
      .sort((a, b) => b.games - a.games || (a.name < b.name ? -1 : 1));

    const filtered = char ? dated.filter((r) => r.myChar === char) : dated;
    // 전적 목록은 최근 1,000경기까지만 JSON 에 싣는다 (전체는 엑셀 다운로드로)
    const result = computeFromRecords(filtered, id, myName, {
      matchesLimit: 1000,
      tzShiftMinutes,
    });

    return NextResponse.json({
      ...result,
      // computeFromRecords 는 필터된 레코드 기준이라 recordCount 도 필터 후 값이다.
      // '전체 이력 건수'는 따로 실어 UI 가 "618 (전체 7,814)" 를 맞게 보여주게 한다.
      totalCount: records.length,
      // 승패 바코드 — 기간·캐릭터 필터를 따른다(filtered). 전체 이력 기준이면
      // 화면의 다른 숫자와 어긋나 보인다.
      barcode: buildBarcodeSeq(filtered),
      charCounts,
      selectedChar: char ?? null,
      stats,
      // 시즌 목록·구간은 전체 이력에서 뽑는다 — 기간 필터를 바꿔도 버튼이 흔들리지 않게.
      seasons: seasonSpans(records),
      // 권장 판수는 '지금 보고 있는 범위' 기준이라 필터된 데이터로 계산한다.
      // 셋째 인자는 '마지막 경기로부터 지난 날짜' — 오래 쉰 사람의 최근 20판을
      // 현재 폼으로 단정하지 않게 하는 값이다(advice.ts 의 STALE_DAYS).
      advice: sessionAdvice(filtered, undefined, daysSinceLast(filtered)),
      // 농담이 인용할 사실. 클라이언트에는 원본 레코드가 없으므로 여기서 계산해 실어 보낸다
      // (양쪽에서 따로 계산하면 같은 농담이 두 화면에서 다른 숫자를 말하게 된다).
      // tzKnown 은 **추정에 성공했는가**다 — guessTimezone 은 모를 때도 KST 를 돌려주므로
      // offsetMinutes 만 보고 "새벽 3시"라고 하면 외국 유저에게 거짓말이 된다.
      quipFacts: buildQuipFacts({
        records: filtered,
        allRecords: records,
        today: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10),
        tzOffsetMinutes: tz.offsetMinutes,
        tzKnown: tz.source !== 'default',
      }),
      filtered: {
        start: start ?? null,
        end: end ?? null,
        season: season ?? null,
        count: filtered.length,
      },
      // 서버 지역과 거기서 추정한 현지 시간대. 화면이 '시간대' 탭에서 KST 와
      // 현지 시각을 전환하는 데 쓴다. region 이 null 이면 추정하지 않았다는 뜻이고
      // (source='default') 그때는 지금까지와 똑같이 KST 만 보여준다.
      timezone: {
        region: region ? { code: region.code, label: region.label } : null,
        offsetMinutes: tz.offsetMinutes,
        offsetLabel: formatOffset(tz.offsetMinutes),
        source: tz.source,
        fit: tz.fit,
      },
      // stale=true 면 wavu 수집에 실패해 지난 사본을 보여주는 중이다. UI 가 밝힌다.
      cache: { fetchedAt, stale },
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
