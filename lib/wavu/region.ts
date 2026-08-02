// 플레이어의 **서버 지역**과, 거기서 정한 **현지 시간대**.
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────────
// 이 사이트는 모든 시각을 KST 로 고정해 보여준다(models.ts 규약). 한국 유저를
// 조회하는 한 옳지만, 외국 유저를 조회하면 '시간대' 탭이 통째로 오독된다.
// 실측(2026-08): 북미 유저 The Quickster 는 KST 축에서 "새벽 5~8시 피크,
// 저녁 8~11시 0%" 로 보인다 — 승률 숫자는 맞지만 "새벽에 강하다"는 결론이 틀린다.
//
// ── 지역은 어디서 오나 ─────────────────────────────────────────────────────
// /replays JSON 에는 국가·지역 필드가 **없다**(필드 24개 전수 확인).
// 대신 플레이어 HTML 페이지에 리더보드 링크로 적혀 있다:
//
//   <span class="region"><a href="/leaderboard/asia">Asia</a></span>
//
// 그래서 이 파일은 검색(search.ts)에 이어 **두 번째이자 마지막 HTML 파싱**이다.
// 남의 사이트 구조에 얹혀 있으므로 깨지는 것 자체는 막을 수 없다. 목표는 같다 —
// **깨졌을 때 그럴듯한 오답을 내놓지 않는 것.** 못 읽으면 추정하지 않고 KST 로 돌아간다.
//
// ── 시간대는 어떻게 정하나 ─────────────────────────────────────────────────
// 지역은 넓다(America 는 UTC-8~-3, 5시간 폭). 그래서 두 단계로 좁힌다.
//   ① 지역이 **가능한 범위**를 준다 (하드 바운드 — 여기서 벗어날 수 없다)
//   ② 활동 곡선이 그 범위 **안에서** 하나를 고른다
// ②만 쓰면 범위 밖으로 튄다(22명 검증에서 5명이 최대 3시간 이탈). ①로 묶으면
// 이탈이 원천 봉쇄되고, 상관계수는 22명 중 20명이 0.73 이상이었다.

import type { Replay } from './types';

/** wavu 리더보드 지역 키. 모르는 값이 와도 코드는 문자열 그대로 담는다. */
export interface Region {
  /** 'asia' | 'am' | 'eu' | 'me' | 'oce' — 또는 wavu 가 새로 만든 값 */
  code: string;
  /** 화면 표기 ('Asia', 'America', …) — wavu 가 쓴 그대로 */
  label: string;
}

export type RegionParse =
  | { ok: true; region: Region | null } // null — 페이지는 정상인데 지역 표기가 없다
  /**
   * not_player_page — 플레이어 페이지가 아니다(없는 식별코드의 에러 페이지 등).
   * unknown_shape   — 지역 표기는 있는데 링크에서 값을 못 뽑았다. 구조 변경.
   */
  | { ok: false; reason: 'not_player_page' | 'unknown_shape' };

/**
 * 플레이어 페이지임을 확인하는 앵커.
 * 실측: 정상 플레이어 8/8 에 있고, 없는 식별코드의 에러 페이지에는 없다.
 * (에러 페이지도 HTTP 200 으로 오기 때문에 상태 코드로는 구분되지 않는다)
 */
const PAGE_ANCHOR = 'class="player-ratings"';
const REGION_MARK = 'class="region"';
const REGION_RE = /class="region"[^>]*>\s*<a[^>]+href="\/leaderboard\/([A-Za-z0-9-]+)"[^>]*>\s*([^<]+?)\s*</;

