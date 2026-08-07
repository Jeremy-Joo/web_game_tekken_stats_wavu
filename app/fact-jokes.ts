// 데이터를 인용하는 농담 — 축마다 pool 이 따로 있고, 우선순위로 하나만 이긴다.
//
// app/jokes.ts 와 파일을 나눈 이유는 season-jokes.ts 와 같다: **축이 다르다.**
// 기본 농담은 mood(승률 편차) 하나가 고르지만, 여기는 축마다 여는 조건이 다르다
// (마일스톤은 판수, 승단은 단 변화, 새벽 3시는 시각…). 한 파일에 섞으면
// "10,000판 축하합니다"가 아무 때나 나오는 사고를 막을 방법이 없다.
//
// ── 두 갈래 ───────────────────────────────────────────────────────
//  사건(event) — 드물게 참이고 시의성이 있다. 걸리면 **우선한다.**
//                마일스톤·최고 갱신·승단·복귀·연승·오늘 몰림·시각
//  특성(trait) — 늘 참이다. 우선하면 기본 농담을 영영 밀어내므로 **섞어서** 뽑는다.
//                실력차·셧아웃·약점 매치업·최고 대비·세션 길이·누적 시간
//
// 이 구분이 없으면 축을 늘릴수록 기본 풀이 죽는다. 계절 하나가 이미 25%를 먹고 있어서
// 서넛만 더 붙이면 141개짜리 cold 풀이 거의 안 나오게 된다.
//
// ── 톤 ───────────────────────────────────────────────────────────
// app/jokes.ts 와 같다. 여기서 특히 조심할 것:
//  - **숫자를 부풀리지 않는다.** 누적 시간은 세션 사이 대기가 빠진 과소 추정이라
//    반드시 '대략'을 붙인다. quip-facts.ts 가 null 을 주면 그 축은 통째로 침묵한다.
//  - 승단은 실측상 12판에 한 번꼴로 일어난다. "드디어 승급"처럼 희소한 척하지 않는다.
//  - 단 이름을 지어내지 않는다. wavu 는 숫자만 준다("후지 등극" 같은 건 못 쓴다).

import type { Lang } from './i18n';
import type { QuipFacts } from '@/lib/tekken/quip-facts';
import type { Mood } from './jokes';
import { divergePool } from './diverge-jokes';

/** 천 단위 쉼표. toLocaleString 은 실행 환경에 따라 결과가 갈릴 수 있어 직접 넣는다. */
const n = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type Pool = Record<Lang, string[]>;
const empty: Pool = { ko: [], en: [], ja: [] };

/* ═══════════════ 사건 ═══════════════ */

function milestone(f: QuipFacts, lang: Lang): string[] {
  if (f.milestone == null) return [];
  const m = n(f.milestone);
  const h = f.hoursPlayed;
  // 근무일 환산은 8시간 기준. 이 한 줄이 제일 잔인하다는 게 제안의 요지였다.
  const days = h != null ? Math.round(h / 8) : null;
  const p: Pool = {
    ko: [
      `${m}판째입니다. 축하드립니다.`,
      ...(h != null ? [`${m}판째입니다. 대략 ${n(h)}시간을 쓰셨습니다.`] : []),
      ...(days != null ? [`${m}판 돌파. 대략 ${n(h!)}시간, 근무일로 ${n(days)}일입니다.`] : []),
      `${m}판. 이쯤이면 취미가 아니라 경력입니다.`,
      `${m}판을 치는 동안 세상은 계속 돌아갔습니다.`,
    ],
    en: [
      `Game ${m}. Congratulations, I suppose.`,
      ...(h != null ? [`Game ${m}. That is roughly ${n(h)} hours of your life.`] : []),
      ...(days != null ? [`${m} games in — about ${n(h!)} hours, or ${n(days)} working days.`] : []),
      `${m} games. That is not a hobby, that is a career.`,
      `${m} games. The world kept turning the whole time.`,
    ],
    ja: [
      `${m}戦目です。おめでとうございます。`,
      ...(h != null ? [`${m}戦目。おおよそ${n(h)}時間を使いました。`] : []),
      ...(days != null ? [`${m}戦突破。約${n(h!)}時間、勤務日換算で${n(days)}日です。`] : []),
      `${m}戦。これはもう趣味ではなく経歴です。`,
      `${m}戦を打つ間も、世界は回り続けていました。`,
    ],
  };
  return p[lang];
}

