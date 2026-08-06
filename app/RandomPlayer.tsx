'use client';

// 랜덤 플레이어 조회.
//
// 조회 폼 아래에 항상 펼쳐 둔다.
// 처음에는 접어뒀는데(곁가지라 입력칸과 경쟁한다는 이유였다), 접어두면 이 기능이
// 있다는 걸 아무도 모른다. 식별코드를 모르는 사람에게는 이쪽이 첫 동작이다.
//
// 접기 버튼도 뺐다 — 두 줄짜리 영역이라 접어서 아낄 게 없고, 제목 옆에 아무도
// 안 누르는 버튼이 남는 쪽이 더 산만하다.
//
// 서버는 식별코드만 준다. 조회는 화면이 평소 경로로 하므로 캐시·집계·멘트가
// 그대로 동작한다(자세한 건 app/api/random/route.ts 주석).

import { useState } from 'react';
import type { Lang } from './i18n';
import { gaEvent } from '@/lib/ga-events';
import { POOL_REGIONS, type PoolRegion } from '@/lib/wavu/pool';

const TXT = {
  // 제목은 두지 않는다 — 아래 안내문이 무슨 기능인지 이미 말한다.
  // 안내문에서도 '지금 랭크전을 돌고 있는 사람 중'을 뺐다. 출처 설명이라
  // 읽는 사람에게는 군더더기이고, 실제 고르는 기준은 판수 하나다.
  note: {
    ko: '현재 게임중인 유저 중에 플레이 카운트가 1,000판 이상인 사람을 무작위로 골라 보여줍니다.',
    en: 'Picks a currently active player with 1,000+ games at random.',
    ja: '現在プレイ中のユーザーからプレイ数1,000戦以上の人を無作為に選んで表示します。',
  },
  go: { ko: '무작위로 보기', en: 'Show me someone', ja: 'ランダムで見る' },
  loading: { ko: '검색 중…', en: 'Searching…', ja: '検索中…' },
} satisfies Record<string, Record<Lang, string>>;

const REGION_LABEL: Record<PoolRegion, Record<Lang, string>> = {
  all: { ko: '전체', en: 'All', ja: '全体' },
  ko: { ko: '한국', en: 'Korea', ja: '韓国' },
  ja: { ko: '일본', en: 'Japan', ja: '日本' },
  en: { ko: '영어권', en: 'English', ja: '英語圏' },
};

export default function RandomPlayer({
  lang,
  onPick,
  compact,
}: {
  lang: Lang;
  /** 뽑힌 식별코드로 평소 조회 흐름을 태운다. */
  onPick: (id: string) => void;
  /**
   * 조회 결과가 이미 떠 있을 때 켠다. 발견 경로로서의 역할은 조회 전에나
   * 필요하고, 결과를 보는 중에는 폼과 표 사이에 낀 무관한 상자가 된다
   * (docs/ui-period-analysis.md P6). 안내문을 줄이고 상자를 좁혀
   * 스크롤 몫을 줄인다 — 기능은 그대로 남긴다(지역 선택도 유지).
   */
  compact?: boolean;
}) {
  const [region, setRegion] = useState<PoolRegion>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`/api/random?region=${region}`);
      const d = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !d.id) throw new Error(d.error ?? `HTTP ${res.status}`);
      // 실제로 한 명 뽑힌 경우에만 센다. 후보를 못 찾아 실패한 건 사용이 아니다.
      gaEvent('random_pick');
      onPick(d.id);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`random${compact ? ' random-compact' : ''}`}>
      <div className="random-body">
        {/* compact 에서는 안내문을 뺀다 — 결과를 보는 중인 사람은 이미 이 기능을
            안다(첫 화면에서 봤거나, 지금 보는 결과 자체가 이걸로 왔을 수도 있다).
            지역 선택·버튼은 기능이라 그대로 둔다. */}
        {!compact && (
          <p className="hint" style={{ margin: 0 }}>
            {TXT.note[lang]}
          </p>
        )}
        <div className="row" style={{ marginTop: compact ? 0 : '0.5rem' }}>
          {POOL_REGIONS.map((r) => (
            <button
              key={r}
              className={`chip${region === r ? ' on' : ''}`}
              onClick={() => setRegion(r)}
              type="button"
            >
              {REGION_LABEL[r][lang]}
            </button>
          ))}
          <button onClick={go} disabled={busy} type="button">
            {busy ? TXT.loading[lang] : TXT.go[lang]}
          </button>
        </div>
        {msg && <p className="error">{msg}</p>}
      </div>
    </section>
  );
}
