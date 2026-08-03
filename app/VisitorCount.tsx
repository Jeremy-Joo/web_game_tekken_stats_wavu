'use client';

// 푸터 맨 아래 방문자 수.
//
// 숫자만 보여준다 — 누르면 열리는 상세 팝업은 두지 않았다. 푸터는 이미 출처·크레딧·
// 고지·농담으로 네 줄인데 거기에 상호작용까지 넣으면 시선이 분산된다.
//
// 마운트 후에 받아온다. 서버에서 렌더하면 페이지 캐시에 특정 시점의 숫자가 굳고,
// GA 호출이 느릴 때 첫 화면 표시까지 늦어진다.
// 값을 못 받으면 **아무것도 그리지 않는다** — '0명' 이나 '집계 실패'를 띄우는 것보다
// 조용히 비는 편이 낫다(로컬 개발에는 GA 환경변수가 없다).

import { useEffect, useState } from 'react';
import type { Lang } from './i18n';

export default function VisitorCount({ lang }: { lang: Lang }) {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/visitors')
      .then((r) => r.json())
      .then((d: { today: number | null }) => {
        if (alive && typeof d.today === 'number' && d.today > 0) setN(d.today);
      })
      .catch(() => {
        /* 조용히 무시 — 푸터 숫자 하나 때문에 오류를 띄울 이유가 없다 */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (n === null) return null;

  const text =
    lang === 'ko' ? `오늘 방문 ${n.toLocaleString('en-US')}` :
    lang === 'ja' ? `本日の訪問 ${n.toLocaleString('en-US')}` :
    `${n.toLocaleString('en-US')} visitors today`;

  return <span className="visitor-count">{text}</span>;
}