function peakFresh(f: QuipFacts, lang: Lang): string[] {
  if (!f.peakFresh) return [];
  const r = n(f.peakRating);
  const p: Pool = {
    ko: [
      `개인 최고 레이팅을 방금 갱신하셨습니다. 지금 끄세요. 진심입니다.`,
      `${r}. 오늘까지의 당신 중 가장 강한 당신입니다.`,
      `최고점 경신. 여기서 한 판 더 하면 최고점이 아니게 됩니다.`,
      `기록을 세우셨습니다. 기록은 지키는 게 더 어렵습니다.`,
    ],
    en: [
      `You just set a personal best. Turn it off. I mean it.`,
      `${r}. This is the strongest version of you so far.`,
      `New peak. One more game and it stops being a peak.`,
      `You set a record. Keeping one is the harder part.`,
    ],
    ja: [
      `自己最高レートを更新しました。今すぐやめましょう。本気です。`,
      `${r}。今日までで最も強いあなたです。`,
      `最高記録更新。ここでもう1戦すると最高でなくなります。`,
      `記録を作りました。守るほうが難しいのですが。`,
    ],
  };
  return p[lang];
}

function rankChange(f: QuipFacts, lang: Lang): string[] {
  const rc = f.rankChange;
  if (!rc) return [];
  const v = rc.visits;
  const d = rc.deltaPp;
  // 재방문 횟수는 그대로 쓴다. 실측상 수백이 나오는데 그게 사실이고, 사실이라 웃기다.
  const many = v >= 5;
  const p: Pool = rc.up
    ? {
        ko: [
          `승급하셨습니다. 축하드립니다.`,
          ...(many ? [`이 계급을 ${v}번째 밟고 계십니다. 문지방이 닳겠네요.`] : []),
          ...(d != null && d < -3 ? [`승급하고 나서 승률이 ${Math.abs(d)}%p 떨어졌습니다. 원래 다 그렇습니다.`] : []),
          `계급이 올랐습니다. 위에는 더 무서운 사람들이 있습니다.`,
          `올라가셨군요. 내려오는 길도 같은 길입니다.`,
          // 2026-08-07 사용자 추가 — 강등 쪽 '운영' 소재의 승격 짝. 리그 승격/잔류 비유는
          // 이 사이트의 단(rank) 구조 자체가 실제로 그런 사다리라 프로/직장 비유와
          // 달리 단정형으로 써도 "진짜 직장 얘기"로 안 읽힌다(승격·잔류는 이 게임에도
          // 실재하는 개념). 넷째 줄("운영의 수준을 끌어올리세요")은 다른 멘트보다
          // 지시형에 가깝지만, 유머 축에 있는 다른 문구들도 종종 그런 톤을 쓴다.
          `프로 무대에 입성했습니다. 이제는 승격이 아니라 잔류를 고민해야 할 때입니다.`,
          `승격은 박수를 받지만, 살아남는 건 운영이 결정합니다.`,
          `상위 리그는 승격을 축하해주지 않습니다. 운영만 평가합니다.`,
          `승격은 쉬워도 잔류는 어렵습니다. 더 나은 운영, 수준 높은 운영이 필요합니다.`,
          `승단 축하드립니다. 더 나은 운영이 필요한 순간입니다.`,
        ],
        en: [
          `You ranked up. Congratulations.`,
          ...(many ? [`This is your ${v}th time at this rank. The doorstep is wearing thin.`] : []),
          ...(d != null && d < -3 ? [`Your win rate dropped ${Math.abs(d)}%p after the promotion. That is normal.`] : []),
          `Rank up. Scarier people live up there.`,
          `You went up. The way down is the same road.`,
          `Welcome to the pro stage. The question now isn't promotion, it's survival.`,
          `Promotion gets the applause. Staying up is decided by how you play.`,
          `The upper bracket doesn't celebrate the promotion. It only grades what comes after.`,
          `Getting promoted is the easy part. Staying up is the hard part, and it takes sharper play.`,
          `Congratulations on the rank up. Now you need the play to match it.`,
        ],
        ja: [
          `昇格しました。おめでとうございます。`,
          ...(many ? [`このランクは${v}回目です。敷居がすり減ります。`] : []),
          ...(d != null && d < -3 ? [`昇格後に勝率が${Math.abs(d)}%p 下がりました。よくあることです。`] : []),
          `ランクが上がりました。上にはもっと怖い人がいます。`,
          `上がりましたね。下りも同じ道です。`,
          `プロの舞台に上がりました。今問われているのは昇格ではなく残留です。`,
          `昇格には拍手が来ます。生き残れるかは運営次第です。`,
          `上位リーグは昇格を祝ってくれません。運営だけを評価します。`,
          `昇格は簡単でも残留は難しいです。求められるのはより良い、質の高い運営です。`,
          `昇段おめでとうございます。今度はより良い運営が必要な瞬間です。`,
        ],
      }
    : {
        // '강등'이라는 단어는 여기서만 쓴다 — myRank 가 실제로 떨어진 직후다.
        // 레이팅 하락(diverge-jokes.ts)은 이 단어를 쓰면 안 된다. 단은 그대로니까.
        ko: [
          `강등되셨습니다. 통계는 위로하지 않습니다.`,
          ...(many ? [`이 계급으로 ${v}번째 돌아오셨습니다. 익숙한 풍경이겠네요.`] : []),
          `내려왔습니다. 올라가는 길은 알고 계시잖습니까.`,
          `계급이 하나 사라졌습니다. 실력이 사라진 건 아닙니다.`,
          `방금 그 판이 승단전이 아니라 잔류전이었습니다. 결과는 보시는 대로고요.`,
          `이 계급의 전세 계약이 끝났습니다. 재계약 조건은 아시는 그대로입니다.`,
          `한 층 아래에서 다시 출발입니다. 엘리베이터가 아니라 계단이었을 뿐입니다.`,
          `내려온 김에 좋은 소식 하나 — 여기서는 당신이 위쪽 손님입니다.`,
          // 2026-08-07 사용자 추가 — 계급은 떨어져도 '운영(플레이 습관)'은 안 바뀐다는 소재.
          `계급은 잃었습니다. 하지만 운영 능력까지 함께 잃어버릴 만큼 운이 좋진 않았군요.`,
          `계급은 내려갔습니다. 운영은 여전히 제자리입니다. 안 좋은 의미로요.`,
          `하락한 건 계급뿐입니다. 문제의 근원은 아직 그대로입니다.`,
          `계급은 바뀌어도 운영 방식은 쉽게 바뀌지 않습니다. 그게 이번 결과의 핵심입니다.`,
          `계급은 초기화될 수 있어도, 운영 습관은 그렇지 않습니다.`,
          `계급은 떨어졌습니다. 하지만 당신의 운영이 함께 사라질 거라 기대했다면 실망이겠군요.`,
          `안타깝게도 계급만 내려갔습니다. 운영은 그대로입니다.`,
          `계급은 하락했지만, 운영은 여전히 익숙한 모습입니다.`,
          `새로운 계급, 같은 운영. 결과가 달라질 이유는 많지 않습니다.`,
          `계급은 바뀌었습니다. 운영까지 바뀌었다는 착각은 하지 않는 편이 좋겠습니다.`,
          // 프로/감독 소재 — 가정법 원칙(jokes.ts 머리말)은 첫 줄만 지킨다.
          // 나머지 둘은 '당신의 감독'이라 안 박아 일반론으로 읽히게 남겨뒀다.
          `계급은 떨어졌습니다. 프로 스포츠였다면 감독이 경질됐겠지만, 안타깝게도 당신의 운영 능력까지 함께 교체되진 않았습니다.`,
          `감독은 바꿀 수 있어도, 운영 습관은 쉽게 바뀌지 않습니다.`,
          `성적은 떨어졌습니다. 하지만 가장 큰 문제는 아직도 벤치에 그대로 남아 있습니다.`,
          `감독은 경질될 수 있습니다. 운영 능력은 자동으로 교체되지 않습니다.`,
          `계급은 떨어졌습니다. 하지만 당신의 운영 능력까지 함께 떨어져 나가진 않았습니다.`,
          `계급만 바뀌었습니다. 운영은 여전히 당신의 것입니다.`,
          `강등은 됐습니다. 운영은 그대로입니다. 그것이 더 큰 문제일 수도 있습니다.`,
          `계급은 초기화됐지만, 운영 습관은 저장되어 있습니다.`,
        ],
        en: [
          `You got demoted. The stats offer no comfort.`,
          ...(many ? [`Your ${v}th return to this rank. Familiar scenery by now.`] : []),
          `You came down. You already know the way back up.`,
          `A rank vanished. Your skill did not.`,
          `That last match was a relegation battle, not a promotion one. The result speaks.`,
          `The lease on that rank expired. You know the renewal terms.`,
          `Starting again one floor down. It was stairs, not an elevator.`,
          `One upside to coming down: here, you are the visitor from upstairs.`,
          // 2026-08-07 사용자 추가분의 en 짝 — 번역이 아니라 같은 성격의 다른 문장.
          `You lost the rank. Lucky for you, your habits didn't come down with it.`,
          `Rank dropped. Your decision-making stayed exactly where it was.`,
          `Only the rank fell. The actual problem is still standing.`,
          `Ranks reset. Habits don't.`,
          `You can wipe the rank. The habits are save-locked.`,
          `Rank down. If you were hoping your play would drop with it, sorry to disappoint.`,
          `Unfortunately, only the rank moved. Everything else held its position.`,
          `Rank slipped. Your play looks exactly as familiar as before.`,
          `New rank, same decisions. Don't expect a different outcome.`,
          `The rank changed. Assuming your play changed with it would be a mistake.`,
          `Rank dropped. If this were pro sports, the coach would be fired — your instincts, unfortunately, were not.`,
          `You can fire the coach. Habits don't take the hint.`,
          `The result dropped. The actual problem is still on the bench.`,
          `Coaches get replaced. Decision-making does not auto-update.`,
          `Rank dropped. Your play did not fall with it.`,
          `Only the rank changed. The play is still yours.`,
          `Demoted, yes. Unchanged, also yes. That might be the bigger issue.`,
          `The rank got reset. The habits were autosaved.`,
        ],
        ja: [
          `降格しました。統計は慰めません。`,
          ...(many ? [`このランクに戻るのは${v}回目です。見慣れた景色でしょう。`] : []),
          `下がりました。上がり方はもう知っているはずです。`,
          `ランクがひとつ消えました。実力が消えたわけではありません。`,
          `さっきの一戦は昇格戦ではなく残留戦でした。結果はご覧の通りです。`,
          `そのランクの賃貸契約が切れました。更新条件はご存じの通りです。`,
          `一階下から再出発です。エレベーターではなく階段だっただけです。`,
          `下りた良い知らせをひとつ — ここではあなたが上の階からの来客です。`,
          // 2026-08-07 사용자 추가분의 ja 짝 — 번역이 아니라 같은 성격의 다른 문장.
          `階級は失いました。運営能力まで一緒に失うほど運は良くなかったようです。`,
          `階級は下がりました。運営は変わらずそのままです。悪い意味で。`,
          `下がったのは階級だけです。問題の根本はそのままです。`,
          `階級は変わっても、プレイスタイルはそう簡単には変わりません。それが今回の結果です。`,
          `階級はリセットできても、プレイの癖はリセットされません。`,
          `階級は下がりました。あなたの運営まで一緒に消えると思っていたなら残念です。`,
          `残念ながら階級だけ下がりました。運営はそのままです。`,
          `階級は下がりましたが、運営は相変わらず見慣れた姿です。`,
          `新しい階級、同じ運営。結果が変わる理由は多くありません。`,
          `階級は変わりました。運営まで変わったと思うのは早計です。`,
          `階級は下がりました。プロの世界なら監督が更迭されるところですが、あなたの運営能力はそのまま残ってしまいました。`,
          `監督は代えられても、プレイの癖はそう簡単には変わりません。`,
          `成績は落ちました。でも一番の問題は今もベンチに座ったままです。`,
          `監督は更迭されることがあります。運営能力は自動では入れ替わりません。`,
          `階級は下がりました。でもあなたの運営能力まで一緒に落ちたわけではありません。`,
          `階級だけが変わりました。運営は相変わらずあなたのものです。`,
          `降格はしました。運営はそのままです。それがより大きな問題かもしれません。`,
          `階級はリセットされましたが、プレイの癖はセーブされています。`,
        ],
      };
  return p[lang];
}

