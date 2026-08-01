// GET /api/search?q=<닉네임> — wavu 플레이어 검색을 중계해 [{id, name}] 로 반환.
//
// wavu 의 /player/search?q= 는 JSON 변형이 없어(?_format=json 무시) HTML 을 파싱한다.
// 파싱 규칙과 실패 판정은 lib/wavu/search.ts 에 있다(네트워크 없이 테스트되는 순수 함수).
// 이 라우트는 가져오기와 필터링만 한다.

import { NextRequest, NextResponse } from 'next/server';
import { WAVU_BASE } from '@/lib/wavu/client';
import { parseSearchHtml } from '@/lib/wavu/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// wavu 검색 자체가 최대 50건을 돌려준다(실측 — limit/page 파라미터 없음).
// 그 이하로 자르면 사용자 눈에 '누락'으로 보이므로 wavu 상한을 그대로 따른다.
const MAX_RESULTS = 50;

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

  const parsed = parseSearchHtml(await res.text());
  if (!parsed.ok) {
    // ★ 파싱 실패를 '결과 0건'으로 흘려보내지 않는다. 그러면 사용자는 자기 오타를
    //   의심하고, 우리는 검색이 죽은 줄도 모른 채 지나간다.
    return NextResponse.json(
      {
        error:
          parsed.reason === 'no_section'
            ? 'wavu 검색 페이지 구조가 바뀌었습니다. (검색 기능 점검 필요)'
            : 'wavu 검색 결과를 읽지 못했습니다. 구조가 바뀐 것 같습니다.',
      },
      { status: 502 },
    );
  }
  const all = parsed.results;

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
