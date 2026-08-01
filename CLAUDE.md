# 철권8 전적 통계 — wavu (웹)

wavu wank 의 **공식 JSON API**로 랭크전 전적을 받아 서버에서 집계해 보여주는 Next.js 사이트.
`tekken8_Stats_WPF`(데스크톱)의 웹 대체품. 배포는 Vercel.

## 핵심 설계 — 스크레이핑 아님

```
GET https://wank.wavu.wiki/player/<식별코드>/replays
Accept: application/json          ← 이 헤더가 없으면 HTML 이 온다
```

**한 번의 요청으로 그 플레이어의 전체 이력이 온다.**
브라우저·Playwright·Cloudflare 우회 전부 불필요. 이 전제가 깨지면(응답이 HTML 로 변함)
`lib/wavu/client.ts` 가 명시적 에러를 낸다 — 조용히 빈 결과가 되지 않게 유지할 것.

- HTML 페이지 경로(`?before=` 페이지네이션, `/opps` 등)는 Cloudflare 403 에 막힌다.
  **HTML 스크레이핑으로 되돌리려는 시도는 하지 말 것.**
  (예외 하나 — 닉네임 검색만은 JSON 변형이 없어 HTML 을 판다. `lib/wavu/search.ts`)
- wavu 레이트리밋: "요청을 한 번에 하나씩이면 안 걸린다" (공식 문서).
  → 비교 모드도 **순차 수집**이다. `Promise.all` 로 바꾸지 말 것.

## 규모 — 여기서 대부분의 사고가 난다

전적 수가 사람마다 두 자릿수 배로 벌어진다. **평균이 아니라 상단을 기준으로 설계할 것.**

| 실측 (2026-08) | 경기 | wavu 원본 | gzip |
|---|---|---|---|
| 보통 | ~500 | 0.3MB | 40KB |
| The Quickster | 7,828 | 4.1MB | 487KB |
| KRX LowHigh | **30,233** | **15.2MB** | 1.86MB |

여기서 나온 규칙 두 가지:

1. **캐시는 Vercel Blob 이다** (`lib/wavu/cache.ts`). `unstable_cache`(Data Cache)는
   **항목당 2MB 한도**가 있고 넘으면 **에러 없이 저장을 건너뛴다.** 그래서 전적이 많은
   사람 — 남들이 제일 많이 찾는 사람 — 만 캐시가 안 걸리고 매번 wavu 를 때렸다.
   **Data Cache 로 되돌리지 말 것.** 크기를 바꿨으면 반드시 재서 확인할 것
   (같은 요청 3번 → 2회차부터 빨라지는가).
2. **응답에 `경기수 × 무언가` 로 커지는 표를 싣지 말 것.** 레이팅 추이가 캐릭터마다
   컬럼을 만드는 와이드 포맷이었다 → 30,233경기 × 43컬럼 = 130만 셀, 88%가 null,
   응답 7.32MB. 좁은 포맷으로 바꿔 **1.69MB(셀 12만)** 가 됐고 정보 손실은 0이다
   (그래프는 원래 앞 3칸만 읽고 있었다). **엑셀만** 와이드로 펼친다(`widenTrend`).

## 빌드 / 검증

```
npm install
npm run dev          # http://localhost:3000
npm run check        # 네트워크 없는 회귀 테스트 (토큰 해석 · 검색 파싱) — 항상 먼저
npm run validate     # 실데이터 자가검증 (PASS 확인) — 요청 1회뿐이라 부담 없음
npm run build
```

`npm run check` 는 **조용히 깨지는 두 곳**을 지킨다. 규칙을 바꾸면 여기가 먼저 깨져야 한다.

- `scripts/check-tokens.ts` — 입력이 식별코드냐 닉네임이냐 판정.
  사고 이력: `HATE_THIS_GAME` 이 영숫자만 남기면 12자(`HATETHISGAME`)라 식별코드로
  오인돼 검색을 건너뛰고 404 가 났다. **구분자를 지우기 전 원문으로 판정할 것.**
- `scripts/check-search.ts` — wavu 검색 HTML 파싱. 구조 변화를 '0건'으로 위장하지 않는지.

## 배포

**`main` 에 push 하면 Vercel 이 자동 배포한다** (2026-08-02 부터 GitHub 연동됨).
그전에는 연동이 없어 push 해도 반영되지 않았다 — 옛 기억으로 "push 했는데 왜 그대로지"
하지 말 것. 연동 상태는 `npx vercel git connect` / `disconnect` 로 바꾼다.