function comeback(f: QuipFacts, lang: Lang): string[] {
  const d = f.comebackDays;
  if (d == null) return [];
  const months = Math.round(d / 30);
  const p: Pool = {
    ko: [
      `${d}일 만에 오셨군요. 그동안 다들 늘었습니다.`,
      `${months}개월 만의 복귀전이었습니다. 손이 기억하고 있던가요.`,
      `오랜만입니다. 통계는 당신을 안 잊었습니다.`,
      `${d}일 쉬고 돌아오셨습니다. 환영합니다. 상대들은 아니겠지만요.`,
    ],
    en: [
      `Back after ${d} days. Everyone else kept improving.`,
      `First session in about ${months} months. Did the hands remember?`,
      `Long time. The stats did not forget you.`,
      `${d} days off and back. Welcome — your opponents are less pleased.`,
    ],
    ja: [
      `${d}日ぶりですね。その間に皆さん上手くなりました。`,
      `約${months}か月ぶりの復帰戦でした。手は覚えていましたか。`,
      `お久しぶりです。統計はあなたを忘れていません。`,
      `${d}日休んで復帰。歓迎します。相手はそうでもないでしょうが。`,
    ],
  };
  return p[lang];
}

// winStreak·todaySameChar 함수는 2026-08-07 사용자 피드백("이 스타일의 문구는 이제
// 적용하지마" / "이 문구도 빼자")으로 제거했다. 실측(2026-08-06)상 둘이 event 762개
// 중 519개(68%)를 차지해서 milestone·peakFresh·comeback 같은 진짜 희귀 사건과
// 섞여 있는 게 애초에 무리였는데, 확률 게이트로 내리는 대신 아예 껐다 — 사용자가
// 반복해서 보고 질렸다고 명시했으므로 "가끔 보이게"가 아니라 "안 보이게"가 맞는 조치다.
// QuipFacts.winStreak/bestWinStreak/todaySameChar 필드 자체는 다른 화면(승단 이력 등)
// 에서 쓰일 수 있어 quip-facts.ts 쪽은 손대지 않았다 — 이 파일의 소비만 껐다.

