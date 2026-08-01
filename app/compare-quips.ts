// 비교 모드 전용 한 줄 멘트.
//
// 한 명 모드(app/jokes.ts)와 파일을 나눈 이유: 소재가 아예 다르다.
// 혼자일 때는 '내 흐름'이 소재지만, 둘 이상이면 '누가 앞서고 누가 올라오는가'가 소재다.
// 한 파일에 섞으면 어느 쪽 문구인지 헷갈려 잘못 가져다 쓰기 쉽다.
//
// 판정은 전부 **개요 탭에 이미 계산된 값**으로 한다 — 추가 수집도 계산도 없다.
// 표시 여부는 한 명 모드와 같은 스위치(한 줄 멘트 표시)를 쓴다.
//
// 톤: 둘 중 누구도 편들지 않는다. 관전자의 말투로 쓴다 —
// 비교는 본인이 아닌 사람도 보게 되므로, 한쪽을 깎으면 그 사람이 상처받는다.

import type { Lang } from './i18n';

/** 안정적인 씨앗으로 하나 고르기 (Math.random 을 쓰지 않는 이유는 jokes.ts 참조). */
function pick<T>(pool: T[], seed: number): T {
  const i = ((Math.trunc(seed) % pool.length) + pool.length) % pool.length;
  return pool[i];
}

/* ═══════════════ ① 비교 요약 (결과 맨 위) ═══════════════ */

export type SummaryTone =
  | 'sameLeader' // 현재도 흐름도 같은 사람
  | 'flipping' // 현재 1위와 최근 폼 1위가 다르다 — 제일 재밌는 경우
  | 'tight' // 레이팅 차이가 근소
  | 'blowout'; // 차이가 크다

export interface SummaryFacts {
  leader: string; // 현재 레이팅 1위
  gap: number; // 1위와 2위의 레이팅 차이
  formLeader: string; // 최근 20경기 승률 1위
  players: number;
}

type SumFn = (f: SummaryFacts) => string;

