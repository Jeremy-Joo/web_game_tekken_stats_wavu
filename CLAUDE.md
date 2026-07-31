# 철권8 전적 통계 — wavu (웹)

wavu wank 의 **공식 JSON API**로 랭크전 전적을 받아 서버에서 집계해 보여주는 Next.js 사이트.
`tekken8_Stats_WPF`(데스크톱)의 웹 대체품. 배포는 Vercel.

## 핵심 설계 — 스크레이핑 아님

```
GET https://wank.wavu.wiki/player/<식별코드>/replays
Accept: application/json          ← 이 헤더가 없으면 HTML 이 온다
```

**한 번의 요청으로 그 플레이어의 전체 이력이 온다** (실측 7,812건 = 489KB gzip).
브라우저·Playwright·Cloudflare 우회 전부 불필요. 이 전제가 깨지면(응답이 HTML 로 변함)
`lib/wavu/client.ts` 가 명시적 에러를 낸다 — 조용히 빈 결과가 되지 않게 유지할 것.

- HTML 페이지 경로(`?before=` 페이지네이션, `/opps` 등)는 Cloudflare 403 에 막힌다.
  **HTML 스크레이핑으로 되돌리려는 시도는 하지 말 것.**
- wavu 레이트리밋: "요청을 한 번에 하나씩이면 안 걸린다" (공식 문서).
  → 비교 모드도 **순차 수집**이다. `Promise.all` 로 바꾸지 말 것.
- 같은 식별코드는 10분 캐시(`unstable_cache`). 기간 필터는 캐시 뒤 메모리에서.

## 빌드 / 검증

```
npm install
npm run dev          # http://localhost:3000
npm run validate     # 실데이터 자가검증 (PASS 확인) — 요청 1회뿐이라 부담 없음
npm run build
```

배포 직후 `/api/probe` 를 열어 Vercel IP 에서 wavu 가 200 을 주는지 확인할 것.

## 구조

```
app/page.tsx               한 명 / 여러 명 비교 화면 (탭+표, 기간 필터, 엑셀 링크)
app/api/replays/[id]       수집→정규화→집계 JSON
app/api/compare            2~4명 비교 (순차 수집)
app/api/xlsx/[id]          엑셀 다운로드 ('compare' 는 예약어)
app/api/probe              배포 후 wavu 접근성 확인용
lib/wavu/                  API 클라이언트, chara_id 매핑, 정규화
lib/tekken/                집계(aggregations)·비교(compare)·xlsx — WPF Core 대응
```

## 데이터 특성 (주의)

- **랭크전만 있다** (battle_type=2 뿐). 퀵매치·플레이어매치는 ewgf 에만 있고, ewgf 는 막혀 있다.
- `chara_id`/`rank` 는 숫자다. 캐릭터 매핑은 `lib/wavu/chars.ts` — HTML×JSON 조인으로
  실측 도출(41종, 충돌 0). **신캐 추가 시 `#<숫자>` 로 표에 드러난다** — 그때 한 줄 추가.
- `rank`(단)는 이름 매핑을 안 만들었다(사이트가 노출 안 함). 숫자 그대로 둔 것은 의도.
- 시각은 **KST 벽시계를 UTC 필드에 담는다** (`lib/tekken/models.ts` 참조). `getUTC*` 로 읽을 것.

## 관련 저장소

- `tekken8_Stats_WPF` — 데스크톱판(ewgf+wavu, Playwright). 집계 의미의 원본.
- `data_game_tk8_data_Wavuwank_py` — py 수집기. `build_sessions` 등 집계의 출처.
- `web_game_tekken_stats_mobile` — ewgf 프래그먼트 방식 모바일 뷰어(별개 유지).
