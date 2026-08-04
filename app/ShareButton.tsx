'use client';

// 조회 결과 공유 버튼.
//
// 주소창에는 이미 `/player/<식별코드>?...` 가 들어가 있다(page.tsx 의 replaceState).
// 그런데 사람들은 주소창을 잘 안 본다 — 특히 폰에서는 주소가 접혀 있어 복사가 번거롭다.
// 버튼 하나를 놔두면 그 마찰이 사라진다.
//
// 리포트의 ShareBar 와 같은 동작이지만 파일을 나눴다. 저쪽은 인쇄 버튼이 붙어 있고
// 리포트 전용 문자열(strings.ts)을 쓴다 — 합치면 조회 화면이 리포트 사전을 끌어온다.

import { gaEvent } from '@/lib/ga-events';
import { useState } from 'react';
import type { Lang } from './i18n';

const TXT = {
  btn: { ko: '🔗 공유', en: '🔗 Share', ja: '🔗 共有' },
  copied: { ko: '링크를 복사했습니다', en: 'Link copied', ja: 'リンクをコピーしました' },
  failed: {
    ko: '복사하지 못했습니다. 주소창에서 직접 복사해 주세요.',
    en: "Couldn't copy. Please copy from the address bar.",
    ja: 'コピーできませんでした。アドレスバーからコピーしてください。',
  },
} satisfies Record<string, Record<Lang, string>>;

export default function ShareButton({ lang, title }: { lang: Lang; title: string }) {
  const [msg, setMsg] = useState('');

  const share = async () => {
    gaEvent('share_click');
    // location.href 를 쓰므로 지금 보고 있는 상태(식별코드·기간·탭)가 그대로 공유된다.
    // 옛 주소(*.vercel.app)로 들어온 사람은 미들웨어가 이미 정식 도메인으로 넘겼다.
    const url = window.location.href;

    // 폰에서는 OS 공유 시트가 훨씬 자연스럽다(카톡으로 바로 보낼 수 있다).
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return; // 사용자가 취소 — 조용히 끝낸다
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg(TXT.copied[lang]);
    } catch {
      // http 로 열었거나 권한이 없을 때. 주소창을 알려주는 게 유일한 대안이다.
      setMsg(TXT.failed[lang]);
    }
    window.setTimeout(() => setMsg(''), 2500);
  };

  return (
    <>
      <button className="ghost share-btn" onClick={share} type="button">
        {TXT.btn[lang]}
      </button>
      {msg && <span className="share-msg">{msg}</span>}
    </>
  );
}
