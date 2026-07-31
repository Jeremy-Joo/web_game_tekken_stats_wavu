// MatchRecord[] → 화면/엑셀에 쓸 탭 데이터 묶음.
// (수집이 어디서 왔든 — API 라우트, 검증 스크립트 — 여기로 모인다)

import {
  buildTotal,
  buildPivot,
  buildWeak,
  buildStrong,
  buildRound,
  buildH2h,
  buildDaily,
  buildSessions,
  buildRatingTrend,
  summaryBy,
} from './aggregations';
import type { MatchRecord } from './models';
import { formatDt } from './models';
import { Table } from './table';

export interface TabData {
  key: string;
  label: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface PlayerResult {
  polarisId: string;
  myName: string;
  recordCount: number;
  firstDt: string | null;
  lastDt: string | null;
  chars: string[];
  tabs: TabData[];
}

const tab = (key: string, label: string, t: Table): TabData => ({
  key,
  label,
  columns: t.columns,
  rows: t.rows,
});

/**
 * 전적 목록: 경기 한 판이 한 행 (최신 우선). 상대 식별코드가 있어 화면에서 링크가 걸린다.
 * limit — JSON 응답이 경기 수에 비례해 커지는 것을 막기 위한 상한
 * (7,800경기 ≈ 1MB). 엑셀 생성처럼 전체가 필요한 곳은 무제한으로 부른다.
 */
function buildMatches(records: MatchRecord[], limit = Infinity): Table {
  const t = new Table(
    'dt', 'result', 'score', 'my_char', 'my_rating', 'RatingDelta',
    'opp_char', 'opp_rating', 'opp_name', 'opp_polaris',
  );
  const ordered = [...records]
    .sort((a, b) => b.dt.getTime() - a.dt.getTime())
    .slice(0, limit);
  for (const r of ordered)
    t.add(
      formatDt(r.dt).slice(0, 16), r.result, r.score, r.myChar, r.myRating,
      r.myDelta, r.oppChar, r.oppRating, r.oppName, r.oppPolaris,
    );
  return t;
}

export function computeFromRecords(
  records: MatchRecord[],
  polarisId: string,
  myName: string,
  opts?: { matchesLimit?: number },
): PlayerResult {
  const ordered = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const first = ordered[0] ?? null;
  const last = ordered[ordered.length - 1] ?? null;
  const chars = [...new Set(records.map((r) => r.myChar))].sort((a, b) =>
    a.toUpperCase() < b.toUpperCase() ? -1 : 1,
  );

  const { table: trend } = buildRatingTrend(records);

  const tabs: TabData[] = [
    tab('total', '캐릭터', buildTotal(records)),
    tab('matches', '전적 목록', buildMatches(records, opts?.matchesLimit)),
    tab('season', '시즌', summaryBy(records, (r) => r.season, 'Season')),
    tab('pivot', '상대 캐릭', buildPivot(records)),
    tab('strong', '강점 매치업', buildStrong(records)),
    tab('weak', '약점 매치업', buildWeak(records)),
    tab('round', '라운드', buildRound(records)),
    tab('h2h', '상대전적', buildH2h(records)),
    tab('daily', '일별', buildDaily(records)),
    tab('sessions', '세션', buildSessions(records)),
    tab('trend', '레이팅 추이', trend),
  ];

  return {
    polarisId,
    myName,
    recordCount: records.length,
    firstDt: first ? formatDt(first.dt) : null,
    lastDt: last ? formatDt(last.dt) : null,
    chars,
    tabs,
  };
}
