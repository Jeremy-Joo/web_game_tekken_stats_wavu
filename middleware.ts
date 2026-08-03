// 옛 주소(*.vercel.app)로 들어오면 정식 도메인으로 넘긴다.
//
// 왜 코드로 하나: Vercel 대시보드의 'Production Domain' 설정으로도 되지만,
// 그건 어디에도 안 적히는 설정이라 나중에 왜 이렇게 동작하는지 알 방법이 없다.
// 미들웨어면 이유가 코드 옆에 남고, 도메인을 또 바꿔도 lib/site.ts 한 곳만 고치면 된다.
//
// 목적은 SEO 가 아니라 **공유되는 주소를 하나로 모으는 것**이다.
// canonical 은 이미 정식 도메인을 가리키고 있어서 색인은 문제가 없었다. 그런데
// 사람들은 주소창에 보이는 걸 복사해서 카톡에 붙인다 — 리다이렉트가 없으면
// 옛 주소가 계속 퍼진다.
//
// ── 건드리면 안 되는 것들 ──────────────────────────────────────────
//  · 프리뷰 배포: 주소가 매번 다르고, 넘겨버리면 배포 전 확인이 불가능해진다.
//    VERCEL_ENV 로 가른다(production 일 때만 동작).
//  · 로컬 개발: 애초에 VERCEL_ENV 가 없다.
//  · 정식 도메인 자신: 무한 리다이렉트가 된다.

import { NextResponse, type NextRequest } from 'next/server';
import { SITE_HOST } from '@/lib/site';

export function middleware(req: NextRequest) {
  // 프로덕션이 아니면 아무것도 하지 않는다 (프리뷰·로컬)
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.next();

  const host = req.headers.get('host');
  if (!host) return NextResponse.next();

  // 이미 정식 도메인이면 그대로 둔다. www 는 canonical 이 처리하므로 넘기지 않는다 —
  // 여기서 www 까지 넘기면 인증서·리다이렉트가 겹쳐 진단이 어려워진다.
  const bare = host.split(':')[0].toLowerCase();
  if (bare === SITE_HOST || bare === `www.${SITE_HOST}`) return NextResponse.next();

  // 남는 건 *.vercel.app 같은 배포 별칭뿐이다.
  if (!bare.endsWith('.vercel.app')) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.protocol = 'https:';
  url.host = SITE_HOST;
  url.port = '';
  // 308: 영구 + 메서드 유지. 301 은 POST 를 GET 으로 바꿔버린다.
  return NextResponse.redirect(url, 308);
}

export const config = {
  /**
   * 정적 파일과 이미지 최적화 경로는 지나가게 둔다 — 리다이렉트할 이유가 없고,
   * 매 요청 미들웨어를 태우면 무료 플랜의 미들웨어 호출 수만 먹는다.
   *
   * `/api/` 는 **일부러 포함한다.** 옛 주소로 API 를 직접 부르는 곳이 있으면
   * 그것도 새 주소로 모여야 한다.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
