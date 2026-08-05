// 플레이어 인덱스 — 유사도 검색·필터형 무작위·표본 통계가 읽는 스냅샷.
//
// ── 왜 실시간이 아니라 스냅샷인가 ────────────────────────────────────
// "나와 비슷한 유형 찾기"는 비교 대상 수백 명의 프로필이 필요하다. wavu 는
// 한 번에 하나씩만 부르는 게 예의라(공식 문서) 조회 시점에 만들 수 없고,
// 조회할 때마다 Blob 에 쌓는 방식은 작업 횟수 한도로 스토어가 정지된 사고가
// 있다(lib/wavu/cache.ts 머리말). 그래서 hexagon-baseline.ts 와 같은 방식을 쓴다:
// **개발자가 손으로 돌리는 스크립트가 월 1~2회 만들고, git 에 파일로 굳힌다.**
//
//   갱신: scripts/build-player-index.ts
//     ga 모드    월 2회 — GA 조회 기록(90일)에서 ID 를 얻어 신규만 수집
//     feed 모드  월 1회 — wavu 공개 피드에서 표본 보충
//     refresh    월 1회 — 오래된 행 재수집 (lastPlayed 가 낡으면 '최근 활동' 필터가 거짓말이 된다)
//
// ── 표본이 무엇인지 정직하게 ─────────────────────────────────────────
// source='lookup' 은 "이 사이트에서 조회된 사람들"이고 유명인·한국 쏠림이 있다.
// source='feed' 는 "그 시각에 랭크를 돌리던 아무나"다. 통계를 낼 때는 이 구분을
// 유지할 것 — "전체 유저"라고 말하면 안 된다.
//
// ── 제품 점수에 들이지 않는다 ────────────────────────────────────────
// hexagon.ts 의 '왜 절대 눈금인가'와 같은 규칙이다. 이 인덱스는 검색·탐색·통계용이고,
// 조회자의 점수·모양을 이 모집단으로 환산하는 데 쓰면 안 된다.

import raw from './player-index-data.json';

export interface PlayerIndexRow {
  id: string;
  name: string;
  /** lookup = GA 조회 기록 출신, feed = 피드 표본, both = 양쪽에서 발견 */
  source: 'lookup' | 'feed' | 'both';
  /** 이 행을 수집한 시각(epoch 초). 화면은 "N일 전 스냅샷"으로 표기한다. */
  fetchedAt: number;
  games: number;
  /** 마지막 경기(epoch 초) — '최근 활동' 필터의 근거 */
  lastPlayed: number;
  /** 마지막 경기의 game_version — '이번 패치' 필터의 근거 */
  lastVersion: number;
  wrOverall: number;
  /** 최근 200판 승률 — 통산은 50%로 수렴해서 변별력이 없다 */
  wrRecent200: number;
  rating: number;
  peakRating: number;
  mainChar: string;
  mainCharGames: number;
  /** 육각형 6축의 눈금 위치(0~100). 축이 못 재지면 null. */
  hex: Record<string, number | null>;
  /** 세션 몇 판째부터 성적이 꺾이나. 못 찾으면 null. (장기전 추락 필터) */
  stopAfter: number | null;
  dropPp: number | null;
  adviceReliable: boolean;
  /** GA 조회수(90일). feed 출신은 0. */
  lookups: number;
}

export interface PlayerIndex {
  updatedAt: number;
  minGames: number;
  rows: PlayerIndexRow[];
  /** 500판 미달로 거른 ID → 판수·확인 시각. 매번 다시 받지 않기 위한 기록. */
  skipped: Record<string, { games: number; at: number }>;
}

const INDEX = raw as unknown as PlayerIndex;

export function playerIndex(): PlayerIndex {
  return INDEX;
}

/** 인덱스에서 관측된 최대 game_version = '이번 패치'. 경계를 코드에 박지 않는다(seasons.ts 규칙). */
export function currentVersion(): number {
  let v = 0;
  for (const r of INDEX.rows) if (r.lastVersion > v) v = r.lastVersion;
  return v;
}