수동 배포가 필요하면 `npx vercel --prod` (프로젝트: `teamjeremio/tekken8stats`).
로컬에 `.vercel/` 이 없으면 먼저
`npx vercel link --yes --scope teamjeremio --project tekken8stats` —
**`--project` 를 빼면 새 프로젝트가 만들어져 URL 이 바뀐다.**

배포 직후 확인할 것:

1. `/api/probe` — Vercel IP 에서 wavu 가 200 을 주는가.
2. 헤비 유저 조회를 두 번 — 응답의 `cache.fetchedAt` 이 두 번 다 같으면 Blob 캐시가
   먹은 것이다. 값이 매번 바뀌면 캐시가 안 걸리고 wavu 를 계속 때리는 중이다.

## 구조

```
app/page.tsx               한 명 / 여러 명 비교 화면 (탭+표, 기간 필터, 엑셀 링크)
app/api/replays/[id]       수집→정규화→집계 JSON
app/api/compare            2~4명 비교 (순차 수집)
app/api/xlsx/[id]          엑셀 다운로드 ('compare' 는 예약어)
app/api/search             닉네임 검색 중계 (유일한 HTML 파싱)
app/api/visit              방문 카운터 (Blob)
app/api/probe              배포 후 wavu 접근성 확인용
lib/wavu/client.ts         wavu 호출 + 에러 분류
lib/wavu/cache.ts          Blob 캐시 + wavu 실패 시 지난 사본 폴백  ← 수집은 전부 여기로
lib/wavu/search.ts         검색 HTML 파서 (순수 함수 — 테스트됨)
lib/wavu/token.ts          입력이 식별코드냐 닉네임이냐 판정 (순수 함수 — 테스트됨)
lib/tekken/                집계(aggregations)·비교(compare)·시즌(seasons)·xlsx
```

**전적 수집은 반드시 `lib/wavu/cache.ts` 의 `getReplays()` 로 한다.**
`fetchReplays()` 를 라우트에서 직접 부르면 캐시와 stale 폴백을 건너뛴다.

## 데이터 특성 (주의)

- **랭크전만 있다** (battle_type=2 뿐). 퀵매치·플레이어매치는 ewgf 에만 있고, ewgf 는 막혀 있다.
- `chara_id`/`rank` 는 숫자다. 캐릭터 매핑은 `lib/wavu/chars.ts` — HTML×JSON 조인으로
  실측 도출(41종, 충돌 0). **신캐 추가 시 `#<숫자>` 로 표에 드러난다** — 그때 한 줄 추가.
- `rank`(단)는 이름 매핑을 안 만들었다(사이트가 노출 안 함). 숫자 그대로 둔 것은 의도.
- 시각은 **KST 벽시계를 UTC 필드에 담는다** (`lib/tekken/models.ts` 참조). `getUTC*` 로 읽을 것.
- **시즌 판정의 정답은 `game_version` 하나다** (`models.seasonOf`). 자릿수로 계산하므로
  S4 가 열려도 저절로 따라간다. 화면의 시즌 필터도 날짜가 아니라 `?season=S3` 키로 보내고,
  버튼 목록·구간은 `lib/tekken/seasons.ts` 가 데이터에서 파생시킨다.
  **시즌 경계 날짜를 코드에 다시 적지 말 것** — 예전에 그랬다가 두 기준이 갈릴 뻔했다.

## 관련 저장소

- `tekken8_Stats_WPF` — 데스크톱판(ewgf+wavu, Playwright). **집계 의미의 원본이자 유일한 현역.**

**은퇴한 참조처 (2026-08-01)** — 아래 둘은 `D:\Git_jerry\_removed\` 로 내려갔고
GitHub은 아카이브 상태다. 코드는 그대로 남아 있으니 필요하면 열어볼 것.

- `data_game_tk8_data_Wavuwank_py` — py 수집기. `build_sessions` 등 집계의 출처였다.
  같은 집계가 `TekkenStats.Core` 에도 있으니 공식을 확인할 일이 생기면 그쪽을 먼저 본다.
- `web_game_tekken_stats_mobile` — ewgf 프래그먼트 방식 모바일 뷰어.
  ewgf 수집이 다시 필요해지면 `_removed\web_game_tekken_stats_mobile\lib\capture.ts` 참조.
