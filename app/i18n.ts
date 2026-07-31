// UI 문자열 3개 언어(ko/en/ja).
// 서버가 주는 데이터(탭 라벨·개요 지표명)는 한국어 원문이 키가 되고,
// 화면에서 lang 에 맞게 치환한다 — 서버 응답 형식은 언어와 무관하게 유지.

export type Lang = 'ko' | 'en' | 'ja';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
];

export const LANG_KEY = 'tkwavu_lang';

type Entry = Record<Lang, string>;

const D = {
  title: { ko: '철권8 전적 통계', en: 'Tekken 8 Match Stats', ja: '鉄拳8 戦績スタッツ' },
  sub: {
    ko: 'wavu wank 랭크전 데이터 · 식별코드만 넣으면 전체 이력을 집계합니다',
    en: 'Ranked data from wavu wank · enter a polaris ID to aggregate full history',
    ja: 'wavu wank のランクマッチデータ · IDを入れるだけで全履歴を集計',
  },
  single: { ko: '한 명', en: 'Single', ja: '1人' },
  compare: { ko: '여러 명 비교', en: 'Compare', ja: '複数比較' },
  idOrNick: { ko: '식별코드 또는 닉네임', en: 'Polaris ID or nickname', ja: 'IDまたはニックネーム' },
  idPlaceholder: {
    ko: '예: 53deQ2dmLday 또는 닉네임',
    en: 'e.g. 53deQ2dmLday or nickname',
    ja: '例: 53deQ2dmLday またはニックネーム',
  },
  idsLabel: {
    ko: '식별코드/닉네임 여러 개 (쉼표 구분, 2~4명)',
    en: 'IDs/nicknames, comma-separated (2–4 players)',
    ja: 'ID/ニックネームをカンマ区切りで (2〜4人)',
  },
  query: { ko: '조회', en: 'Search', ja: '照会' },
  querying: { ko: '수집 중…', en: 'Loading…', ja: '取得中…' },
  addLabel: { ko: '검색해서 목록에 추가', en: 'Search and add to list', ja: '検索してリストに追加' },
  addPlaceholder: { ko: '닉네임 또는 ID', en: 'Nickname or ID', ja: 'ニックネームまたはID' },
  addBtn: { ko: '검색·추가', en: 'Add', ja: '検索・追加' },
  searching: { ko: '검색 중…', en: 'Searching…', ja: '検索中…' },
  period: { ko: '조회 기간', en: 'Period', ja: '照会期間' },
  periodAll: { ko: '전체', en: 'All', ja: '全体' },
  periodMonth: { ko: '월별', en: 'Month', ja: '月別' },
  periodYear: { ko: '연별', en: 'Year', ja: '年別' },
  periodCustom: { ko: '직접입력', en: 'Custom', ja: '指定' },
  startDate: { ko: '시작일', en: 'From', ja: '開始日' },
  endDate: { ko: '종료일', en: 'To', ja: '終了日' },
  firstHint: {
    ko: '첫 조회는 몇 초 걸릴 수 있습니다 (전체 전적을 한 번에 받아옴 · 10분간 캐시).',
    en: 'First query may take a few seconds (full history fetched at once, cached 10 min).',
    ja: '初回照会は数秒かかることがあります (全履歴を一括取得・10分キャッシュ)。',
  },
  games: { ko: '경기', en: ' games', ja: '試合' },
  totalSuffix: { ko: '전체', en: 'total', ja: '全' },
  excluded: { ko: '제외', en: 'excluded', ja: '除外' },
  xlsxBtn: { ko: '📥 엑셀 (전체 탭)', en: '📥 Excel (all tabs)', ja: '📥 Excel (全タブ)' },
  csvBtn: { ko: '📄 CSV (현재 탭)', en: '📄 CSV (current tab)', ja: '📄 CSV (現在のタブ)' },
  jsonBtn: { ko: '🧾 JSON (전체)', en: '🧾 JSON (all)', ja: '🧾 JSON (全体)' },
  chart: { ko: '그래프', en: 'Chart', ja: 'グラフ' },
  table: { ko: '표', en: 'Table', ja: '表' },
  charAll: { ko: '전체 캐릭터', en: 'All characters', ja: '全キャラ' },
  charLabel: { ko: '캐릭터별 상세 (경기 수 순)', en: 'Per-character detail (by games)', ja: 'キャラ別詳細 (試合数順)' },
  hlToggle: { ko: '우위 항목 하이라이트', en: 'Highlight advantages', ja: '優位項目をハイライト' },
  periodPrefix: { ko: '기간', en: 'Period', ja: '期間' },
  begin: { ko: '처음', en: 'start', ja: '最初' },
  today: { ko: '오늘', en: 'today', ja: '今日' },
  historyOpt: {
    ko: '과거 닉네임 포함 검색',
    en: 'Include past nicknames',
    ja: '過去のニックネームも検索',
  },
  searchInTable: { ko: '🔍 검색 (이름·캐릭터·날짜…)', en: '🔍 Filter (name, character, date…)', ja: '🔍 検索 (名前・キャラ・日付…)' },
  matched: { ko: '건 일치 / ', en: ' matched / ', ja: '件一致 / ' },
  totalRows: { ko: '행', en: ' rows', ja: '行' },
  loadMore: { ko: '더 보기', en: 'Load more', ja: 'もっと見る' },
  noRows: { ko: '표시할 행이 없습니다.', en: 'No rows to display.', ja: '表示する行がありません。' },
  recent: { ko: '최근 조회', en: 'Recent', ja: '最近の照会' },
  clearBtn: { ko: '지우기', en: 'Clear', ja: 'クリア' },
  sumToday: { ko: '오늘', en: 'Today', ja: '今日' },
  sumNoToday: { ko: '경기 없음', en: 'No games', ja: '試合なし' },
  sumLastDay: { ko: '마지막 경기', en: 'Last played', ja: '最終対戦' },
  sumRating: { ko: '현재 레이팅', en: 'Rating', ja: '現在レート' },
  winChar: { ko: '승', en: 'W', ja: '勝' },
  lossChar: { ko: '패', en: 'L', ja: '敗' },
  visitors: { ko: '방문', en: 'Visits', ja: '訪問' },
  todayLabel: { ko: '오늘', en: 'today', ja: '今日' },
  footer1: { ko: '데이터:', en: 'Data:', ja: 'データ:' },
  footer2: {
    ko: '(랭크전만 집계됨) · 이 사이트는 Bandai Namco 와 무관합니다',
    en: '(ranked matches only) · This site is not affiliated with Bandai Namco',
    ja: '(ランクマッチのみ) · 当サイトはバンダイナムコとは無関係です',
  },
  multiFound: {
    ko: (tok: string) => `'${tok}' 검색 결과가 여러 명입니다 — 선택하세요.`,
    en: (tok: string) => `Multiple players match '${tok}' — pick one.`,
    ja: (tok: string) => `「${tok}」に複数一致しました — 選択してください。`,
  },
  addPick: {
    ko: (tok: string) => `'${tok}' 검색 결과 — 탭하면 목록에 추가됩니다.`,
    en: (tok: string) => `Results for '${tok}' — tap to add to the list.`,
    ja: (tok: string) => `「${tok}」の検索結果 — タップでリストに追加。`,
  },
  added: {
    ko: (s: string) => `${s} 추가됨`,
    en: (s: string) => `${s} added`,
    ja: (s: string) => `${s} を追加しました`,
  },
  already: {
    ko: (s: string) => `${s} 은(는) 이미 목록에 있습니다.`,
    en: (s: string) => `${s} is already in the list.`,
    ja: (s: string) => `${s} はすでにリストにあります。`,
  },
  needInput: {
    ko: '식별코드 또는 닉네임을 입력하세요.',
    en: 'Enter a polaris ID or nickname.',
    ja: 'IDまたはニックネームを入力してください。',
  },
  needTwo: {
    ko: '식별코드/닉네임을 쉼표로 구분해 2개 이상 입력하세요.',
    en: 'Enter 2 or more IDs/nicknames, comma-separated.',
    ja: 'ID/ニックネームをカンマ区切りで2つ以上入力してください。',
  },
  trendLimit: {
    ko: (n: number, total: number) => `최근 ${n}경기만 표시 (전체 ${total}건은 엑셀 다운로드로)`,
    en: (n: number, total: number) => `Showing last ${n} games (all ${total} via Excel download)`,
    ja: (n: number, total: number) => `直近${n}試合のみ表示 (全${total}件はExcelで)`,
  },
} satisfies Record<string, Entry | Record<Lang, (...a: never[]) => string>>;

