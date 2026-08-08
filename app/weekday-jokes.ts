// 요일 테마 — 흐름 탭 한 줄에 섞여 나간다 (2026-08-09).
//
// app/jokes.ts 와 파일을 나눈 이유: season-jokes.ts 와 같다. **축이 다르다.**
// 기존 농담은 mood(숫자)가 고르지만, 이건 mood 위에 **요일**이 한 겹 더 얹힌다.
//
// ── 왜 6상태인가 ───────────────────────────────────────────────────
// lib/tekken/quip-facts.ts 의 `divergence`(상태 축)는 승률·레이팅이 어긋날 때만
// 값이 있다 — 둘 다 오르는 정상, 둘 다 내리는 정상은 "mood가 맡는다"며 일부러
// 버린다. 요일 테마 넷(영화·정의역사·땅값세금고소득자·동물의왕국) 은 그 버려지는
// 두 상태까지 문구가 있어야 해서, 같은 계산에서 나온 `sixState`(같은 파일, 같은
// wins/net/winLo/winHi) 를 쓴다 — 두 축이 다른 계산으로 갈리면 상태 티어와
// 요일 테마가 같은 조회에서 다른 말을 하게 된다.
//
// ── 요일 배정 ──────────────────────────────────────────────────────
// 월~금만 고정 테마, 토·일은 기존 방식(mood 기반 무작위) 그대로.
// 배정은 **일요일마다 다시 섞인다** — 한 주(일요일 시작) 안에서는 고정, 주가
// 바뀌면 자동으로 재배정된다. Math.random 은 안 쓴다(파일 머리말 규칙과 같은 이유 —
// 같은 조회가 새로고침마다 달라지면 신뢰가 깎인다) — 그 주의 시작일(일요일)을
// 씨앗으로 한 결정론적 셔플이다.
//
// **날짜는 '오늘'(서버 시계)이 아니라 season과 같은 기준을 쓴다** — 호출부가
// 마지막 경기 날짜를 넘긴다. 조회 시점에 따라 같은 데이터가 다른 요일 테마를
// 받으면 "같은 조회는 항상 같은 문구" 원칙이 깨진다.
//
// ── en/ja ─────────────────────────────────────────────────────────
// 영화대사는 en/ja 까지 채웠다(원작 대사가 언어마다 다른 게 자연스러워서).
// 나머지 넷(영화·정의역사·땅값세금고소득자·동물의왕국)은 **아직 ko만 있다.**
// season-jokes.ts 의 en 처럼, 빈 배열이면 호출부가 자동으로 기본 농담으로
// 떨어진다 — 고장이 아니라 의도된 폴백이다. en/ja 는 후속 작업.

import type { Lang } from './i18n';
import type { Mood } from './jokes';

export type WeekdayTheme = 'movie' | 'movieQuote' | 'justiceHistory' | 'realEstateTax' | 'wildlife';

/** `lib/tekken/quip-facts.ts` 의 `sixState.kind`와 동일 — 그쪽이 원본이다. */
export type SixState = 'normalWin' | 'winNoGain' | 'near' | 'loseButGain' | 'flatEven' | 'normalLose';

const WEEKDAY_THEMES: WeekdayTheme[] = ['movie', 'movieQuote', 'justiceHistory', 'realEstateTax', 'wildlife'];

type SixStatePool = Record<SixState, Record<Lang, string[]>>;

