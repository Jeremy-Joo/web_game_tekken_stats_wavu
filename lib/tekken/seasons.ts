// 시즌 구간을 **데이터에서** 뽑는다.
//
// 예전에는 시즌 판정이 두 군데에 서로 다른 기준으로 있었다:
//   models.seasonOf()  — game_version 만 자리 (자동, 새 시즌도 알아서 따라감)
//   page.tsx SEASON_RANGE — '2026-03-18 이후는 S3' 같은 하드코딩된 날짜 (수동)
// 지금은 같은 답을 내지만 S4 가 열리면 갈라진다 — 시즌 탭엔 S4 가 뜨는데
// 일별 탭의 시즌 롤업은 영영 S3 로 접히고, 프리셋 버튼에도 S4 가 없다.
//
// 그래서 기준을 하나로 만든다. **정답은 game_version 하나뿐**이고(seasonOf),
// 날짜 구간은 그 판정 결과에서 파생시킨다. 하드코딩이 사라지므로 어긋날 곳이 없다.
//
// 파생된 구간은 '그 플레이어가 각 시즌에 처음/마지막으로 뛴 날'이다.
// 전역 시즌 경계와는 다르지만, 쓰임(그 사람의 기간 필터·롤업)에는 이쪽이 더 정확하다.

import type { MatchRecord } from './models';
import { dateKey } from './models';

export interface SeasonSpan {
  key: string; // 'S1' | 'S2' | ... (models.seasonOf 가 낸 값)
  start: string; // 'yyyy-MM-dd' (KST) — 그 시즌 첫 경기
  end: string; // 'yyyy-MM-dd' (KST) — 그 시즌 마지막 경기
  games: number;
}

function spansBy(records: MatchRecord[], keyOf: (r: MatchRecord) => string): SeasonSpan[] {
  const m = new Map<string, SeasonSpan>();
  for (const r of records) {
    const d = dateKey(r.dt);
    const k = keyOf(r);
    const cur = m.get(k);
    if (!cur) {
      m.set(k, { key: k, start: d, end: d, games: 1 });
      continue;
    }
    if (d < cur.start) cur.start = d;
    if (d > cur.end) cur.end = d;
    cur.games++;
  }
  return [...m.values()];
}

/** 최신 시즌 우선으로 정렬해 돌려준다. */
export function seasonSpans(records: MatchRecord[]): SeasonSpan[] {
  return spansBy(records, (r) => r.season).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/**
 * 시즌+버전 단위 구간(예: 'S3-30101'). 화면의 "버전별로 나눠보기"가 고른 버전이
 * 정확히 언제~언제였는지 보여주는 데 쓴다 — seasonSpans 와 같은 방식,
 * 키만 game_version 까지 더 자른다.
 */
export function versionSpans(records: MatchRecord[]): SeasonSpan[] {
  return spansBy(records, (r) => `${r.season}-${r.gameVersion}`);
}

/**
 * 여러 사람의 시즌 구간을 합친다 (비교 모드용).
 *
 * 레코드를 한 배열에 모았다가 계산하지 않는 이유: 4명 × 30,233경기면 12만 개를
 * 쓸데없이 메모리에 이고 있게 되고, `push(...records)` 는 인자 개수 한계에 걸릴 수도 있다.
 * 각자 요약해서 합치면 시즌 수(한 자릿수)만큼만 든다.
 */
export function mergeSeasonSpans(lists: SeasonSpan[][]): SeasonSpan[] {
  const m = new Map<string, SeasonSpan>();
  for (const list of lists)
    for (const s of list) {
      const cur = m.get(s.key);
      if (!cur) {
        m.set(s.key, { ...s });
        continue;
      }
      if (s.start < cur.start) cur.start = s.start;
      if (s.end > cur.end) cur.end = s.end;
      cur.games += s.games;
    }
  return [...m.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}
