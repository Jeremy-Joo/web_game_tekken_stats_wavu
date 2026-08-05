'use client';

import { useEffect, useState } from 'react';
import { makeT, type Lang } from './i18n';

// 캐릭터별 현재 단 배지.
//
// **추정이 하나도 없다.** 단 이름·번호·경기 수 전부 wavu 가 준 값을 그대로 센 것이다.
// (랭크 포인트 추정은 정확도 검증이 부족해 뺐다 — docs/rank-point-attempt.md 참조)
//
// 단은 캐릭터마다 따로라 줄도 캐릭터마다 하나씩이다. 기본은 메인 + 최근 둘만 펼치고
// 나머지는 접어둔다. 둘이 같으면 한 줄.

const BRAND = '#ff0060';

interface CharRow {
  charaId: number;
  charaName: string;
  matches: number;
  lastPlayed: number;
  rankId: number;
  rankName: string;
}

export default function RankBadges({ polarisId, lang }: { polarisId: string; lang: Lang }) {
  const [rows, setRows] = useState<CharRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const t = makeT(lang);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setOpen(false);

    fetch(`/api/rankinfo/${encodeURIComponent(polarisId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setRows(d.characters ?? []))
      .catch(() => alive && setRows([])); // 실패해도 페이지의 나머지는 그대로 굴러간다

    return () => {
      alive = false;
    };
  }, [polarisId]);

  if (!rows) return null;

  const usable = rows.filter((c) => c.matches >= 20);
  if (usable.length === 0) return null;

  const recent = [...usable].sort((a, b) => b.lastPlayed - a.lastPlayed)[0];
  const main = [...usable].sort((a, b) => b.matches - a.matches)[0];
  const same = main.charaId === recent.charaId;

  const shown = same ? [main] : [main, recent];
  const shownIds = new Set(shown.map((c) => c.charaId));
  const rest = usable.filter((c) => !shownIds.has(c.charaId));

  return (
    <div style={S.wrap}>
      {shown.map((c) => (
        <Row
          key={c.charaId}
          c={c}
          lang={lang}
          tag={same ? t('riTagBoth') : c.charaId === main.charaId ? t('riTagMain') : t('riTagRecent')}
        />
      ))}

      {rest.length > 0 && (
        <>
          {open && rest.map((c) => <Row key={c.charaId} c={c} lang={lang} tag="" />)}
          <button style={S.toggle} onClick={() => setOpen(!open)}>
            {open ? t('riFold') : t('riMore')(rest.length)}
            <span style={{ marginLeft: 6 }}>{open ? '▲' : '▼'}</span>
          </button>
        </>
      )}
    </div>
  );
}

function Row({ c, tag, lang }: { c: CharRow; tag: string; lang: Lang }) {
  const t = makeT(lang);
  return (
    // 좁은 폭에서는 오른쪽 묶음이 통째로 아랫줄로 내려간다.
    // (예전 카드가 3열 그리드라 모바일에서 "약"·숫자·"P" 가 각각 줄바꿈됐다)
    <div style={S.row}>
      <span style={S.left}>
        {tag && <span style={S.tag}>{tag}</span>}
        <span style={S.rank}>{c.rankName}</span>
        <span style={S.rankNo}>({c.rankId})</span>
      </span>
      <span style={S.right}>
        {c.charaName} · {c.matches.toLocaleString()}
        {t('riGames')}
      </span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { margin: '8px 0 14px' },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '4px 10px',
    background: '#141418',
    border: '1px solid #2a2a32',
    borderRadius: 4,
    padding: '9px 14px',
    marginBottom: 6,
  },
  left: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, minWidth: 0 },
  tag: {
    fontSize: 10,
    background: BRAND,
    color: '#000',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 2,
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  },
  rank: { fontSize: 15, fontWeight: 700, color: '#ececef' },
  rankNo: { fontSize: 12, color: '#8a8a96', fontFamily: 'Consolas, monospace' },
  right: { fontSize: 12, color: '#8a8a96', whiteSpace: 'nowrap' },
  toggle: {
    width: '100%',
    background: '#16161c',
    border: '1px solid #2a2a32',
    color: '#8a8a96',
    padding: '7px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 4,
  },
};
