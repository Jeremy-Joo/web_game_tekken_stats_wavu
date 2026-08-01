// 흐름 탭 한 줄 농담 모음.
//
// 수위(mood)는 lib/tekken/advice.ts 가 **실제 숫자**로 정한다 — 최근 20경기 승률이
// 자기 평균에서 벗어난 정도(%p)와 현재 연패 수. 근거 없이 놀리지 않기 위해서다.
// 이 파일은 그 판정에 붙일 문구만 갖는다.
//
// 고르는 방식: 무작위가 아니라 **데이터에서 나온 씨앗**으로 고른다.
// Math.random 을 쓰면 화면이 다시 그려질 때마다 문구가 바뀌어 산만하고,
// 조회 결과가 같은데 말이 달라지면 신뢰가 깎인다.
//
// 톤 규칙: 승률을 인생(주식·연애·건강)에 빗대는 자조 개그. 놀리되 비하하지 않는다.
// 실제로 힘든 주제(건강 악화·정신건강 등)를 소재로 삼지 않는다 — 웃기려다 다치게 한다.

import type { Lang } from './i18n';

export type Mood = 'hot' | 'steady' | 'cooling' | 'cold';

/** pp = 최근 폼 편차(%p, 부호 있음), streak = 현재 연패 수 */
type JokeFn = (pp: number, streak: number) => string;

/**
 * `streak` 을 문장에 넣는 농담은 연패가 실제로 이어질 때만 쓸 수 있다.
 * (수위는 승률 하락만으로도 내려갈 수 있어서, 그때 연패 문구를 뽑으면
 *  "0연패 중입니다" 같은 말이 나온다. 실제로 나왔던 버그다.)
 */
type Joke = JokeFn | { needsStreak: true; fn: JokeFn };

/** 연패 문구를 쓸 수 있는 최소 연패 수. */
const STREAK_MIN = 2;

const s = (fn: JokeFn): Joke => ({ needsStreak: true, fn });

const abs = (n: number) => Math.abs(n);