// ── 영화 — 승률=주인공/악당, 레이팅 방향=서사 (6상태) ─────────────────
const MOVIE: SixStatePool = {
  normalWin: {
    ko: [
      '영화 속이라면 당신은 주인공이겠군요. 악당을 멋지게 물리쳤고, 출연료도 두둑하시겠네요.',
      '영화 속이라면 당신은 주인공이겠군요. 결말까지 완벽해서 속편 제안이 들어올 정도입니다.',
      '영화 속이라면 당신은 주인공이겠군요. 평론가 별점도, 관객 평점도 다 높게 나왔습니다.',
      '영화 속이라면 당신은 주인공이겠군요. 오프닝 첫 주부터 흥행 신기록을 갈아치웠습니다.',
      '영화 속이라면 당신은 주인공이겠군요. 시상식 시즌에 이름이 오르내릴 만한 한 해입니다.',
    ],
    en: [
      "If this were a movie, you'd be the hero. You beat the villain in style, and the paycheck matches.",
      "If this were a movie, you'd be the hero. The ending was so clean, there's already a sequel offer on the table.",
      "If this were a movie, you'd be the hero. Critics and audiences both gave it top marks.",
      "If this were a movie, you'd be the hero. Opening week alone broke box office records.",
      "If this were a movie, you'd be the hero. The kind of year that gets your name mentioned at awards season.",
    ],
    ja: [
      '映画なら、あなたは主人公です。悪役を華麗に倒し、ギャラもそれなりですね。',
      '映画なら、あなたは主人公です。結末まで完璧で、続編のオファーが来るレベルです。',
      '映画なら、あなたは主人公です。批評家評価も観客評価もどちらも高評価でした。',
      '映画なら、あなたは主人公です。公開初週から興行記録を塗り替えました。',
      '映画なら、あなたは主人公です。授賞式シーズンに名前が挙がってもおかしくない年です。',
    ],
  },
  winNoGain: {
    ko: [
      '영화 속이라면 당신은 주인공이겠군요. 악당은 물리쳤는데, 세금 떼고 나면 남는 게 없는 흥행이네요.',
      '영화 속이라면 당신은 주인공이겠군요. 흥행은 했는데 제작비도 만만치 않았나 봅니다.',
      '영화 속이라면 당신은 주인공이겠군요. 박스오피스 1위인데 정산서를 보면 표정이 안 좋습니다.',
      '영화 속이라면 당신은 주인공이겠군요. 관객은 들었는데 정작 순이익은 배급사가 다 가져갔습니다.',
      '영화 속이라면 당신은 주인공이겠군요. 흥행 순위는 좋은데 정산일마다 한숨이 나옵니다.',
    ],
    en: [
      "If this were a movie, you'd be the hero. You beat the villain, but after taxes there's nothing left of the box office.",
      "If this were a movie, you'd be the hero. It did well at the box office, but production costs weren't cheap either.",
      "If this were a movie, you'd be the hero. Number one at the box office — the settlement statement tells a different story.",
      "If this were a movie, you'd be the hero. The audience showed up — the distributor took the profit.",
      'If this were a movie, you would be the hero. Great box office ranking, sighs every settlement day.',
    ],
    ja: [
      '映画なら、あなたは主人公です。悪役は倒しましたが、税金を引いたら何も残らない興行でした。',
      '映画なら、あなたは主人公です。興行はしましたが、制作費もそれなりにかかったようです。',
      '映画なら、あなたは主人公です。興行成績1位なのに、精算書を見ると表情が曇ります。',
      '映画なら、あなたは主人公です。観客は入りましたが、利益は配給会社が持っていきました。',
      '映画なら、あなたは主人公です。興行順位は良いのに、精算日のたびにため息が出ます。',
    ],
  },
  near: {
    ko: [
      '영화 속이라면 당신은 주인공이겠군요. 악당은 물리쳤는데, 이 작품 손익분기점은 겨우 넘겼습니다.',
      '영화 속이라면 당신은 주인공이겠군요. 흥행 실패는 면했다는 게 이번 작품의 최고 성과입니다.',
      '영화 속이라면 당신은 주인공이겠군요. 다음 주에 순위가 어떻게 될지는 아무도 모릅니다.',
      '영화 속이라면 당신은 주인공이겠군요. 재개봉을 하기엔 애매하고 내리기엔 아쉬운 성적입니다.',
      '영화 속이라면 당신은 주인공이겠군요. 평가는 반반, 정확히 반반입니다.',
    ],
    en: [
      "If this were a movie, you'd be the hero. You beat the villain, but this one barely broke even.",
      "If this were a movie, you'd be the hero. Avoiding a flop is basically the highlight of this one.",
      "If this were a movie, you'd be the hero. Whether it holds the charts next week is anyone's guess.",
      "If this were a movie, you'd be the hero. Too weak for a re-release, too strong to pull yet.",
      "If this were a movie, you'd be the hero. Reviews are split right down the middle.",
    ],
    ja: [
      '映画なら、あなたは主人公です。悪役は倒しましたが、この作品は収支トントンでした。',
      '映画なら、あなたは主人公です。興行的に大コケしなかったことが今回一番の成果です。',
      '映画なら、あなたは主人公です。来週の順位がどうなるかは誰にもわかりません。',
      '映画なら、あなたは主人公です。再上映するには微妙で、打ち切るには惜しい成績です。',
      '映画なら、あなたは主人公です。評価はちょうど半々です。',
    ],
  },
  loseButGain: {
    ko: [
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 그래도 팬은 확실히 있으십니다.',
      '조커 같은 영화 아시죠? 지금 딱 그 장르의 주인공이십니다.',
      '이쯤 되면 안티히어로물 주인공감입니다. 조커도 이렇게 시작했습니다.',
      '빌런이 주인공인 영화, 아시죠? 지금 딱 그 포지션이십니다. 팬도 확실히 있고요.',
      '결말은 비참해도 서사가 있는 악당입니다. 이런 캐릭터가 오히려 오래 회자됩니다.',
    ],
    en: [
      "If this were a movie, you'd be the villain with the tragic ending. Still, you've clearly got fans.",
      "You know those movies where the villain is the protagonist? That's exactly the genre you're headlining right now.",
      "At this point, you're anti-hero material. Joker started out this way too.",
      "You know the genre where the villain is the lead? That's your position right now. And yes, you've got fans.",
      'The ending is tragic, but there is a story here. Characters like this get talked about for years.',
    ],
    ja: [
      '映画なら、あなたは悲劇的な結末を迎える悪役です。それでもファンは確実についています。',
      '悪役が主人公の映画、知っていますよね? 今まさにそのジャンルの主人公です。',
      'ここまでくればアンチヒーロー物の主人公級です。ジョーカーもこうやって始まりました。',
      '悪役が主人公のジャンル、知っていますよね? 今のあなたのポジションです。ファンも確実にいます。',
      '結末は悲劇でも、物語のある悪役です。こういうキャラクターほど長く語り継がれます。',
    ],
  },
  flatEven: {
    ko: [
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 그마저도 딱히 존재감은 없는 역할입니다.',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 엔딩 크레딧에 이름 석 자 올라가는 걸로 만족해야 합니다.',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 예고편에도 안 나온 역할입니다.',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 굿즈로도 안 나오는 캐릭터입니다.',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 팬 미팅 명단에도 안 불립니다.',
    ],
    en: [
      "If this were a movie, you'd be the villain with the tragic ending. Except there's not much presence to speak of either.",
      "If this were a movie, you'd be the villain with the tragic ending. Getting your name in the credits is about all you get.",
      "If this were a movie, you'd be the villain with the tragic ending. You didn't even make the trailer.",
      "If this were a movie, you'd be the villain with the tragic ending. Not even the merchandise features you.",
      "If this were a movie, you'd be the villain with the tragic ending. You didn't make the fan meet lineup either.",
    ],
    ja: [
      '映画なら、あなたは悲劇的な結末を迎える悪役です。ただ、存在感もあまりない役どころです。',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。エンドクレジットに名前が載るだけで満足するしかありません。',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。予告編にすら出てこなかった役どころです。',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。グッズにすらならないキャラクターです。',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。ファンミーティングの出演者リストにも呼ばれません。',
    ],
  },
  normalLose: {
    ko: [
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 시리즈가 몇 편째인데 아직도 이 배역이시네요. 언제까지 악당으로 계실 건가요?',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 이번엔 리부트조차 필요 없는 완패입니다.',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 평론가도 관객도 등을 돌린 결과입니다.',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 팬 사이트 투표에서도 최하위입니다.',
      '영화 속이라면 당신은 결말이 비참한 악당이겠군요. 다음 시리즈 제작 소식조차 없습니다.',
    ],
    en: [
      "If this were a movie, you'd be the villain with the tragic ending. This is what, the fifth sequel, and you're still typecast? How long are you staying the villain?",
      "If this were a movie, you'd be the villain with the tragic ending. This one's a defeat so total it doesn't even need a reboot.",
      "If this were a movie, you'd be the villain with the tragic ending. Critics and audiences both walked away from this one.",
      "If this were a movie, you'd be the villain with the tragic ending. Dead last in the fan site poll, too.",
      "If this were a movie, you'd be the villain with the tragic ending. There isn't even a rumor of a sequel.",
    ],
    ja: [
      '映画なら、あなたは悲劇的な結末を迎える悪役です。シリーズ何作目かなのに、まだこの役どころですね。いつまで悪役を続けるおつもりですか?',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。今回はリブートすら必要ない完敗です。',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。批評家にも観客にも見放された結果です。',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。ファンサイトの投票でも最下位です。',
      '映画なら、あなたは悲劇的な結末を迎える悪役です。続編の噂すらありません。',
    ],
  },
};

