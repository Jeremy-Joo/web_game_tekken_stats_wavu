// 랜덤 조회용 플레이어 풀.
//
// ── 왜 공개 피드인가 ──────────────────────────────────────────────
// 후보가 셋 있었다.
//
//  1. GA 방문 기록 — **쓰지 않는다.** "누가 어떤 ID 를 조회했는지"는 관리자 전용으로
//     막아둔 데이터다. 식별코드를 가려도 소용없다: 화면에 닉네임이 남고, 가려도
//     레이팅+주력캐릭+판수 조합이 사실상 지문이라 wavu 로 역조회가 된다.
//     즉 "이 사람이 우리 사이트에서 조회됐다"는 사실이 새어 나간다.
//  2. 리더보드(/leaderboard/*) — 상위권만 있다. cold·frozen 문구가 영영 안 나온다.
//  3. **공개 피드(/api/replays)** — 방금 끝난 랭크전. 실력대가 전부 섞여 있고
//     wavu 가 이미 전 세계에 공개한 데이터라 우리 방문자 정보가 아니다.
//
// 실측(2026-08): 한 번 요청에 5,996경기 · 803KB · 고유 플레이어 4,604명,
// battle_type 전부 2(랭크전), game_version 전부 현재 시즌, 레이팅 820~2,658.

import { unstable_cache } from 'next/cache';
import { WAVU_BASE } from './client';

/** 피드에서 뽑아 두는 값. 실제 전적은 뽑힌 뒤에 따로 받는다. */
export interface PoolEntry {
  id: string;
  /** 게임 언어 설정. 지역 필터에 쓴다 — region_id 보다 이쪽이 뜻이 분명하다. */
  lang: string | null;
  /** 피드에 찍힌 그 경기 시점의 레이팅. 대략의 실력대 참고용. */
  rating: number;
}

/**
 * 지역 필터.
 *
 * wavu 의 `region_id`·`area_id` 는 값의 뜻이 문서화돼 있지 않고 20% 가 null 이다.
 * 반면 `lang` 은 바로 읽히고 결측이 적다. 다만 이건 **게임 언어 설정**이지 접속
 * 국가가 아니다 — 해외 거주 한국인도 ko 로 잡힌다. 그 편이 오히려 쓸모에 맞다.
 */
export type PoolRegion = 'all' | 'ko' | 'ja' | 'en';

export const POOL_REGIONS: PoolRegion[] = ['all', 'ko', 'ja', 'en'];

const isRegion = (v: string): v is PoolRegion => (POOL_REGIONS as string[]).includes(v);
export const parseRegion = (v: string | null): PoolRegion =>
  v && isRegion(v) ? v : 'all';

interface RawBattle {
  p1_polaris_id?: unknown;
  p2_polaris_id?: unknown;
  p1_lang?: unknown;
  p2_lang?: unknown;
  p1_rating_before?: unknown;
  p2_rating_before?: unknown;
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

async function fetchPool(): Promise<PoolEntry[]> {
  const res = await fetch(`${WAVU_BASE}/api/replays`, {
    headers: { Accept: 'application/json' },
    // 아래 unstable_cache 가 하루치를 들고 있으므로 fetch 자체는 캐시하지 않는다.
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`wavu feed ${res.status}`);
  const feed = (await res.json()) as RawBattle[];

  // 한 사람이 여러 경기에 나온다. 처음 본 값만 남긴다.
  const seen = new Map<string, PoolEntry>();
  for (const b of feed) {
    for (const side of ['p1', 'p2'] as const) {
      const id = str(b[`${side}_polaris_id` as keyof RawBattle]);
      // 식별코드는 12자리 영숫자다. 형식이 다르면 버린다.
      if (!id || !/^[A-Za-z0-9]{12}$/.test(id) || seen.has(id)) continue;
      seen.set(id, {
        id,
        lang: str(b[`${side}_lang` as keyof RawBattle]),
        rating: num(b[`${side}_rating_before` as keyof RawBattle]),
      });
    }
  }
  return [...seen.values()];
}

/**
 * 하루 한 번만 받는다.
 *
 * 803KB 짜리 응답이라 요청마다 부르면 wavu 에도 우리에게도 부담이다. 하루면
 * 충분하다 — 풀에 4,600명이 있어서 하루 종일 눌러도 같은 사람이 잘 안 나온다.
 *
 * 키에 버전을 붙인다. **저장 모양이 바뀌면 반드시 올릴 것** — 형제 저장소에서
 * 필드를 지웠는데 옛 캐시가 그대로 나와 한참 헤맨 적이 있다.
 */
export const getPool = unstable_cache(fetchPool, ['wavu-pool-v1'], {
  revalidate: 24 * 3600,
});

/** 지역으로 거른다. 'all' 이면 그대로 돌려준다. */
export function filterPool(pool: PoolEntry[], region: PoolRegion): PoolEntry[] {
  if (region === 'all') return pool;
  return pool.filter((p) => p.lang === region);
}