const SUMMARY: Record<SummaryTone, Record<Lang, SumFn[]>> = {
  sameLeader: {
    ko: [
      (f) => `현재도 흐름도 ${f.leader} 쪽입니다. 반박할 숫자가 없습니다.`,
      (f) => `${f.leader}가 ${f.gap} 앞서 있고 최근 폼도 위입니다. 지금은 이견이 없네요.`,
      (f) => `${f.leader}의 시간입니다. 나머지는 다음 시즌을 기약하시죠.`,
      (f) => `레이팅도 최근 폼도 ${f.leader}. 통계가 한쪽만 편들고 있습니다.`,
      (f) => `${f.leader}가 앞서고, 심지어 더 잘하고 있는 중입니다. 야속하죠.`,
      (f) => `지금 기준으로는 ${f.leader}입니다. '지금 기준'이라는 말이 중요합니다.`,
      (f) => `${f.gap} 차이. 게다가 흐름까지 ${f.leader} 쪽이라 좁히기 쉽지 않겠습니다.`,
      (f) => `${f.leader}가 두 지표 모두 위입니다. 나머지 분들은 연습 모드가 기다립니다.`,
      (f) => `숫자만 보면 ${f.leader}. 숫자 말고 볼 게 있냐고 물으신다면 없습니다.`,
      (f) => `${f.leader} 우세. 다만 철권은 통계로 이기는 게임이 아니라는 점만 위안입니다.`,
      (f) => `현재 1위 ${f.leader}, 상승세도 ${f.leader}. 재미없는 결론이지만 사실입니다.`,
      (f) => `${f.leader}가 앞서 있습니다. 다들 이미 알고 계셨겠지만요.`,
    ],
    en: [
      (f) => `${f.leader} leads on both rating and recent form. Not much to argue with.`,
      (f) => `${f.leader} is ${f.gap} ahead and still climbing.`,
      (f) => `Both metrics point to ${f.leader}. Boring, but true.`,
      (f) => `It's ${f.leader}'s moment. Everyone else, see you next season.`,
    ],
    ja: [
      (f) => `現在も流れも${f.leader}。反論できる数字がありません。`,
      (f) => `${f.leader}が${f.gap}リード、しかも調子も上。`,
      (f) => `両指標とも${f.leader}。地味な結論ですが事実です。`,
      (f) => `今は${f.leader}の時間です。`,
    ],
  },
  flipping: {
    ko: [
      (f) => `지금은 ${f.leader}가 앞서지만 최근 20경기는 ${f.formLeader}가 낫습니다. 뒤가 조용하지 않네요.`,
      (f) => `레이팅은 ${f.leader}, 흐름은 ${f.formLeader}. 이런 게 제일 무섭습니다.`,
      (f) => `${f.leader}가 ${f.gap} 앞서 있는데 ${f.formLeader}가 따라붙고 있습니다. 지켜볼 만합니다.`,
      (f) => `순위는 ${f.leader}, 기세는 ${f.formLeader}. 다음 달에 다시 보시죠.`,
      (f) => `${f.formLeader}가 올라오는 중입니다. ${f.leader}는 지금 뒤를 봐야 합니다.`,
      (f) => `현재 1위와 상승세 1위가 다릅니다. 이 표에서 제일 재밌는 대목이죠.`,
      (f) => `${f.leader}의 리드는 과거형이고 ${f.formLeader}의 상승은 현재진행형입니다.`,
      (f) => `숫자는 ${f.leader} 편인데 흐름은 ${f.formLeader} 편입니다. 둘 다 맞습니다.`,
      (f) => `${f.formLeader}가 최근에 잘하고 있습니다. ${f.gap} 차이는 생각보다 빨리 줄어듭니다.`,
      (f) => `${f.leader}는 지키는 입장, ${f.formLeader}는 쫓는 입장. 보통 쫓는 쪽이 더 즐겁습니다.`,
      (f) => `레이팅과 폼이 갈렸습니다. 이럴 때 붙으면 결과를 아무도 못 맞힙니다.`,
      (f) => `${f.formLeader}의 최근 폼이 좋습니다. ${f.leader}, 연습 모드 문 열려 있습니다.`,
    ],
    en: [
      (f) => `${f.leader} leads by ${f.gap}, but ${f.formLeader} has the better recent form. Watch this space.`,
      (f) => `Rating says ${f.leader}. Momentum says ${f.formLeader}. Both are right.`,
      (f) => `${f.leader}'s lead is past tense; ${f.formLeader}'s climb is present tense.`,
      (f) => `Current leader and form leader disagree — the most interesting row here.`,
    ],
    ja: [
      (f) => `今は${f.leader}が上ですが、直近20試合は${f.formLeader}が上。油断できません。`,
      (f) => `レートは${f.leader}、流れは${f.formLeader}。どちらも正しい。`,
      (f) => `${f.leader}のリードは過去形、${f.formLeader}の上昇は現在進行形です。`,
      (f) => `順位と勢いが食い違っています。ここが一番面白い。`,
    ],
  },
  tight: {
    ko: [
      (f) => `${f.gap} 차이. 이 정도면 그날 컨디션이 순위를 정합니다.`,
      () => `거의 붙어 있습니다. 다음에 만나면 재밌겠네요.`,
      (f) => `${f.gap} 차이는 한 세션이면 뒤집힙니다. 둘 다 아실 겁니다.`,
      () => `우열을 가리기 어렵습니다. 통계가 판정을 포기했습니다.`,
      (f) => `${f.leader}가 앞서긴 하는데, 자랑할 만한 차이는 아닙니다.`,
      () => `이 정도 차이면 순위보다 컨디션 관리가 답입니다.`,
      () => `숫자상 우열이 없습니다. 직접 붙어서 정하시죠.`,
      (f) => `${f.gap}. 이 숫자로 싸우기엔 서로 너무 비슷합니다.`,
      () => `팽팽합니다. 이런 비교가 제일 볼 맛 납니다.`,
      () => `누가 위인지 물으시면, 오늘 잘 잔 쪽이라고 답하겠습니다.`,
      (f) => `${f.leader}가 근소하게 앞섭니다. 근소하다는 말에 방점이 있습니다.`,
      () => `차이가 오차 범위입니다. 다음 세션에 다시 보시죠.`,
    ],
    en: [
      (f) => `${f.gap} apart. At this range, whoever slept better wins.`,
      () => `Too close to call. The stats have given up refereeing.`,
      (f) => `${f.gap} flips in a single session. You both know it.`,
      () => `Dead even. This is the fun kind of comparison.`,
    ],
    ja: [
      (f) => `${f.gap}差。ここまで来ると、その日の調子で決まります。`,
      () => `ほぼ互角。統計が判定を放棄しました。`,
      (f) => `${f.gap}差は1セッションでひっくり返ります。`,
      () => `拮抗しています。こういう比較が一番面白い。`,
    ],
  },
  blowout: {
    ko: [
      (f) => `${f.gap} 차이입니다. 같은 게임을 하고 있는 게 맞나 싶은 수치죠.`,
      (f) => `${f.leader}가 멀리 있습니다. 목표로 삼기엔 좋은 거리입니다.`,
      (f) => `${f.gap} 차이. 이건 비교라기보다 관람에 가깝습니다.`,
      (f) => `${f.leader}와의 거리가 상당합니다. 그래도 어제보다는 가까워졌겠죠.`,
      (f) => `격차가 큽니다. 좋은 소식은 배울 게 그만큼 많다는 겁니다.`,
      (f) => `${f.leader}는 다른 구간에 있습니다. 같이 놓고 보기가 미안할 정도네요.`,
      (f) => `${f.gap}. 이 숫자를 보고 포기하지 않는 게 실력의 시작입니다.`,
      (f) => `${f.leader} 쪽으로 확실히 기울었습니다. 다음 비교는 좀 더 좁혀서 해보시죠.`,
      (f) => `차이가 큽니다. 리플레이를 보실 거면 ${f.leader} 쪽을 보세요.`,
      (f) => `${f.gap} 차이는 하루아침에 안 좁혀집니다. 대신 확실히 좁혀집니다.`,
      (f) => `${f.leader}가 압도합니다. 비교 대상을 바꾸면 기분이 나아집니다.`,
      (f) => `숫자가 이 정도로 갈리면 할 말이 별로 없습니다. 축하와 위로를 동시에 드립니다.`,
    ],
    en: [
      (f) => `${f.gap} apart. Are these two playing the same game?`,
      (f) => `${f.leader} is far ahead — which makes for a clear target.`,
      (f) => `Big gap. The upside: that's a lot left to learn.`,
      (f) => `If you're going to watch replays, watch ${f.leader}'s.`,
    ],
    ja: [
      (f) => `${f.gap}差。同じゲームをしているのか疑わしい数字です。`,
      (f) => `${f.leader}は遠いですが、目標としてはちょうどいい距離です。`,
      (f) => `差が大きい。良い知らせは、学べることが多いということ。`,
      (f) => `リプレイを見るなら${f.leader}のほうを。`,
    ],
  },
};