// ── 정의·역사 — 강한 판정은 정의/불의, 애매한 둘은 역사(각주 취급)로 ──
const JUSTICE_HISTORY: SixStatePool = {
  normalWin: {
    ko: [
      '아무도 반박할 수 없는 정의입니다.',
      '이의 제기조차 나오지 않는 완승입니다.',
      '판결문을 다시 쓸 필요가 없는 결과입니다.',
      '만장일치 판결입니다.',
      '교과서에 실려도 이상하지 않은 승리입니다.',
    ],
    en: [
      'This is justice nobody can argue with.',
      'A win so clean, not even an objection was raised.',
      'A verdict that does not need a rewrite.',
      'A unanimous verdict.',
      'The kind of win that could go in a textbook.',
    ],
    ja: [
      '誰も反論できない正義です。',
      '異議すら出ない完勝です。',
      '判決文を書き直す必要のない結果です。',
      '満場一致の判決です。',
      '教科書に載ってもおかしくない勝利です。',
    ],
  },
  winNoGain: {
    ko: [
      '정의는 정의인데, 만신창이가 된 정의입니다.',
      '이기긴 이겼는데, 승소 비용이 배상금보다 컸습니다.',
      '정의는 세웠는데, 그 대가로 체력을 다 썼습니다.',
      '승소는 했는데, 다음 재판을 준비할 기력이 없습니다.',
      '정의는 정의인데, 뒤풀이는 조용히 넘어가야 할 정도입니다.',
    ],
    en: [
      'Justice, technically. Just the battered, barely-standing kind.',
      'You won the case — the legal fees just outran the damages.',
      'Justice was served. It just cost every bit of stamina to get there.',
      'You won the case. There is nothing left in the tank for the next one.',
      'Justice, technically. The celebration is going to be a quiet one.',
    ],
    ja: [
      '正義は正義ですが、満身創痍の正義です。',
      '勝訴は勝訴ですが、訴訟費用が賠償金を上回りました。',
      '正義は貫きましたが、その代償で体力を使い果たしました。',
      '勝訴はしましたが、次の裁判に備える気力が残っていません。',
      '正義は正義ですが、打ち上げは静かに済ませるレベルです。',
    ],
  },
  near: {
    ko: [
      '역사에는 남겠지만, 딱 각주 한 줄 분량입니다.',
      '판례집에는 실리겠지만, 뒤쪽 페이지입니다.',
      '기록은 되는데, 다음 학기 시험엔 안 나올 분량입니다.',
      '기록은 남는데, 굳이 찾아보는 사람은 없을 분량입니다.',
      '역사가 일단 적어는 두겠다는 태도입니다.',
    ],
    en: [
      'This will make it into history — as a footnote, exactly one line long.',
      'It will make the case law — somewhere in the back pages.',
      'It gets recorded, but it is not making next semester exam.',
      'It gets recorded, but nobody is going to go looking for it.',
      "History is taking the 'write it down just in case' approach.",
    ],
    ja: [
      '歴史には残りますが、脚注一行分です。',
      '判例集には載りますが、後ろのほうのページです。',
      '記録はされますが、来学期の試験には出ない分量です。',
      '記録は残りますが、わざわざ調べる人はいない分量です。',
      '歴史は「一応書いておく」という態度です。',
    ],
  },
  loseButGain: {
    ko: [
      '정의에 응징당한 불의입니다. 좀 억울하게 당한 쪽이지만요.',
      '패소는 패소인데, 배상금은 오히려 적게 나왔습니다.',
      '유죄 판결은 받았는데, 형량이 예상보다 가볍게 나왔습니다.',
      '패소했는데, 다음 재판에 유리한 판례를 하나 남겼습니다.',
      '졌지만 지는 방식이 나쁘지 않았다는 평가입니다.',
    ],
    en: [
      'Injustice, smitten by justice. Though it is the somewhat wrongly-accused kind.',
      'You lost the case. The damages awarded were smaller than expected, though.',
      'Guilty verdict — but the sentence came in lighter than anyone expected.',
      'You lost, but the ruling left a precedent that helps next time.',
      'A loss, but the kind that earns some respect for how it went down.',
    ],
    ja: [
      '正義に成敗された不義です。ただ、少し理不尽な形で裁かれた側ですが。',
      '敗訴は敗訴ですが、賠償額は思ったより少なく済みました。',
      '有罪判決は受けましたが、量刑は予想より軽く出ました。',
      '敗訴しましたが、次の裁判に有利な判例を一つ残しました。',
      '負けはしましたが、負け方は悪くなかったという評価です。',
    ],
  },
  flatEven: {
    ko: [
      '역사가 기록은 하는데, 아직 뭐라고 부를지는 정하지 못했습니다.',
      '판결은 미뤄졌습니다. 다음 기일을 기다리는 수밖에 없습니다.',
      '증거 불충분으로 오늘은 판단을 보류합니다.',
      '재판부가 오늘은 그냥 넘어가기로 했습니다.',
      '판결 대신 정회를 선택한 하루입니다.',
    ],
    en: [
      'History is taking notes. It just has not decided what to call this yet.',
      'The verdict is postponed. Nothing to do but wait for the next hearing.',
      'Insufficient evidence — the judgment is on hold today.',
      'The court decided to just let today slide.',
      'A day the court chose recess over a ruling.',
    ],
    ja: [
      '歴史は記録していますが、まだ何と呼ぶかは決まっていません。',
      '判決は持ち越しです。次の期日を待つしかありません。',
      '証拠不十分で、今日のところは判断を保留します。',
      '裁判所は今日のところは見送ることにしました。',
      '判決の代わりに休廷を選んだ一日です。',
    ],
  },
  normalLose: {
    ko: [
      '역사가 이미 판결을 내렸습니다. 빼도 박도 못하는 불의입니다.',
      '항소해도 결과는 안 바뀔 것 같은 판결입니다.',
      '역사책에 실명까지 나올 수준의 패배입니다.',
      '재심을 청구해도 결과는 뻔한 판결입니다.',
      '이 판결에는 소수 의견조차 없습니다.',
    ],
    en: [
      'History has already delivered its verdict. Undeniable injustice.',
      'The kind of verdict that would not change even on appeal.',
      'A loss clear enough to make the history books by name.',
      'A verdict so clear that even a retrial would not help.',
      'Not even a dissenting opinion on this one.',
    ],
    ja: [
      '歴史はすでに判決を下しました。言い逃れできない不義です。',
      '控訴しても結果は変わりそうにない判決です。',
      '歴史書に実名で載ってもおかしくない敗北です。',
      '再審を請求しても結果は目に見えている判決です。',
      'この判決には少数意見すらありません。',
    ],
  },
};

