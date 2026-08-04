'use client';

// 홈 하단의 설명 섹션.
//
// ── 왜 넣나 ───────────────────────────────────────────────────────
// 색인되는 페이지가 홈 한 장뿐인데, 그 한 장의 본문이 528자였다. 대부분 버튼·라벨이라
// 구글 입장에서는 "검색 폼 하나 있는 페이지"다. 색인은 되지만 순위가 안 나온다.
// (플레이어 페이지는 sitemap 에 넣지 않기로 했으므로 늘릴 수 있는 건 이 한 장뿐이다)
//
// ── 왜 client component 인가 ─────────────────────────────────────
// 언어 전환이 클라이언트 상태라 어쩔 수 없다. 다만 Next 는 client component 도
// 초기 HTML 로 서버 렌더하므로 **크롤러는 그대로 읽는다** — lang 초기값이 'ko' 라
// 한국어 본문이 색인된다(주 대상이 한국 유저라 그게 맞다).
//
// ── 접는 방식 ────────────────────────────────────────────────────
// 첫 문단은 항상 보이고, 나머지는 <details> 로 접는다.
// 구글은 details 안의 내용도 색인한다. 다만 접힌 내용에 가중치를 덜 준다는 관측이
// 있어서, **가장 중요한 요약 한 문단은 펼쳐둔다.**
// <details> 는 브라우저 기본 기능이라 JS 없이도 열린다 — 크롤러에게도, JS 를 끈
// 사람에게도 동작한다.

import type { Lang } from './i18n';
import { SITE_URL } from '@/lib/site';

interface Block {
  intro: string;
  sections: { q: string; a: string[] }[];
  faq: { q: string; a: string }[];
  faqTitle: string;
}