function clock(f: QuipFacts, lang: Lang, mood: Mood): string[] {
  const c = f.clock;
  if (!c) return []; // 시간대를 모르면 침묵한다 — 이 축의 제1 규칙
  const { hour, dow } = c;

  // 새벽 (0~4시)
  if (hour <= 4) {
    const p: Pool = {
      ko: [
        `새벽 ${hour}시. 내일 출근 안 하십니까. 통계는 아무 말도 안 하겠습니다.`,
        `이 시각에 랭크를 도는 사람의 성적이 이렇습니다.`,
        `새벽 ${hour}시입니다. 지금 이기든 지든 내일은 옵니다.`,
        `해가 뜨기 전에 끄는 게 오늘의 목표였을 텐데요.`,
      ],
      en: [
        `${hour} in the morning. No work tomorrow? The stats will say nothing.`,
        `This is what playing ranked at this hour looks like.`,
        `It is ${hour}am. Win or lose, tomorrow arrives either way.`,
        `Stopping before sunrise was probably today's goal.`,
      ],
      ja: [
        `午前${hour}時。明日は仕事ではないのですか。統計は何も言いません。`,
        `この時間にランクを回す人の成績がこれです。`,
        `午前${hour}時です。勝っても負けても明日は来ます。`,
        `日が昇る前にやめるのが今日の目標だったはずですが。`,
      ],
    };
    return p[lang];
  }

  // 일요일 밤
  if (dow === 0 && hour >= 20) {
    const p: Pool = {
      ko: [
        `일요일 밤입니다. 내일 월요일이고요. 마지막 판은 여기까지로 하시죠.`,
        `주말의 마지막 시간을 여기 쓰고 계십니다. 그럴 만한 성적이었나요.`,
        `일요일 밤의 한 판은 항상 한 판으로 끝나지 않습니다.`,
      ],
      en: [
        `Sunday night. Monday follows. Make this the last one.`,
        `You are spending the last hours of the weekend here. Was it worth it?`,
        `One more on a Sunday night is never actually one more.`,
      ],
      ja: [
        `日曜の夜です。明日は月曜です。最後の1戦にしましょう。`,
        `週末の最後の時間をここに使っています。その価値はありましたか。`,
        `日曜夜の「あと1戦」が1戦で終わったことはありません。`,
      ],
    };
    return p[lang];
  }

  // 금요일 밤
  if (dow === 5 && hour >= 20) {
    const p: Pool =
      mood === 'hot' || mood === 'blazing'
        ? {
            ko: [`금요일 밤에 이 폼이면 주말이 위험합니다.`, `금요일 밤, 물이 올랐습니다. 토요일 일정은 비우시죠.`],
            en: [`This form on a Friday night puts the weekend at risk.`, `Friday night and you are hot. Clear Saturday.`],
            ja: [`金曜の夜にこの調子だと週末が危険です。`, `金曜夜、絶好調。土曜の予定は空けましょう。`],
          }
        : {
            ko: [`금요일 밤입니다. 밖에 사람들이 있습니다.`, `금요일 밤을 이 성적으로 보내고 계십니다.`],
            en: [`It is Friday night. There are people outside.`, `You are spending a Friday night on this scoreline.`],
            ja: [`金曜の夜です。外には人がいます。`, `金曜の夜をこの戦績で過ごしています。`],
          };
    return p[lang];
  }

  // 점심시간
  if (hour === 12 || hour === 13) {
    const p: Pool = {
      ko: [
        `점심시간에 랭크를 도는 사람의 승률이 이렇습니다.`,
        `점심은 드셨습니까. 통계가 묻고 있습니다.`,
        `점심시간 한 판. 오후 업무에 영향이 없기를 바랍니다.`,
      ],
      en: [
        `This is the win rate of someone playing ranked on their lunch break.`,
        `Did you actually eat? The stats are asking.`,
        `A lunch-break set. Hopefully the afternoon survives it.`,
      ],
      ja: [
        `昼休みにランクを回す人の勝率がこれです。`,
        `昼食は食べましたか。統計が尋ねています。`,
        `昼休みの1戦。午後の仕事に響かないことを祈ります。`,
      ],
    };
    return p[lang];
  }

  return [];
}

