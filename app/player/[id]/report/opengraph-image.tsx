// 리포트 공유 카드 — 카톡·디스코드·트위터에 링크를 붙이면 뜨는 이미지.
//
// 플레이어마다 다르게 만든다. 공통 이미지를 쓰면 누구 링크인지 알 수 없어
// 공유가 잘 안 퍼진다. 이름·승률·주력 캐릭터만 크게 넣는다.
//
// next/og 의 ImageResponse 는 Satori 로 SVG 를 거쳐 PNG 를 만든다 —
// flex 기반의 제한된 CSS 만 쓸 수 있어서, 화면 CSS 를 그대로 가져오면 안 된다.

import { ImageResponse } from 'next/og';
import { getRecords } from '@/lib/wavu/cache';

export const runtime = 'nodejs';
export const alt = '철권8 전적 리포트';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const normalize = (raw: string) => decodeURIComponent(raw).replace(/[^A-Za-z0-9]/g, '');

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = normalize((await params).id);

  let name = id;
  let games = 0;
  let wins = 0;
  let mainChar = '';
  let rating = 0;

  try {
    const { records, myName } = await getRecords(id);
    if (myName) name = myName;
    games = records.length;
    wins = records.filter((r) => r.result === 'W').length;

    const byChar = new Map<string, number>();
    for (const r of records) byChar.set(r.myChar, (byChar.get(r.myChar) ?? 0) + 1);
    mainChar = [...byChar.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    const latest = records.reduce((m, r) => (r.dt > m.dt ? r : m), records[0]);
    rating = latest?.myRating ?? 0;
  } catch {
    /* 데이터를 못 얻어도 카드는 나간다 — 이름 자리에 식별코드가 들어갈 뿐이다 */
  }

  const wr = games ? Math.round((wins * 1000) / games) / 10 : 0;
  const good = wr >= 50;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'linear-gradient(150deg, #0f1115 0%, #171a21 55%, #1b2333 100%)',
          color: '#e6e8ec',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, color: '#6ea8fe', fontWeight: 700 }}>
          🏆 tekken8stats.vercel.app
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: name.length > 14 ? 76 : 96,
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            {name}
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#9aa1ad', marginTop: 14 }}>
            {mainChar ? `${mainChar} · ` : ''}
            {games.toLocaleString()}경기
            {rating ? ` · 레이팅 ${rating.toLocaleString()}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 26, color: '#9aa1ad' }}>승률</div>
            <div
              style={{
                display: 'flex',
                fontSize: 108,
                fontWeight: 800,
                lineHeight: 1,
                color: good ? '#4ade80' : '#f87171',
              }}
            >
              {wr.toFixed(1)}%
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#9aa1ad', paddingBottom: 14 }}>
            {wins.toLocaleString()}승 {(games - wins).toLocaleString()}패
          </div>
        </div>
      </div>
    ),
    size,
  );
}
