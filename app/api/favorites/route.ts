// 자주 쓰는 ID 전역 목록 — Vercel Blob 에 favorites.json 하나로 저장.
//
//   GET  /api/favorites                          누구나 (칩 목록 표시용)
//   POST /api/favorites {password, action, ...}  관리자만 (ADMIN_PASSWORD 환경변수 대조)
//
// 비밀번호는 코드/저장소에 없다 — Vercel 환경변수 ADMIN_PASSWORD 로만 존재.
// Blob 공개 URL 은 추측 불가능한 스토어 주소이고 내용도 닉네임/식별코드뿐(민감정보 아님).

import { NextRequest, NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_PATH = 'favorites.json';

interface Favorite {
  id: string;
  name: string;
}

function checkPassword(input: string): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? '';
  if (!secret) return false; // 환경변수 미설정이면 등록 자체를 막는다
  const a = Buffer.from(String(input ?? ''));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readFavs(): Promise<Favorite[]> {
  // 목록에서 favorites.json 을 찾아 그 URL 을 읽는다 (CDN 캐시 회피 no-store)
  const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
  const blob = blobs.find((b) => b.pathname === BLOB_PATH);
  if (!blob) return [];
  const res = await fetch(blob.url, { cache: 'no-store' });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  return Array.isArray(data)
    ? (data as Favorite[]).filter((f) => f && typeof f.id === 'string')
    : [];
}

async function writeFavs(favs: Favorite[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(favs), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

export async function GET() {
  try {
    return NextResponse.json({ favorites: await readFavs() });
  } catch (e) {
    // Blob 미설정(로컬 등)이어도 페이지는 동작해야 한다
    return NextResponse.json({ favorites: [], warning: (e as Error).message });
  }
}

export async function POST(req: NextRequest) {
  let body: {
    password?: string;
    action?: 'add' | 'remove';
    id?: string;
    name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
  }

  if (!checkPassword(body.password ?? '')) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 });
  }

  const id = (body.id ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (!id) {
    return NextResponse.json({ error: '식별코드가 비었습니다.' }, { status: 400 });
  }

  try {
    const favs = await readFavs();
    if (body.action === 'remove') {
      const next = favs.filter((f) => f.id !== id);
      await writeFavs(next);
      return NextResponse.json({ favorites: next });
    }
    // add (같은 id 는 이름 갱신)
    const name = (body.name ?? '').trim() || id;
    const next = [...favs.filter((f) => f.id !== id), { id, name }];
    await writeFavs(next);
    return NextResponse.json({ favorites: next });
  } catch (e) {
    return NextResponse.json(
      { error: `저장 실패: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
