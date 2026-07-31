// GET /api/xlsx/<식별코드>?start=&end=  → 집계 전체를 xlsx 로 다운로드.
// GET /api/xlsx/compare?ids=a,b&start=&end= 는 별도 라우트 없이 여기서 처리한다
// (id 자리에 'compare' 예약어).

import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchReplays, normalizePolarisId, WavuError } from '@/lib/wavu/client';
import { normalizeReplays, filterByDate } from '@/lib/wavu/normalize';
import { computeFromRecords } from '@/lib/tekken/compute';
import { computeCompare, type ComparePlayer } from '@/lib/tekken/compare';
import { tabsToXlsx } from '@/lib/tekken/xlsx';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CACHE_SECONDS = 600;

const getReplaysCached = (id: string) =>
  unstable_cache(() => fetchReplays(id), ['wavu-replays', id], {
    revalidate: CACHE_SECONDS,
  })();

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
  const { id: rawId } = await params;
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;
  const period = start || end ? `${start ?? ''}~${end ?? ''}` : undefined;

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
        const replays = await getReplaysCached(id);
        const { records, myName } = normalizeReplays(replays, id);
        players.push({
          polarisId: id,
          name: myName || id,
          records: filterByDate(records, start, end),
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
    const replays = await getReplaysCached(id);
    const { records, myName } = normalizeReplays(replays, id);
    const filtered = filterByDate(records, start, end);
    if (!filtered.length) {
      return NextResponse.json({ error: '해당 조건의 경기가 없습니다.' }, { status: 404 });
    }
    const result = computeFromRecords(filtered, id, myName);
    const buf = await tabsToXlsx(result.tabs, {
      title: `${myName || id} (${id})`,
      subtitle: period,
    });
    const safe = (myName || id).replace(/[<>:"/\\|?*]/g, '_');
    return xlsxResponse(buf, `${safe}_${id}_wavu_${stamp()}.xlsx`);
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