/** 플레이어 HTML 에서 지역을 뽑는다. 순수 함수 — 네트워크 없이 테스트된다. */
export function parseRegionHtml(html: string): RegionParse {
  if (!html.includes(PAGE_ANCHOR)) return { ok: false, reason: 'not_player_page' };

  // 지역 표기 자체가 없는 것은 고장이 아니다 — 리더보드에 오르지 못한 신규 계정 등.
  // '모른다'와 '깨졌다'를 반드시 구분한다.
  if (!html.includes(REGION_MARK)) return { ok: true, region: null };

  const m = html.match(REGION_RE);
  if (!m) return { ok: false, reason: 'unknown_shape' };
  return { ok: true, region: { code: m[1].toLowerCase(), label: m[2] } };
}

// ── 지역 → 시간대 ──────────────────────────────────────────────────────────

/** KST 오프셋(분). 이 사이트의 기본 시간대다. */
export const KST_MINUTES = 9 * 60;

interface RegionTz {
  /** 활동 곡선이 고를 수 있는 범위(시). 이 밖으로는 절대 나가지 않는다. */
  range: [number, number];
  /** 곡선을 못 믿을 때 쓰는 대표값(시). */
  fallback: number;
  /** true 면 곡선 보정을 하지 않고 fallback 을 그대로 쓴다. */
  pinned?: boolean;
}

/**
 * 실제 시간대 분포에서 잡은 범위.
 * asia 만 **고정**이다 — 범위가 +7~+9 인데 랭크전 인구는 한국·일본(+9)이 압도하고,
 * 이 사이트를 쓰는 사람이 조회하는 대상도 대부분 거기다. 2시간 폭을 곡선으로
 * 흔들면 한국 유저에게 "현지 추정 UTC+8" 같은 틀린 라벨이 붙을 위험만 생긴다.
 * (게다가 +9 는 화면 기본값과 같아서, 고정하면 흔한 경우의 동작이 그대로 유지된다)
 */
const REGION_TZ: Record<string, RegionTz> = {
  asia: { range: [9, 9], fallback: 9, pinned: true }, // 한국·일본
  am: { range: [-8, -3], fallback: -6 }, // 미 서부 ~ 브라질
  eu: { range: [0, 3], fallback: 1 }, // 영국 ~ 동유럽
  me: { range: [3, 4], fallback: 3 }, // 걸프 지역
  oce: { range: [8, 13], fallback: 10 }, // 호주 서부 ~ 뉴질랜드
};

/**
 * 기준 활동 프로필 — **현지시간별 경기 비율(천분율)**.
 *
 * 시간대를 아는 집단에서 뽑아야 해서 asia(=UTC+9) 상위 6명 140,259경기를 썼다
 * (2026-08 실측). 0시부터 23시까지.
 *
 * 읽는 법: 저녁 18~23시가 8% 대로 가장 높고, 05~11시가 1% 대로 비어 있다.
 * '새벽 4시'가 아니라 '아침 6~7시'가 골짜기인 게 핵심이다 — 게이머는 늦게 잔다.
 * 이 골짜기 위치를 맞추는 방식이라, 일반적인 '수면 시간 = 새벽 4시' 가정을
 * 쓰면 안 된다(그렇게 계산했더니 한국 유저가 UTC+5.5 로 나왔다).
 */
export const REFERENCE_PROFILE = [
  70, 56, 40, 31, 18, 10, 9, 11, 13, 14, 14, 13,
  15, 22, 30, 40, 54, 69, 81, 80, 74, 74, 80, 83,
] as const;

/** 곡선 보정을 시도할 최소 경기 수. 이보다 적으면 분포가 잡음이다. */
export const MIN_GAMES_FOR_CURVE = 300;
/** 이 상관계수 미만이면 '사람의 하루'로 보이지 않는다 — 보정을 포기한다. */
export const MIN_CORRELATION = 0.5;

export interface TimezoneGuess {
  /** UTC 오프셋(분). 화면·집계는 이 값만 쓴다. */
  offsetMinutes: number;
  /**
   * curve   — 지역으로 범위를 잡고 활동 곡선으로 고름 (가장 정확)
   * region  — 지역만 씀 (곡선이 표본 부족이거나 사람의 하루로 안 보임)
   * default — 지역을 모름. KST 로 둔다. **추정하지 않았다는 뜻이다.**
   */
  source: 'curve' | 'region' | 'default';
  /** source==='curve' 일 때 기준 프로필과의 상관계수. 아니면 null. */
  fit: number | null;
}

