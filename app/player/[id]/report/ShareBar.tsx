'use client';

// 리포트 공유·인쇄 줄. 리포트는 '공유되는 것'이 목적이라 동선이 화면에 있어야 한다
// (주소를 직접 복사하게 두면 아무도 공유하지 않는다).

import { useState } from 'react';
import { R, type Lang } from './strings';

export default function ShareBar({ name, lang }: { name: string; lang: Lang }) {
  const [msg, setMsg] = useState('');

  const share = async () => {
    // location.href 를 쓰므로 지금 보고 있는 범위·언어가 그대로 공유된다
    const url = window.location.href;
    const title = R.shareTitle[lang](name);
    // 폰에서는 OS 공유 시트가 훨씬 자연스럽다. 없으면 클립보드로 떨어진다.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return; // 사용자가 취소한 경우 — 조용히 끝낸다
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg(R.shareCopied[lang]);
    } catch {
      setMsg(R.shareFailed[lang]);
    }
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="rp-share">
      <button className="rp-share-btn" onClick={share}>
        {R.share[lang]}
      </button>
      <button className="rp-share-btn" onClick={() => window.print()}>
        {R.print[lang]}
      </button>
      {msg && <span className="rp-share-msg">{msg}</span>}
    </div>
  );
}
