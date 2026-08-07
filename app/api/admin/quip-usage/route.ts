// POST /api/admin/quip-usage — 멘트 풀별 GA 실사용 분포. 관리자 비밀번호 필수.
//
// GitHub Actions(scripts/check-quip-usage-drift.ts)가 이 라우트를 통해서만 GA 데이터에
// 접근한다 — GA_SERVICE_ACCOUNT 는 Vercel 환경변수에만 있고 Actions 시크릿에는 없다
// (scripts/build-player-index.ts 머리말과 같은 이유). /api/admin/stats 를 통째로 부르지
// 않고 이 전용 라우트를 따로 둔 이유는, 드리프트 검사는 이 데이터 하나만 필요한데
// stats 는 GA 호출을 여러 개 묶어서 훨씬 무겁기 때문이다.
//
// GET 은 두지 않는다: 주소만 알면 열리는 경로가 생기면 안 되고, 비밀번호가
// URL·리퍼러·서버 로그에 남는 것도 피하려는 것 (admin/stats·revalidate-index 와 같은 이유).

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { quipUsage, GaError } from '@/lib/ga';
import { isAdminRangeDays } from '@/lib/admin-ranges';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkPassword(input: unknown): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? '';
  if (!secret) return false;
  const a = Buffer.from(typeof input === 'string' ? input : '');
  const b = Buffer.from(secret);
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
    const rows = await quipUsage(days);
    return NextResponse.json({ days, rows });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json(
      { error: msg, setup: e instanceof GaError },
      { status: e instanceof GaError ? 503 : 502 },
    );
  }
}
