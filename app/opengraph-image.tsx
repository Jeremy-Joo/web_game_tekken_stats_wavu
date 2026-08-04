// 사이트 공통 공유 카드 — 홈(/) 링크를 붙였을 때 뜨는 이미지.
//
// **예전에는 정적 PNG 였다.** 거기 `tekken8stats.vercel.app` 이 그림으로 박혀 있어서,
// 도메인을 tekkenstats.com 으로 옮긴 뒤에도 홈 링크를 공유할 때마다 옛 주소를
// 광고하고 있었다. lib/site.ts 가 "예전에는 이 주소가 여섯 파일에 흩어져 있었다"고
// 적어둔 그 정리에서 이미지만 빠졌던 것이다.
//
// 그래서 그림으로 굽지 않고 **SITE_HOST 를 읽어 그린다.** 도메인이 또 바뀌어도
// 저절로 따라간다 — 같은 사고가 다시 날 수 없는 형태로 바꾼 것이지, 값만 고친 게 아니다.

import { ImageResponse } from 'next/og';
import { SITE_HOST } from '@/lib/site';
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card';

export const runtime = 'nodejs';
export const alt = '철권8 전적 통계';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * 오른쪽 막대 장식. **실제 데이터가 아니다** — 사이트 카드는 특정인의 것이 아니라
 * 가져올 수치가 없다. 승/패 막대의 '모양'만 빌린 장식이고, 숫자나 축을 붙이지 않는다.
 * (숫자를 붙이면 근거 없는 값이 되어 jokes.ts 가 세운 원칙과 어긋난다.)
 */
const BARS = [
  { h: 300, win: 190 },
  { h: 430, win: 310 },
  { h: 240, win: 150 },
  { h: 420, win: 260 },
  { h: 425, win: 320 },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(150deg, #0f1115 0%, #171a21 55%, #1b2333 100%)',
          color: '#e6e8ec',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* 막대 — 아래 끝은 화면 밖으로 흘려보낸다(원본 카드와 같은 인상) */}
        <div
          style={{
            position: 'absolute',
            right: 60,
            bottom: 0,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 22,
          }}
        >
          {BARS.map((b, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: 54,
                height: b.h,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', height: b.win, background: '#4ade80' }} />
              <div style={{ display: 'flex', height: b.h - b.win, background: '#f87171' }} />
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 72px',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', fontSize: 30, color: '#6ea8fe', fontWeight: 700 }}>
            🏆 {SITE_HOST}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 800, lineHeight: 1.1 }}>
              <span style={{ color: '#e6e8ec' }}>철권8&nbsp;</span>
              <span style={{ color: '#6ea8fe' }}>전적 통계</span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 34,
                color: '#9aa1ad',
                marginTop: 22,
                lineHeight: 1.35,
              }}
            >
              <div style={{ display: 'flex' }}>승률 · 매치업 · 레이팅 추이 · 여러 명 비교 —</div>
              <div style={{ display: 'flex' }}>식별코드 하나로</div>
            </div>
          </div>

          <div style={{ display: 'flex', fontSize: 26, color: '#6b7280' }}>
            Tekken 8 Match Stats · Ranked
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