// ── 땅값·세금·고소득자 — 능력=승률, 자산=레이팅 ──────────────────────
const REAL_ESTATE_TAX: SixStatePool = {
  normalWin: {
    ko: [
      '능력만큼 자산도 불었습니다. 이제 고소득자 신고 대상이시네요.',
      '이 정도면 세무서에서 먼저 연락이 올 수준입니다.',
      '능력도 자산도 동반 상승 — 이번 분기 실적이 좋습니다.',
      '이 정도면 재무설계사를 알아봐야 할 시점입니다.',
      '자산 증가 속도가 심상치 않습니다. 좋은 쪽으로요.',
    ],
    en: [
      "Your assets grew right along with your skill. You're officially in high-earner territory now.",
      'At this level, the tax office might reach out to you first.',
      'Skill and assets rose together — a strong quarter.',
      'This is the point where you start looking for a financial advisor.',
      'The pace of asset growth is unusual. The good kind of unusual.',
    ],
    ja: [
      '実力どおりに資産も増えました。もう高所得者の申告対象ですね。',
      'このレベルだと、税務署のほうから連絡が来かねません。',
      '実力も資産も同時に上昇 — 今四半期は好調です。',
      'このレベルだと、そろそろファイナンシャルプランナーを探す時期です。',
      '資産の増加ペースがただごとではありません。良い意味で。',
    ],
  },
  winNoGain: {
    ko: [
      '당신의 능력은 좋지만, 그 능력만큼 세금이 크군요.',
      '번 만큼 나가는 구조라, 통장은 그대로입니다.',
      '소득은 늘었는데 실수령액은 그대로인 신기한 달입니다.',
      '이번 달은 세율 구간이 하나 더 올라간 느낌입니다.',
      '숫자는 좋은데 통장 잔고는 그걸 안 믿는 눈치입니다.',
    ],
    en: [
      'Your skill is real. So is the tax bill that comes with it.',
      'You earn it, it goes right back out — the balance never moves.',
      'Income went up, take-home stayed exactly the same. Strange month.',
      'It feels like you jumped a whole tax bracket this month.',
      'The numbers look great. Your bank balance is not convinced.',
    ],
    ja: [
      '実力は確かです。ただ、それに見合うだけ税金も重いですね。',
      '稼いだ分だけ出ていく構造で、通帳の残高は変わりません。',
      '所得は増えたのに手取りはそのまま — 不思議な月です。',
      '今月は税率区分がひとつ上がった感覚です。',
      '数字は良いのに、通帳残高はそれを信じていない様子です。',
    ],
  },
  near: {
    ko: [
      '능력은 늘었는데, 자산은 아직 그걸 못 따라왔습니다. 서류상으로만 고소득자입니다.',
      '심사는 통과했는데, 대출 한도는 아직 그대로입니다.',
      '연봉은 올랐다는데, 체감은 딱히 없는 수준입니다.',
      '승진은 됐는데 명함만 바뀐 수준입니다.',
      '숫자는 올랐는데, 생활은 어제와 똑같습니다.',
    ],
    en: [
      "Your skill went up, but your assets haven't caught up yet. High earner — on paper only.",
      "You passed the review, but the loan limit hasn't moved yet.",
      'The raise is official. It just does not feel like much yet.',
      'You got the promotion. Only the business card changed.',
      'The number went up. Life looks exactly like yesterday.',
    ],
    ja: [
      '実力は上がりましたが、資産がまだ追いついていません。書類上だけの高所得者です。',
      '審査は通りましたが、融資限度額はまだそのままです。',
      '昇給はしたそうですが、体感はあまりありません。',
      '昇進はしましたが、名刺が変わっただけのレベルです。',
      '数字は上がりましたが、生活は昨日とまったく同じです。',
    ],
  },
  loseButGain: {
    ko: [
      '능력은 아직인데 자산은 늘었습니다. 이런 걸 복지라고 부릅니다.',
      '실력 심사는 통과 못 했는데, 지원금은 들어왔습니다.',
      '이건 능력이 아니라 운영 지원 사업 덕분입니다.',
      '능력 심사가 아니라 그냥 운이 좋았습니다.',
      '이건 실력 증명이 아니라 지원 대상 선정입니다.',
    ],
    en: [
      "Your skill isn't there yet, but your assets grew anyway. That's what we call welfare.",
      "You didn't pass the skill review, but the subsidy came through anyway.",
      'Call it luck of the support program, not skill.',
      'It was not a skill review. It was just good luck.',
      'This is not proof of skill — it is qualifying for the program.',
    ],
    ja: [
      '実力はまだですが、資産は増えました。これを福祉と呼びます。',
      '実力審査は通っていませんが、支援金は振り込まれました。',
      'これは実力ではなく、支援事業のおかげです。',
      '実力審査ではなく、ただ運が良かっただけです。',
      'これは実力の証明ではなく、支援対象への選定です。',
    ],
  },
  flatEven: {
    ko: [
      '능력도 자산도 제자리입니다. 세금은 안 내도 되지만, 자랑할 것도 없습니다.',
      '신고할 소득이 없어서 이번엔 서류가 간단합니다.',
      '오르지도 내리지도 않은, 제일 심심한 명세서입니다.',
      '이번 달 가계부는 한 줄로 끝납니다.',
      '변동이 없다는 것도 하나의 기록입니다.',
    ],
    en: [
      'Neither skill nor assets moved. No tax owed, but nothing to brag about either.',
      "No income to report, so at least the paperwork's simple this time.",
      'Neither up nor down — the most boring statement you will get.',
      "This month's ledger fits in one line.",
      'No change is technically still a data point.',
    ],
    ja: [
      '実力も資産も現状維持です。税金は払わなくていいですが、自慢できることもありません。',
      '申告する所得がなく、今回は書類が簡単で済みます。',
      '上がりも下がりもしない、一番退屈な明細書です。',
      '今月の家計簿は一行で終わります。',
      '変動がないというのも、ひとつの記録です。',
    ],
  },
  normalLose: {
    ko: [
      '능력도 자산도 같이 줄었습니다. 이번엔 신고할 것도 없는 상태입니다.',
      '적자 신고서를 써야 할 수준입니다.',
      '이번 분기는 감면이 아니라 결손 처리 대상입니다.',
      '가계부에 마이너스가 익숙해지고 있습니다.',
      '이번 분기는 세무사도 딱히 해줄 말이 없습니다.',
    ],
    en: [
      'Both skill and assets shrank together. Nothing to even report this time.',
      'This is loss-declaration territory.',
      'This quarter is not a tax break, it is a write-off.',
      'Red numbers in the ledger are starting to feel routine.',
      'Even the accountant does not have much to say this quarter.',
    ],
    ja: [
      '実力も資産も一緒に減りました。今回は申告することすらありません。',
      '赤字申告書を書くレベルです。',
      '今四半期は減税ではなく、欠損処理の対象です。',
      '家計簿のマイナスに慣れてきています。',
      '今四半期は税理士も特に言うことがありません。',
    ],
  },
};