export function pickCompareSummary(
  tone: SummaryTone,
  lang: Lang,
  seed: number,
  f: SummaryFacts,
): string {
  return pick(SUMMARY[tone][lang], seed)(f);
}

/* ═══════════════ ② 맞대결 ═══════════════ */

export type H2hTone =
  | 'dominant' // 한쪽이 65% 이상
  | 'edge' // 55~65%
  | 'even' // 45~55%
  | 'few'; // 표본이 적다

export interface H2hFacts {
  leader: string;
  loser: string;
  games: number;
  wr: number; // leader 기준 승률
}

type H2hFn = (f: H2hFacts) => string;

const H2H: Record<H2hTone, Record<Lang, H2hFn[]>> = {
  dominant: {
    ko: [
      (f) => `${f.games}전 ${f.wr}%. 이건 매치업이 아니라 천적입니다.`,
      (f) => `${f.leader}가 ${f.wr}%로 앞섭니다. ${f.loser} 님, 캐릭터를 바꿔보시는 건 어떨까요.`,
      (f) => `${f.games}번 붙어서 ${f.wr}%. 우연이라기엔 표본이 너무 큽니다.`,
      (f) => `${f.leader} 쪽으로 확실히 기울었습니다. 상성이란 게 있긴 있나 봅니다.`,
      (f) => `${f.wr}%. ${f.loser} 님은 이 사람 이름만 봐도 손이 굳으실 겁니다.`,
      (f) => `${f.leader}가 ${f.loser}를 ${f.games}번 만나 대부분 이겼습니다. 할 말이 없네요.`,
      (f) => `이 정도 승률이면 ${f.loser} 님은 리플레이부터 보셔야 합니다.`,
      (f) => `${f.games}전에서 ${f.wr}%. 습관을 완전히 읽혔다는 뜻입니다.`,
      (f) => `${f.leader}의 압승. 다음엔 다른 캐릭터로 만나보시죠.`,
      (f) => `천적 관계 확정입니다. 피하는 것도 전략입니다.`,
      (f) => `${f.wr}%면 실력차보다 상성 문제일 가능성이 큽니다. 위안이 되셨나요.`,
      (f) => `${f.leader}가 ${f.loser}의 공략집을 갖고 있는 것 같습니다.`,
    ],
    en: [
      (f) => `${f.games} games at ${f.wr}%. That's not a matchup, that's a nemesis.`,
      (f) => `${f.leader} owns this one. ${f.loser}, maybe try another character.`,
      (f) => `${f.wr}% over ${f.games} games — the sample is too big for luck.`,
      (f) => `${f.loser} should start with the replays.`,
    ],
    ja: [
      (f) => `${f.games}戦で${f.wr}%。マッチアップではなく天敵です。`,
      (f) => `${f.leader}の圧勝。${f.loser}さん、キャラを変えてみては。`,
      (f) => `${f.games}戦で${f.wr}%。偶然にしては標本が大きすぎます。`,
      (f) => `${f.loser}さんはリプレイから見るべきです。`,
    ],
  },
  edge: {
    ko: [
      (f) => `${f.games}전 ${f.wr}%. ${f.leader}가 조금 위지만 안심할 정도는 아닙니다.`,
      (f) => `근소하게 ${f.leader} 우세. 다음 세트에서 뒤집혀도 이상하지 않습니다.`,
      (f) => `${f.wr}%면 이긴 쪽도 편하게 이긴 건 아닐 겁니다.`,
      (f) => `${f.games}번 만나 ${f.wr}%. 서로 연구가 끝난 사이군요.`,
      (f) => `${f.leader}가 앞서지만 ${f.loser}도 만만치 않습니다. 좋은 라이벌이네요.`,
      (f) => `이 정도 차이면 그날 컨디션이 절반입니다.`,
      (f) => `${f.leader} 쪽이 살짝 유리합니다. 살짝이라는 말이 중요합니다.`,
      (f) => `${f.wr}%. 재대결이 기대되는 숫자입니다.`,
      (f) => `우열은 있지만 결론은 아닙니다. ${f.games}전으로도 부족한가 봅니다.`,
      (f) => `${f.leader}가 조금 낫습니다. ${f.loser} 님, 아직 늦지 않았습니다.`,
      (f) => `팽팽한 편이지만 ${f.leader} 쪽으로 기울어 있습니다.`,
      (f) => `${f.games}전 ${f.wr}%. 이런 관계가 서로를 제일 빨리 늘게 합니다.`,
    ],
    en: [
      (f) => `${f.games} games, ${f.wr}%. ${f.leader} is ahead — but not comfortably.`,
      (f) => `A slight edge to ${f.leader}. Emphasis on slight.`,
      (f) => `Close enough that condition decides half of it.`,
      (f) => `This kind of rivalry makes both of you better fastest.`,
    ],
    ja: [
      (f) => `${f.games}戦 ${f.wr}%。${f.leader}がやや上ですが安心はできません。`,
      (f) => `わずかに${f.leader}有利。「わずかに」が重要です。`,
      (f) => `この差ならその日の調子が半分を決めます。`,
      (f) => `こういうライバル関係が一番伸びます。`,
    ],
  },
  even: {
    ko: [
      (f) => `${f.games}전 ${f.wr}%. 사실상 반반입니다. 이런 상대가 제일 재밌죠.`,
      (f) => `우열이 없습니다. ${f.games}번을 붙고도 결론이 안 났네요.`,
      () => `완전히 팽팽합니다. 다음 판이 곧 결승전입니다.`,
      (f) => `${f.wr}%. 통계가 두 손 들었습니다.`,
      (f) => `${f.games}전을 하고도 반반이면 서로를 너무 잘 아는 겁니다.`,
      () => `막상막하. 이 관계는 오래갑니다.`,
      () => `누가 이길지는 그날 봐야 압니다. 그게 제일 좋은 라이벌이죠.`,
      (f) => `${f.wr}%면 실력이 같다는 뜻입니다. 인정하기 싫으셔도요.`,
      () => `승부가 안 납니다. 계속 붙는 수밖에 없겠네요.`,
      (f) => `${f.games}판을 나눠 가졌습니다. 훌륭한 라이벌입니다.`,
      () => `양쪽 다 상대를 외웠습니다. 이제 새로운 수를 꺼낼 차례죠.`,
      () => `무승부에 가깝습니다. 다음에 만나면 꼭 이기시길.`,
    ],
    en: [
      (f) => `${f.games} games, ${f.wr}%. Effectively even — the best kind of rival.`,
      (f) => `Still unresolved after ${f.games} games.`,
      () => `Dead heat. The next one is the decider.`,
      () => `You've both memorised each other. Time for something new.`,
    ],
    ja: [
      (f) => `${f.games}戦 ${f.wr}%。ほぼ五分。こういう相手が一番面白い。`,
      (f) => `${f.games}戦しても決着がついていません。`,
      () => `完全に互角。次の一戦が決勝です。`,
      () => `お互い手を覚えました。新しい手を出す番です。`,
    ],
  },
  few: {
    ko: [
      (f) => `아직 ${f.games}전뿐입니다. 결론을 내기엔 이릅니다.`,
      (f) => `${f.games}판으로는 아무것도 증명되지 않습니다. 더 붙어보세요.`,
      (f) => `표본이 ${f.games}전. 승률보다 기억에 의존할 단계입니다.`,
      (f) => `${f.games}번 만났습니다. 라이벌이 되기엔 아직 부족하죠.`,
      () => `표본이 적어 숫자를 믿기 어렵습니다. 재밌는 건 이제부터죠.`,
      (f) => `${f.games}전. 이 승률은 다음 한 판에 크게 흔들립니다.`,
      () => `아직 서로를 잘 모르는 사이입니다. 좋은 시작이네요.`,
      (f) => `만난 지 얼마 안 됐습니다. ${f.games}전은 통계라기보다 인사입니다.`,
    ],
    en: [
      (f) => `Only ${f.games} games so far. Too early to conclude anything.`,
      (f) => `${f.games} games proves nothing. Play more.`,
      () => `Small sample — trust memory over the percentage here.`,
      (f) => `${f.games} games is less a statistic than an introduction.`,
    ],
    ja: [
      (f) => `まだ${f.games}戦。結論には早すぎます。`,
      (f) => `${f.games}戦では何も証明できません。もっと戦いましょう。`,
      () => `標本が少ないので数字より記憶を信じる段階です。`,
      (f) => `${f.games}戦は統計というより挨拶です。`,
    ],
  },
};

