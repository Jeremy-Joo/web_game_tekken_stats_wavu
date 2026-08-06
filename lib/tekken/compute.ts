// MatchRecord[] → 화면/엑셀에 쓸 탭 데이터 묶음.
// (수집이 어디서 왔든 — API 라우트, 검증 스크립트 — 여기로 모인다)

import {
  buildTotal,
  buildTotalSplit,
  buildPivot,
  buildPivotSplit,
  buildWeak,
  buildWeakSplit,
  buildStrong,
  buildStrongSplit,
  buildRound,
  buildRoundSplit,
  buildStage,
  buildStageSplit,
  buildH2h,
  buildDaily,
  buildSessions,
  buildRatingTrend,
  widenTrend,
  buildVsRating,
  buildVsRatingSplit,
  buildRankHistory,
  buildTimePatterns,
  buildFlow,
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
  /** 가장 최근 경기의 레이팅. 조언 수위를 가르는 데 쓴다(jokes.pickCoach). */
  currentRating: number | null;
  firstDt: string | null;
  lastDt: string | null;
  chars: string[];
  tabs: TabData[];
  /**
   * 시간대 탭을 **조회 대상의 현지 시각**으로 다시 묶은 것. KST 와 같으면 null.
   *
   * tabs 안에 끼우지 않고 따로 내보내는 이유: 탭 목록이 사람에 따라 늘었다 줄었다
   * 하면 안 되고, 화면에서는 같은 탭 안의 '보기 전환'이기 때문이다.
   * 31행짜리 작은 표라 두 벌을 다 실어도 응답 크기에 영향이 없다 —
   * 덕분에 전환이 즉시 되고 재조회가 필요 없다.
   */
  localTime: TabData | null;
  /**
   * 라운드 탭을 **상대 캐릭터별**로 다시 묶은 것 (화면의 '상대 캐릭터별로 펼쳐보기').
   *
   * localTime 과 같은 이유로 tabs 밖에 있다 — 탭 목록을 늘리지 않고 같은 탭 안에서
   * 보기만 바꾸는 것이라서다. 행 수가 **캐릭터 수로 묶여 있어(최대 42행)** 경기 수와
   * 무관하게 작으므로 두 벌을 다 실어도 응답이 안 커지고, 덕분에 전환이 즉시 된다.
   */
  roundByOpp: TabData;
  /**
   * 시즌 탭을 **game_version 단위**로 다시 묶은 것 (화면의 '버전별').
   *
   * 시즌은 game_version 의 맨 앞자리라(models.seasonOf), 같은 시즌 안의 밸런스
   * 패치가 한 줄로 뭉친다 — 실측으로 S3 는 30002(293경기)와 30101(175경기)이
   * 468경기 한 줄이었다. 캐릭터 성능이 바뀐 전후를 섞어 놓은 셈이라 따로 볼 길이 필요하다.
   *
   * localTime·roundByOpp 와 같은 이유로 tabs 밖에 있다 — 탭 목록을 늘리지 않고
   * 같은 탭 안에서 보기만 바꾼다. 행이 **버전 수만큼**(실측 12행)이라 경기 수와
   * 무관하게 작으므로 두 벌을 다 실어도 응답이 안 커지고 전환이 즉시 된다.
   */
  seasonByVersion: TabData;
  /**
   * 캐릭터·강점·약점 매치업 탭을 시즌별/버전별로 나눠 이어붙인 것
   * ('시즌 (버전별)'과 같은 발상 — aggregations.ts 의 splitByPeriod 참조).
   * localTime·roundByOpp·seasonByVersion 과 같은 이유로 tabs 밖에 있다: 탭
   * 목록을 늘리지 않고 그 탭 안에서 "전체/시즌별/버전별" 보기만 바꾼다. 행 수가
   * 캐릭터(또는 매치업) 수 × 시즌(또는 버전) 수로 작게 묶여 있어(실측 40종
   * × 4시즌 이하) 경기 수와 무관하므로 두 벌씩 더 실어도 응답이 안 커진다.
   */
  totalBySeason: TabData;
  totalByVersion: TabData;
  strongBySeason: TabData;
  strongByVersion: TabData;
  weakBySeason: TabData;
  weakByVersion: TabData;
  /**
   * 스테이지·상대 캐릭·레이팅대·라운드(내 캐릭터 기준) 탭도 같은 방식으로
   * 시즌별/버전별을 낸다. 라운드는 'my' 기준만 나눈다 — '상대 캐릭터별로
   * 펼쳐보기'(roundByOpp)와 곱하면 축이 3개(내 캐릭터×상대 캐릭터×시즌)가 돼
   * 화면 토글이 과하게 복잡해진다(aggregations.ts buildRoundSplit 참조).
   */
  stageBySeason: TabData;
  stageByVersion: TabData;
  pivotBySeason: TabData;
  pivotByVersion: TabData;
  vsRatingBySeason: TabData;
  vsRatingByVersion: TabData;
  roundBySeason: TabData;
  roundByVersion: TabData;
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
  /**
   * matchesLimit — 전적 목록 행 상한 (JSON 응답 크기 제한용).
   * wideTrend  — 레이팅 추이를 캐릭터별 컬럼으로 펼친다. **엑셀에서만 켤 것.**
   *              JSON 응답에서 켜면 셀 수가 경기수 × 캐릭터수 로 곱해진다
   *              (aggregations.buildRatingTrend 주석 참조).
   * tzShiftMinutes — KST 로부터의 차이(분). 0/미지정이면 지금까지와 완전히 같다.
   *              시간대 탭에만 쓴다 (buildTimePatterns 주석 참조).
   */
  opts?: {
    matchesLimit?: number;
    wideTrend?: boolean;
    tzShiftMinutes?: number;
  },
): PlayerResult {
  const ordered = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const first = ordered[0] ?? null;
  const last = ordered[ordered.length - 1] ?? null;
  const chars = [...new Set(records.map((r) => r.myChar))].sort((a, b) =>
    a.toUpperCase() < b.toUpperCase() ? -1 : 1,
  );

  const { table: trend, chars: trendChars } = buildRatingTrend(records);

  // 순서 = 탭 줄에 보이는 순서이자 **기본으로 열리는 탭**이다 (화면이 tabs[0] 을 연다).
  // 엑셀 시트 순서도 이걸 따른다 — 한 번 익히면 두 곳이 같다.
  //
  // 묶는 기준은 "이 표가 어떤 물음에 답하나"다 (TAB_GROUP 참조). 예전 순서는 만든
  // 차례에 가까웠고, 시트가 16개가 되면서 특히 안 읽혔다 — '전적 목록'(원자료
  // 1,000행)이 셋째라 분석 표를 오른쪽으로 밀어냈고, 같은 라운드 표 둘이 정반대
  // 끝에 떨어져 있었다.
  //
  // '흐름'이 맨 앞인 것은 그대로다: 조회하자마자 궁금한 건 캐릭터별 누적이 아니라
  // "지금 상태가 어떤가 / 더 해도 되나"다. 누적 통계는 그다음에 찾아본다.
  const tabs: TabData[] = [
    // 요약
    tab('flow', '흐름', buildFlow(records)),
    // 내 캐릭터로 무엇을 하나
    tab('total', '캐릭터', buildTotal(records)),
    tab('round', '라운드', buildRound(records, 'my')),
    // 스테이지 — 내 성적을 조건별로 자른 표라 '캐릭터·라운드'와 같은 묶음에 뒀다.
    // 사실 '어디서 하면 어떤가'는 기존 여섯 묶음 어디에도 딱 맞지 않는다.
    // 새 묶음을 만들면 엑셀 시트 색·순서 검사까지 건드려야 해서, 일단 여기 두고
    // 로컬에서 보면서 자리를 정한다. **묶음을 옮길 거면 TAB_GROUP·SHEET_ORDER 도 같이.**
    tab('stage', '스테이지', buildStage(records)),
    // 누구를 만나면 어떤가 (roundByOpp 가 이 뒤에 붙는다 — SHEET_ORDER 참조)
    tab('pivot', '상대 캐릭', buildPivot(records)),
    tab('strong', '강점 매치업', buildStrong(records)),
    tab('weak', '약점 매치업', buildWeak(records)),
    tab('vs_rating', '레이팅대', buildVsRating(records)),
    tab('h2h', '상대전적', buildH2h(records)),
    // 언제 하나 (localTime 이 time 뒤에 붙는다)
    tab('time', '시간대', buildTimePatterns(records)),
    tab('sessions', '세션', buildSessions(records)),
    tab('daily', '기간별', buildDaily(records)),
    // 시간에 따라 어떻게 변했나
    tab('season', '시즌', summaryBy(records, (r) => r.season, 'Season')),
    tab('rank', '승단 이력', buildRankHistory(records)),
    tab('trend', '레이팅 추이', opts?.wideTrend ? widenTrend(trend, trendChars) : trend),
    // 원자료 — 나머지 전부의 출처다. 분석이 아니라 확인용이라 맨 뒤에 둔다.
    tab('matches', '전적 목록', buildMatches(records, opts?.matchesLimit)),
  ];

  const shift = opts?.tzShiftMinutes ?? 0;

  return {
    polarisId,
    myName,
    recordCount: records.length,
    currentRating: last?.myRating ?? null,
    firstDt: first ? formatDt(first.dt) : null,
    lastDt: last ? formatDt(last.dt) : null,
    chars,
    tabs,
    // 라벨을 KST 쪽과 다르게 둔다 — 엑셀 시트명이 라벨이라 겹치면 만들 수 없다.
    localTime: shift
      ? tab('time_local', '시간대 (현지)', buildTimePatterns(records, shift))
      : null,
    // 라벨을 '라운드'와 다르게 둔다 — 엑셀 시트명이 라벨이라 겹치면 만들 수 없다.
    roundByOpp: tab('round_opp', '라운드 (상대 캐릭)', buildRound(records, 'opp')),
    // 라벨을 '시즌'과 다르게 둔다 — 위와 같은 이유(시트명 충돌).
    //
    // 키에 시즌을 앞세운다('S3-30101'). 버전 번호만 있으면 30101 이 몇 시즌인지
    // 외우고 있어야 읽히는데, 맨 앞자리가 곧 시즌이라(models.seasonOf) 공짜로 붙는다.
    // 정렬도 그대로다 — summaryBy 가 사전순으로 세우고, S1<S2<S3 인 데다 시즌 안에서는
    // 자리수가 같아(30002 < 30101) 사전순이 곧 시간순이다.
    seasonByVersion: tab(
      'season_version',
      '시즌 (버전별)',
      summaryBy(records, (r) => `${r.season}-${r.gameVersion}`, 'Version'),
    ),
    // 라벨은 각 원본 탭('캐릭터'/'강점 매치업'/'약점 매치업')과 다르게 둔다 —
    // 위와 같은 이유(엑셀 시트명 충돌). 키도 'total_season' 처럼 원본 탭 키를
    // 앞세운다 — SHEET_ORDER 에서 원본 옆에 두기 쉽게.
    totalBySeason: tab('total_season', '캐릭터 (시즌별)', buildTotalSplit(records, 'season')),
    totalByVersion: tab('total_version', '캐릭터 (버전별)', buildTotalSplit(records, 'version')),
    strongBySeason: tab('strong_season', '강점 매치업 (시즌별)', buildStrongSplit(records, 'season')),
    strongByVersion: tab('strong_version', '강점 매치업 (버전별)', buildStrongSplit(records, 'version')),
    weakBySeason: tab('weak_season', '약점 매치업 (시즌별)', buildWeakSplit(records, 'season')),
    weakByVersion: tab('weak_version', '약점 매치업 (버전별)', buildWeakSplit(records, 'version')),
    stageBySeason: tab('stage_season', '스테이지 (시즌별)', buildStageSplit(records, 'season')),
    stageByVersion: tab('stage_version', '스테이지 (버전별)', buildStageSplit(records, 'version')),
    pivotBySeason: tab('pivot_season', '상대 캐릭 (시즌별)', buildPivotSplit(records, 'season')),
    pivotByVersion: tab('pivot_version', '상대 캐릭 (버전별)', buildPivotSplit(records, 'version')),
    vsRatingBySeason: tab('vs_rating_season', '레이팅대 (시즌별)', buildVsRatingSplit(records, 'season')),
    vsRatingByVersion: tab('vs_rating_version', '레이팅대 (버전별)', buildVsRatingSplit(records, 'version')),
    roundBySeason: tab('round_season', '라운드 (시즌별)', buildRoundSplit(records, 'season')),
    roundByVersion: tab('round_version', '라운드 (버전별)', buildRoundSplit(records, 'version')),
  };
}