// ── 동물의 왕국 — 승률=사냥 성공 여부, 레이팅=먹이사슬 서열 ───────────
const WILDLIFE: SixStatePool = {
  normalWin: {
    ko: [
      '오늘 당신은 먹이사슬 최상위입니다. 사냥도 성공하고 영역도 넓어졌습니다.',
      '무리 안에서 서열이 확실히 올라갔습니다.',
      '오늘은 어떤 상대도 당신 앞에서 도망치는 게 상책이었을 겁니다.',
      '오늘 사냥터의 주인은 당신이었습니다.',
      '무리 전체가 오늘 당신을 따라 움직였을 겁니다.',
    ],
    en: [
      "Today you're at the top of the food chain. The hunt succeeded, and your territory grew.",
      'Your rank in the pack climbed, no question about it.',
      'Today, running was the only smart move for anything that crossed your path.',
      'Today, the hunting ground belonged to you.',
      'The whole pack probably followed your lead today.',
    ],
    ja: [
      '今日のあなたは食物連鎖の頂点です。狩りも成功し、縄張りも広がりました。',
      '群れの中での序列が確実に上がりました。',
      '今日はどんな相手も、あなたの前では逃げるのが正解だったはずです。',
      '今日の狩場の主はあなたでした。',
      '群れ全体が今日はあなたについて動いたはずです。',
    ],
  },
  winNoGain: {
    ko: [
      '사냥엔 성공했습니다. 다만 이 한 번에 오늘 체력을 전부 썼습니다.',
      '잡긴 잡았는데, 이빨이 다 나갈 뻔했습니다.',
      '성공한 사냥인데, 회복하는 데 며칠은 걸릴 겁니다.',
      '사냥은 성공했는데, 다음 사냥은 당분간 못 나갈 몸 상태입니다.',
      '이겼는데 진 것처럼 지쳤습니다.',
    ],
    en: [
      'The hunt succeeded. It just cost you every bit of energy you had today.',
      'You caught it — but you nearly lost your teeth doing it.',
      'A successful hunt, but recovery is going to take a few days.',
      'The hunt succeeded. Your body is in no shape for the next one for a while.',
      'You won, but you are as exhausted as if you had lost.',
    ],
    ja: [
      '狩りは成功しました。ただ、これ一回で今日の体力を使い果たしました。',
      '仕留めはしましたが、牙が折れかけました。',
      '狩りは成功しましたが、回復には数日かかりそうです。',
      '狩りは成功しましたが、次の狩りはしばらく無理な状態です。',
      '勝ったのに、負けたときのように疲れ果てています。',
    ],
  },
  near: {
    ko: [
      '먹잇감은 잡았습니다. 다만 영양가가 없는 먹이였네요.',
      '잡긴 잡았는데, 다음 끼니 걱정은 그대로입니다.',
      '배는 안 고픈데, 배부르지도 않은 애매한 사냥이었습니다.',
      '잡긴 잡았는데, 무리에게 자랑할 정도는 아닙니다.',
      '사냥이었다고 부르기엔 좀 애매한 사냥이었습니다.',
    ],
    en: [
      'You caught something. Just not a very nutritious catch.',
      'You caught something. The next meal is still up in the air, though.',
      'Not hungry, but not full either — an oddly inconclusive hunt.',
      'You caught it, but it is not something to brag to the pack about.',
      'Calling it a hunt is a bit generous.',
    ],
    ja: [
      '獲物は捕まえました。ただ、あまり栄養のない獲物でしたね。',
      '獲物は捕まえましたが、次の食事の心配は変わりません。',
      '空腹ではないけれど満腹でもない、中途半端な狩りでした。',
      '捕まえはしましたが、群れに自慢できるほどではありません。',
      '狩りと呼ぶには少し微妙な狩りでした。',
    ],
  },
  loseButGain: {
    ko: [
      '사냥은 실패했습니다. 다만 상대가 원래 당신보다 훨씬 센 놈이었죠.',
      '도망친 게 아니라 전략적 후퇴였다고 해두죠.',
      '이 정도 상대에게 덤빈 것 자체가 무리 안에서 화제입니다.',
      '이길 상대는 아니었지만, 물러서는 타이밍은 완벽했습니다.',
      '무리에서 이 얘기가 한동안 회자될 겁니다 — 좋은 쪽으로요.',
    ],
    en: [
      'The hunt failed. To be fair, that prey was way out of your league to begin with.',
      'Let us call it a strategic retreat, not a chase you lost.',
      'Just going after prey that size is already the talk of the pack.',
      'Not a fight you could win, but the timing of the retreat was perfect.',
      'The pack is going to be talking about this one for a while — the good kind of talk.',
    ],
    ja: [
      '狩りは失敗しました。ただ、相手はもともとあなたよりずっと格上でした。',
      '逃げたのではなく、戦略的撤退だったということにしておきましょう。',
      'あの相手に挑んだこと自体が、群れの中で話題になっています。',
      '勝てる相手ではありませんでしたが、退くタイミングは完璧でした。',
      'この話は群れの中でしばらく語り継がれるはずです。良い意味で。',
    ],
  },
  flatEven: {
    ko: [
      '오늘은 사냥도 없이 그냥 숨어 지낸 날입니다.',
      '발자국 하나 안 남긴, 존재감 없는 하루였습니다.',
      '무리도 당신이 오늘 뭘 했는지 모릅니다.',
      '오늘 하루는 통째로 굴 안에서 지나갔습니다.',
      '사냥 기록에 오늘 날짜가 아예 없습니다.',
    ],
    en: [
      'No hunting today. You just stayed hidden.',
      'Not a single footprint left today. Zero presence.',
      'Even the pack has no idea what you did today.',
      'The whole day passed inside the den.',
      "Today's date is simply missing from the hunting log.",
    ],
    ja: [
      '今日は狩りもせず、ただ身を潜めていた一日でした。',
      '足跡ひとつ残さない、存在感のない一日でした。',
      '群れですら、今日のあなたが何をしていたか知りません。',
      '今日一日はまるごと巣穴の中で過ぎました。',
      '狩りの記録に今日の日付がそもそもありません。',
    ],
  },
  normalLose: {
    ko: [
      '오늘 당신은 포식자가 아니라 먹잇감 쪽이었습니다. 안타깝습니다만 그렇습니다.',
      '무리에서 오늘 순위표가 다시 그려졌습니다. 아래쪽으로요.',
      '오늘 같은 날이 계속되면 서식지를 옮겨야 할 수도 있습니다.',
      '오늘은 쫓기는 쪽이었다는 걸 인정해야 할 것 같습니다.',
      '무리 안에서 조심하라는 얘기가 나올 정도입니다.',
    ],
    en: [
      'Today you were prey, not predator. Unfortunate, but that is what happened.',
      'The pack redrew today rankings. You moved down.',
      'Keep having days like this and it might be time to relocate.',
      'Today, you have to admit you were the one being chased.',
      'Even the pack is starting to say you should be careful.',
    ],
    ja: [
      '今日のあなたは捕食者ではなく、獲物の側でした。残念ながら、それが事実です。',
      '群れの中の順位表が今日、書き換わりました。下方向に。',
      'こんな日が続けば、生息地を変える必要が出てくるかもしれません。',
      '今日は追われる側だったと認めるしかなさそうです。',
      '群れの中でも「気をつけろ」という声が出るレベルです。',
    ],
  },
};