export function pickH2hQuip(
  tone: H2hTone,
  lang: Lang,
  seed: number,
  f: H2hFacts,
): string {
  return pick(H2H[tone][lang], seed)(f);
}

/* ═══════════════ ③ 캐릭터 폭 ═══════════════ */

export type CharsTone = 'wide' | 'similar' | 'narrow';

export interface CharsFacts {
  most: string;
  mostN: number;
  least: string;
  leastN: number;
}

type CharsFn = (f: CharsFacts) => string;

const CHARS: Record<CharsTone, Record<Lang, CharsFn[]>> = {
  wide: {
    ko: [
      (f) => `${f.most}는 ${f.mostN}종, ${f.least}는 ${f.leastN}종. 취향의 문제지 우열은 아닙니다.`,
      (f) => `${f.most}는 다 써보는 쪽, ${f.least}는 하나를 파는 쪽. 둘 다 정답입니다.`,
      (f) => `캐릭터 폭이 ${f.mostN} 대 ${f.leastN}. 철권을 대하는 태도가 다르네요.`,
      (f) => `${f.least}는 ${f.leastN}종에 집중합니다. 깊이로 승부하는 유형이죠.`,
      (f) => `${f.most}가 ${f.mostN}종을 만졌습니다. 손이 여러 개인 모양입니다.`,
      (f) => `한쪽은 넓고 한쪽은 깊습니다. 대회에서는 보통 깊은 쪽이 유리합니다.`,
      (f) => `${f.most}의 ${f.mostN}종은 연구용일 수도, 그냥 못 참는 성격일 수도 있습니다.`,
      (f) => `${f.leastN}종만 쓰는 ${f.least}가 매치업 공부는 더 편할 겁니다.`,
      (f) => `폭이 다릅니다. 캐릭터를 늘리면 재미가, 줄이면 승률이 늘어납니다. 대체로요.`,
      (f) => `${f.most}는 뷔페, ${f.least}는 단골집. 둘 다 배는 부릅니다.`,
    ],
    en: [
      (f) => `${f.most}: ${f.mostN} characters. ${f.least}: ${f.leastN}. Taste, not ranking.`,
      (f) => `One goes wide, the other goes deep. Both work.`,
      (f) => `${f.least} focuses on ${f.leastN} — depth over breadth.`,
      () => `More characters means more fun; fewer means more wins. Usually.`,
    ],
    ja: [
      (f) => `${f.most}は${f.mostN}種、${f.least}は${f.leastN}種。優劣ではなく好みです。`,
      (f) => `一方は広く、一方は深く。どちらも正解です。`,
      (f) => `${f.least}は${f.leastN}種に集中。深さで勝負する型ですね。`,
      () => `キャラを増やすと楽しく、減らすと勝率が上がります。だいたいは。`,
    ],
  },
  similar: {
    ko: [
      (f) => `둘 다 ${f.leastN}~${f.mostN}종. 캐릭터 폭은 비슷하니 실력으로 갈립니다.`,
      () => `캐릭터 수가 비슷합니다. 이 항목으로는 우열을 못 가리겠네요.`,
      () => `둘 다 비슷하게 벌려놨습니다. 서로 이해하실 겁니다.`,
      (f) => `${f.mostN}종과 ${f.leastN}종. 사실상 같은 유형입니다.`,
      () => `폭이 비슷하니 이 표에서 볼 건 승률뿐입니다.`,
      () => `캐릭터 선택 성향이 닮았습니다. 그래서 더 재밌는 비교죠.`,
      () => `둘 다 한 캐릭터로 만족 못 하는 유형입니다. 알아봤습니다.`,
      () => `비슷한 폭. 이제 누가 더 깊이 팠는지가 문제입니다.`,
    ],
    en: [
      (f) => `${f.mostN} vs ${f.leastN} characters — near enough the same.`,
      () => `Similar range. This row won't decide anything.`,
      () => `Same instincts on character choice. That makes it a better comparison.`,
      () => `Equal breadth. Now it's about who went deeper.`,
    ],
    ja: [
      (f) => `${f.mostN}種と${f.leastN}種。ほぼ同じ傾向です。`,
      () => `幅が似ています。この項目では優劣がつきません。`,
      () => `キャラ選びの性格が似ていますね。`,
      () => `幅は同じ。あとはどちらが深く掘ったかです。`,
    ],
  },
  narrow: {
    ko: [
      (f) => `둘 다 ${f.mostN}종 이하. 확실한 주력으로 승부하는 분들이군요.`,
      () => `둘 다 한 우물을 팝니다. 매치업 공부에는 제일 좋은 방식이죠.`,
      () => `주력 하나로 밀어붙이는 유형끼리의 비교입니다. 순수한 실력 싸움이네요.`,
      () => `캐릭터를 안 바꾸는 분들입니다. 이겨도 져도 캐릭 탓은 못 하겠네요.`,
      () => `둘 다 폭이 좁습니다. 대신 그만큼 깊을 겁니다.`,
      () => `주력 캐릭터가 뚜렷합니다. 서로 연구하기도 쉽겠네요.`,
      () => `캐릭터 수가 적다는 건 이미 답을 찾았다는 뜻입니다.`,
      () => `둘 다 외길입니다. 이런 비교가 제일 깔끔하죠.`,
    ],
    en: [
      (f) => `Both under ${f.mostN} characters — committed mains.`,
      () => `Both dig one well. Best way to learn matchups.`,
      () => `Neither of you can blame the character. Pure skill comparison.`,
      () => `Few characters means you already found your answer.`,
    ],
    ja: [
      (f) => `どちらも${f.mostN}種以下。明確なメインで勝負する型です。`,
      () => `どちらも一本道。マッチアップ研究には最適です。`,
      () => `キャラのせいにはできません。純粋な実力比較です。`,
      () => `キャラが少ないのは、もう答えを見つけた証拠です。`,
    ],
  },
};