const JOKES: Record<Mood, Record<Lang, Joke[]>> = {
  // ── 🔥 물 올랐을 때: 칭찬하되 한 번 비튼다 ──
  hot: {
    ko: [
      (pp) => `주식도 이렇게 올라야 하는 건데… 최근 20경기가 평균보다 ${pp}%p 높습니다.`,
      () => `승률이 좋으시군요. 건강도 일상도 당연히 챙기고 계시겠죠?`,
      (pp) => `최근 폼 +${pp}%p. 이 그래프를 통장에도 붙여넣고 싶습니다.`,
      () => `지금 실력이 인생 그래프였다면 진작 은퇴하셨을 겁니다.`,
      (pp) => `+${pp}%p. 오늘의 당신에게 조언할 자격이 있는 사람은 없습니다.`,
      () => `이겨서 기분 좋은 게 아니라, 기분이 좋아서 이기는 겁니다. 아마도요.`,
    ],
    en: [
      (pp) => `If only stocks moved like this — last 20 games are ${pp}%p above your average.`,
      () => `Great win rate. Surely your sleep and diet are equally on point?`,
      (pp) => `Form +${pp}%p. I'd like to paste this graph into my bank account.`,
      () => `If life had this curve, you'd have retired already.`,
      (pp) => `+${pp}%p. Nobody is qualified to give you advice today.`,
      () => `You're not winning because you feel good. You feel good because you're winning. Probably.`,
    ],
    ja: [
      (pp) => `株もこう上がってほしい… 直近20試合が平均より${pp}%p 高いです。`,
      () => `勝率いいですね。健康も生活もきっと整ってるんですよね？`,
      (pp) => `直近 +${pp}%p。このグラフを口座にも貼りたい。`,
      () => `人生のグラフがこれなら、とっくに引退してます。`,
      (pp) => `+${pp}%p。今日のあなたに助言できる人はいません。`,
      () => `気分がいいから勝つのか、勝つから気分がいいのか。たぶん後者。`,
    ],
  },

  // ── 📊 평소대로: 심심함을 소재로 ──
  steady: {
    ko: [
      () => `기복이 없습니다. 좋게 말하면 안정적이고, 나쁘게 말하면 성장도 없습니다.`,
      () => `평소와 똑같습니다. 인생도 이렇게 예측 가능하면 좋을 텐데요.`,
      () => `변동 없음. 주식이었다면 아주 건전한 종목입니다. 재미는 없고요.`,
      () => `평균 그대로 하고 있습니다. 재미없지만 그게 제일 어려운 겁니다.`,
      () => `오늘의 당신은 어제의 당신과 통계적으로 구분되지 않습니다.`,
    ],
    en: [
      () => `No swings. Generously: consistent. Honestly: not improving either.`,
      () => `Right at your usual level. If only life were this predictable.`,
      () => `Flat. As a stock, very healthy. As entertainment, less so.`,
      () => `Exactly average — boring, and the hardest thing to keep doing.`,
      () => `Today's you is statistically indistinguishable from yesterday's you.`,
    ],
    ja: [
      () => `波がありません。よく言えば安定、悪く言えば伸びもなし。`,
      () => `いつも通りです。人生もこれくらい読めたらいいのに。`,
      () => `変動なし。株なら優良銘柄。面白みはゼロ。`,
      () => `平均どおり。地味ですが、それが一番難しい。`,
      () => `今日のあなたは昨日のあなたと統計的に区別がつきません。`,
    ],
  },

  // ── 🥶 식어갈 때: 위로 반, 놀림 반 ──
  cooling: {
    ko: [
      (pp) => `주식 그래프가 떨어져도 승률은 올라야 하는 거 아닙니까? 최근 ${abs(pp)}%p 하락입니다.`,
      s((_, s) => `${s}연패 중입니다. 다음 판이 복수전일지 ${s + 1}연패일지는 아무도 모릅니다.`),
      (pp) => `'한 판만 더'는 통계적으로 거짓말입니다. 최근 ${abs(pp)}%p 하락.`,
      () => `사랑에 실패했어도 게임은 성공했어야 하는 거 아닙니까?`,
      (pp) => `손이 식은 게 아니라 마음이 식었습니다. 최근 ${abs(pp)}%p 하락.`,
      s((_, s) => `${s}연패. 상대가 강한 게 아니라 당신이 잠깐 약해진 겁니다. 잠깐이길 바랍니다.`),
    ],
    en: [
      (pp) => `Stocks can fall, but your win rate? Down ${abs(pp)}%p lately.`,
      s((_, s) => `${s} losses in a row. Nobody knows if the next is revenge or number ${s + 1}.`),
      (pp) => `"One more game" is statistically a lie. Down ${abs(pp)}%p.`,
      () => `Love may fail, but the game was supposed to work out.`,
      (pp) => `Your hands aren't cold — your heart is. Down ${abs(pp)}%p.`,
      s((_, s) => `${s} straight. They're not stronger; you're briefly weaker. Hopefully briefly.`),
    ],
    ja: [
      (pp) => `株は落ちても勝率は上がるべきでは？ 直近${abs(pp)}%p 低下。`,
      s((_, s) => `${s}連敗中。次が復讐か${s + 1}連敗かは誰にも分かりません。`),
      (pp) => `「あと1戦」は統計的に嘘です。直近${abs(pp)}%p 低下。`,
      () => `恋に失敗しても、ゲームは成功するはずだったのでは？`,
      (pp) => `手が冷えたのではなく心が冷えました。直近${abs(pp)}%p 低下。`,
      s((_, s) => `${s}連敗。相手が強いのではなく、あなたが一時的に弱いだけ。一時的だといいですね。`),
    ],
  },

  // ── 💀 심각할 때: 블랙유머 + 그만두기를 권함 ──
  cold: {
    ko: [
      (pp) => `최근 ${abs(pp)}%p 하락. 철권이 문제가 아닙니다. 농사 짓는 게임을 켜세요.`,
      s((_, s) => `${s}연패. 이쯤 되면 캐릭터가 아니라 우주가 당신을 막고 있습니다.`),
      () => `지금 계속하면 내일의 당신이 오늘의 당신을 원망합니다.`,
      (pp) => `최근 ${abs(pp)}%p 하락. 오늘은 승리보다 수면이 레이팅에 도움이 됩니다.`,
      () => `게임을 끄는 것도 실력입니다. 그리고 지금 배울 수 있는 건 그것뿐입니다.`,
      s((_, s) => `${s}연패. 주식이었으면 벌써 손절했을 구간입니다.`),
    ],
    en: [
      (pp) => `Down ${abs(pp)}%p. Tekken isn't the problem today. Go boot up a farming game.`,
      s((_, s) => `${s} losses straight. At this point it's not the matchup, it's the universe.`),
      () => `Keep going and tomorrow-you will resent today-you.`,
      (pp) => `Down ${abs(pp)}%p. Sleep will do more for your rating than another set.`,
      () => `Turning the game off is a skill too — and the only one available right now.`,
      s((_, s) => `${s} in a row. If this were a stock, you'd have sold already.`),
    ],
    ja: [
      (pp) => `直近${abs(pp)}%p 低下。今日は鉄拳が問題ではありません。農業ゲームを起動しましょう。`,
      s((_, s) => `${s}連敗。もうキャラではなく宇宙があなたを止めています。`),
      () => `このまま続けると、明日のあなたが今日のあなたを恨みます。`,
      (pp) => `直近${abs(pp)}%p 低下。今日は勝利より睡眠のほうがレートに効きます。`,
      () => `ゲームを消すのも実力です。今日学べるのはそれだけかもしれません。`,
      s((_, s) => `${s}連敗。株ならとっくに損切りしている場面です。`),
    ],
  },
};

/**
 * 문구 하나 고르기.
 * `seed` 는 조회 결과에서 나온 안정적인 정수(예: 경기 수 + 연패×7)를 넘긴다 —
 * 같은 조회에서는 항상 같은 문구가 나오고, 조회가 달라지면 문구도 달라진다.
 */
export function pickJoke(
  mood: Mood,
  lang: Lang,
  seed: number,
  pp: number,
  streak: number,
): string {
  // 연패가 없으면 연패를 소재로 한 문구는 후보에서 뺀다.
  const pool = JOKES[mood][lang].filter(
    (j) => typeof j === 'function' || streak >= STREAK_MIN,
  );
  if (pool.length === 0) return ''; // 이론상 없지만, 빈 문구가 잘못된 문구보다 낫다
  const i = ((Math.trunc(seed) % pool.length) + pool.length) % pool.length;
  const j = pool[i];
  return (typeof j === 'function' ? j : j.fn)(pp, streak);
}
