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
  // sub / footer1 / footer2 는 지웠다.
  //  · sub — 제목 바로 아래에서 "wavu 랭크전 데이터 · 식별코드만 넣으면…"을 반복했다.
  //    출처는 푸터 고지가, 사용법은 입력칸 라벨이 이미 말한다.
  //  · footer1·footer2 — "데이터: wank.wavu.wiki … Bandai Namco 와 무관합니다"였는데
  //    바로 아래 disclaimer 가 출처와 무관함을 둘 다 담고 있어 중복이었다.
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
  // 오래 걸리는 조회에서 화면이 멈춘 것처럼 보이지 않게 초를 센다.
  queryingSec: {
    ko: (s: number) => `수집 중… ${s}초`,
    en: (s: number) => `Loading… ${s}s`,
    ja: (s: number) => `取得中… ${s}秒`,
  },
  longWait: {
    ko: '전적이 많은 플레이어는 시간이 걸립니다. 그대로 기다려 주세요 — 다음 조회부터는 훨씬 빠릅니다.',
    en: 'Players with huge histories take a while. Please wait — the next lookup will be much faster.',
    ja: '対戦数が多いプレイヤーは時間がかかります。そのままお待ちください — 次回はずっと速くなります。',
  },
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
  reportBtn: { ko: '리포트 보기', en: 'View report', ja: 'レポートを見る' },
  // 아이콘은 두지 않는다 — 버튼이 여럿 붙어 있는 줄에서 시선만 분산되고,
  // 이모지는 기기마다 너비가 달라 줄바꿈을 예측할 수 없게 만든다.
  xlsxBtn: { ko: '엑셀 (전체 탭)', en: 'Excel (all tabs)', ja: 'Excel (全タブ)' },
  csvBtn: { ko: 'CSV (현재 탭)', en: 'CSV (current tab)', ja: 'CSV (現在のタブ)' },
  jsonBtn: { ko: 'JSON (전체)', en: 'JSON (all)', ja: 'JSON (全体)' },
  dlFailed: {
    ko: '파일을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.',
    en: 'Could not save the file. Reload and try again.',
    ja: 'ファイルを保存できませんでした。再読み込みして再度お試しください。',
  },
  chart: { ko: '그래프', en: 'Chart', ja: 'グラフ' },
  table: { ko: '표', en: 'Table', ja: '表' },
  charAll: { ko: '전체 캐릭터', en: 'All characters', ja: '全キャラ' },
  charLabel: { ko: '캐릭터별 상세 (경기 수 순)', en: 'Per-character detail (by games)', ja: 'キャラ別詳細 (試合数順)' },
  hlToggle: { ko: '우위 항목 하이라이트', en: 'Highlight advantages', ja: '優位項目をハイライト' },
  // 상대전적 → 비교 목록에 담기 (화면을 벗어나지 않는다)
  addToCompare: { ko: '비교 목록에 추가', en: 'Add to compare list', ja: '比較リストに追加' },
  // 비교 결과 위 한 줄 — 서로 붙은 기록이 있을 때만. 누르면 '맞대결 상세' 탭으로 간다.
  // 승패는 **앞사람 기준**이라 이름을 다시 붙인다 — 누구의 2승인지 안 밝히면 못 읽는다.
  h2hHint: {
    ko: (a: string, b: string, g: number, aw: number, bw: number) =>
      `⚔ ${a} ↔ ${b} ${g}경기 · ${a} ${aw}승 ${bw}패 — 맞대결 상세 보기`,
    en: (a: string, b: string, g: number, aw: number, bw: number) =>
      `⚔ ${a} vs ${b} — ${g} games · ${a} ${aw}W ${bw}L — see head-to-head`,
    ja: (a: string, b: string, g: number, aw: number, bw: number) =>
      `⚔ ${a} ↔ ${b} ${g}試合 · ${a} ${aw}勝${bw}敗 — 対戦詳細を見る`,
  },
  h2hHintMore: {
    ko: (n: number) => `(외 ${n}쌍)`,
    en: (n: number) => `(+${n} more pairs)`,
    ja: (n: number) => `(他${n}組)`,
  },
  // 전적 목록·상대전적 표의 '나와 비교' 열 머리 — 상대 식별코드 바로 다음.
  // 이름·식별코드 열은 각각 글자·조회 링크 하나씩만 맡고, 담기는 이 열이 맡는다.
  cmpCol: { ko: '나와 비교', en: 'Vs me', ja: '自分と比較' },
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
  // 비공식 팬사이트 고지. 상표권자와 무관하다는 것과 데이터 출처를 함께 밝힌다 —
  // 둘을 붙여 두는 게 "누가 만들었고 자료가 어디서 왔나"를 한 번에 답한다.
  disclaimer: {
    ko: '비공식 팬 사이트입니다. TEKKEN™ 은 반다이남코 엔터테인먼트의 상표이며 이 사이트는 반다이남코와 아무 관련이 없습니다. 전적 자료의 출처는 wank.wavu.wiki 입니다.',
    en: 'An unofficial fan site. TEKKEN™ is a trademark of Bandai Namco Entertainment; this site is not affiliated with or endorsed by Bandai Namco. Match data comes from wank.wavu.wiki.',
    ja: '非公式のファンサイトです。TEKKEN™ はバンダイナムコエンターテインメントの商標であり、当サイトはバンダイナムコとは一切関係ありません。戦績データの出典は wank.wavu.wiki です。',
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
  // 꺾이는 폭에 따라 나눈다. 3%p 나 8%p 나 같은 문장이면 숫자를 보여주는 의미가 없다.
  // (실측 4명: 3.6 / 3.7 / 4.4 / 7.6%p — 6%p 를 경계로 잡으면 실제로 갈린다)
  adviceStopMild: {
    ko: (good: number, stop: number, pp: number) =>
      `한 세션 ${good}판까지는 평균 이상이었고, ${stop}판을 넘기면 ${pp}%p 내려갑니다. 폭이 작아 오차에 가깝습니다.`,
    en: (good: number, stop: number, pp: number) =>
      `Above your average through ${good} games; past ${stop} it slips ${pp}%p — small enough to be noise.`,
    ja: (good: number, stop: number, pp: number) =>
      `1セッション${good}試合までは平均以上、${stop}試合を超えると${pp}%p 下がります。幅が小さく誤差に近い範囲です。`,
  },
  adviceStopSharp: {
    ko: (good: number, stop: number, pp: number) =>
      `한 세션 ${good}판까지는 평균 이상이었고, ${stop}판을 넘기면 ${pp}%p 급락합니다. 뚜렷한 한계선입니다.`,
    en: (good: number, stop: number, pp: number) =>
      `Above your average through ${good} games; past ${stop} it drops ${pp}%p. That is a hard ceiling.`,
    ja: (good: number, stop: number, pp: number) =>
      `1セッション${good}試合までは平均以上、${stop}試合を超えると${pp}%p 急落します。明確な限界線です。`,
  },
  // 첫 구간부터 평균 이하 — 예전에는 stopAfter===0 이 falsy 라
  // "꺾이는 지점이 없었습니다"(정반대 말)가 나갔다.
  adviceFromStart: {
    ko: (pp: number) =>
      `세션 길이 문제가 아닙니다. 첫 5판부터 평균보다 ${pp}%p 낮습니다 — 시작이 안 풀리는 쪽입니다.`,
    en: (pp: number) =>
      `This is not about session length. The first 5 games already sit ${pp}%p below your average — you start cold.`,
    ja: (pp: number) =>
      `試合数の問題ではありません。最初の5戦から平均より${pp}%p 低いです — 立ち上がりが課題です。`,
  },
  // 승률은 평균 이상인데 레이팅은 안 붙는 구간. avgDelta 는 계산만 되고
  // 아무도 안 쓰던 값이었다 — 승률만 봐서는 절대 안 보이는 정보다.
  adviceNoGain: {
    ko: (from: number, to: number) =>
      `${from}~${to}판째는 이겨도 레이팅이 거의 안 오릅니다. 승률만 보면 안 보이는 구간입니다.`,
    en: (from: number, to: number) =>
      `Games ${from}–${to} win but barely move your rating. The win rate alone hides this.`,
    ja: (from: number, to: number) =>
      `${from}〜${to}戦目は勝ってもレートがほぼ動きません。勝率だけでは見えない区間です。`,
  },
  // 표본이 없는 '이유'를 나눈다. 경기가 많은데 뒷구간이 빈 건 실패가 아니라
  // '짧게 자주 하는 사람'이라는 정보다 — 알고 있는 걸 모른다고 말하면 안 된다.
  // 안 되는 이유만 말하면 "그래서 몇 판을 하라는 거냐"가 바로 나온다. 답을 같이 준다.
  // 계산 근거: 구간은 5판 단위(advice.ts BAND), 구간 하나를 쓰려면 50판
  // (MIN_BAND_GAMES), 판정에는 세 구간이 필요하다. 세 번째 구간은 '세션 내
  // 11~15판째'이고 15판짜리 세션 하나가 거기에 5판을 넣으므로 → 15판 세션 10회.
  //
  // **'하루에 몇 판'이 아니라 '한 번에 몇 판'이다.** 구간이 세션 안 순번이라
  // 5판씩 열 번 해봐야 앞 구간만 쌓인다. 문구에서 그 점을 분명히 한다.
  adviceThinShort: {
    ko: (games: number) =>
      `${games}판을 하셨지만 한 번에 짧게 끊으셔서 뒷구간이 비어 있습니다. 한 자리에서 15판 이상 하는 날이 10번쯤 쌓이면 계산됩니다 — 총 판수가 아니라 한 번에 이어서 하는 판수가 기준입니다.`,
    en: (games: number) =>
      `${games} games, but each sitting is short so the later buckets are empty. About ten sessions of 15+ games in one sitting will fill them — what matters is games per sitting, not the total.`,
    ja: (games: number) =>
      `${games}試合ありますが、1回が短く後半区間が空です。1回に15戦以上のセッションが10回ほど貯まれば計算できます — 合計ではなく「一度に続けた試合数」が基準です。`,
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
    ko: '한 줄 멘트 표시 (컨디션·유머)',
    en: 'Show one-line commentary (mood)',
    ja: '一行コメントを表示 (調子)',
  },
  // 멘트가 보이는 자리마다 마지막 줄에 붙는 안내.
  // 끄는 방법을 모르면 불편해도 참고 보게 된다 — 스위치가 있다는 사실 자체를 알려준다.
  quipsOff: {
    ko: '※ 이 문구가 불편하시면 위 조회 화면의 체크박스를 해제하세요.',
    en: '※ Not your thing? Uncheck the option in the search panel above.',
    ja: '※ この一言が不要なら、上の検索画面のチェックを外してください。',
  },
  coachOpt: {
    ko: '연습 조언 표시 (리플레이·확정딜캐·영상)',
    en: 'Show practice tips (replays, punishes, video)',
    ja: '練習アドバイスを表示 (リプレイ・確定反撃・動画)',
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
  pinHint: {
    ko: '다음 방문에 이 계정이 자동으로 조회됩니다 (이 브라우저에만 저장)',
    en: 'This account loads automatically on your next visit (stored in this browser only)',
    ja: '次回訪問時にこのアカウントが自動照会されます (このブラウザにのみ保存)',
  },
  pinSet: { ko: '내 계정으로 고정', en: 'Pin as my account', ja: '自分のアカウントに固定' },
  pinnedHere: { ko: '내 계정', en: 'my account', ja: '自分のアカウント' },
  pinnedLabel: { ko: '내 계정:', en: 'My account:', ja: '自分のアカウント:' },
  unpin: { ko: '해제', en: 'Unpin', ja: '解除' },
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
  // 푸터 농담 — 실행 난이도로 악명 높은 캐릭터들에 대한 과장된 농담이다.
  // 한국어 원문이 본체라 번역은 뜻만 옮긴다.
  footerJoke: {
    ko: '술 담배 해도 풍신류 화랑 스티브 하지마라, 그럴거면 차라리 마약을 해라',
    en: 'Drink and smoke if you must — just don\'t pick Mishima, Hwoarang, or Steve.',
    ja: '酒もタバコもいい、でも風神流・ファラン・スティーブだけはやめとけ。',
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
  xlsxBusy: { ko: '엑셀 생성 중…', en: 'Building Excel…', ja: 'Excel 生成中…' },
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
  // ── 시간대 기준 (lib/wavu/region.ts) ──
  tzLocal: {
    ko: (off: string) => `현지 시간 (${off})`,
    en: (off: string) => `Local time (${off})`,
    ja: (off: string) => `現地時間 (${off})`,
  },
  sessBars: { ko: '세션별', en: 'By session', ja: 'セッション別' },
  sessLength: { ko: '세션 길이별', en: 'By length', ja: 'セッション長別' },
  trendByGame: { ko: '경기 순번', en: 'By game', ja: '試合順' },
  trendByDate: { ko: '날짜', en: 'By date', ja: '日付' },
  tzKst: { ko: '한국 시간 (UTC+9)', en: 'Korea time (UTC+9)', ja: '韓国時間 (UTC+9)' },
  // 라운드 탭 보기 전환 — 내 캐릭터별(기본) ↔ 상대 캐릭터별로 펼치기
  roundByMine: { ko: '내 캐릭터별', en: 'By my character', ja: '自キャラ別' },
  roundByOpp: { ko: '상대 캐릭터별로 펼쳐보기', en: 'Expand by opponent', ja: '相手キャラ別に展開' },
  // 시즌 탭 보기 전환 — 시즌별(기본) ↔ game_version 별(같은 시즌 안의 밸런스 패치까지)
  seasonBySeason: { ko: '시즌별', en: 'By season', ja: 'シーズン別' },
  seasonByVersion: { ko: '버전별로 나눠보기', en: 'Split by version', ja: 'バージョン別に分割' },
  tzRegion: {
    ko: (region: string, off: string) => `이 플레이어는 ${region} 서버입니다 — 현지 시각은 ${off} 기준입니다.`,
    en: (region: string, off: string) => `This player is on the ${region} server — local time is ${off}.`,
    ja: (region: string, off: string) => `このプレイヤーは ${region} サーバーです — 現地時間は ${off} 基準です。`,
  },
  tzUnknown: {
    ko: '서버 지역을 알 수 없어 한국 시간(UTC+9) 그대로 보여줍니다.',
    en: 'Server region unknown — showing Korea time (UTC+9) as-is.',
    ja: 'サーバー地域が不明なため、韓国時間 (UTC+9) のまま表示しています。',
  },
  tzByCurve: {
    ko: '(지역 안에서의 정확한 시간대는 플레이 시간 분포로 추정한 값입니다)',
    en: '(exact offset within the region is estimated from the play-time distribution)',
    ja: '(地域内の正確な時間帯はプレイ時間の分布から推定した値です)',
  },

  // ── 캐릭터별 현재 단 배지 (추정 없음, wavu 값 그대로) ──
  riTagMain: { ko: '메인', en: 'Main', ja: 'メイン' },
  riTagRecent: { ko: '최근', en: 'Recent', ja: '最近' },
  riTagBoth: { ko: '메인 · 최근', en: 'Main · Recent', ja: 'メイン・最近' },
  riGames: { ko: '경기', en: ' games', ja: '試合' },
  riFold: { ko: '접기', en: 'Collapse', ja: '閉じる' },
  riMore: {
    ko: (n: number) => `다른 캐릭터 ${n}개 더 보기`,
    en: (n: number) => `Show ${n} more character${n === 1 ? '' : 's'}`,
    ja: (n: number) => `他${n}体を表示`,
  },

  // ── 승률 비슷한/정반대인 사람, 장기전 패턴 찾기 (player-index 기반) ──
  spToggle: { ko: '승률 비교 · 장기전 패턴 찾기', en: 'Find by win rate / long-session pattern', ja: '勝率比較・長時間戦のパターンを探す' },
  spDirSimilar: { ko: '비슷한 승률', en: 'Similar win rate', ja: '勝率が近い' },
  spDirOpposite: { ko: '반대 승률', en: 'Opposite win rate', ja: '勝率が正反対' },
  spCharLabel: {
    ko: (c: string) => `기준 캐릭터: ${c} (최근 사용)`,
    en: (c: string) => `Comparing on: ${c} (recently used)`,
    ja: (c: string) => `基準キャラ: ${c}(最近使用)`,
  },
  spMinGamesLabel: { ko: '최소 판수', en: 'Min games', ja: '最低試合数' },
  spTrendLabel: { ko: '장기전 패턴', en: 'Long-session pattern', ja: '長時間戦のパターン' },
  spTrendAny: { ko: '무관', en: 'Any', ja: '指定なし' },
  spTrendDeclining: { ko: '장기전에서 하락하는 사람', en: 'Declines in long sessions', ja: '長時間戦で下がる人' },
  spTrendRising: { ko: '장기전에서 상승하는 사람', en: 'Rises in long sessions', ja: '長時間戦で上がる人' },
  spTrendRisingCaveat: {
    ko: '주의: 이기는 날엔 계속 치고 지는 날엔 그만두는 경향 때문에, 후반 승률이 높게 나오는 건 흔한 일입니다. 실력이 좋아졌다는 뜻은 아닐 수 있습니다.',
    en: 'Caution: later-session win rates often look high simply because people keep playing on good days and stop on bad ones. This does not necessarily mean real improvement.',
    ja: '注意: 勝っている日は続け、負けている日はやめる傾向があるため、後半の勝率が高く出るのはよくあることです。実力が上がったとは限りません。',
  },
  spRecencyLabel: { ko: '최근 활동', en: 'Recent activity', ja: '最近の活動' },
  spRecencyMonth: { ko: '한 달 내', en: 'Last month', ja: '直近1ヶ月' },
  spRecencyPatch: { ko: '이번 패치', en: 'Current patch', ja: '今パッチ' },
  spRecencyAll: { ko: '전체', en: 'All time', ja: '全期間' },
  spSearch: { ko: '찾기', en: 'Search', ja: '検索' },
  spSearching: { ko: '찾는 중…', en: 'Searching…', ja: '検索中…' },
  spMyWinRate: {
    ko: (wr: number, n: number) => `내 승률 ${wr}% (최근 ${n}판 기준)`,
    en: (wr: number, n: number) => `Your win rate: ${wr}% (last ${n} games)`,
    ja: (wr: number, n: number) => `自分の勝率 ${wr}%(直近${n}戦)`,
  },
  spIndexNote: {
    ko: (n: number, d: number) => `표본 ${n}명 · ${d}일 전 스냅샷 기준`,
    en: (n: number, d: number) => `Sample of ${n}, snapshot from ${d} days ago`,
    ja: (n: number, d: number) => `サンプル${n}人・${d}日前のスナップショット`,
  },
  spEmpty: {
    ko: (n: number) => `표본 ${n}명 중 이 조건에 맞는 사람이 없습니다. 최소 판수를 낮춰보세요.`,
    en: (n: number) => `None of the ${n} sampled players match. Try lowering the minimum games.`,
    ja: (n: number) => `サンプル${n}人の中に条件に合う人がいません。最低試合数を下げてみてください。`,
  },
  spLooserHint: {
    ko: (n: number) => `최소 판수를 한 단계 낮추면 ${n}명 더 나옵니다.`,
    en: (n: number) => `Lowering the minimum by one step adds ${n} more.`,
    ja: (n: number) => `最低試合数を一段下げると${n}人増えます。`,
  },
  spGamesShort: { ko: '판', en: ' games', ja: '戦' },
  spTooFewGames: {
    ko: '전적이 너무 적어(20판 미만) 승률을 잴 수 없습니다.',
    en: 'Too few matches (under 20) to measure win rate.',
    ja: '試合数が少なすぎて(20戦未満)勝率を測れません。',
  },
  spDecliningBadge: {
    ko: (n: number, pp: number) => `${n}판째부터 -${pp}%p`,
    en: (n: number, pp: number) => `-${pp}%p after game ${n}`,
    ja: (n: number, pp: number) => `${n}戦目から-${pp}%p`,
  },
  spRisingBadge: {
    ko: (n: number, pp: number) => `${n}판째부터 +${pp}%p`,
    en: (n: number, pp: number) => `+${pp}%p after game ${n}`,
    ja: (n: number, pp: number) => `${n}戦目から+${pp}%p`,
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
  stage: { ko: '스테이지', en: 'Stages', ja: 'ステージ' },
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
  // KST 를 라벨에 박지 않는다 — 외국 플레이어는 현지 시각으로 볼 수 있고,
  // 어느 기준인지는 표 위의 전환 버튼과 안내문이 말한다 (lib/wavu/region.ts).
  '시간대': { ko: '시간대', en: 'Hour', ja: '時間帯' },
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
  // '최근 20경기' 같은 최근 폼 라벨. 사전에 20/50/100 을 박아두지 않고 패턴으로 받는다
  // — 집계 쪽에서 구간을 늘리면(aggregations.ts 의 [20, 50, 100]) 사전만 뒤처져서
  //   한국어가 그대로 새어 나온다. 실제로 이 세 줄이 그렇게 빠져 있었다.
  const recentN = /^최근 (\d+)경기$/.exec(v);
  if (recentN) return lang === 'ja' ? `直近${recentN[1]}試合` : `Last ${recentN[1]} games`;
  return v;
}

/**
 * 표 컬럼 헤더 표시명. 데이터/CSV 구조의 키는 영문 원명을 유지하고
 * 화면에 보일 때만 이 표로 바꾼다 (한국어 모드도 번역 대상).
 */
export const COL_I18N: Record<string, Entry> = {
  my_char: { ko: '내 캐릭터', en: 'My char', ja: '自キャラ' },
  stage: { ko: '스테이지', en: 'Stage', ja: 'ステージ' },
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
  // '단' 이 아니라 '계급'이다 — 29단 위(God of Destruction I~∞)는 단이 아니라서
  // 'God of Destruction I' 옆에 '이전 단'이 붙으면 어긋나 보인다. 일본어 段位 도 같다.
  From: { ko: '이전 계급', en: 'From', ja: '前のランク' },
  To: { ko: '바뀐 계급', en: 'To', ja: '後のランク' },
  Change: { ko: '변동', en: 'Change', ja: '変動' },
  PrevGames: { ko: '이전 계급 경기', en: 'Games at prev', ja: '前ランクの試合' },
  'PrevWinRate(%)': { ko: '이전 계급 승률(%)', en: 'Prev WR(%)', ja: '前ランク勝率(%)' },
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
