// POST /api/admin/xlsx — 관리자 통계를 엑셀로. 비밀번호가 맞을 때만 만든다.
//
// GET 이 아닌 이유: 다운로드 링크(<a href>)로 만들면 비밀번호가 URL·리퍼러·
// 서버 로그에 남는다. 화면에서 POST 로 받아 Blob URL 로 저장하게 한다.
// 엑셀 생성은 기존 tabsToXlsx 를 그대로 쓴다 — 시트 = 표 하나.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { playerViews, dailyTotals, trafficSources, lookupLangByPlayer, GaError } from '@/lib/ga';
import { tabsToXlsx } from '@/lib/tekken/xlsx';
import type { TabData } from '@/lib/tekken/compute';
import { isAdminRangeDays, adminRangeLabel, ADMIN_RANGE_ALL_DAYS } from '@/lib/admin-ranges';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function checkPassword(input: unknown): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? '';
  if (!secret) return false;
  const a = Buffer.from(typeof input === 'string' ? input : '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 파일명에 쓸 수 없는 문자 정리 + 시각 도장. */
function stamp(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
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
    const [players, daily, sources] = await Promise.all([
      playerViews(days),
      dailyTotals(days),
      trafficSources(days),
    ]);
    // 곁다리 — customEvent:ui_lang 을 GA4 에서 맞춤 측정기준으로 등록하기 전에는
    // 늘 실패한다(lib/ga.ts lookupLangByPlayer 주석 참조). 실패해도 엑셀 자체는
    // 만들어져야 하므로 catch 해서 null 로 떨어뜨린다.
    const langByPlayer = await lookupLangByPlayer(days).catch(() => null);
    const langLabel = (id: string): string => {
      const rec = langByPlayer?.get(id);
      if (!rec) return '';
      return Object.entries(rec)
        .sort((a, b) => b[1] - a[1])
        .map(([l, c]) => `${l} ${c}`)
        .join(' · ');
    };
    const totalViews = daily.reduce((s, d) => s + d.views, 0);
    const pct = (n: number) => (totalViews ? Math.round((n * 10000) / totalViews) / 100 : 0);

    const tabs: TabData[] = [
      {
        key: 'players',
        label: '조회된 플레이어',
        columns: [
          '#', '마지막 조회', '이름', '식별코드', '조회', '페이지뷰', '깊이', '비율(%)',
          '사용자', '첫 조회', '조회일 수', '패턴', '언어',
        ],
        rows: players.map((p, i) => [
          i + 1, p.lastDate, p.name || '', p.id, p.lookups,
          p.views,
          // 조회 1건당 화면을 몇 번 만졌나. 조회가 0 인 과거 기간에는 낼 수 없다.
          p.lookups > 0 ? Number((p.views / p.lookups).toFixed(1)) : '',
          pct(p.views), p.users,
          p.firstDate, p.daysSeen,
          // 조회된 ID 가 본인인지 남인지는 알 수 없다 — 사용자 수로 갈라낸 '추정'이다
          p.users >= 3
            ? '여러 명'
            : p.users >= 2
              ? '2명'
              : p.lookups >= 2
                ? '1명 반복'
                : p.views >= 10
                  ? '1명 정독'
                  : '1회성',
          langLabel(p.id),
        ]),
      },
      {
        key: 'sources',
        label: '유입 경로',
        columns: ['출처 / 매체', '사용자'],
        rows: sources.map((s) => [s.source, s.users]),
      },
      {
        key: 'daily',
        label: '일별',
        columns: ['날짜', '조회수', '사용자'],
        rows: daily.map((d) => [d.date, d.views, d.users]),
      },
    ];

    const buf = await tabsToXlsx(tabs, {
      title: '철권8 전적 통계 — 관리자 리포트',
      subtitle: `${days === ADMIN_RANGE_ALL_DAYS ? '전체 기간' : `최근 ${adminRangeLabel(days)}`} · 출처 Google Analytics`,
    });

    const filename = `tekken8stats_admin_${days}d_${stamp()}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json(
      { error: msg, setup: e instanceof GaError },
      { status: e instanceof GaError ? 503 : 502 },
    );
  }
}
