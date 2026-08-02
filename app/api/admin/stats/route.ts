// POST /api/admin/stats — 조회 로그 열람. 관리자 비밀번호가 맞을 때만 응답한다.
//
// GET 은 두지 않는다: 주소만 알면 열리는 경로가 생기면 안 되고,
// 비밀번호가 URL·리퍼러·서버 로그에 남는 것도 피하려는 것.
// 비밀번호는 저장소에 없고 Vercel 환경변수 ADMIN_PASSWORD 에만 있다.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { readLog, todayKst } from '@/lib/stats-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function checkPassword(input: unknown): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? '';
  if (!secret) return false; // 미설정이면 아무도 못 본다
  const a = Buffer.from(typeof input === 'string' ? input : '');
  const b = Buffer.from(secret);
  // 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다
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

  const log = await readLog();

  const players = Object.entries(log.players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.count - a.count || b.last - a.last);

  const searches = Object.entries(log.searches)
    .map(([q, s]) => ({ query: q, ...s }))
    .sort((a, b) => b.count - a.count || b.last - a.last);

  const days = Object.entries(log.byDay)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({
    total: log.total,
    today: log.byDay[todayKst()] ?? 0,
    uniquePlayers: players.length,
    players,
    searches,
    days,
  });
}
