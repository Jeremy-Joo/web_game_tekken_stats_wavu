'use client';

// 리포트 공유·인쇄 줄. 리포트는 '공유되는 것'이 목적이라 동선이 화면에 있어야 한다
// (주소를 직접 복사하게 두면 아무도 공유하지 않는다).

import { useState } from 'react';
import { R, type Lang } from './strings';

/** 이미지에서 뺄 요소 — 인쇄(@media print, report.css)가 이미 같은 기준으로 뒤로가기
 * 링크·공유줄·범위 바·CTA 를 뺀다. 조작용 UI 라 종이에도 이미지에도 남길 이유가 없다. */
const IMAGE_EXCLUDE_CLASSES = ['rp-back', 'rp-share', 'rp-cta', 'rp-scope'];

export default function ShareBar({ name, lang }: { name: string; lang: Lang }) {
  const [msg, setMsg] = useState('');
  const [imgBusy, setImgBusy] = useState(false);

  const saveImage = async () => {
    if (imgBusy) return;
    const node = document.querySelector<HTMLElement>('main.report');
    if (!node) return;
    setImgBusy(true);
    setMsg(R.saveImageBusy[lang]);
    try {
      // next/dynamic 대신 동적 import — 리포트를 그냥 보러 온 사람 대다수는
      // 이 버튼을 안 누른다. 번들에 항상 실어둘 이유가 없다.
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(node, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#0b0d12',
        pixelRatio: 2,
        filter: (n) =>
          !(n instanceof HTMLElement) ||
          !IMAGE_EXCLUDE_CLASSES.some((c) => n.classList.contains(c)),
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${name || 'report'}_tekken8.png`;
      a.click();
      setMsg('');
    } catch {
      setMsg(R.saveImageFailed[lang]);
      setTimeout(() => setMsg(''), 4000);
    } finally {
      setImgBusy(false);
    }
  };

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
      <button className="rp-share-btn" onClick={saveImage} disabled={imgBusy}>
        {imgBusy ? R.saveImageBusy[lang] : R.saveImage[lang]}
      </button>
      {msg && <span className="rp-share-msg">{msg}</span>}
    </div>
  );
}
