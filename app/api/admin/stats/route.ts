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
import { playerViews, dailyTotals, trafficSources, GaError } from '@/lib/ga';

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

  const days = [7, 28, 90, 365].includes(Number(body.days)) ? Number(body.days) : 28;

  try {
    // 세 리포트는 서로 무관하니 같이 던진다
    const [players, daily, sources] = await Promise.all([
      playerViews(days),
      dailyTotals(days),
      trafficSources(days),
    ]);

    return NextResponse.json({
      days,
      totalViews: daily.reduce((s, d) => s + d.views, 0),
      uniquePlayers: players.length,
      players,
      daily,
      sources,
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