const SIX_STATE_POOLS: Record<'movie' | 'justiceHistory' | 'realEstateTax' | 'wildlife', SixStatePool> = {
  movie: MOVIE,
  justiceHistory: JUSTICE_HISTORY,
  realEstateTax: REAL_ESTATE_TAX,
  wildlife: WILDLIFE,
};

// ── 영화대사 — 유명 대사를 한 구절만 비틀어 쓴다(원문 그대로는 안 옮김,
//    노래 패러디와 같은 저작권 원칙). 끝에 출처를 명시한다.
//
// blazing/frozen 을 hot/cold 로 대충 재사용하던 걸 걷어냈다(2026-08-09) —
// frozen은 JOKES 풀 자체에 "여기서는 놀리지 않는다, 짧게 끄라고만 한다"는
// 설계 원칙이 있다(app/jokes.ts frozen 섹션 머리말 참조). 위트 있는 영화 대사
// 패러디는 그 원칙과 정면으로 부딪힌다 — 그래서 frozen은 **줄을 안 만들고
// 비워서** pickWeekdayJoke 가 null 을 돌려주게 하고, 기존 진지한 frozen 풀로
// 자연히 떨어지게 둔다. blazing은 반대로 조크가 허용되는 구간이라(다만
// "오래 못 간다"는 경고 톤, 실측 6%로 드묾) 전용 줄을 새로 썼다.
const MOVIE_QUOTE_4: Record<'blazing' | 'hot' | 'steady' | 'cooling' | 'cold', Record<Lang, string[]>> = {
  blazing: {
    ko: [
      '신도 가라앉힐 수 없다던 배도 침몰했습니다. 지금 이 기세도 마찬가지입니다. (영화 타이타닉의 대사에서)',
      '"정신 나간 것처럼 좋은 날"이라던 그 대사, 사실 영화 통틀어 딱 하루 얘기였습니다. (영화 매드맥스: 분노의 도로의 대사에서)',
      '"나는 아이언맨이다"급 선언이지만, 그 뒤로 시리즈 내내 위기만 이어졌다는 것도 기억하시길. (영화 아이언맨의 대사에서)',
      '"예이 아드리안, 해냈어!"급 승률입니다. 다만 록키도 다음 편에서 바로 챔피언 자리를 내줬습니다. (영화 록키의 대사에서)',
      '"해적왕이 될 거다"급 선언이지만, 그 여정이 몇 년째인지는 세지 않는 게 정신건강에 좋습니다. (영화 원피스의 대사에서)',
    ],
    en: [
      'Even the ship they called unsinkable went down. This kind of streak is no different. (from a line in Titanic)',
      '"What a lovely day" — turns out that was the one good day in the whole movie. (from a line in Mad Max: Fury Road)',
      '"I am Iron Man" — a great line to say, right before an entire franchise of crises followed it. (from a line in Iron Man)',
      '"Yo Adrian, I did it!" — Rocky said that too, right before losing the title again next movie. (from a line in Rocky)',
      'Declaring you\'ll be "King of the Pirates" is fine — just do not count how many years that journey has been running. (from a line in One Piece)',
    ],
    ja: [
      '神にも沈められないと言われた船も沈みました。今のこの勢いも同じです。(映画『タイタニック』のセリフから)',
      '「最高の日じゃないか」— 実はあの映画で唯一まともだった日でした。(映画『マッドマックス 怒りのデス・ロード』のセリフから)',
      '「私はアイアンマンだ」— 名言ですが、その直後からシリーズはずっと危機の連続でした。(映画『アイアンマン』のセリフから)',
      '「エイドリアン、やったぞ!」— ロッキーもこの後の作品でチャンピオンの座をすぐ失いました。(映画『ロッキー』のセリフから)',
      '「海賊王に俺はなる!」— 宣言してから何年連載が続いているか、数えないほうが精神衛生上いいです。(映画『ONE PIECE』のセリフから)',
    ],
  },
  hot: {
    ko: [
      '"이것이 오늘 승률이다" — 외치기 딱 좋지만, 그 영화도 결국 전멸로 끝났다는 건 다들 압니다. (영화 300의 대사에서)',
      '"지금까지 이런 폼은 없었다"— 그 폼도 어차피 다음 화까진 못 갔습니다. (영화 극한직업의 대사에서)',
      '손모가지를 걸어야지 급의 배짱으로 딴 승률인데, 그 영화 주인공도 결국 판을 접었습니다. (영화 타짜의 대사에서)',
      '회피부동, 즉시 참수 수준의 기세지만, 그 영화도 속편은 안 나왔습니다. (영화 명량의 대사에서)',
      '"속도에 대한 갈증"급 승률이지만, 후속작 나오는 데 36년 걸린 시리즈입니다. 다음 전성기도 그 정도는 각오하시길. (영화 탑건의 대사에서)',
    ],
    en: [
      "This is today's win rate! — great line, though everyone remembers how that ended for the 300. (from a line in 300)",
      "I'm kind of a big deal today. — said right before losing a fight to himself in a phone booth. (from a line in Anchorman)",
      'This is "the need for speed" territory — though the sequel took 36 years to show up. Pace yourself. (from a line in Top Gun)',
      'This is "Show me the money!" energy — right before that character got cut from the roster anyway. (from a line in Jerry Maguire)',
      'This is "To infinity and beyond!" territory — said by a toy who spent the whole movie realizing he could not actually fly. (from a line in Toy Story)',
    ],
    ja: [
      '「これが今日の勝率だ」— 名台詞ですが、その映画の300人がどうなったかは周知の事実です。(映画『300』のセリフから)',
      '「戦闘力で例えるなら、今日は53万です」— そう言った直後、あっさりもっと強い敵が出てきました。(映画『ドラゴンボールZ』のセリフから)',
      '「スピードへの渇望」レベルの勝率ですが、続編が出るまで36年かかったシリーズです。次の絶好調もそれくらい気長にどうぞ。(映画『トップガン』のセリフから)',
      '「俺より強い奴に会いに行く」レベルの自信ですが、大抵すぐにもっと強い奴が現れます。(映画『ドラゴンボールZ』のセリフから)',
      '「無限の彼方へ、さあ行くぞ!」— 言ったのは、映画一本かけて自分が飛べないことに気づくおもちゃでした。(映画『トイ・ストーリー』のセリフから)',
    ],
  },
  steady: {
    ko: [
      '인생은 초콜릿 상자 같다는데, 오늘 승률은 열기 전부터 뭐가 나올지 다 압니다. (영화 포레스트 검프의 대사에서)',
      '"우리는 답을 찾을 것이다, 늘 그랬듯이"— 그 대사, 세 시간짜리 영화 안에서만 몇 번을 우려먹었는지 모릅니다. 오늘도 그 재탕 중입니다. (영화 인터스텔라의 대사에서)',
      '"나한테는 다 계획이 있다"— 그 대사가 밈이 된 이유, 오늘 승률을 보면 알 것도 같습니다. 계획대로라 부르기엔 그냥 그런 하루입니다. (영화 기생충의 대사에서)',
      '"숟가락은 없다"던 그 대사처럼, 오늘은 승률도 없었다고 해도 아무도 안 믿진 않을 겁니다. (영화 매트릭스의 대사에서)',
      '"이건 개인적인 감정이 아니라 그냥 비즈니스"라는데, 오늘 승률도 딱 그 정도로 무덤덤했습니다. (영화 대부의 대사에서)',
    ],
    en: [
      "Life is like a box of chocolates. Today's win rate, though — you already know what you're gonna get. (from a line in Forrest Gump)",
      '"We will find a way. We always have." — a line the movie itself recycled about four times over three hours. Today is just another rerun of it. (from a line in Interstellar)',
      '"There is no spoon" — and no one would blink if you said there was no win rate today either. (from a line in The Matrix)',
      '"It is not personal, it is strictly business." Today\'s numbers were about that detached — and about that forgettable. (from a line in The Godfather)',
      '"Life moves pretty fast." Today did not move at all, fast or otherwise. (from a line in Ferris Bueller\'s Day Off)',
    ],
    ja: [
      '人生はチョコレートの箱のようなものだそうですが、今日の勝率は開ける前から中身がわかります。(映画『フォレスト・ガンプ』のセリフから)',
      '「答えはいつか見つかります、いつもそうだったように」— この映画、3時間の中でこのセリフを4回くらい使い回しています。今日もその使い回しの一環です。(映画『インターステラー』のセリフから)',
      '「スプーンは存在しない」と言いますが、今日は勝率も存在しないと言っても誰も驚かないでしょう。(映画『マトリックス』のセリフから)',
      '「個人的な恨みじゃない、ただのビジネスだ」というほど、今日の数字も他人事のように淡々としていました。(映画『ゴッドファーザー』のセリフから)',
      '「人生は思ったより早く過ぎる」そうですが、今日は特に何も過ぎていきませんでした。(映画『フェリスはある朝突然に』のセリフから)',
    ],
  },
  cooling: {
    ko: [
      '밤이 가장 어두울 때 새벽이 가장 가깝다는데, 지금은 아직 밤입니다. (영화 다크나이트의 대사에서)',
      '"묻고 더블로 가는" 오늘은 하지 마세요. 그 대사를 한 인물도 결국 손모가지가 남아나질 않았습니다. (영화 타짜의 대사에서)',
      '누구나 하루만 잘못되면 이렇게 된다던데, 지금이 딱 그 하루 같습니다. (영화 조커의 대사에서)',
      '더 큰 배가 필요하다는 대사, 지금 이 연패 앞에서 나와야 할 것 같습니다. (영화 죠스의 대사에서)',
      '"선을 넘지 마세요"라는 대사, 지금 딱 필요한 경고입니다. (영화 기생충의 대사에서)',
    ],
    en: [
      "The night is darkest just before the dawn. We're still in the night part. (from a line in The Dark Knight)",
      "You're gonna need a bigger boat. This losing streak calls for one. (from a line in Jaws)",
      '"Do not cross the line" — words that apply right about now. (from a line in Parasite)',
      '"Houston, we have a problem." That is roughly where things stand. (from a line in Apollo 13)',
      '"Danger, Will Robinson" is about the energy right now. (from a line in Lost in Space)',
    ],
    ja: [
      '夜明け前が一番暗いと言いますが、今はまだ夜です。(映画『ダークナイト』のセリフから)',
      'もっと大きい船が要ると言いますが、今のこの連敗にはまさにそれが必要です。(映画『ジョーズ』のセリフから)',
      '「一線を越えるな」というセリフ、今まさに必要な警告です。(映画『パラサイト 半地下の家族』のセリフから)',
      '「ヒューストン、問題発生」という状況に近いです。(映画『アポロ13』のセリフから)',
      '「使徒、襲来」レベルの警報が今、必要です。(映画『エヴァンゲリオン』のセリフから)',
    ],
  },
  cold: {
    ko: [
      '죽기 딱 좋은 날씨네 급의 판이었습니다. (영화 신세계의 대사에서)',
      '내가 돌아왔다는 대사, 오늘은 못 하겠네요. (영화 터미네이터의 대사에서)',
      '이 정도면 비극인 줄 알았는데, 다시 보니 코미디입니다. (영화 조커의 대사에서)',
      '뭣이 중헌디 — 오늘 승률 앞에서는 이 말이 정답입니다. (영화 곡성의 대사에서)',
      '"너는 나에게 모욕감을 줬어"급으로 오늘 승률이 저를 대했습니다. (영화 달콤한 인생의 대사에서)',
    ],
    en: [
      "I'll be back. Just not today. (from a line in The Terminator)",
      "I thought this was a tragedy, but now I realize, it's a comedy. (from a line in Joker)",
      '"I coulda been a contender." That is about where today landed. (from a line in On the Waterfront)',
      '"Frankly, I do not give a damn" is about the energy left today. (from a line in Gone with the Wind)',
      '"You cannot handle the truth" is about where today\'s numbers stand. (from a line in A Few Good Men)',
    ],
    ja: [
      'アイル・ビー・バック、とはいきませんでした、今日は。(映画『ターミネーター』のセリフから)',
      '今日は悲劇だと思っていましたが、今にして思えば喜劇でした。(映画『ジョーカー』のセリフから)',
      '「コンテンダーになれたかもしれないのに」という心境です。(映画『波止場』のセリフから)',
      '「率直に言って、知ったことか」という気分で今日は終わりました。(映画『風と共に去りぬ』のセリフから)',
      '「お前に真実は扱えない」というレベルです、今日の数字は。(映画『ア・フュー・グッドメン』のセリフから)',
    ],
  },
};

