'use client';

// 랜덤 플레이어 조회.
//
// 조회 폼 아래에 **펼친 채로** 둔다.
// 처음에는 접어뒀는데(곁가지라 입력칸과 경쟁한다는 이유였다), 접어두면 이 기능이
// 있다는 걸 아무도 모른다. 식별코드를 모르는 사람에게는 이쪽이 첫 동작이라
// 보이는 게 맞다. 접기 버튼은 남겨뒀다 — 자기 전적만 보는 사람에게는 매번
// 지나쳐야 하는 줄이다.
//
// 서버는 식별코드만 준다. 조회는 화면이 평소 경로로 하므로 캐시·집계·멘트가
// 그대로 동작한다(자세한 건 app/api/random/route.ts 주석).

import { useState } from 'react';
import type { Lang } from './i18n';
import { POOL_REGIONS, type PoolRegion } from '@/lib/wavu/pool';

const TXT = {
  title: { ko: '남의 전적 구경하기', en: 'Look at someone else', ja: '他人の戦績を見る' },
  note: {
    ko: '지금 랭크전을 돌고 있는 사람 중 1,000판 이상인 사람을 무작위로 골라 보여줍니다.',
    en: 'Picks someone with 1,000+ games at random from players currently in ranked.',
    ja: 'ランクマッチ中のプレイヤーから1,000戦以上の人を無作為に選びます。',
  },
  go: { ko: '무작위로 보기', en: 'Show me someone', ja: 'ランダムで見る' },
  loading: { ko: '고르는 중…', en: 'Picking…', ja: '選択中…' },
  open: { ko: '펼치기', en: 'Show', ja: '開く' },
  close: { ko: '접기', en: 'Hide', ja: '閉じる' },
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
}: {
  lang: Lang;
  /** 뽑힌 식별코드로 평소 조회 흐름을 태운다. */
  onPick: (id: string) => void;
}) {
  // 기본은 펼침. 접어두면 이 기능이 있다는 걸 아무도 모른다 — 조회할 식별코드가
  // 없는 사람에게는 이쪽이 첫 동작이 되어야 한다. 접기는 남겨둔다(자기 전적만 보는
  // 사람에게는 매번 지나쳐야 하는 줄이라).
  const [open, setOpen] = useState(true);
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
      onPick(d.id);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="random">
      <div className="random-head">
        <span className="random-title">{TXT.title[lang]}</span>
        <button
          className="random-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          type="button"
        >
          {open ? TXT.close[lang] : TXT.open[lang]}
        </button>
      </div>

      {open && (
        <div className="random-body">
          <p className="hint" style={{ margin: 0 }}>
            {TXT.note[lang]}
          </p>
          <div className="row" style={{ marginTop: '0.5rem' }}>
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
              🎲 {busy ? TXT.loading[lang] : TXT.go[lang]}
            </button>
          </div>
          {msg && <p className="error">{msg}</p>}
        </div>
      )}
    </section>
  );
}
