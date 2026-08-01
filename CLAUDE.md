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
  예외는 **둘뿐**이다. 둘 다 JSON 에 아예 없는 정보라서 어쩔 수 없는 경우다:
  1. 닉네임 검색 (`lib/wavu/search.ts`) — 검색은 JSON 변형이 없다(`?_format=json` 무시).
  2. 서버 지역 (`lib/wavu/region.ts`) — `/player/<id>` 페이지의
     `<span class="region">`. `/replays` JSON 필드 24개에 국가·지역이 없다(전수 확인).
     이 경로는 403 에 안 막힌다(실측 200).

  둘 다 **없어도 되는 값**으로 다룬다 — 못 읽으면 조용히 0건/기본값이 되는 게 아니라
  실패 이유를 구분해 내놓고(`scripts/check-search.ts`, `scripts/check-region.ts`),
  기능은 '모름' 상태로 계속 굴러간다.
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

   **Blob 은 용량이 아니라 작업 횟수에서 먼저 터진다** (`lib/wavu/blob.ts`).
   무료 한도가 Advanced 2,000/월 · Simple 10,000/월인데
   **`list()` 가 Advanced 다**(`put`·`copy` 도). 예전엔 읽기 전에 `list()` 로
   사본 유무를 확인해서 **조회 1회 = Advanced 1회**, 방문 1회 = 2회였고,
   스토어가 **이틀 만에 정지**됐다(용량은 10.9MB/1GB 로 멀쩡했다).
   → 지금은 `addRandomSuffix:false` 로 URL 을 경로에서 결정하고 **공개 URL 을 바로 읽는다.**
   404 가 곧 '사본 없음'이다. **읽기 경로에 `list()`·`head()` 를 넣지 말 것** —
   `scripts/check-blob-ops.ts` 가 소스를 읽어 막는다(증상이 없는 실패라 테스트로 잡는다).
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
- `scripts/check-region.ts` — 지역 파싱 + 시간대 추정. 구조 변화를 '지역 없음'으로
  위장하지 않는지, 그리고 **추정이 지역 범위를 절대 벗어나지 않는지**(25시간대 × 4지역).

## 배포

**`main` 에 push 하면 Vercel 이 자동 배포한다** (2026-08-02 부터 GitHub 연동됨).
그전에는 연동이 없어 push 해도 반영되지 않았다 — 옛 기억으로 "push 했는데 왜 그대로지"
하지 말 것. 연동 상태는 `npx vercel git connect` / `disconnect` 로 바꾼다.

수동 배포가 필요하면 `npx vercel --prod` (프로젝트: `teamjeremio/tekken8stats`).
로컬에 `.vercel/` 이 없으면 먼저
`npx vercel link --yes --scope teamjeremio --project tekken8stats` —
**`--project` 를 빼면 새 프로젝트가 만들어져 URL 이 바뀐다.**

배포 직후 확인할 것:

1. **`/api/probe` 하나면 된다.** `ok: true` 가 아니면 `hint` 에 뭘 고쳐야 하는지 나온다.
   조용히 깨지는 것 셋을 한 번에 본다 — 셋 다 **화면은 멀쩡한데 속으로만 죽는** 것들이다.
   - `wavu`   — Vercel IP 에서 JSON 이 열리는가 (막히면 조회 자체가 안 됨)
   - `region` — 지역 HTML 을 읽는가 (막히면 시간대가 KST 로 고정돼 외국 유저 분석이 어긋남)
   - `blob`   — 캐시 스토어에 **쓰기까지** 되는가 (읽기만 되는 상태가 실제로 있었다)
2. 헤비 유저 조회를 두 번 — 응답의 `cache.fetchedAt` 이 두 번 다 같으면 Blob 캐시가
   먹은 것이다. 값이 매번 바뀌면 캐시가 안 걸리고 wavu 를 계속 때리는 중이다.

**사고 이력**: Blob 스토어가 **Advanced Operation 한도 초과로 정지**돼 캐시와 방문
카운터가 함께 죽은 적이 있다(2026-08, 스토어 생성 이틀 만에 2.1k/2k). `cache.ts`·
`visit/route.ts` 가 Blob 실패를 조용히 삼키게 돼 있어서(로컬 개발을 굴러가게 하려는
의도) 응답은 정상이었고, 30,233경기 유저를 조회할 때마다 wavu 에서 15MB 를 새로
받고 있었다. 원인인 `list()` 는 없앴고(위 규모 절 참조), **`/api/probe` 의 `blob`
항목이 상태를 잡는다.** 실패는 여전히 삼키되 `console.warn` 을 남기므로 Vercel
로그에서도 보인다.

여기서 배운 것 하나 더 — **'모름'을 '0'으로 바꿔 말하지 말 것.** 방문 카운터가
저장소를 못 읽는 상태에서 푸터에 "방문 0" 을 사실처럼 띄우고 있었다. 지금은
`stale` 을 응답에 실어 화면이 숫자를 감춘다.

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
lib/wavu/region.ts         서버 지역 HTML 파서 + 현지 시간대 추정 (순수 함수 — 테스트됨)
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
- `stage_id` 는 수집만 하고 **집계하지 않는다.** 이름을 알 방법이 없어서다 —
  캐릭터와 달리 wavu 는 JSON 에도 HTML 에도 스테이지명을 안 쓴다(전문 검색 확인).
  스테이지별 승률 탭을 한 번 만들었다가 `#500 70.14%` 처럼 읽을 수 없어 뺐다.
  **매핑이 확보되기 전에는 다시 만들지 말 것.**
- 시각은 **KST 벽시계를 UTC 필드에 담는다** (`lib/tekken/models.ts` 참조). `getUTC*` 로 읽을 것.
  wavu 원본 `battle_at` 은 **진짜 UTC epoch 초**다 — wavu 화면이 `new Date(t*1000)` 에
  `toLocaleString(undefined, …)` (timeZone 옵션 없음)을 쓰므로 **보는 사람 브라우저 시간대**로
  그려진다. 즉 한국에서 wavu 를 보면 이 사이트와 시각이 같다. 시차 문제는 없다.
- **'시간대' 탭만 조회 대상의 현지 시각으로 볼 수 있다** (`lib/wavu/region.ts`).
  외국 유저를 KST 축에 얹으면 "새벽 6~8시 피크, 저녁 0%" 처럼 보여 해석이 통째로 틀린다
  (실측: 북미 The Quickster). 지역이 **가능한 오프셋 범위**를 주고, 활동 곡선이 그
  **범위 안에서** 하나를 고른다 — 곡선만 믿으면 22명 검증에서 5명이 최대 3시간 튀었다.
  - `asia` 는 +9 고정이다(범위 +7~+9). 랭크전 인구가 한국·일본이고, 흔한 경우를
    2시간 폭으로 흔들 이유가 없다. **한국 유저 조회는 동작이 예전과 완전히 같다.**
  - 지역을 못 읽으면 **추정하지 않는다.** KST 로 두고 '모름'이라고 화면에 밝힌다.
  - 기준 프로필(`REFERENCE_PROFILE`)은 asia 상위 6명 140,259경기 실측이다.
    **'수면 = 새벽 4시' 같은 상식으로 대체하지 말 것** — 게이머의 골짜기는 아침 6~7시라,
    상식으로 계산했더니 한국 유저가 UTC+5.5 로 나왔다.
  - **일별·세션·기간 필터·엑셀 파일명은 KST 로 남긴다.** 거기까지 밀면 '기간 08-01~08-02'
    의 의미가 조회 대상마다 달라지고, 두 사람 비교에서 같은 날짜가 다른 구간을 가리킨다.
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