/* ═══════════════ 특성 ═══════════════ */

function traits(f: QuipFacts, lang: Lang): string[] {
  const out: Record<Lang, string[]> = { ko: [], en: [], ja: [] };
  const push = (p: Pool) => {
    for (const l of ['ko', 'en', 'ja'] as Lang[]) out[l].push(...p[l]);
  };

  // 실력차 — 사람이 스스로는 절대 모르는 종류다.
  // 실측상 '위에 약하고 아래에 강하다'가 거의 전원이라(매칭 구조상 당연) 그걸
  // 개성인 것처럼 말하지 않는다. 숫자를 인용하는 데서 멈춘다.
  if (f.vsUp && f.vsDown) {
    const gap = Math.round((f.vsDown.wr - f.vsUp.wr) * 10) / 10;
    push({
      ko: [
        `레이팅이 위인 상대에겐 ${f.vsUp.wr}%입니다. 전체 승률 ${f.overallWr}%가 당신을 후하게 말하고 있습니다.`,
        `위 ${f.vsUp.wr}% / 아래 ${f.vsDown.wr}%. 격차 ${gap}%p 만큼 상대를 탑니다.`,
      ],
      en: [
        `Against higher-rated opponents you win ${f.vsUp.wr}%. Your overall ${f.overallWr}% is being generous.`,
        `${f.vsUp.wr}% up, ${f.vsDown.wr}% down — a ${gap}%p swing depending on who you draw.`,
      ],
      ja: [
        `格上相手には${f.vsUp.wr}%です。総合${f.overallWr}%はあなたを甘く語っています。`,
        `格上${f.vsUp.wr}% / 格下${f.vsDown.wr}%。${gap}%p ぶん相手に左右されます。`,
      ],
    });
    // 역전형 — 실측 4명 중 0명이었다. 걸리면 진짜 드문 사람이라 따로 말한다.
    if (f.vsUp.wr > f.vsDown.wr) {
      push({
        ko: [`위에는 ${f.vsUp.wr}%, 아래에는 ${f.vsDown.wr}%. 긴장을 해야 잘하는 유형이군요.`],
        en: [`${f.vsUp.wr}% against stronger, ${f.vsDown.wr}% against weaker. You need the pressure.`],
        ja: [`格上に${f.vsUp.wr}%、格下に${f.vsDown.wr}%。緊張しないと力が出ない型ですね。`],
      });
    }
  }

  // 최고 대비 — 최저점에서 회복 중이면(recovery) 한탄 대신 회복을 말한다.
  // 같은 곡선의 더 나은 독해라 두 풀을 겹치지 않는다(회복이 이긴다).
  // **문구는 관찰형까지만** — "올라왔다"(사실)는 되고, "계속 오른다"(예측)나
  // "실력이 돌아왔다"(인과)는 안 된다. 평균 회귀 때문이다(quip-facts.ts recovery 주석).
  if (f.recovery) {
    const r = f.recovery;
    push({
      ko: [
        `최저점 ${n(r.troughRating)}에서 ${n(r.up)} 올라왔습니다. 최고점까지는 ${n(r.toPeak)} 남았고요.`,
        `바닥은 ${n(r.troughRating)}이었습니다. 지금은 거기서 ${n(r.up)} 위에 계십니다.`,
        `그래프가 V자를 그리는 중입니다. 최저점 대비 +${n(r.up)}.`,
        `내려간 걸 전부 되찾진 못했어도, 바닥에서 ${n(r.up)}은 되찾았습니다.`,
        // 주제 변형 (2026-08-07 사용자 요청: 낚시·병원·항해·농사). 은유의 주어가
        // 승률임을 문장 안에서 밝힌다 — 틀만 던지면 무슨 얘긴지 못 알아듣는다는
        // 피드백. 여전히 관찰형까지만: 수확/완쾌"까지 남은 거리"는 사실이고,
        // "수확할 겁니다"(예측)는 아니다.
        `입질이 돌아왔습니다. 바닥 ${n(r.troughRating)}에서 ${n(r.up)}을 끌어올리셨거든요.`,
        `승률이라는 환자에게 차도가 있습니다. 최저점 ${n(r.troughRating)}에서 ${n(r.up)} 회복 — 완쾌(최고점)까지는 ${n(r.toPeak)} 남았습니다.`,
        `항해로 치면 배가 다시 나아가는 중입니다. 바닥 ${n(r.troughRating)}에서 ${n(r.up)} 올라왔습니다.`,
        `농사로 치면 작황이 돌아오는 중입니다. 바닥 ${n(r.troughRating)}에서 ${n(r.up)} 자랐고, 수확(최고점)까지는 ${n(r.toPeak)}입니다.`,
      ],
      en: [
        `Up ${n(r.up)} from the bottom (${n(r.troughRating)}). ${n(r.toPeak)} left to your peak.`,
        `The floor was ${n(r.troughRating)}. You are ${n(r.up)} above it now.`,
        `The graph is drawing a V. +${n(r.up)} off the low.`,
        `Not all the way back, but ${n(r.up)} of it is reclaimed.`,
        `The bites are back — you have hauled it up ${n(r.up)} from the bottom (${n(r.troughRating)}).`,
        `The patient — your win rate — is improving: up ${n(r.up)} from ${n(r.troughRating)}. Full recovery, your peak, is ${n(r.toPeak)} away.`,
        `The ship is making way again: up ${n(r.up)} from the low of ${n(r.troughRating)}.`,
        `The crop is coming back — up ${n(r.up)} from ${n(r.troughRating)}, ${n(r.toPeak)} short of harvest (your peak).`,
      ],
      ja: [
        `最低点${n(r.troughRating)}から${n(r.up)}上がってきました。最高点まではあと${n(r.toPeak)}です。`,
        `底は${n(r.troughRating)}でした。今はそこから${n(r.up)}上にいます。`,
        `グラフがV字を描いている最中です。最低点から+${n(r.up)}。`,
        `落ちた分を全部ではなくても、底から${n(r.up)}は取り返しました。`,
        `当たりが戻ってきました。底の${n(r.troughRating)}から${n(r.up)}引き上げています。`,
        `患者(あなたの勝率)に快方の兆しがあります。底の${n(r.troughRating)}から${n(r.up)}回復 — 全快(最高点)まではあと${n(r.toPeak)}です。`,
        `航海で言えば、船が再び進み始めたところです。底の${n(r.troughRating)}から${n(r.up)}上がってきました。`,
        `畑が持ち直してきました。底の${n(r.troughRating)}から${n(r.up)}。収穫(最高点)まではあと${n(r.toPeak)}です。`,
      ],
    });
  } else if (f.peakGamesAgo > 100 && f.peakRating > f.currentRating) {
    const d = n(f.peakRating - f.currentRating);
    push({
      ko: [
        `최고점보다 ${d} 낮습니다. 그때가 좋았죠.`,
        `개인 최고 ${n(f.peakRating)}은 ${n(f.peakGamesAgo)}판 전입니다. 기억은 나십니까.`,
      ],
      en: [
        `You are ${d} below your peak. Those were the days.`,
        `Your best (${n(f.peakRating)}) was ${n(f.peakGamesAgo)} games ago. Remember it?`,
      ],
      ja: [
        `最高点より${d}低いです。あの頃はよかった。`,
        `自己最高${n(f.peakRating)}は${n(f.peakGamesAgo)}戦前です。覚えていますか。`,
      ],
    });
  }

  // 셧아웃 패 — 접전 비율은 실측상 사람마다 31~35%로 거의 안 갈려서 쓰지 않는다.
  if (f.shutoutLossPct != null && f.shutoutLossPct >= 15) {
    push({
      ko: [
        `3-0 으로 지는 비율이 ${f.shutoutLossPct}%입니다. 그건 매치업이 아니라 정보 부족입니다.`,
        `${f.shutoutLossPct}% 는 한 라운드도 못 따고 끝난 경기입니다. 그 판들은 시작 전에 이미 갈려 있었습니다.`,
      ],
      en: [
        `${f.shutoutLossPct}% of your losses are 3-0. That is not a matchup, that is missing information.`,
        `In ${f.shutoutLossPct}% of games you took zero rounds. Those were decided before they began.`,
      ],
      ja: [
        `3-0で負ける割合が${f.shutoutLossPct}%です。相性ではなく情報不足です。`,
        `${f.shutoutLossPct}%は1ラウンドも取れずに終わった試合です。始まる前に決まっていた試合ですね。`,
      ],
    });
  }

  // 약점 매치업 — 탭에 이미 있는 값을 농담이 직접 인용한다
  if (f.worstMatchup) {
    const w = f.worstMatchup;
    push({
      ko: [
        `약점 매치업 탭에 범인이 있습니다. ${w.opp}, ${w.wr}%.`,
        `${w.opp} 상대로 ${w.games}판에 ${w.wr}%. 이건 운이 아니라 숙제입니다.`,
      ],
      en: [
        `The culprit is in your matchup tab: ${w.opp}, ${w.wr}%.`,
        `${w.wr}% over ${w.games} games against ${w.opp}. That is homework, not luck.`,
      ],
      ja: [
        `苦手マッチアップに犯人がいます。${w.opp}、${w.wr}%。`,
        `${w.opp}相手に${w.games}戦で${w.wr}%。運ではなく宿題です。`,
      ],
    });
  }

  // 누적 시간 (마일스톤이 아닐 때도 한 번씩)
  if (f.hoursPlayed != null && f.hoursPlayed >= 50) {
    const days = Math.round(f.hoursPlayed / 8);
    push({
      ko: [`지금까지 대략 ${n(f.hoursPlayed)}시간입니다. 근무일로 ${n(days)}일이고요.`],
      en: [`That is roughly ${n(f.hoursPlayed)} hours so far — about ${n(days)} working days.`],
      ja: [`これまでおおよそ${n(f.hoursPlayed)}時間。勤務日で${n(days)}日ぶんです。`],
    });
  }

  return out[lang];
}