export type Dict = typeof D;

export function makeT(lang: Lang) {
  return <K extends keyof Dict>(key: K): Dict[K][Lang] => D[key][lang];
}

/** 탭 키 → 언어별 라벨. 서버가 준 한국어 라벨은 ko 외 언어에서 이걸로 대체. */
export const TAB_LABELS: Record<string, Entry> = {
  total: { ko: '캐릭터', en: 'Characters', ja: 'キャラ' },
  matches: { ko: '전적 목록', en: 'Matches', ja: '対戦履歴' },
  season: { ko: '시즌', en: 'Seasons', ja: 'シーズン' },
  pivot: { ko: '상대 캐릭', en: 'Vs characters', ja: '相手キャラ' },
  strong: { ko: '강점 매치업', en: 'Strong matchups', ja: '得意マッチ' },
  weak: { ko: '약점 매치업', en: 'Weak matchups', ja: '苦手マッチ' },
  round: { ko: '라운드', en: 'Rounds', ja: 'ラウンド' },
  h2h: { ko: '상대전적', en: 'Head-to-head', ja: '対戦成績' },
  daily: { ko: '일별', en: 'Daily', ja: '日別' },
  sessions: { ko: '세션', en: 'Sessions', ja: 'セッション' },
  trend: { ko: '레이팅 추이', en: 'Rating trend', ja: 'レート推移' },
  overview: { ko: '개요', en: 'Overview', ja: '概要' },
  chars: { ko: '캐릭터', en: 'Characters', ja: 'キャラ' },
  h2h_detail: { ko: '맞대결 상세', en: 'H2H detail', ja: '直接対決詳細' },
  vs_common: { ko: '공통 상대', en: 'Common opponents', ja: '共通の相手' },
};

