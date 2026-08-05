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
//
// 스타일을 인라인이 아니라 <style> 로 두는 이유는 **미디어쿼리** 때문이다.
// 좁은 폭에서 캐릭터·경기수가 아랫줄로 내려가는데, 인라인으로는 그때 여백을
// 줄일 방법이 없어 줄 높이가 불필요하게 커졌다.

interface CharRow {
  charaId: number;
  charaName: string;
  matches: number;
  lastPlayed: number;
  rankId: number;
  rankName: string;
}

const CSS = `
.rb-wrap { margin: 8px 0 14px; }
.rb-row {
  display: flex; flex-wrap: wrap; align-items: baseline;
  justify-content: space-between; gap: 2px 10px;
  background: #141418; border: 1px solid #2a2a32; border-radius: 4px;
  padding: 8px 13px; margin-bottom: 5px;
}
.rb-left { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; min-width: 0; }
.rb-tag {
  font-size: 10px; background: #ff0060; color: #000; font-weight: 700;
  padding: 2px 7px; border-radius: 2px; letter-spacing: .5px; white-space: nowrap;
}
.rb-rank { font-size: 15px; font-weight: 700; color: #ececef; }
.rb-no { font-size: 12px; color: #8a8a96; font-family: Consolas, monospace; }
.rb-right { font-size: 12px; color: #8a8a96; white-space: nowrap; }
.rb-toggle {
  width: 100%; background: #16161c; border: 1px solid #2a2a32; color: #8a8a96;
  padding: 7px; font-size: 12px; cursor: pointer; border-radius: 4px;
}

/* 좁은 폭에서는 오른쪽 묶음이 통째로 아랫줄로 내려간다.
   그때 줄 사이가 벌어져 보이므로 여백과 글자를 함께 조인다. */
@media (max-width: 560px) {
  .rb-row { padding: 6px 10px; margin-bottom: 4px; gap: 0 8px; }
  .rb-left { gap: 5px; }
  .rb-tag { font-size: 9px; padding: 1px 5px; }
  .rb-rank { font-size: 14px; line-height: 1.25; }
  .rb-no { font-size: 11px; }
  .rb-right { font-size: 11px; line-height: 1.2; }
  .rb-toggle { padding: 6px; }
}
`;

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
    <div className="rb-wrap">
      <style>{CSS}</style>

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
          <button className="rb-toggle" onClick={() => setOpen(!open)}>
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
    <div className="rb-row">
      <span className="rb-left">
        {tag && <span className="rb-tag">{tag}</span>}
        <span className="rb-rank">{c.rankName}</span>
        <span className="rb-no">({c.rankId})</span>
      </span>
      <span className="rb-right">
        {c.charaName} · {c.matches.toLocaleString()}
        {t('riGames')}
      </span>
    </div>
  );
}