/** 두 24칸 배열의 피어슨 상관계수. */
function correlation(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  if (da === 0 || db === 0) return 0; // 전부 같은 값 — 비교할 모양이 없다
  return num / Math.sqrt(da * db);
}

/**
 * UTC 시각별 경기 수 24칸.
 *
 * `battle_at` 은 진짜 UTC epoch 초라서 나눗셈만으로 시각이 나온다(epoch 기준점이
 * UTC 자정이므로). 3만 경기짜리 플레이어에서 Date 를 3만 개 만들지 않으려는 것 —
 * 이 값은 조회마다 전체 이력으로 한 번씩 계산된다.
 */
export function hourHistogramUtc(replays: Replay[]): number[] {
  const h = new Array(24).fill(0);
  for (const r of replays) {
    const t = r?.battle_at;
    if (!Number.isFinite(t)) continue;
    h[(((Math.floor(t / 3600) % 24) + 24) % 24)]++;
  }
  return h;
}

/**
 * 정규화된 레코드로 같은 히스토그램을 만든다.
 *
 * 캐시가 원본이 아니라 정규화 레코드를 들고 있어서 필요하다(lib/tekken/codec.ts).
 * `dt` 는 **KST 벽시계를 UTC 필드에 담고 있으므로**(models.ts 규약) 9시간을
 * 되돌리면 진짜 UTC 시각이 된다.
 */
export function hourHistogramUtcFromRecords(
  records: readonly { dt: Date }[],
): number[] {
  const h = new Array(24).fill(0);
  for (const r of records) h[(((r.dt.getUTCHours() - 9) % 24) + 24) % 24]++;
  return h;
}

/** UTC 히스토그램을 offsetHours 만큼 돌려 '현지시간별'로 만든다. */
function toLocal(utc: readonly number[], offsetHours: number): number[] {
  return utc.map((_, i) => utc[(((i - offsetHours) % 24) + 24) % 24]);
}

/**
 * 지역 + 활동 곡선 → 현지 시간대.
 *
 * 지역을 모르면 **추정하지 않는다.** 곡선만으로도 값은 나오지만, 22명 검증에서
 * 범위를 최대 3시간 벗어났다. 틀린 시각을 자신 있게 보여주느니 KST 로 두고
 * '모름'이라고 말하는 편이 낫다.
 */
export function guessTimezone(
  region: Region | null,
  utcHistogram: readonly number[],
): TimezoneGuess {
  const tz = region ? REGION_TZ[region.code] : undefined;
  if (!tz) return { offsetMinutes: KST_MINUTES, source: 'default', fit: null };

  const games = utcHistogram.reduce((a, b) => a + b, 0);
  if (tz.pinned || games < MIN_GAMES_FOR_CURVE)
    return { offsetMinutes: tz.fallback * 60, source: 'region', fit: null };

  const [lo, hi] = tz.range;
  let bestOff = tz.fallback;
  let bestFit = -2;
  for (let k = lo; k <= hi; k++) {
    const c = correlation(toLocal(utcHistogram, k), REFERENCE_PROFILE);
    if (c > bestFit) { bestFit = c; bestOff = k; }
  }

  if (bestFit < MIN_CORRELATION)
    return { offsetMinutes: tz.fallback * 60, source: 'region', fit: null };

  return { offsetMinutes: bestOff * 60, source: 'curve', fit: Math.round(bestFit * 100) / 100 };
}

/** 'UTC+9' / 'UTC-6' / 'UTC+0' 표기. */
export function formatOffset(offsetMinutes: number): string {
  const h = offsetMinutes / 60;
  const sign = h < 0 ? '-' : '+';
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `UTC${sign}${hh}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`;
}
