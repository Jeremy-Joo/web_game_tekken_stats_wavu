# 철권8 전적 통계 — wavu 웹

식별코드(polaris ID)만 넣으면 [wank.wavu.wiki](https://wank.wavu.wiki)의 공식 JSON API 에서
**전체 랭크전 이력을 한 번에** 받아 통계로 보여준다. 데스크톱 도구
`tekken8_Stats_WPF` 의 웹 버전 — 설치·브라우저 자동화·수동 단계 전부 없음.

## 기능

- **집계 탭 9종** — 캐릭터별 / 시즌 / 상대 캐릭 / 약점 매치업 / 라운드(접전·셧아웃) /
  상대전적(h2h, 상대 식별코드 기준) / 일별 / 세션(120분 공백 구분) / 레이팅 추이
- **기간 필터** — 시작·종료일 지정
- **여러 명 비교(2~4명)** — 개요·시즌·캐릭터 나란히 + 맞대결 기록 + 공통 상대 승률
- **엑셀 다운로드** — 시트 구성이 WPF/py 결과물과 같은 형태

## 왜 wavu 인가

ewgf.gg 는 Cloudflare 뒤라 서버 수집이 불가능하다(403/401). wavu 는 공식 API 를 열어뒀다:

```
GET https://wank.wavu.wiki/player/<식별코드>/replays
Accept: application/json
```

레이팅 변동·상대 식별코드까지 직접 주므로 파싱·추정이 필요 없다.
대신 **랭크전만** 있다 — 퀵/플레이어 매치 전적은 다루지 않는다.

## 개발

```bash
npm install
npm run dev        # http://localhost:3000
npm run validate   # 실데이터 자가검증 (PASS 확인)
npm run build
```

## Vercel 배포

```bash
vercel             # 또는 GitHub 연결 후 push
```

배포 직후 `https://<도메인>/api/probe` 를 열어 `"ok": true` 를 확인한다.
(Vercel 데이터센터 IP 에서 wavu 가 열리는지 확인하는 프로브)

## 데이터 출처

[wank.wavu.wiki](https://wank.wavu.wiki) — 이 사이트는 Bandai Namco 와 무관하다.
