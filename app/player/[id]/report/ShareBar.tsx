'use client';

// 리포트 공유·인쇄 줄. 리포트는 '공유되는 것'이 목적이라 동선이 화면에 있어야 한다
// (주소를 직접 복사하게 두면 아무도 공유하지 않는다).

import { useState } from 'react';

export default function ShareBar({ name }: { name: string }) {
  const [msg, setMsg] = useState('');

  const share = async () => {
    const url = window.location.href;
    const title = `${name} — 철권8 전적 리포트`;
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
      setMsg('링크를 복사했습니다');
    } catch {
      setMsg('복사하지 못했습니다. 주소창에서 직접 복사해 주세요.');
    }
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="rp-share">
      <button className="rp-share-btn" onClick={share}>
        🔗 공유
      </button>
      <button className="rp-share-btn" onClick={() => window.print()}>
        🖨 인쇄 · PDF
      </button>
      {msg && <span className="rp-share-msg">{msg}</span>}
    </div>
  );
}