export function pickCharsQuip(
  tone: CharsTone,
  lang: Lang,
  seed: number,
  f: CharsFacts,
): string {
  return pick(CHARS[tone][lang], seed)(f);
}

/* ═══════════════ ④ 공통 상대 ═══════════════ */

export interface CommonFacts {
  count: number;
  leader: string; // 공통 상대 상대로 평균 승률이 가장 높은 사람
}

type CommonFn = (f: CommonFacts) => string;

const COMMON: Record<'many' | 'few', Record<Lang, CommonFn[]>> = {
  many: {
    ko: [
      (f) => `공통 상대 ${f.count}명. 같은 물에서 노는 사이군요.`,
      (f) => `${f.count}명을 같이 만났습니다. 이쯤이면 생활권이 겹칩니다.`,
      (f) => `같은 상대 ${f.count}명 기준으로는 ${f.leader}가 더 잘 잡습니다.`,
      (f) => `공통 상대가 ${f.count}명이면 비교가 꽤 공정합니다. 같은 시험을 본 셈이죠.`,
      (f) => `${f.count}명이 겹칩니다. 서로 아직 안 만났다면 그게 더 신기하네요.`,
      (f) => `같은 사람들을 상대로 ${f.leader}의 성적이 낫습니다. 표본이 받쳐줍니다.`,
      (f) => `공통 상대 ${f.count}명 — 이 표가 레이팅보다 정직할 수 있습니다.`,
      (f) => `${f.count}명을 공유합니다. 랭크 매칭이 좁은 건지 둘이 열심인 건지.`,
      (f) => `같은 상대들 앞에서 ${f.leader}가 더 나았습니다. 변명거리가 없네요.`,
      (f) => `겹치는 상대가 ${f.count}명. 비교하기 딱 좋은 조건입니다.`,
    ],
    en: [
      (f) => `${f.count} shared opponents. You two swim in the same pool.`,
      (f) => `Against the same people, ${f.leader} does better.`,
      (f) => `${f.count} in common — this table may be more honest than rating.`,
      (f) => `Same exam, different scores. ${f.leader} scored higher.`,
    ],
    ja: [
      (f) => `共通の相手${f.count}人。同じ水で泳いでいますね。`,
      (f) => `同じ相手に対しては${f.leader}のほうが上です。`,
      (f) => `${f.count}人が重複 — この表はレートより正直かもしれません。`,
      (f) => `同じ試験を受けた形です。${f.leader}のほうが高得点でした。`,
    ],
  },
  few: {
    ko: [
      (f) => `공통 상대가 ${f.count}명뿐입니다. 서로 다른 물에서 놀고 계시네요.`,
      (f) => `겹치는 상대가 적습니다(${f.count}명). 비교 조건이 그만큼 다르다는 뜻입니다.`,
      () => `공통 상대가 거의 없습니다. 시간대나 랭크대가 다른 모양이네요.`,
      (f) => `${f.count}명으로는 공정한 비교가 어렵습니다. 참고만 하세요.`,
      () => `만나는 사람이 다릅니다. 승률을 곧이곧대로 비교하면 안 되는 이유죠.`,
      (f) => `공통 상대 ${f.count}명. 표본이 얇아 결론은 미루겠습니다.`,
      () => `서로 다른 세계에서 플레이하고 계십니다. 언젠가 만나시겠죠.`,
      (f) => `겹치는 상대 ${f.count}명이면 이 표는 재미로만 보세요.`,
    ],
    en: [
      (f) => `Only ${f.count} shared opponents. Different pools entirely.`,
      (f) => `Thin overlap (${f.count}) — treat this table as a curiosity.`,
      () => `You face different people. That's why raw win rates don't compare.`,
      () => `Different worlds. You'll meet eventually.`,
    ],
    ja: [
      (f) => `共通の相手は${f.count}人だけ。違う水で泳いでいます。`,
      (f) => `重複が薄い(${f.count}人) — 参考程度に。`,
      () => `対戦相手が違います。勝率をそのまま比べられない理由です。`,
      () => `別々の世界でプレイしています。いつか出会うでしょう。`,
    ],
  },
};

export function pickCommonQuip(
  lang: Lang,
  seed: number,
  f: CommonFacts,
): string {
  // 100명은 '같은 물에서 논다'고 말해도 되는 최소선 (실측: 30k·44k 유저 둘이 1,497명)
  return pick(COMMON[f.count >= 100 ? 'many' : 'few'][lang], seed)(f);
}
