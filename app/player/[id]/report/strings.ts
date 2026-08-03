// 리포트 전용 문자열 (ko/en/ja).
//
// app/i18n.ts 를 쓰지 않는 이유: 저기는 조회 화면의 사전이고 서버 응답의 컬럼명·셀값을
// 치환하는 게 주된 일이다. 리포트는 문장 단위 카피가 대부분이라(“가운데 선이 50%입니다”)
// 성격이 다르다. 섞으면 양쪽 다 뒤진다.
//
// 값이 함수인 항목은 숫자를 문장 안에 넣어야 하는 것들이다 — 언어마다 어순이 달라서
// 조각을 이어붙이면 번역이 망가진다.

import type { Lang } from '@/app/i18n';
import { SITE_HOST } from '@/lib/site';

export type { Lang };

export const REPORT_LANGS: Lang[] = ['ko', 'en', 'ja'];

/** 쿼리스트링에서 온 값을 언어로 확정한다. 모르는 값이면 한국어. */
export function parseLang(v: string | string[] | undefined): Lang {
  const s = (Array.isArray(v) ? v[0] : v) ?? '';
  return s === 'en' || s === 'ja' ? s : 'ko';
}

type S = Record<Lang, string>;
type F<A extends unknown[]> = Record<Lang, (...a: A) => string>;