const C: Record<Lang, Block> = {
  ko: {
    intro:
      '철권 전적 검색 사이트입니다. 철권8 랭크전 전적을 닉네임이나 식별코드로 조회해 캐릭터별 승률, 상대 캐릭터 매치업, 레이팅 추이, 플레이 패턴까지 한 번에 보여줍니다. 회원가입이나 설치 없이 바로 조회할 수 있고, 전체 이력을 그대로 집계하기 때문에 최근 몇 판이 아니라 지금까지 쌓인 기록 전부를 기준으로 봅니다.',
    sections: [
      {
        q: '무엇을 볼 수 있나요',
        a: [
          '캐릭터별 성적 — 사용한 캐릭터마다 경기 수와 승률, 라운드 지표까지 나눠서 봅니다.',
          '매치업 — 상대 캐릭터별 승률에서 강점과 약점을 뽑습니다. 표본 기준은 전체 경기 수에 맞춰 자동으로 조정되고, 적게 상대한 캐릭터는 순위에서 뒤로 밀립니다.',
          '레이팅 추이 — 경기 순서대로 그린 그래프입니다. 캐릭터를 바꾼 시점이 어디였는지도 같이 보입니다.',
          '세션 분석 — 한 세션에서 몇 판째부터 성적이 꺾이는지 계산합니다. "오늘 몇 판까지 하는 게 좋은가"에 대한 답입니다.',
          '시간대·요일 — 언제 강하고 언제 약한지. 표본이 적은 구간은 제외합니다.',
          '실력차별 성적 — 나보다 레이팅이 높은 상대와 낮은 상대를 나눠 봅니다. 전체 승률보다 실력을 잘 보여줍니다.',
          '시즌별·승단 이력·상대전적 — 시즌마다 성적이 어떻게 달라졌는지, 단이 언제 오르내렸는지, 특정 상대와의 전적은 어떤지.',
          '여러 명 비교 — 2~4명을 나란히 놓고 항목마다 우위를 표시합니다.',
          '리포트 — 위 내용을 한 장으로 요약해 공유하거나 PDF 로 인쇄할 수 있습니다.',
          '내려받기 — 엑셀·CSV·JSON 으로 저장할 수 있습니다.',
        ],
      },
      {
        q: '식별코드(폴라리스 ID)를 모를 때',
        a: [
          '식별코드는 12자리 영숫자입니다. 몰라도 됩니다 — 검색창에 닉네임을 그대로 넣으면 후보 목록이 나오고, 거기서 고르면 식별코드가 자동으로 채워집니다.',
          '닉네임이 흔해서 여러 명이 나오면 캐릭터와 레이팅을 보고 고르시면 됩니다. 예전에 쓰던 닉네임으로도 찾고 싶으면 "과거 닉네임 포함 검색"을 켜세요.',
          '한 번 조회한 뒤에는 주소창이 그 사람 주소로 바뀝니다. 그 주소를 복사해 두면 다음부터 바로 들어올 수 있고, 공유 버튼을 쓰면 지금 보고 있는 화면 그대로 링크가 만들어집니다.',
        ],
      },
    ],
    faqTitle: '자주 묻는 것',
    faq: [
      {
        q: '철권 전적은 어디서 보나요?',
        a: '게임 안에서는 최근 몇 판과 누적 승률 정도만 보입니다. 이 사이트는 wavu wank 의 공개 기록을 받아 랭크전 전체 이력을 집계하므로, 캐릭터별·상대별·시간대별로 나눠서 볼 수 있습니다. 닉네임만 알면 조회됩니다.',
      },
      {
        q: '데이터는 어디서 가져오나요?',
        a: '전적 자료는 wavu wank(wank.wavu.wiki)의 공개 기록에서 가져옵니다. 이 사이트는 별도 데이터베이스를 두지 않고, 조회할 때마다 받아와서 그 자리에서 집계합니다.',
      },
      {
        q: '얼마나 최신인가요?',
        a: '같은 식별코드는 10분 동안 캐시합니다. 방금 친 경기는 원본에 반영된 뒤에 보이며, 원본 수집이 실패하면 최대 6시간까지 지난 사본을 보여주고 화면에 그 사실을 표시합니다.',
      },
      {
        q: '퀵매치나 플레이어 매치도 볼 수 있나요?',
        a: '랭크전만 볼 수 있습니다. 원본이 랭크전 기록만 공개하기 때문이고, 다른 모드를 가져올 방법이 지금은 없습니다.',
      },
      {
        q: '제 기록이 안 나옵니다.',
        a: '랭크전 기록이 없는 계정이거나 식별코드가 잘못 입력된 경우입니다. 식별코드는 12자리 영숫자이며, 닉네임으로 검색해서 다시 확인해 보세요.',
      },
      {
        q: '회원가입이 필요한가요?',
        a: '필요 없습니다. 로그인도 설치도 없고, 조회한 식별코드를 따로 저장하지도 않습니다.',
      },
      {
        q: '공식 사이트인가요?',
        a: '아닙니다. 개인이 만든 비공식 팬 사이트이며 반다이남코와 아무 관련이 없습니다.',
      },
    ],
  },

  en: {
    intro:
      'Look up Tekken 8 ranked match history by polaris ID or nickname and see win rates per character, matchups against every opponent character, rating trends and play patterns in one place. No sign-up, no install, and the whole history is aggregated — not just your recent games.',
    sections: [
      {
        q: 'What you can see',
        a: [
          'Per-character results — games, win rate and round stats for every character you have played.',
          'Matchups — best and worst opponent characters by win rate. The sample threshold scales with your total games, and matchups you have played less rank lower.',
          'Rating trend — plotted by game order, with character switches visible along the way.',
          'Session analysis — how deep into a session your results start to fall off. An answer to "how many games should I play today".',
          'Time of day and weekday — when you are strong and when you are not. Thin buckets are excluded.',
          'By opponent strength — split against higher- and lower-rated opponents. Says more about skill than the overall number.',
          'Seasons, rank history, head-to-head — how each season went, when your rank moved, and your record against specific players.',
          'Compare — put 2 to 4 players side by side with the better value highlighted per row.',
          'Report — a one-page summary you can share or print to PDF.',
          'Download — save as Excel, CSV or JSON.',
        ],
      },
      {
        q: "If you don't know your polaris ID",
        a: [
          'A polaris ID is 12 alphanumeric characters. You do not need it — type a nickname into the search box and pick from the results; the ID fills in automatically.',
          'If a common nickname returns several players, pick by character and rating. To match nicknames someone used in the past, turn on the historical-nickname option.',
          'After a lookup the address bar changes to that player. Bookmark it to come straight back, or use the share button to copy a link to exactly what you are looking at.',
        ],
      },
    ],
    faqTitle: 'Frequently asked',
    faq: [
      {
        q: 'Where does the data come from?',
        a: 'Match data comes from the public records at wavu wank (wank.wavu.wiki). This site keeps no database of its own — it fetches and aggregates on each lookup.',
      },
      {
        q: 'How up to date is it?',
        a: 'Each polaris ID is cached for 10 minutes. A match appears once it reaches the source; if fetching fails, a copy up to 6 hours old is shown and the page says so.',
      },
      {
        q: 'Can I see quick match or player match?',
        a: 'Ranked only. The source publishes ranked records only, and there is currently no way to obtain the other modes.',
      },
      {
        q: 'My record does not show up.',
        a: 'Either the account has no ranked games, or the polaris ID is wrong. IDs are 12 alphanumeric characters — try searching by nickname instead.',
      },
      {
        q: 'Do I need an account?',
        a: 'No. No login, no install, and the IDs you look up are not stored.',
      },
      {
        q: 'Is this official?',
        a: 'No. It is an unofficial fan site with no affiliation to Bandai Namco.',
      },
    ],
  },

  ja: {
    intro:
      '鉄拳8のランクマッチ戦績を、IDまたはニックネームで検索してキャラ別勝率・相手キャラとの相性・レート推移・プレイ傾向までまとめて表示するサイトです。会員登録もインストールも不要で、直近の数戦ではなく全履歴を集計して表示します。',
    sections: [
      {
        q: '何が見られますか',
        a: [
          'キャラ別成績 — 使用キャラごとの試合数・勝率・ラウンド指標。',
          'マッチアップ — 相手キャラ別の勝率から得意・苦手を抽出します。サンプル基準は総試合数に応じて自動調整され、対戦数が少ない相手は順位が下がります。',
          'レート推移 — 試合順に描いたグラフ。キャラを変えた時期も一緒に見えます。',
          'セッション分析 — 1回のプレイで何戦目から成績が落ちるかを算出します。「今日は何戦までにするか」への答えです。',
          '時間帯・曜日 — いつ強く、いつ弱いか。サンプルの少ない区間は除外します。',
          '格上・格下との成績 — 自分よりレートが高い相手と低い相手に分けて見ます。総合勝率より実力を表します。',
          'シーズン別・段位履歴・対戦相手別 — シーズンごとの変化、段位が動いた時期、特定の相手との戦績。',
          '複数比較 — 2〜4人を並べ、項目ごとに優位な側を強調表示します。',
          'レポート — 以上を1ページにまとめ、共有やPDF印刷ができます。',
          'ダウンロード — Excel・CSV・JSON で保存できます。',
        ],
      },
      {
        q: 'IDが分からないとき',
        a: [
          'IDは英数字12桁です。分からなくても構いません — 検索欄にニックネームを入れると候補が出て、選べばIDが自動で入ります。',
          'よくある名前で複数出た場合は、キャラとレートを見て選んでください。過去に使っていた名前でも探したい場合は「過去のニックネームを含めて検索」をオンにします。',
          '一度検索するとアドレスがその人のものに変わります。ブックマークすれば次回すぐ開けますし、共有ボタンを使えば今見ている画面そのままのリンクが作れます。',
        ],
      },
    ],
    faqTitle: 'よくある質問',
    faq: [
      {
        q: 'データはどこから取得していますか？',
        a: '戦績データは wavu wank(wank.wavu.wiki)の公開記録から取得しています。当サイトは独自のデータベースを持たず、検索のたびに取得してその場で集計します。',
      },
      {
        q: 'どれくらい最新ですか？',
        a: '同じIDは10分間キャッシュします。試合は元データに反映されてから表示され、取得に失敗した場合は最大6時間前の控えを表示し、その旨を画面に明示します。',
      },
      {
        q: 'クイックマッチやプレイヤーマッチも見られますか？',
        a: 'ランクマッチのみです。元データがランクマッチしか公開しておらず、他のモードを取得する手段が現在ありません。',
      },
      {
        q: '自分の記録が出てきません。',
        a: 'ランクマッチの記録がないアカウントか、IDの入力間違いです。IDは英数字12桁です。ニックネームで検索して確認してみてください。',
      },
      {
        q: '会員登録は必要ですか？',
        a: '不要です。ログインもインストールもなく、検索したIDを保存することもありません。',
      },
      {
        q: '公式サイトですか？',
        a: 'いいえ。個人が作った非公式ファンサイトで、バンダイナムコとは一切関係ありません。',
      },
    ],
  },
};