/** 안정적인 씨앗으로 배열에서 하나 고르기. app/jokes.ts 의 pick() 과 동일 규칙. */
function pick<T>(pool: T[], seed: number): T {
  const i = ((Math.trunc(seed) % pool.length) + pool.length) % pool.length;
  return pool[i];
}

/** KST 벽시계 기준 요일 (0=일 ~ 6=토). dt 는 KST 벽시계를 UTC 필드에 담은 Date(models.ts 규약). */
function weekdayOf(dt: Date): number {
  return dt.getUTCDay();
}

/** dt가 속한 주(일요일 시작)의 시작일 — 1970-01-01 기준 날짜 수. 한 주 내내 값이 같다. */
function weekStartDayIndex(dt: Date): number {
  const dayIndex = Math.floor(dt.getTime() / 86_400_000);
  return dayIndex - weekdayOf(dt);
}

/**
 * 주 시작일을 씨앗으로 5개 테마를 결정론적으로 섞는다(xorshift32 기반 Fisher–Yates).
 * Math.random 을 안 쓰는 이유는 파일 머리말 참조 — 같은 주 안에서는 항상 같은 순서다.
 */
function shuffleThemesForWeek(weekStart: number): WeekdayTheme[] {
  let s = (weekStart ^ 0x9e3779b9) >>> 0 || 1; // 0이면 xorshift가 멈추므로 최소 1
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s;
  };
  const arr = [...WEEKDAY_THEMES];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 그 날짜의 요일 테마. 월~금만 값이 있고 토·일은 null(기존 방식 유지).
 * `dt` 는 season과 같은 기준 — 호출부가 **조회 시점이 아니라 마지막 경기 날짜**로 넘긴다.
 */
