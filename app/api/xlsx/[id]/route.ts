// GET /api/xlsx/<식별코드>?start=&end=  → 집계 전체를 xlsx 로 다운로드.
// GET /api/xlsx/compare?ids=a,b&start=&end= 는 별도 라우트 없이 여기서 처리한다
// (id 자리에 'compare' 예약어).

import { NextRequest, NextResponse } from 'next/server';
import { normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { getReplays } from '@/lib/wavu/cache';
import { normalizeReplays, filterByDate } from '@/lib/wavu/normalize';
import { computeFromRecords } from '@/lib/tekken/compute';
import { computeCompare, type ComparePlayer } from '@/lib/tekken/compare';
import { tabsToXlsx } from '@/lib/tekken/xlsx';
import type { MatchRecord } from '@/lib/tekken/models';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ── 최소한의 남용 방지 ──────────────────────────────────────────────
// 이 라우트가 사이트에서 가장 비싸다 — 30,233경기 기준 27.6초, 워크북 5.5MB.
// 무제한으로 열려 있으면 무작위 호출만으로 wavu 수집이 계속 돌고,
// 차단당하는 쪽은 우리가 아니라 wavu 다.
//
// 정직하게: 이 카운터는 **인스턴스별 메모리**라 정확하지 않다.
// Vercel 은 요청을 여러 인스턴스에 나눠주므로 실제 허용치는 이 값보다 클 수 있고,
// 인스턴스가 재시작되면 초기화된다. 정확한 제한이 필요해지면 KV 로 옮긴다.
// 그래도 '한 명이 한 인스턴스를 계속 두드리는' 흔한 경우는 여기서 걸린다.
const RATE_WINDOW_MS = 5 * 60_000;
const RATE_MAX = 6;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // 메모리 상한 — 정밀도보다 안전이 우선
  return recent.length > RATE_MAX;
}

function stamp(): string {
  // KST 기준 파일명 타임스탬프 (WPF 의 yyyy_MMdd_HHmmss 관례)
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}_${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function xlsxResponse(buf: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // 한글 파일명 대비 RFC 5987 인코딩
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '엑셀 다운로드 요청이 너무 잦습니다. 잠시 후 다시 시도하세요.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const { id: rawId } = await params;
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;
  const season = sp.get('season') ?? undefined;
  const period = season
    ? season
    : start || end
      ? `${start ?? ''}~${end ?? ''}`
      : undefined;
  /** 화면과 같은 기준으로 거른다 — 시즌은 날짜가 아니라 season 키로. */
  const applyPeriod = (rs: MatchRecord[]) =>
    season ? rs.filter((r) => r.season === season) : filterByDate(rs, start, end);

  try {
    if (rawId === 'compare') {
      const ids = [
        ...new Set(
          (sp.get('ids') ?? '').split(',').map(normalizePolarisId).filter(Boolean),
        ),
      ];
      if (ids.length < 2) {
        return NextResponse.json(
          { error: '비교 다운로드에는 ids=a,b 가 필요합니다.' },
          { status: 400 },
        );
      }
      const players: ComparePlayer[] = [];
      for (const id of ids) {
        // wavu 지침대로 순차 수집
        const { replays } = await getReplays(id);
        const { records, myName } = normalizeReplays(replays, id);
        players.push({
          polarisId: id,
          name: myName || id,
          records: applyPeriod(records),
        });
      }
      const tabs = computeCompare(players);
      const names = players.map((p) => p.name).join('_vs_');
      const buf = await tabsToXlsx(tabs, {
        title: `비교: ${players.map((p) => p.name).join(' vs ')}`,
        subtitle: period,
      });
      return xlsxResponse(buf, `compare_${names}_${stamp()}.xlsx`.slice(0, 120));
    }

    const id = normalizePolarisId(rawId);
    if (!id) {
      return NextResponse.json({ error: '식별코드가 비었습니다.' }, { status: 400 });
    }
    const { replays } = await getReplays(id);
    const { records, myName } = normalizeReplays(replays, id);
    const char = sp.get('char') ?? undefined;
    const dated = applyPeriod(records);
    const filtered = char ? dated.filter((r) => r.myChar === char) : dated;
    if (!filtered.length) {
      return NextResponse.json({ error: '해당 조건의 경기가 없습니다.' }, { status: 404 });
    }
    // 엑셀은 레이팅 추이를 캐릭터별 컬럼으로 펼친다 — 시트에서 바로 차트를 만들 수 있게.
    // (JSON 응답은 좁은 포맷이다. compute.ts 의 wideTrend 주석 참조)
    const result = computeFromRecords(filtered, id, myName, { wideTrend: true });
    const buf = await tabsToXlsx(result.tabs, {
      title: `${myName || id} (${id})${char ? ` — ${char}` : ''}`,
      subtitle: period,
    });
    const safe = (myName || id).replace(/[<>:"/\\|?*]/g, '_');
    const charTag = char ? `_${char.replace(/[<>:"/\\|?*]/g, '_')}` : '';
    return xlsxResponse(buf, `${safe}_${id}${charTag}_wavu_${stamp()}.xlsx`);
  } catch (e) {
    if (e instanceof WavuError) {
      const status = e.kind === 'not_found' ? 404 : e.kind === 'blocked' ? 503 : 502;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json(
      { error: `엑셀 생성 오류: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
