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
          ...(many ? [`이 단을 ${v}번째 밟고 계십니다. 문지방이 닳겠네요.`] : []),
          ...(d != null && d < -3 ? [`승단하고 나서 승률이 ${Math.abs(d)}%p 떨어졌습니다. 원래 다 그렇습니다.`] : []),
          `단이 올랐습니다. 위에는 더 무서운 사람들이 있습니다.`,
          `올라가셨군요. 내려오는 길도 같은 길입니다.`,
        ],
        en: [
          `You ranked up. Congratulations.`,
          ...(many ? [`This is your ${v}th time at this rank. The doorstep is wearing thin.`] : []),
          ...(d != null && d < -3 ? [`Your win rate dropped ${Math.abs(d)}%p after the promotion. That is normal.`] : []),
          `Rank up. Scarier people live up there.`,
          `You went up. The way down is the same road.`,
        ],
        ja: [
          `昇格しました。おめでとうございます。`,
          ...(many ? [`この段位は${v}回目です。敷居がすり減ります。`] : []),
          ...(d != null && d < -3 ? [`昇格後に勝率が${Math.abs(d)}%p 下がりました。よくあることです。`] : []),
          `段位が上がりました。上にはもっと怖い人がいます。`,
          `上がりましたね。下りも同じ道です。`,
        ],
      }
    : {
        ko: [
          `강등되셨습니다. 통계는 위로하지 않습니다.`,
          ...(many ? [`이 단으로 ${v}번째 돌아오셨습니다. 익숙한 풍경이겠네요.`] : []),
          `내려왔습니다. 올라가는 길은 알고 계시잖습니까.`,
          `단이 하나 사라졌습니다. 실력이 사라진 건 아닙니다.`,
        ],
        en: [
          `You got demoted. The stats offer no comfort.`,
          ...(many ? [`Your ${v}th return to this rank. Familiar scenery by now.`] : []),
          `You came down. You already know the way back up.`,
          `A rank vanished. Your skill did not.`,
        ],
        ja: [
          `降格しました。統計は慰めません。`,
          ...(many ? [`この段位に戻るのは${v}回目です。見慣れた景色でしょう。`] : []),
          `下がりました。上がり方はもう知っているはずです。`,
          `段位がひとつ消えました。実力が消えたわけではありません。`,
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

/** 연승은 이만큼부터 소재가 된다. 3연승은 흔해서 농담이 안 된다. */
const WIN_STREAK_MIN = 5;

function winStreak(f: QuipFacts, lang: Lang): string[] {
  const s = f.winStreak;
  if (s < WIN_STREAK_MIN) return [];
  const best = f.bestWinStreak;
  const tying = s >= best;
  const p: Pool = {
    ko: [
      `${s}연승 중입니다. 지금 끄면 오늘은 전설로 남습니다.`,
      `${s}연승. 통계가 슬슬 무서워하고 있습니다.`,
      `${s}연승째. 다음 판을 이기면 자랑이고, 지면 이야기가 됩니다.`,
      ...(tying ? [`${s}연승 — 개인 최고 기록입니다. 여기서 멈추는 것도 실력입니다.`] : [`${s}연승. 개인 최고는 ${best}입니다.`]),
    ],
    en: [
      `${s} wins in a row. Stop now and today becomes a legend.`,
      `${s} straight. The stats are getting nervous.`,
      `${s} in a row. Win the next and it is a brag; lose it and it is a story.`,
      ...(tying
        ? [`${s} straight — your personal best. Stopping here is also a skill.`]
        : [`${s} straight. Your best is ${best}.`]),
    ],
    ja: [
      `${s}連勝中です。今やめれば今日は伝説になります。`,
      `${s}連勝。統計がそろそろ怖がっています。`,
      `${s}連勝目。次に勝てば自慢、負ければ物語です。`,
      ...(tying
        ? [`${s}連勝 — 自己最高記録です。ここで止めるのも実力です。`]
        : [`${s}連勝。自己最高は${best}です。`]),
    ],
  };
  return p[lang];
}

function todaySameChar(f: QuipFacts, lang: Lang): string[] {
  const t = f.todaySameChar;
  if (!t) return [];
  const p: Pool = {
    ko: [
      `오늘 만난 상대 중 ${t.count}명이 ${t.opp}였습니다. 유행인가 봅니다.`,
      `${t.opp}만 ${t.count}번 만나셨습니다. 매칭이 뭔가 알고 있는 걸까요.`,
      `오늘의 ${t.opp} ${t.count}연벽. 연습은 되셨겠습니다.`,
    ],
    en: [
      `${t.count} of today's opponents were ${t.opp}. Must be trending.`,
      `You met ${t.opp} ${t.count} times today. Matchmaking knows something.`,
      `${t.count} rounds of ${t.opp} today. Free matchup practice, at least.`,
    ],
    ja: [
      `今日の相手のうち${t.count}人が${t.opp}でした。流行っているようです。`,
      `${t.opp}と${t.count}回。マッチングが何か知っているのでしょうか。`,
      `本日の${t.opp}${t.count}連戦。練習にはなりましたね。`,
    ],
  };
  return p[lang];
}

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
      mood === 'hot'
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

  // 최고 대비
  if (f.peakGamesAgo > 100 && f.peakRating > f.currentRating) {
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
        `${f.shutoutLossPct}% 는 한 라운드도 못 따고 끝난 경기입니다. 프레임을 한 번 찾아보세요.`,
      ],
      en: [
        `${f.shutoutLossPct}% of your losses are 3-0. That is not a matchup, that is missing information.`,
        `In ${f.shutoutLossPct}% of games you took zero rounds. Go look up the frame data.`,
      ],
      ja: [
        `3-0で負ける割合が${f.shutoutLossPct}%です。相性ではなく情報不足です。`,
        `${f.shutoutLossPct}%は1ラウンドも取れずに終わった試合です。フレームを調べましょう。`,
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
  /** 기본 농담과 섞어 뽑는다. */
  traits: string[];
}

/**
 * 우선순위: 좁은 조건이 이긴다.
 *   마일스톤 > 최고 갱신 > 승단·강등 > 복귀 > 연승 > 오늘 몰림 > 시각
 *
 * 근거: 위로 갈수록 발화 빈도가 낮다. 자주 참인 축이 앞에 있으면 뒤의 축은 영영
 * 안 나온다 — seed % N 으로 섞으면 드문 사건이 묻히는 정반대 문제가 생긴다
 * (10,000판 달성은 평생 한 번인데 25% 확률로 밀리면 안 된다).
 */
export function factPools(f: QuipFacts | null, lang: Lang, mood: Mood): FactPools {
  if (!f) return { events: [], traits: [] };
  return {
    events: [
      milestone(f, lang),
      peakFresh(f, lang),
      rankChange(f, lang),
      comeback(f, lang),
      winStreak(f, lang),
      todaySameChar(f, lang),
      clock(f, lang, mood),
    ].filter((p) => p.length > 0),
    traits: traits(f, lang),
  };
}

export { empty as _emptyPool };
