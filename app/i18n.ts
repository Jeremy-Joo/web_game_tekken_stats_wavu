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
  // 비교는 wavu 지침에 맞춰 순차 수집이라 인원수만큼 시간이 는다.
  // 실측: 4명(149,593경기) 첫 조회 36.7초. 아무 말 없이 30초가 흐르면 멈춘 줄 안다.
  compareHint: {
    ko: '여러 명은 한 명씩 차례로 수집합니다 — 인원이 많으면 1분 가까이 걸릴 수 있습니다.',
    en: 'Players are fetched one at a time — 4 players can take close to a minute.',
    ja: '複数人は1人ずつ順に取得します — 人数が多いと1分近くかかることがあります。',
  },
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
  // 상대전적 → 비교 목록에 담기 (화면을 벗어나지 않는다)
  addToCompare: { ko: '비교 목록에 추가', en: 'Add to compare list', ja: '比較リストに追加' },
  pickLabel: {
    ko: (n: number, max: number) => `비교 목록 ${n}/${max}명`,
    en: (n: number, max: number) => `Compare list ${n}/${max}`,
    ja: (n: number, max: number) => `比較リスト ${n}/${max}人`,
  },
  meLabel: { ko: '나', en: 'me', ja: '自分' },
  remove: { ko: '목록에서 빼기', en: 'Remove', ja: 'リストから外す' },
  copyBtn: { ko: '📋 복사', en: '📋 Copy', ja: '📋 コピー' },
  copied: { ko: '복사했습니다 — 여러 명 비교 입력칸에 붙여넣으세요.', en: 'Copied — paste it into the Compare box.', ja: 'コピーしました — 複数比較の入力欄に貼り付けてください。' },
  copyFail: {
    ko: '복사하지 못했습니다. 입력칸을 눌러 직접 복사하세요.',
    en: "Couldn't copy. Select the field and copy manually.",
    ja: 'コピーできませんでした。入力欄を選択して手動でコピーしてください。',
  },
  compareNow: { ko: '⚔ 즉시 비교 (새 창)', en: '⚔ Compare now (new tab)', ja: '⚔ すぐ比較 (新規タブ)' },
  pickTextLabel: { ko: '비교할 식별코드 목록', en: 'IDs to compare', ja: '比較するIDリスト' },
  pickFull: {
    ko: (max: number) => `최대 ${max}명까지 비교할 수 있습니다. 빼고 담으세요.`,
    en: (max: number) => `Up to ${max} players can be compared. Remove one first.`,
    ja: (max: number) => `最大${max}人まで比較できます。先に外してください。`,
  },
  openPlayer: {
    ko: '이 플레이어 전적 보기 (새 창)',
    en: 'Open this player (new tab)',
    ja: 'このプレイヤーを開く (新規タブ)',
  },
  minGames: { ko: '최소 경기', en: 'Min games', ja: '最低試合数' },
  showTop: { ko: '보여줄 수', en: 'Show top', ja: '表示人数' },
  // ── 권장 판수 (lib/tekken/advice.ts) ──
  adviceStop: {
    ko: (good: number, stop: number) =>
      `한 세션 ${good}판까지는 평균 이상이었고, ${stop}판을 넘기면 성적이 꺾였습니다.`,
    en: (good: number, stop: number) =>
      `Up to ${good} games per session you were above your average; past ${stop} it dropped.`,
    ja: (good: number, stop: number) =>
      `1セッション${good}試合までは平均以上、${stop}試合を超えると成績が落ちました。`,
  },
  adviceNoDrop: {
    ko: (good: number) =>
      `${good}판까지 봐도 성적이 꺾이는 지점이 없었습니다. 판수 자체는 발목을 잡지 않는 편입니다.`,
    en: (good: number) =>
      `No drop-off found through ${good} games — session length doesn't seem to hurt you.`,
    ja: (good: number) =>
      `${good}試合まで成績の落ち込みは見られません。試合数自体は足を引っ張っていないようです。`,
  },
  adviceThin: {
    ko: '권장 판수를 말하기엔 표본이 부족합니다. 경기가 더 쌓이면 계산됩니다.',
    en: 'Not enough data yet to suggest a session length.',
    ja: '推奨試合数を出すにはデータが足りません。',
  },
  adviceBaseline: { ko: '내 평균', en: 'your average', ja: '自分の平均' },
  // 흐름 탭 농담은 app/jokes.ts 에 따로 모아뒀다 (수위별로 여러 개 + 데이터로 선택).
  adviceCaveat: {
    ko: '※ 상관관계일 뿐입니다 — 잘 풀린 날일수록 오래 하게 되므로 뒷구간 표본은 유리한 쪽으로 치우칩니다.',
    en: '※ Correlation only — good days last longer, so later buckets are biased toward good sessions.',
    ja: '※ 相関にすぎません — 調子が良い日ほど長く続くため、後半の標本は有利側に偏ります。',
  },
  metSince: { ko: '만난 시기', en: 'Last met', ja: '対戦時期' },
  hideThin: {
    ko: (n: number) => `${n}경기 미만 숨기기 (표본 부족)`,
    en: (n: number) => `Hide under ${n} games (thin sample)`,
    ja: (n: number) => `${n}試合未満を隠す (標本不足)`,
  },
  periodPrefix: { ko: '기간', en: 'Period', ja: '期間' },
  begin: { ko: '처음', en: 'start', ja: '最初' },
  today: { ko: '오늘', en: 'today', ja: '今日' },
  quipsOpt: {
    ko: '한 줄 멘트 표시 (컨디션·조언)',
    en: 'Show one-line commentary',
    ja: '一行コメントを表示',
  },
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
  // 푸터 농담 — 실행 난이도로 악명 높은 캐릭터들에 대한 과장된 농담이다.
  // 한국어 원문이 본체라 번역은 뜻만 옮긴다.
  footerJoke: {
    ko: '술 담배 해도 풍신류 화랑 스티브 하지마라, 그럴거면 차라리 마약을 해라',
    en: 'Drink and smoke if you must — just don\'t pick Mishima, Hwoarang, or Steve.',
    ja: '酒もタバコもいい、でも風神流・ファラン・スティーブだけはやめとけ。',
  },
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
  // 식별코드로도 닉네임으로도 못 찾은 경우. 한쪽 실패 메시지만 보이면
  // (예: '그런 식별코드 없음') 닉네임을 넣은 사용자가 원인을 오해한다.
  noMatch: {
    ko: (tok: string) => `'${tok}' — 식별코드로도 닉네임으로도 찾지 못했습니다.`,
    en: (tok: string) => `'${tok}' — not found as a polaris ID or a nickname.`,
    ja: (tok: string) => `「${tok}」— IDでもニックネームでも見つかりませんでした。`,
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
  // 엑셀 생성은 경기 수에 비례해 오래 걸린다 (실측 30,233경기 = 27.6초).
  // 아무 반응 없이 30초가 흐르면 사용자는 멈춘 줄 안다 — 상태와 예상 시간을 밝힌다.
  xlsxBusy: { ko: '⏳ 엑셀 생성 중…', en: '⏳ Building Excel…', ja: '⏳ Excel 生成中…' },
  xlsxEta: {
    ko: (sec: number) =>
      `${sec}초쯤 걸립니다 — 기간이나 캐릭터를 좁히면 빨라집니다.`,
    en: (sec: number) =>
      `Takes about ${sec}s — narrowing the period or character speeds it up.`,
    ja: (sec: number) =>
      `約${sec}秒かかります — 期間やキャラを絞ると速くなります。`,
  },
  // wavu 수집에 실패했지만 지난 사본이 있어 그것으로 보여주는 중.
  // 예전에는 이 경우 사이트 전체가 503 이었다.
  staleWarn: {
    ko: (min: number) =>
      `⚠ wavu 에 연결하지 못해 ${min}분 전 데이터를 보여주고 있습니다.`,
    en: (min: number) =>
      `⚠ Can't reach wavu — showing data from ${min} min ago.`,
    ja: (min: number) =>
      `⚠ wavu に接続できず、${min}分前のデータを表示しています。`,
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
  vs_rating: { ko: '레이팅대', en: 'By opp rating', ja: 'レート帯' },
  flow: { ko: '흐름', en: 'Form & streaks', ja: '流れ' },
  time: { ko: '시간대', en: 'Time of day', ja: '時間帯' },
  rank: { ko: '승단 이력', en: 'Rank history', ja: '昇段履歴' },
  overview: { ko: '개요', en: 'Overview', ja: '概要' },
  chars: { ko: '캐릭터', en: 'Characters', ja: 'キャラ' },
  vs_chars: { ko: '상대 캐릭', en: 'Vs characters', ja: '相手キャラ' },
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
  '현재 레이팅': { ko: '현재 레이팅', en: 'Current rating', ja: '現在レート' },
  '최근 20경기 승률(%)': {
    ko: '최근 20경기 승률(%)', en: 'Last 20 win rate (%)', ja: '直近20試合勝率(%)',
  },
  // ── 흐름 탭 (구분 열 없이 항목 라벨만으로 읽히게) ──
  '전체 평균': { ko: '전체 평균', en: 'Overall', ja: '全体平均' },
  '최장 연승': { ko: '최장 연승', en: 'Longest win streak', ja: '最長連勝' },
  '최장 연패': { ko: '최장 연패', en: 'Longest loss streak', ja: '最長連敗' },
  '현재 연승': { ko: '현재 연승', en: 'Current win streak', ja: '現在の連勝' },
  '현재 연패': { ko: '현재 연패', en: 'Current loss streak', ja: '現在の連敗' },
  '2연승 직후': { ko: '2연승 직후', en: 'After 2 wins', ja: '2連勝の直後' },
  '3연승 이상 직후': { ko: '3연승 이상 직후', en: 'After 3+ wins', ja: '3連勝以上の直後' },
  '2연패 직후': { ko: '2연패 직후', en: 'After 2 losses', ja: '2連敗の直後' },
  '3연패 이상 직후': { ko: '3연패 이상 직후', en: 'After 3+ losses', ja: '3連敗以上の直後' },
  '세션 1~5번째': { ko: '세션 1~5번째', en: 'Session 1st–5th', ja: 'セッション1〜5戦目' },
  '세션 6~10번째': { ko: '세션 6~10번째', en: 'Session 6th–10th', ja: 'セッション6〜10戦目' },
  '세션 11~20번째': { ko: '세션 11~20번째', en: 'Session 11th–20th', ja: 'セッション11〜20戦目' },
  '세션 21~30번째': { ko: '세션 21~30번째', en: 'Session 21st–30th', ja: 'セッション21〜30戦目' },
  '세션 31번째 이상': { ko: '세션 31번째 이상', en: 'Session 31st+', ja: 'セッション31戦目以降' },
  // ── 시간대 탭 ──
  '시간대': { ko: '시간대', en: 'Hour (KST)', ja: '時間帯 (KST)' },
  '요일': { ko: '요일', en: 'Weekday', ja: '曜日' },
  // ── 승단 이력 ──
  '▲ 승단': { ko: '▲ 승단', en: '▲ Promoted', ja: '▲ 昇段' },
  '▼ 강등': { ko: '▼ 강등', en: '▼ Demoted', ja: '▼ 降段' },
  // ── 레이팅대 탭 ──
  '-300 이하 (내가 훨씬 위)': {
    ko: '-300 이하 (내가 훨씬 위)', en: '≤ -300 (far below me)', ja: '-300以下 (自分が格上)',
  },
  '-300 ~ -150': { ko: '-300 ~ -150', en: '-300 to -150', ja: '-300 〜 -150' },
  '-150 ~ -50': { ko: '-150 ~ -50', en: '-150 to -50', ja: '-150 〜 -50' },
  '-50 ~ +50 (비슷)': { ko: '-50 ~ +50 (비슷)', en: '-50 to +50 (even)', ja: '-50 〜 +50 (互角)' },
  '+50 ~ +150': { ko: '+50 ~ +150', en: '+50 to +150', ja: '+50 〜 +150' },
  '+150 ~ +300': { ko: '+150 ~ +300', en: '+150 to +300', ja: '+150 〜 +300' },
  '+300 이상 (상대가 훨씬 위)': {
    ko: '+300 이상 (상대가 훨씬 위)', en: '≥ +300 (far above me)', ja: '+300以上 (相手が格上)',
  },
};

/** 요일 한 글자 (버킷 값으로 저장된 한국어 요일 → 각 언어) */
const WEEKDAY_I18N: Record<string, Entry> = {
  일: { ko: '일', en: 'Sun', ja: '日' },
  월: { ko: '월', en: 'Mon', ja: '月' },
  화: { ko: '화', en: 'Tue', ja: '火' },
  수: { ko: '수', en: 'Wed', ja: '水' },
  목: { ko: '목', en: 'Thu', ja: '木' },
  금: { ko: '금', en: 'Fri', ja: '金' },
  토: { ko: '토', en: 'Sat', ja: '土' },
};

export function cellText(lang: Lang, v: string): string {
  if (lang === 'ko') return v;
  const hit = CELL_I18N[v]?.[lang] ?? WEEKDAY_I18N[v]?.[lang];
  if (hit) return hit;
  // '14시' 같은 시간 버킷 — 숫자는 그대로 두고 단위만 바꾼다
  const hour = /^(\d{2})시$/.exec(v);
  if (hour) return lang === 'ja' ? `${hour[1]}時` : `${hour[1]}:00`;
  return v;
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
  // 신규 탭 컬럼
  RatingGap: { ko: '레이팅 차 (상대-나)', en: 'Rating gap (opp−me)', ja: 'レート差 (相手−自分)' },
  AvgRatingDelta: { ko: '평균 증감', en: 'Avg rating Δ', ja: '平均レート増減' },
  'Share(%)': { ko: '비중(%)', en: 'Share(%)', ja: '割合(%)' },
  Unit: { ko: '구분', en: 'Group', ja: '区分' },
  Bucket: { ko: '항목', en: 'Item', ja: '項目' },
  // 승단 이력
  From: { ko: '이전 단', en: 'From', ja: '前の段位' },
  To: { ko: '바뀐 단', en: 'To', ja: '後の段位' },
  Change: { ko: '변동', en: 'Change', ja: '変動' },
  PrevGames: { ko: '이전 단 경기', en: 'Games at prev', ja: '前段位の試合' },
  'PrevWinRate(%)': { ko: '이전 단 승률(%)', en: 'Prev WR(%)', ja: '前段位勝率(%)' },
  player: { ko: '플레이어', en: 'Player', ja: 'プレイヤー' },
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