// ── 표 묶음 ────────────────────────────────────────────────────────────────
//
// 위 tabs 배열의 순서가 곧 이 묶음의 순서다. 여기 정의는 **엑셀 시트 탭 색**과
// 순서 검사에 쓴다 — 화면은 순서만으로 충분해서 색을 쓰지 않는다(탭 줄은 한눈에
// 다 들어오고, 색을 더하면 '지금 열린 탭' 표시와 싸운다).

export type TabGroup = 'summary' | 'mine' | 'versus' | 'when' | 'change' | 'raw';

/** 각 표가 어떤 물음에 답하는가. */
export const TAB_GROUP: Record<string, TabGroup> = {
  flow: 'summary',
  total: 'mine',
  total_season: 'mine',
  total_version: 'mine',
  round: 'mine',
  round_season: 'mine',
  round_version: 'mine',
  stage: 'mine',
  stage_season: 'mine',
  stage_version: 'mine',
  pivot: 'versus',
  pivot_season: 'versus',
  pivot_version: 'versus',
  strong: 'versus',
  strong_season: 'versus',
  strong_version: 'versus',
  weak: 'versus',
  weak_season: 'versus',
  weak_version: 'versus',
  round_opp: 'versus',
  vs_rating: 'versus',
  vs_rating_season: 'versus',
  vs_rating_version: 'versus',
  h2h: 'versus',
  time: 'when',
  time_local: 'when',
  sessions: 'when',
  daily: 'when',
  season: 'change',
  season_version: 'change',
  rank: 'change',
  trend: 'change',
  matches: 'raw',
};

/**
 * 엑셀 시트 순서.
 *
 * tabs 배열과 같되, 거기 없는 셋(roundByOpp·localTime·seasonByVersion)을 제 묶음 안에
 * 끼워 넣는다. 이 셋은 화면에서 '같은 탭 안의 보기 전환'이라 tabs 에 없지만, 엑셀에는
 * 시트로 들어가므로 자리를 정해줘야 한다 — 안 그러면 맨 뒤에 붙어 묶음이 깨진다.
 */
export const SHEET_ORDER: string[] = [
  'flow',
  'total',
  'total_season',
  'total_version',
  'round',
  'round_season',
  'round_version',
  'stage',
  'stage_season',
  'stage_version',
  'pivot',
  'pivot_season',
  'pivot_version',
  'strong',
  'strong_season',
  'strong_version',
  'weak',
  'weak_season',
  'weak_version',
  'round_opp',
  'vs_rating',
  'vs_rating_season',
  'vs_rating_version',
  'h2h',
  'time',
  'time_local',
  'sessions',
  'daily',
  'season',
  'season_version',
  'rank',
  'trend',
  'matches',
];
