// 기능 사용량 이벤트.
//
// ── 왜 이벤트 이름을 여럿 두는가 ──────────────────────────────────
// 하나로 묶고 파라미터로 구분하는 편이(feature_use + {name:'csv'}) 깔끔해 보이지만,
// GA4 는 **맞춤 측정기준으로 등록한 파라미터만** Data API 로 읽게 해준다. 게다가
// 등록 이전 기간은 영영 안 나온다. eventName 은 표준 측정기준이라 그런 준비가
// 필요 없다 — 그래서 기능마다 이름을 따로 준다.
// (같은 이유로 lib/ga.ts 의 lookupCounts 도 pagePath 로 가른다)
//
// ── 안 담는 것 ────────────────────────────────────────────────────
// 어떤 식별코드를 봤는지, 어떤 닉네임을 검색했는지는 여기 담지 않는다. 이건
// '기능이 쓰이나'를 세는 것이지 누가 뭘 했나를 남기는 것이 아니다.
// 조회 대상 자체는 이미 player_lookup 이 페이지 주소로 센다.

/** 세는 기능들. 값이 곧 GA4 이벤트 이름이다. */
export const FEATURE_EVENTS = {
  random_pick: '무작위로 보기',
  report_open: '리포트 보기',
  share_click: '공유',
  download_xlsx: '엑셀 내려받기',
  download_csv: 'CSV 내려받기',
  download_json: 'JSON 내려받기',
  compare_run: '여러 명 비교',
  // 탭 안의 보기 전환. 주소가 안 바뀌어서 페이지뷰로는 흔적이 없다 —
  // 이 옵션들이 제 값을 하는지 알려면 이것뿐이다.
  // 기본값에서 **벗어나는 쪽으로 바꿀 때만** 센다(되돌리기까지 세면 왕복이 2회가 된다).
  round_by_opp: '라운드 — 상대 캐릭터별로 펼쳐보기',
  tz_kst: '시간대 — 한국 시간으로 보기',
  season_by_version: '시즌 — 버전별로 나눠보기',
  // 캐릭터/강점/약점 매치업 공통 — 세 탭 중 어디서 눌렀는지는 안 가른다
  // (탭별로 나누면 이름이 6개가 되는데, "이 토글을 쓰는 사람이 있나"에는
  // 그 구분이 필요 없다).
  matchup_by_season: '캐릭터·매치업 — 시즌별로 나눠보기',
  matchup_by_version: '캐릭터·매치업 — 버전별로 나눠보기',
  matchup_by_custom_date: '캐릭터·매치업 — 날짜로 지정해서 나눠보기',
  lang_switch: '언어 전환',
} as const;

export type FeatureEvent = keyof typeof FEATURE_EVENTS;

export const FEATURE_NAMES = Object.keys(FEATURE_EVENTS) as FeatureEvent[];

/**
 * 이벤트 하나 보낸다.
 *
 * gtag 이 없으면 조용히 넘어간다 — GA_ID 환경변수가 없으면 layout 이 스크립트를
 * 아예 넣지 않기 때문이다(로컬 개발, 저장소 복제본). 통계가 없다고 기능이
 * 멈추면 안 된다.
 */
export function gaEvent(name: FeatureEvent): void {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', name);
}