/* ═══════════════ 조립 ═══════════════ */

export interface FactPools {
  /** 우선순위 순. 앞에서부터 비어 있지 않은 첫 pool 이 이긴다. */
  events: string[][];
  /**
   * 승단·강등. 예전엔 events 안에 있었다 — **실측(2026-08-06, 2,204명 스냅샷)으로
   * 뺐다.** 단 변화는 "12판에 한 번꼴"(quip-facts.ts RANK_RECENT 주석)로 흔해서
   * events 취급을 받으면 전체의 40.4% 를 이게 혼자 잠식했다(milestone·comeback 같은
   * 진짜 희귀 사건과 같은 등급이 아니었다). state 처럼 확률 게이트를 준다 —
   * jokes.ts 의 pickJoke, RANKCHANGE_EVERY 참조.
   */
  rankChange: string[];
  /**
   * 시각(새벽/일요일밤/금요일밤/점심). 예전엔 events 안에 있었다 — **실측
   * (2026-08-06, 425명 재검증)으로 뺐다.** 조건이 커버하는 시간대가 새벽 0~4시
   * (매일 5시간) + 일요일 밤 + 금요일 밤 + 점심 1~2시로, 한 주 168시간 중 약
   * 57시간(34%)이나 된다 — "드물게 참"이 아니라 "3번에 1번꼴로 참"이라 events
   * 취급을 받으면 milestone·comeback 같은 진짜 희귀 사건을 밀어내며 기본 풀을
   * 잠식했다(rankChange 를 뺀 뒤에도 이게 새 1위로 튀어나왔다). rankChange 와
   * 같은 이유로 같은 방식(확률 게이트)을 쓴다 — jokes.ts 의 CLOCK_EVERY 참조.
   */
  clock: string[];
  /**
   * 승률·레이팅 어긋남(diverge-jokes.ts). 사건도 특성도 아닌 **상태**다 —
   * 25판쯤 지속되다 사라진다. 사다리에서의 취급은 jokes.ts 의 pickJoke 주석 참조.
   */
  state: string[];
  /** 기본 농담과 섞어 뽑는다. */
  traits: string[];
}

