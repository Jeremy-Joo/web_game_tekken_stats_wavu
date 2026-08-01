// '나' 관점으로 정규화한 경기 레코드.
// C# TekkenStats.Core/Models.cs · py main.py 의 레코드와 같은 자리를 채우되,
// wavu JSON 이 직접 주는 값(레이팅/변동/상대 식별코드)을 그대로 쓴다.

/**
 * 시각 표현 규약 — **KST 벽시계를 UTC 필드에 담는다.**
 *
 * 즉 `dt` 는 항상 `getUTCHours()` 같은 UTC 접근자로 읽어야 KST 가 나온다.
 * 이렇게 하는 이유: 일별/세션 집계가 '한국 날짜' 기준이어야 기존 WPF·py 시트와
 * 같은 결과가 나오는데, 브라우저 로컬 타임존에 맡기면 보는 기기마다 달라진다.
 * 서버(UTC)와 클라이언트(KST)가 같은 값을 내야 하므로 고정 오프셋을 쓴다.
 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** epoch(초) → KST 벽시계를 담은 Date. */
export function kstFromEpoch(epochSec: number): Date {
  return new Date(epochSec * 1000 + KST_OFFSET_MS);
}

export interface MatchRecord {
  dt: Date; // KST 벽시계 (getUTC* 로 읽을 것)
  battleId: string; // wavu battle_id — 중복 제거 키

  player: string; // 내 닉네임(경기 당시가 아니라 현재 이름)
  myPolaris: string;
  myChar: string;
  /** 경기 **후** glicko2 레이팅 = rating_before + rating_change. */
  myRating: number;
  myDelta: number; // rating_change
  myPower: number; // 테켄 파워
  myRank: number; // 단(숫자) — wavu 가 이름을 노출하지 않아 숫자 그대로 둔다

  score: string; // "3-1"
  myRounds: number;
  oppRounds: number;
  result: 'W' | 'L';

  oppName: string;
  oppPolaris: string;
  oppChar: string;
  oppRating: number;
  oppDelta: number;
  oppPower: number;
  oppRank: number;

  season: string; // S1/S2/S3
  gameVersion: number;
  /**
   * wavu 의 stage_id 원본값. **집계에 쓰지 않는다.**
   * 이름을 알 방법이 없어서다 — wavu 는 JSON 에도 HTML 에도 스테이지명을 안 쓴다.
   * 필드만 남겨두는 이유는 나중에 매핑이 생기면 바로 쓰기 위해서다.
   * (aggregations.ts 의 '스테이지별 성적은 만들지 않는다' 주석 참조)
   */
  stageId: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'yyyy-MM-dd HH:mm:ss' (KST). */
export function formatDt(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** 'yyyy-MM-dd HH:mm' (KST) — 세션 라벨용. */
export function formatDtMin(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

/** 'yyyy-MM-dd' (KST) — 일별 그룹 키. */
export function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * game_version → 시즌.
 * 실측된 값이 10201~30101 이고 만 자리가 시즌과 일치한다(1xxxx=S1, 2xxxx=S2, 3xxxx=S3).
 * 새 시즌이 열리면 4xxxx 가 올 것이므로 하드코딩 대신 자릿수로 계산한다.
 */
export function seasonOf(gameVersion: number): string {
  const s = Math.floor(gameVersion / 10000);
  return s > 0 ? `S${s}` : '?';
}