export default function SeoContent({ lang }: { lang: Lang }) {
  const c = C[lang];

  // 사이트 자체를 설명하는 구조화 데이터. potentialAction 은 검색결과에
  // 이 사이트 전용 검색창(sitelinks searchbox)이 붙을 수 있게 하는 것으로,
  // 붙는다는 보장은 없지만 비용이 없다. 조회 주소가 /?q=닉네임 형태라 그대로 쓴다.
  const siteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '철권8 전적 통계',
    alternateName: ['철권 전적 검색', 'Tekken 8 Stats'],
    url: SITE_URL,
    inLanguage: 'ko',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  // FAQ 구조화 데이터. 검색결과에 질문이 펼쳐져 나올 수 있다.
  // 초기 서버 렌더 언어가 'ko' 라 한국어 판을 싣는다 — 크롤러가 보는 것과 일치시킨다.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: C.ko.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <section className="seo">
      <p className="seo-intro">{c.intro}</p>

      {c.sections.map((s) => (
        <details key={s.q} className="seo-block">
          <summary>{s.q}</summary>
          <ul>
            {s.a.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ))}

      <details className="seo-block">
        <summary>{c.faqTitle}</summary>
        <dl>
          {c.faq.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </details>

      <script
        type="application/ld+json"
        // 우리가 만든 객체만 넣는다 — 사용자 입력이 섞이지 않으므로 안전하다.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </section>
  );
}