export const R = {
  // ── 머리말 ──
  backToStats: { ko: '← 전체 통계', en: '← Full stats', ja: '← 全統計' } as S,
  share: { ko: '🔗 공유', en: '🔗 Share', ja: '🔗 共有' } as S,
  print: { ko: '🖨 인쇄 · PDF', en: '🖨 Print · PDF', ja: '🖨 印刷 · PDF' } as S,
  shareCopied: { ko: '링크를 복사했습니다', en: 'Link copied', ja: 'リンクをコピーしました' } as S,
  shareFailed: {
    ko: '복사하지 못했습니다. 주소창에서 직접 복사해 주세요.',
    en: "Couldn't copy. Please copy the address bar manually.",
    ja: 'コピーできませんでした。アドレスバーからコピーしてください。',
  } as S,
  shareTitle: {
    ko: (name: string) => `${name} — 철권8 전적 리포트`,
    en: (name: string) => `${name} — Tekken 8 Stats Report`,
    ja: (name: string) => `${name} — 鉄拳8 戦績レポート`,
  } as F<[string]>,
  mainChar: { ko: '주력', en: 'main', ja: 'メイン' } as S,

  // ── 헤드라인 수치 ──
  winRate: { ko: '승률', en: 'Win rate', ja: '勝率' } as S,
  totalGames: { ko: '총 경기', en: 'Games', ja: '試合数' } as S,
  currentRating: { ko: '현재 레이팅', en: 'Current rating', ja: '現在レート' } as S,
  lastRating: { ko: '마지막 레이팅', en: 'Last rating', ja: '最終レート' } as S,
  tekkenPower: { ko: '텍켄파워', en: 'Tekken Power', ja: 'TEKKEN POWER' } as S,
  peak: { ko: (v: string) => `최고 ${v}`, en: (v: string) => `peak ${v}`, ja: (v: string) => `最高 ${v}` } as F<[string]>,
  winsLosses: {
    ko: (w: string, l: string) => `${w}승 ${l}패`,
    en: (w: string, l: string) => `${w}W ${l}L`,
    ja: (w: string, l: string) => `${w}勝 ${l}敗`,
  } as F<[string, string]>,
  meterAbove: {
    ko: '가운데 선이 50%입니다. 이 선보다 위입니다.',
    en: 'The center line is 50%. You are above it.',
    ja: '中央の線が50%です。それより上です。',
  } as S,
  meterBelow: {
    ko: '가운데 선이 50%입니다. 이 선보다 아래입니다.',
    en: 'The center line is 50%. You are below it.',
    ja: '中央の線が50%です。それより下です。',
  } as S,
  thin: {
    ko: (n: number) =>
      `경기가 ${n}판뿐입니다. 아래 수치는 표본이 적어 크게 흔들립니다 — 한두 판 결과로도 승률이 몇 %씩 움직이는 구간이라 확정된 실력으로 읽지 마세요.`,
    en: (n: number) =>
      `Only ${n} games. Everything below swings hard on this little data — a single match moves the win rate by whole points, so don't read it as settled skill.`,
    ja: (n: number) =>
      `${n}試合しかありません。以下の数値はサンプルが少なく大きくぶれます — 1〜2試合で勝率が数%動く範囲なので、確定した実力として読まないでください。`,
  } as F<[number]>,

  // ── 범위 바 ──
  scope: { ko: '범위', en: 'Scope', ja: '範囲' } as S,
  scopeAll: { ko: '전체', en: 'All', ja: '全期間' } as S,
  scopeAllLabel: { ko: '전체 기간', en: 'All time', ja: '全期間' } as S,
  seasonLabel: {
    ko: (n: string) => `시즌 ${n}`,
    en: (n: string) => `Season ${n}`,
    ja: (n: string) => `シーズン${n}`,
  } as F<[string]>,
  gamesUnit: {
    ko: (n: string) => `${n}판`,
    en: (n: string) => `${n}`,
    ja: (n: string) => `${n}戦`,
  } as F<[string]>,
  period: { ko: '기간', en: 'Period', ja: '期間' } as S,
  last30: { ko: '최근 30일', en: 'Last 30d', ja: '直近30日' } as S,
  last90: { ko: '최근 90일', en: 'Last 90d', ja: '直近90日' } as S,
  thisYear: { ko: '올해', en: 'This year', ja: '今年' } as S,
  apply: { ko: '적용', en: 'Apply', ja: '適用' } as S,
  from: { ko: '시작일', en: 'From', ja: '開始日' } as S,
  to: { ko: '종료일', en: 'To', ja: '終了日' } as S,
  language: { ko: '언어', en: 'Language', ja: '言語' } as S,

  emptyScope: {
    ko: (scope: string, last: string, total: string) =>
      `${scope}에는 랭크전 기록이 없습니다. 마지막 경기는 ${last} 이고, 전체 기간에는 ${total}판이 있습니다.`,
    en: (scope: string, last: string, total: string) =>
      `No ranked matches in ${scope}. The last match was ${last}, and there are ${total} games across all time.`,
    ja: (scope: string, last: string, total: string) =>
      `${scope}にはランクマッチの記録がありません。最後の試合は ${last}、全期間では ${total}試合です。`,
  } as F<[string, string, string]>,
  seeAllPeriod: { ko: '전체 기간으로 보기 →', en: 'View all time →', ja: '全期間で見る →' } as S,

  // ── 섹션 제목 ──
  secForm: { ko: '최근 흐름', en: 'Recent form', ja: '最近の調子' } as S,
  secTrend: { ko: '레이팅 추이', en: 'Rating trend', ja: 'レート推移' } as S,
  secChars: { ko: '캐릭터별 성적', en: 'By character', ja: 'キャラ別成績' } as S,
  secMatchups: { ko: '매치업', en: 'Matchups', ja: 'マッチアップ' } as S,
  secSeasons: { ko: '시즌별', en: 'By season', ja: 'シーズン別' } as S,
  secWhen: { ko: '언제 강한가', en: 'When you play best', ja: '強い時間帯' } as S,
  secGap: { ko: '실력차별 성적', en: 'By opponent strength', ja: '格上・格下との成績' } as S,
  secDetail: { ko: '세부 지표', en: 'Details', ja: '詳細指標' } as S,

  // ── 최근 흐름 ──
  mood: {
    ko: { hot: '물이 올랐다', steady: '평소만큼', cooling: '내려가는 중', cold: '많이 식었다' },
    en: { hot: 'On fire', steady: 'Usual self', cooling: 'Cooling off', cold: 'Ice cold' },
    ja: { hot: '絶好調', steady: 'いつも通り', cooling: '下降中', cold: '完全に冷えた' },
  } as Record<Lang, Record<string, string>>,
  vsAverage: {
    ko: (pp: string) => `최근 20판이 직전 200판 대비 ${pp}%p`,
    en: (pp: string) => `Last 20 games are ${pp}%p vs. the 200 before them`,
    ja: (pp: string) => `直近20戦はその前の200戦比 ${pp}%p`,
  } as F<[string]>,
  bandBoth: {
    ko: (good: number, stop: number) =>
      `한 세션 ${good}판까지는 평균 이상이었고, ${stop}판을 넘기면 성적이 꺾였습니다.`,
    en: (good: number, stop: number) =>
      `You stayed above average through game ${good} of a session, and fell off past ${stop}.`,
    ja: (good: number, stop: number) =>
      `1セッション${good}戦までは平均以上で、${stop}戦を超えると成績が落ちました。`,
  } as F<[number, number]>,
  bandGood: {
    ko: (good: number) => `${good}판까지 봐도 성적이 꺾이는 지점이 없었습니다.`,
    en: (good: number) => `No drop-off found even out to game ${good}.`,
    ja: (good: number) => `${good}戦まで見ても落ち込む地点はありませんでした。`,
  } as F<[number]>,
  bandFromStart: {
    ko: (pp: number) => `세션 길이 문제가 아닙니다. 첫 5판부터 평균보다 ${pp}%p 낮습니다.`,
    en: (pp: number) => `Not a session-length problem — the first 5 games already sit ${pp}%p below your average.`,
    ja: (pp: number) => `試合数の問題ではありません。最初の5戦から平均より${pp}%p 低いです。`,
  } as F<[number]>,
  bandSharp: {
    ko: (good: number, stop: number, pp: number) =>
      `한 세션 ${good}판까지는 평균 이상이었고, ${stop}판을 넘기면 ${pp}%p 급락합니다.`,
    en: (good: number, stop: number, pp: number) =>
      `Above average through ${good} games; past ${stop} it drops ${pp}%p.`,
    ja: (good: number, stop: number, pp: number) =>
      `1セッション${good}試合までは平均以上、${stop}試合を超えると${pp}%p 急落します。`,
  } as F<[number, number, number]>,
  bandNoGain: {
    ko: (from: number, to: number) => `${from}~${to}판째는 이겨도 레이팅이 거의 안 오릅니다.`,
    en: (from: number, to: number) => `Games ${from}–${to} win but barely move your rating.`,
    ja: (from: number, to: number) => `${from}〜${to}戦目は勝ってもレートがほぼ動きません。`,
  } as F<[number, number]>,
  bandThinShort: {
    ko: (games: number) => `${games}판을 하셨지만 세션이 짧아 뒷구간 표본이 없습니다. 짧게 자주 하시는 편입니다.`,
    en: (games: number) => `${games} games, but short sessions leave the later buckets empty — you play in bursts.`,
    ja: (games: number) => `${games}試合ありますが、1回が短く後半のサンプルがありません。短時間を頻繁に遊ぶ型です。`,
  } as F<[number]>,
  bandThin: {
    ko: '권장 판수를 말하기엔 표본이 부족합니다.',
    en: 'Not enough data to recommend a session length.',
    ja: '推奨試合数を言うにはサンプルが足りません。',
  } as S,
  streakNow: {
    ko: (n: number) => ` 지금 ${n}연패 중입니다.`,
    en: (n: number) => ` You're on a ${n}-game losing streak.`,
    ja: (n: number) => ` 現在${n}連敗中です。`,
  } as F<[number]>,
  formEmpty: {
    ko: (n: number) =>
      `흐름을 판단하려면 경기가 더 필요합니다. 지금은 ${n}판이라 “물이 올랐다/식었다”를 말할 근거가 없습니다.`,
    en: (n: number) =>
      `Not enough matches to call the form. At ${n} games there's no basis for "hot" or "cold".`,
    ja: (n: number) =>
      `調子を判断するには試合が足りません。${n}戦では「絶好調／冷えた」と言う根拠がありません。`,
  } as F<[number]>,

  // ── 캐릭터·매치업 ──
  charsNote: {
    ko: '가운데가 50%입니다. 오른쪽으로 길수록 잘 쓰는 캐릭터입니다.',
    en: 'Center is 50%. The farther right, the better that character performs.',
    ja: '中央が50%です。右に長いほど得意なキャラです。',
  } as S,
  strongOpp: { ko: '강한 상대', en: 'You beat', ja: '得意な相手' } as S,
  weakOpp: { ko: '까다로운 상대', en: 'You struggle with', ja: '苦手な相手' } as S,
  matchupsNote: {
    ko: '5판 이상 붙어본 상대 캐릭터 기준입니다.',
    en: 'Opponent characters you have faced at least 5 times.',
    ja: '5戦以上対戦した相手キャラが対象です。',
  } as S,
  matchupsEmpty: {
    ko: '같은 캐릭터를 5판 이상 만난 기록이 아직 없습니다. 상대별 유불리는 표본이 쌓여야 의미가 생깁니다.',
    en: "You haven't faced any single character 5+ times yet. Matchup numbers only mean something once samples build up.",
    ja: '同じキャラと5戦以上した記録がまだありません。相性はサンプルが貯まって初めて意味を持ちます。',
  } as S,
  waitingSample: { ko: '표본이 쌓이면 표시됩니다', en: 'Shown once samples build up', ja: 'サンプルが貯まれば表示されます' } as S,

  // ── 시즌 ──
  seasonsNote: {
    ko: '시즌 이름을 누르면 그 시즌만 따로 볼 수 있습니다.',
    en: 'Click a season to scope the whole report to it.',
    ja: 'シーズン名を押すと、そのシーズンだけを表示できます。',
  } as S,
  seasonBest: { ko: '최고 승률', en: 'best', ja: '最高勝率' } as S,

  // ── 시간대 ──
  bestHour: { ko: '가장 강한 시간대', en: 'Best hour', ja: '最も強い時間帯' } as S,
  worstHour: { ko: '가장 약한 시간대', en: 'Worst hour', ja: '最も弱い時間帯' } as S,
  bestDay: { ko: '가장 강한 요일', en: 'Best day', ja: '最も強い曜日' } as S,
  worstDay: { ko: '가장 약한 요일', en: 'Worst day', ja: '最も弱い曜日' } as S,
  whenNote: {
    ko: (min: number) => `${min}판 이상 뛴 구간만 비교했습니다. 표본이 적은 시간대는 제외됩니다.`,
    en: (min: number) => `Only buckets with ${min}+ games are compared. Thin slots are excluded.`,
    ja: (min: number) => `${min}戦以上の区間のみ比較しています。サンプルの少ない時間帯は除外されます。`,
  } as F<[number]>,
  whenEmpty: {
    ko: '시간대별로 나누기엔 경기가 부족합니다.',
    en: 'Not enough matches to break down by time of day.',
    ja: '時間帯で分けるには試合が足りません。',
  } as S,

  // ── 실력차 ──
  gapUp: { ko: '나보다 위', en: 'Stronger', ja: '格上' } as S,
  gapEven: { ko: '비슷한 상대', en: 'Even', ja: '互角' } as S,
  gapDown: { ko: '나보다 아래', en: 'Weaker', ja: '格下' } as S,
  gapNote: {
    ko: '레이팅 차 50 기준입니다. 위쪽 상대 승률이 전체 승률보다 그 사람의 실력을 잘 보여줍니다.',
    en: 'Split at a 50-point rating gap. Your rate against stronger opponents says more than the overall number.',
    ja: 'レート差50を基準に分けています。格上相手の勝率のほうが総合勝率より実力を表します。',
  } as S,
  gapEmpty: {
    ko: '레이팅이 붙은 경기가 부족해 실력차를 나눌 수 없습니다.',
    en: 'Not enough rated matches to split by opponent strength.',
    ja: 'レートの付いた試合が少なく、格差で分けられません。',
  } as S,

  // ── 세부 지표 ──
  roundWr: { ko: '라운드 승률', en: 'Round win rate', ja: 'ラウンド勝率' } as S,
  closeWr: { ko: '접전 승률', en: 'Close-set win rate', ja: '接戦勝率' } as S,
  closeNote: { ko: '1라운드 차 승부', en: 'decided by one round', ja: '1ラウンド差の勝負' } as S,
  shutoutWr: { ko: '완승 비율', en: 'Shutout rate', ja: '完封率' } as S,
  shutoutNote: { ko: '3-0 승리', en: '3-0 wins', ja: '3-0での勝利' } as S,
  charsUsed: { ko: '사용 캐릭터', en: 'Characters used', ja: '使用キャラ数' } as S,
  bestStreak: { ko: '최장 연승', en: 'Longest win streak', ja: '最長連勝' } as S,

  // ── 꼬리말 ──
  cta: {
    ko: '전체 통계 16개 항목 보기 →',
    en: 'See all 16 stat tabs →',
    ja: '全16項目の統計を見る →',
  } as S,
  credit: {
    ko: `데이터: wank.wavu.wiki (랭크전) · ${SITE_HOST}`,
    en: `Data: wank.wavu.wiki (ranked) · ${SITE_HOST}`,
    ja: `データ: wank.wavu.wiki (ランクマッチ) · ${SITE_HOST}`,
  } as S,
};

/** 집계가 내는 한국어 요일 라벨(일/월/…)을 표시 언어로 옮긴다. */
const WEEKDAY: Record<Lang, Record<string, string>> = {
  ko: { 일: '일요일', 월: '월요일', 화: '화요일', 수: '수요일', 목: '목요일', 금: '금요일', 토: '토요일' },
  en: { 일: 'Sunday', 월: 'Monday', 화: 'Tuesday', 수: 'Wednesday', 목: 'Thursday', 금: 'Friday', 토: 'Saturday' },
  ja: { 일: '日曜', 월: '月曜', 화: '火曜', 수: '水曜', 목: '木曜', 금: '金曜', 토: '土曜' },
};

export const weekdayText = (lang: Lang, ko: string) => WEEKDAY[lang][ko] ?? ko;

/** '13시' → 'oo시' / '13:00'. 집계 라벨이 한국어라 표시용으로만 바꾼다. */
export function hourText(lang: Lang, ko: string): string {
  const h = ko.replace(/\D/g, '');
  if (!h) return ko;
  return lang === 'ko' ? `${h}시` : lang === 'ja' ? `${h}時` : `${h}:00`;
}
