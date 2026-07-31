// GET /api/search?q=<닉네임> — wavu 플레이어 검색을 중계해 [{id, name}] 로 반환.
//
// wavu 의 /player/search?q= 는 JSON 변형이 없어(?_format=json 무시) HTML 을 파싱한다.
// 응답이 작고(수 KB) 구조가 단순하다: #search-results 안에
//   <a href="/player/<식별코드>">닉네임</a>
// 형태의 링크가 결과마다 하나씩 있다. 사이트 개편으로 구조가 바뀌면 결과가 0건이
// 되므로, 그때를 대비해 파싱 실패와 '진짜 0건'을 구분해 메시지를 낸다.

import { NextRequest, NextResponse } from 'next/server';
import { WAVU_BASE } from '@/lib/wavu/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RESULTS = 20;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ error: '검색어를 입력하세요.' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(
      `${WAVU_BASE}/player/search?q=${encodeURIComponent(q)}`,
      {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': 'tekken-stats-wavu (personal stats viewer)',
        },
        cache: 'no-store',
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `wavu 연결 실패: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `wavu 검색 오류 (HTTP ${res.status})` },
      { status: res.status === 403 || res.status === 429 ? 503 : 502 },
    );
  }

  const html = await res.text();
  const secIdx = html.indexOf('search-results');
  if (secIdx < 0) {
    return NextResponse.json(
      { error: 'wavu 검색 응답 구조가 바뀐 것 같습니다.' },
      { status: 502 },
    );
  }

  const sec = html.slice(secIdx);
  const seen = new Set<string>();
  const all: { id: string; name: string }[] = [];
  for (const m of sec.matchAll(
    /href="\/player\/([A-Za-z0-9]+)"[^>]*>\s*([^<]+?)\s*</g,
  )) {
    const id = m[1];
    const name = m[2].trim();
    if (!name || seen.has(id)) continue;
    seen.add(id);
    all.push({ id, name });
  }

  // wavu 검색은 '과거 닉네임'이 일치해도 현재 이름으로 보여준다.
  // 그래서 'chif' 검색에 ROBS 같은 무관해 보이는 이름이 섞인다.
  // 기본값: 현재 이름에 검색어가 들어간 결과만. (하나도 없으면 원본 그대로 —
  //         옛 닉네임으로만 찾아지는 경우를 살리기 위해)
  // ?history=1: 필터 없이 wavu 결과 전체 (과거 닉네임 포함 검색 옵션).
  const includeHistory = req.nextUrl.searchParams.get('history') === '1';
  const ql = q.toLowerCase();
  const matched = all.filter((r) => r.name.toLowerCase().includes(ql));
  const results = (
    includeHistory ? all : matched.length > 0 ? matched : all
  ).slice(0, MAX_RESULTS);

  return NextResponse.json({ query: q, results, history: includeHistory });
}