/** 표 안의 한국어 지표명(비교 개요·시즌 등) → 언어별 표기. 없는 값은 원문 유지. */
export const CELL_I18N: Record<string, Entry> = {
  '경기 수': { ko: '경기 수', en: 'Games', ja: '試合数' },
  '승': { ko: '승', en: 'Wins', ja: '勝' },
  '패': { ko: '패', en: 'Losses', ja: '敗' },
  '경기 승률(%)': { ko: '경기 승률(%)', en: 'Win rate (%)', ja: '勝率(%)' },
  '라운드 승률(%)': { ko: '라운드 승률(%)', en: 'Round win rate (%)', ja: 'ラウンド勝率(%)' },
  '접전 승률(%)': { ko: '접전 승률(%)', en: 'Close-game win rate (%)', ja: '接戦勝率(%)' },
  '완승 비율(%)': { ko: '완승 비율(%)', en: 'Shutout wins (%)', ja: 'ストレート勝ち(%)' },
  '완패 비율(%)': { ko: '완패 비율(%)', en: 'Shutout losses (%)', ja: 'ストレート負け(%)' },
  '주 캐릭터': { ko: '주 캐릭터', en: 'Main character', ja: 'メインキャラ' },
  '사용 캐릭터 수': { ko: '사용 캐릭터 수', en: 'Characters used', ja: '使用キャラ数' },
  '최고 레이팅': { ko: '최고 레이팅', en: 'Peak rating', ja: '最高レート' },
  '최고 텍켄파워': { ko: '최고 텍켄파워', en: 'Peak Tekken Power', ja: '最高鉄拳パワー' },
  '경기당 평균/일': { ko: '경기당 평균/일', en: 'Avg games/day', ja: '1日平均試合数' },
  '데이터 기간': { ko: '데이터 기간', en: 'Data range', ja: 'データ期間' },
  '지표': { ko: '지표', en: 'Metric', ja: '指標' },
  '승률(%)': { ko: '승률(%)', en: 'Win rate (%)', ja: '勝率(%)' },
};

export function cellText(lang: Lang, v: string): string {
  if (lang === 'ko') return v;
  return CELL_I18N[v]?.[lang] ?? v;
}

/**
 * 표 컬럼 헤더 표시명. 데이터/CSV 구조의 키는 영문 원명을 유지하고
 * 화면에 보일 때만 이 표로 바꾼다 (한국어 모드도 번역 대상).
 */
