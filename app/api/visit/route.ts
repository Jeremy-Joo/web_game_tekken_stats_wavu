// 방문자 카운터 — Vercel Blob 의 visits.json 하나로 관리.
//
//   POST /api/visit  방문 1 증가 후 현재 값 반환 (클라이언트가 세션당 1회 호출)
//   GET  /api/visit  현재 값만 반환
//
// 읽고-더하고-쓰는 방식이라 동시 방문이 겹치면 일부 증가가 유실될 수 있다.
// 개인 사이트 트래픽에서는 무시할 수준이고, 정밀 집계가 필요해지면 KV 로 옮긴다.
// (KV 는 '1 더해줘'를 한 동작으로 처리한다. Blob 으로는 원자적 증가가 불가능하다.)
//
// 유실보다 훨씬 나쁜 실패가 하나 있어서 그것만은 막는다 —
// 읽기가 실패했을 때 '0명'으로 착각하고 1을 써버리면 **누적값 전체가 날아간다.**
// 그래서 readVisits 는 '읽기 성공 여부'(ok)를 값과 함께 돌려주고,
// 읽지 못했으면 POST 는 아무것도 쓰지 않는다. 한 명 덜 세는 편이 낫다.

import { NextRequest, NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_PATH = 'visits.json';

interface Visits {
  total: number;
  byDay: Record<string, number>; // 'yyyy-MM-dd'(KST) → 방문 수 (최근 위주로만 유지)
}

const EMPTY: Visits = { total: 0, byDay: {} };

/**
 * ok=false 는 **읽지 못했다**는 뜻이다 — '0명'이 아니다.
 * 파일이 아직 없는 경우만 ok=true + 0 으로 돌려준다(첫 방문은 정상적으로 1이 된다).
 */
async function readVisits(): Promise<{ ok: boolean; v: Visits }> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!blob) return { ok: true, v: { total: 0, byDay: {} } }; // 아직 없음 = 0 이 맞다
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return { ok: false, v: EMPTY }; // 있는데 못 읽음 = 값을 모른다
    const d = (await res.json()) as Visits;
    if (typeof d?.total !== 'number') return { ok: false, v: EMPTY }; // 깨진 내용
    return {
      ok: true,
      v: {
        total: d.total,
        byDay: d.byDay && typeof d.byDay === 'object' ? d.byDay : {},
      },
    };
  } catch {
    return { ok: false, v: EMPTY }; // 네트워크/권한 실패 — 값을 모른다
  }
}

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const view = (v: Visits) => ({ total: v.total, today: v.byDay[todayKst()] ?? 0 });

export async function GET() {
  const { ok, v } = await readVisits();
  // ★ ok 를 버리면 '진짜 0명'과 '못 읽어서 모름'이 같은 응답이 된다.
  //   화면이 둘을 구분해야 없는 숫자를 사실처럼 띄우지 않는다.
  return NextResponse.json(ok ? view(v) : { ...view(v), stale: true });
}

export async function POST(req: NextRequest) {
  // 브라우저 방문만 센다 — 크롤러/프리페치가 카운터를 부풀리지 않게 최소한의 거름막
  const ua = req.headers.get('user-agent') ?? '';
  if (/bot|crawler|spider|preview|prerender/i.test(ua)) {
    const { v } = await readVisits();
    return NextResponse.json(view(v));
  }

  const { ok, v } = await readVisits();
  // ★ 읽지 못했으면 쓰지 않는다. 여기서 쓰면 누적값이 1 로 덮여 복구가 불가능하다.
  if (!ok) return NextResponse.json({ ...view(v), stale: true });

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
  } catch (e) {
    // Blob 미설정(로컬 등)이어도 페이지는 굴러가야 한다.
    //
    // 다만 **저장 못 한 숫자를 저장한 것처럼 돌려주지는 않는다.** 예전에는 여기서
    // 삼키고 v.total(=읽은 값+1)을 그대로 내보냈다. 쓰기만 막힌 상태에서는
    // 방문자 수가 새로고침마다 늘었다 되돌아가는 유령 숫자가 된다.
    // 읽기 실패와 같은 취급(stale)으로 통일해 화면이 숫자를 감추게 한다.
    console.warn(`[visit] Blob 저장 실패 — 방문 수가 누적되지 않는다: ${(e as Error).message}`);
    return NextResponse.json({ ...view(v), stale: true });
  }
  return NextResponse.json({ total: v.total, today: v.byDay[day] });
}