export function weekdayThemeOf(dt: Date | null): WeekdayTheme | null {
  if (!dt) return null;
  const dow = weekdayOf(dt); // 0=일 ... 6=토
  if (dow === 0 || dow === 6) return null;
  const themes = shuffleThemesForWeek(weekStartDayIndex(dt));
  return themes[dow - 1]; // 월=0 ... 금=4
}

/**
 * 요일 테마 문구 하나. 6상태 테마(영화·정의역사·땅값세금고소득자·동물의왕국)는
 * `sixState`, 영화대사는 `mood`를 쓴다. frozen은 의도적으로 풀이 없다(위 MOVIE_QUOTE_4
 * 머리말 참조) — null을 돌려주면 호출부가 기존 JOKES[frozen] 의 "놀리지 않는다" 풀로
 * 자연히 떨어진다. 그 외 풀이 비어 있으면(en/ja 미착수 구간) 역시 null.
 */
export function pickWeekdayJoke(
  theme: WeekdayTheme,
  sixState: SixState | null,
  mood: Mood,
  lang: Lang,
  seed: number,
): string | null {
  if (theme === 'movieQuote') {
    if (mood === 'frozen') return null;
    const pool = MOVIE_QUOTE_4[mood][lang];
    return pool.length ? pick(pool, seed) : null;
  }
  if (!sixState) return null;
  const pool = SIX_STATE_POOLS[theme][sixState][lang];
  return pool.length ? pick(pool, seed) : null;
}
