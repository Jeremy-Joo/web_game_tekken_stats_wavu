// POST /api/admin/revalidate-index — 플레이어 인덱스 캐시를 즉시 무효화한다.
//
// player-index.ts 가 GitHub raw 를 1시간 캐시로 받아오므로, 인덱스를 갱신해도
// 최대 1시간은 예전 사본이 나간다. 매일 자동 갱신(GA, GitHub Actions)이 끝난
// 직후 이 라우트를 한 번 불러서 그 기다림을 없앤다 — revalidateTag 는 다음
// 요청부터 바로 새로 받아오게 만든다(그 자리에서 미리 받아두지는 않는다,
// 그래서 이 라우트 자체는 아주 가볍다).
//
// 인증은 admin/stats 와 같은 방식이다(비밀번호는 Vercel 환경변수에만 있고
// 저장소에 없다). GET 을 안 두는 이유도 같다 — 주소만 알면 아무나 캐시를
// 무효화할 수 있게 되는 것도, 비밀번호가 URL 에 남는 것도 피한다.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { PLAYER_INDEX_TAG } from '@/lib/tekken/player-index';

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
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
  }

  if (!checkPassword(body.password)) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  }

  revalidateTag(PLAYER_INDEX_TAG);
  return NextResponse.json({ ok: true, revalidated: PLAYER_INDEX_TAG });
}
