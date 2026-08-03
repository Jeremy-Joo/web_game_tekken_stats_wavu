// GET /api/visitors — 오늘·최근 7일 방문자 수. **공개 엔드포인트다.**
//
// ── 관리자 통계와 무엇이 다른가 ───────────────────────────────────
// /api/admin/stats 는 "누가 어떤 ID 를 조회했는지"를 준다. 그건 비밀번호로 막혀 있고
// 앞으로도 막혀 있어야 한다. 여기는 **합계 숫자 두 개뿐**이라 누구의 무엇도 드러나지
// 않는다. 같은 GA 를 쓰지만 꺼내는 것이 다르다 — 그래서 공개해도 된다.
//
// ── 왜 Upstash 를 안 쓰나 ────────────────────────────────────────
// 형제 저장소(tekken8_tube)는 Upstash Redis 에 카운터를 증가시킨다. 여기서는
// GA 를 이미 붙여 뒀고 자격증명도 있어서 **새 서비스를 늘릴 이유가 없다.**
// 대신 GA 표준 리포트는 반영이 즉시가 아니다 — 이른 아침에는 오늘 수치가 0 으로
// 나올 수 있다. 푸터의 참고용 숫자라 그 정도 지연은 감수한다.
// (실시간이 필요해지면 그때 Upstash 를 붙이면 된다)

import { NextResponse } from 'next/server';
import { dailyTotals, GaError } from '@/lib/ga';

export const runtime = 'nodejs';
// 10분 캐시. GA Data API 는 일일 토큰 한도가 있어서 요청마다 부르면 안 된다.
// 방문자 수는 10분 낡아도 아무 문제가 없다.
export const revalidate = 600;

export async function GET() {
  try {
    const days = await dailyTotals(7);
    // dailyTotals 는 최신순이라 [0] 이 오늘이다. 아직 집계 전이면 아예 없을 수 있다.
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const t = days.find((d) => d.date === today);
    return NextResponse.json({
      today: t?.users ?? 0,
      week: days.reduce((n, d) => n + d.users, 0),
    });
  } catch (e) {
    // GA 환경변수가 없거나(로컬 개발) 호출이 실패해도 화면이 깨지면 안 된다.
    // null 이면 화면이 아무것도 안 그린다.
    if (!(e instanceof GaError)) console.error('visitors:', e);
    return NextResponse.json({ today: null, week: null });
  }
}