/**
 * 우선순위: 좁은 조건이 이긴다.
 *   마일스톤 > 최고 갱신 > 복귀  (여기까지 events, 무조건)
 *   승단·강등 / 시각             (별도 필드, 확률 게이트 — 둘 다 흔한 일이라)
 *
 * 연승·오늘 몰림은 2026-08-07 사용자 피드백으로 아예 껐다(위 winStreak·
 * todaySameChar 자리의 주석 참조) — 확률로 낮추는 게 아니라 안 보이게.
 *
 * 근거: 위로 갈수록 발화 빈도가 낮다. 자주 참인 축이 앞에 있으면 뒤의 축은 영영
 * 안 나온다 — seed % N 으로 섞으면 드문 사건이 묻히는 정반대 문제가 생긴다
 * (10,000판 달성은 평생 한 번인데 25% 확률로 밀리면 안 된다). 승단·강등과 시각은
 * 이 논리가 안 맞아서(둘 다 흔한 일이라) events 에서 뺐다 — 위 필드 주석 참조.
 */
export function factPools(f: QuipFacts | null, lang: Lang, mood: Mood): FactPools {
  if (!f) return { events: [], rankChange: [], clock: [], state: [], traits: [] };
  return {
    events: [milestone(f, lang), peakFresh(f, lang), comeback(f, lang)].filter((p) => p.length > 0),
    rankChange: rankChange(f, lang),
    clock: clock(f, lang, mood),
    state: divergePool(f, lang),
    traits: traits(f, lang),
  };
}

export { empty as _emptyPool };
