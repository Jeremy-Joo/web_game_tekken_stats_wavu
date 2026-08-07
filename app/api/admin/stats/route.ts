// POST /api/admin/stats — Google Analytics 조회 기록 열람. 관리자 비밀번호 필수.
//
// GET 은 두지 않는다: 주소만 알면 열리는 경로가 생기면 안 되고,
// 비밀번호가 URL·리퍼러·서버 로그에 남는 것도 피하려는 것.
// 비밀번호는 저장소에 없고 Vercel 환경변수 ADMIN_PASSWORD 에만 있다.
//
// 데이터 출처는 GA4 다 — 우리가 Blob 에 따로 쌓지 않는다.
// 조회 1건마다 Blob 에 쓰면 Advanced Operation(월 2,000)을 태우고,
// 실제로 그 방식 때문에 스토어가 정지된 적이 있다(lib/wavu/blob.ts 사고 이력).

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  playerViews,
  dailyTotals,
  trafficSources,
  tabViews,
  audience,
  featureUsage,
  reportViews,
  lookupLangByPlayer,
  GaError,
} from '@/lib/ga';
import { isAdminRangeDays } from '@/lib/admin-ranges';
import { fetchPlayerIndex, indexSummaryByPlayer } from '@/lib/tekken/player-index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function checkPassword(input: unknown): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? '';
  if (!secret) return false; // 미설정이면 아무도 못 본다
  const a = Buffer.from(typeof input === 'string' ? input : '');
  const b = Buffer.from(secret);
  // 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  let body: { password?: string; days?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
  }

  if (!checkPassword(body.password)) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  }

  const days = isAdminRangeDays(Number(body.days)) ? Number(body.days) : 28;

  try {
    // 핵심 세 가지. 하나라도 실패하면 화면을 띄우지 않는다 — 조용히 0 으로 채우면
    // '기록이 없었다'와 구별되지 않는다.
    const [players, daily, sources] = await Promise.all([
      playerViews(days),
      dailyTotals(days),
      trafficSources(days),
    ]);

    // 곁다리들은 없어도 화면이 성립한다. allSettled 로 따로 받아서, 이쪽이
    // 실패했다고 위의 핵심 데이터까지 못 보게 되는 일을 막는다.
    // (GA4 측정기준 이름이 바뀌거나 권한이 모자랄 때 여기만 깨질 수 있다)
    // langR 은 특히 잘 실패한다 — customEvent:ui_lang 을 GA4 관리화면에서
    // 맞춤 측정기준으로 등록하기 전에는 항상 실패한다(lookupLangByPlayer 주석 참조).
    const [tabsR, audR, featR, repR, langR, idxR] = await Promise.allSettled([
      tabViews(days),
      audience(days),
      featureUsage(days),
      reportViews(days),
      lookupLangByPlayer(days),
      fetchPlayerIndex(),
    ]);

    // 메인 캐릭터·레이팅 — 플레이어 인덱스(500판 이상만 담는 스냅샷)에서 찾아 곁들인다.
    // 인덱스를 못 받았거나 그 사람이 인덱스에 없으면(표본 미달) 그대로 나간다.
    const idxSummary = idxR.status === 'fulfilled' ? indexSummaryByPlayer(idxR.value) : new Map();
    const playersWithChar = players.map((p) => {
      const m = idxSummary.get(p.id);
      return m
        ? { ...p, mainChar: m.mainChar, mainCharGames: m.mainCharGames, rating: m.rating, peakRating: m.peakRating }
        : p;
    });

    return NextResponse.json({
      days,
      totalViews: daily.reduce((s, d) => s + d.views, 0),
      uniquePlayers: players.length,
      players: playersWithChar,
      daily,
      sources,
      tabs: tabsR.status === 'fulfilled' ? tabsR.value : null,
      audience: audR.status === 'fulfilled' ? audR.value : null,
      features: featR.status === 'fulfilled' ? featR.value : null,
      reports: repR.status === 'fulfilled' ? repR.value : null,
      // Map 은 JSON 으로 직렬화하면 사라지므로 일반 객체로 바꿔 보낸다.
      langByPlayer: langR.status === 'fulfilled' ? Object.fromEntries(langR.value) : null,
    });
  } catch (e) {
    // 설정 미비(환경변수·권한)와 일시적 오류를 구분해 화면이 원인을 알려줄 수 있게
    const msg = (e as Error).message;
    return NextResponse.json(
      { error: msg, setup: e instanceof GaError },
      { status: e instanceof GaError ? 503 : 502 },
    );
  }
}