export const COL_I18N: Record<string, Entry> = {
  my_char: { ko: '내 캐릭터', en: 'My char', ja: '自キャラ' },
  opp_char: { ko: '상대 캐릭터', en: 'Vs char', ja: '相手キャラ' },
  opp_name: { ko: '상대 이름', en: 'Opponent', ja: '相手名' },
  opp_polaris: { ko: '상대 식별코드', en: 'Opp ID', ja: '相手ID' },
  main_char: { ko: '주 캐릭터', en: 'Main char', ja: 'メインキャラ' },
  Total: { ko: '경기 수', en: 'Games', ja: '試合数' },
  Games: { ko: '경기 수', en: 'Games', ja: '試合数' },
  W: { ko: '승', en: 'W', ja: '勝' },
  L: { ko: '패', en: 'L', ja: '敗' },
  'WinRate(%)': { ko: '승률(%)', en: 'Win rate(%)', ja: '勝率(%)' },
  LastPlayed: { ko: '마지막 대전', en: 'Last played', ja: '最終対戦' },
  Date: { ko: '날짜', en: 'Date', ja: '日付' },
  Period: { ko: '기간', en: 'Period', ja: '期間' },
  RatingDelta: { ko: '레이팅 증감', en: 'Rating Δ', ja: 'レート増減' },
  EndRating: { ko: '종료 레이팅', en: 'End rating', ja: '終了レート' },
  Session: { ko: '세션', en: 'Session', ja: 'セッション' },
  Start: { ko: '시작', en: 'Start', ja: '開始' },
  End: { ko: '종료', en: 'End', ja: '終了' },
  Season: { ko: '시즌', en: 'Season', ja: 'シーズン' },
  dt: { ko: '일시', en: 'Time', ja: '日時' },
  my_rating: { ko: '내 레이팅', en: 'My rating', ja: '自レート' },
  opp_rating: { ko: '상대 레이팅', en: 'Opp rating', ja: '相手レート' },
  result: { ko: '결과', en: 'Result', ja: '結果' },
  // 라운드 탭
  RoundsWon: { ko: '라운드 승', en: 'Rounds won', ja: 'R勝' },
  RoundsLost: { ko: '라운드 패', en: 'Rounds lost', ja: 'R敗' },
  'RoundWR(%)': { ko: '라운드 승률(%)', en: 'Round WR(%)', ja: 'R勝率(%)' },
  AvgRoundsWon: { ko: '경기당 라운드 승', en: 'Avg R won', ja: '平均R勝' },
  AvgRoundsLost: { ko: '경기당 라운드 패', en: 'Avg R lost', ja: '平均R敗' },
  CloseGames: { ko: '접전 경기', en: 'Close games', ja: '接戦数' },
  'Close(%)': { ko: '접전 비율(%)', en: 'Close(%)', ja: '接戦率(%)' },
  CloseWins: { ko: '접전 승', en: 'Close wins', ja: '接戦勝' },
  'CloseWin(%)': { ko: '접전 승 비율(%)', en: 'Close win(%)', ja: '接戦勝率(%)' },
  CloseLosses: { ko: '접전 패', en: 'Close losses', ja: '接戦敗' },
  'CloseLoss(%)': { ko: '접전 패 비율(%)', en: 'Close loss(%)', ja: '接戦敗率(%)' },
  Shutouts_Dealt: { ko: '완승 (3-0)', en: 'Shutout wins', ja: 'ストレート勝ち' },
  'ShutoutWin(%)': { ko: '완승 비율(%)', en: 'Shutout win(%)', ja: 'スト勝率(%)' },
  Shutouts_Received: { ko: '완패 (0-3)', en: 'Shutout losses', ja: 'ストレート負け' },
  'ShutoutLoss(%)': { ko: '완패 비율(%)', en: 'Shutout loss(%)', ja: 'スト負率(%)' },
  // 비교 탭
  지표: { ko: '지표', en: 'Metric', ja: '指標' },
  player_a: { ko: '플레이어 A', en: 'Player A', ja: 'プレイヤーA' },
  player_b: { ko: '플레이어 B', en: 'Player B', ja: 'プレイヤーB' },
  games: { ko: '경기 수', en: 'Games', ja: '試合数' },
  a_wins: { ko: 'A 승', en: 'A wins', ja: 'A勝' },
  b_wins: { ko: 'B 승', en: 'B wins', ja: 'B勝' },
  'a_winrate(%)': { ko: 'A 승률(%)', en: 'A win rate(%)', ja: 'A勝率(%)' },
  last_played: { ko: '마지막 대전', en: 'Last played', ja: '最終対戦' },
  a_char: { ko: 'A 캐릭터', en: 'A char', ja: 'Aキャラ' },
  b_char: { ko: 'B 캐릭터', en: 'B char', ja: 'Bキャラ' },
  score: { ko: '스코어', en: 'Score', ja: 'スコア' },
  result_for_a: { ko: 'A 결과', en: 'Result (A)', ja: 'A結果' },
};

/**
 * 컬럼 헤더 표시명. 고정 매핑에 없으면 비교 탭의 동적 컬럼
 * `<이름>_games` / `<이름>_wr(%)` 패턴을 처리하고, 그 외(캐릭터명 등)는 원문 유지.
 */
export function colText(lang: Lang, col: string): string {
  const hit = COL_I18N[col];
  if (hit) return hit[lang];
  if (col.endsWith('_games')) {
    const name = col.slice(0, -'_games'.length);
    return lang === 'en' ? `${name} games` : lang === 'ja' ? `${name} 試合` : `${name} 경기`;
  }
  if (col.endsWith('_wr(%)')) {
    const name = col.slice(0, -'_wr(%)'.length);
    return lang === 'en' ? `${name} WR(%)` : lang === 'ja' ? `${name} 勝率(%)` : `${name} 승률(%)`;
  }
  return col;
}
