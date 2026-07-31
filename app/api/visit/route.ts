// 방문자 카운터 — Vercel Blob 의 visits.json 하나로 관리.
//
//   POST /api/visit  방문 1 증가 후 현재 값 반환 (클라이언트가 세션당 1회 호출)
//   GET  /api/visit  현재 값만 반환
//
// 읽고-더하고-쓰는 방식이라 동시 방문이 겹치면 일부 증가가 유실될 수 있다.
// 개인 사이트 트래픽에서는 무시할 수준이고, 정밀 집계가 필요해지면 KV 로 옮긴다.

import { NextRequest, NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_PATH = 'visits.json';

interface Visits {
  total: number;
  byDay: Record<string, number>; // 'yyyy-MM-dd'(KST) → 방문 수 (최근 위주로만 유지)
}

async function readVisits(): Promise<Visits> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!blob) return { total: 0, byDay: {} };
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return { total: 0, byDay: {} };
    const d = (await res.json()) as Visits;
    return {
      total: typeof d.total === 'number' ? d.total : 0,
      byDay: d.byDay && typeof d.byDay === 'object' ? d.byDay : {},
    };
  } catch {
    return { total: 0, byDay: {} };
  }
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET() {
  const v = await readVisits();
  return NextResponse.json({ total: v.total, today: v.byDay[todayKst()] ?? 0 });
}

export async function POST(req: NextRequest) {
  // 브라우저 방문만 센다 — 크롤러/프리페치가 카운터를 부풀리지 않게 최소한의 거름막
  const ua = req.headers.get('user-agent') ?? '';
  if (/bot|crawler|spider|preview|prerender/i.test(ua)) {
    const v = await readVisits();
    return NextResponse.json({ total: v.total, today: v.byDay[todayKst()] ?? 0 });
  }

  const v = await readVisits();
  const day = todayKst();
  v.total += 1;
  v.byDay[day] = (v.byDay[day] ?? 0) + 1;

  // byDay 는 최근 60일만 유지 (파일이 무한히 자라지 않게)
  const days = Object.keys(v.byDay).sort();
  for (const d of days.slice(0, Math.max(0, days.length - 60))) delete v.byDay[d];

  try {
    await put(BLOB_PATH, JSON.stringify(v), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
  } catch {
    // Blob 미설정(로컬 등)이어도 페이지는 굴러가야 한다
  }
  return NextResponse.json({ total: v.total, today: v.byDay[day] });
}
