// wavu 전체 이력 캐시 — 서버 인스턴스 메모리에 보관한다.
//
// ── 왜 Vercel Blob 을 버렸나 (사고 이력) ────────────────────────────────────
// Blob 은 용량은 넉넉했지만 **작업 횟수**가 문제였다. put()·list() 는 Advanced
// Operation 이고 무료 한도가 월 2,000 이다. 조회 1건이 곧 쓰기 1건이라
// 일 1,400 조회 규모에서 이틀 만에 소진돼 스토어가 정지됐다:
//
//   Storage      10.9 MB / 1 GB     여유
//   Advanced Ops  2,100 / 2,000     ← 이것 때문에 정지
//
// 읽기에서 list() 를 없애 절반을 줄였지만, 쓰기는 구조상 조회 수에 비례해 남는다.
// 유료 전환 없이는 트래픽이 늘수록 다시 막히는 구조라 아예 걷어냈다.
//
// ── 왜 unstable_cache(Vercel Data Cache) 도 아닌가 ─────────────────────────
// Data Cache 는 **항목당 2MB 한도**가 있고, 넘으면 에러 없이 조용히 건너뛴다.
// 실측:  7,828경기 =  4.1MB
//       30,233경기 = 15.2MB
// 즉 전적이 많은 사람 — 남들이 가장 많이 찾아보는 사람 — 만 캐시가 안 걸렸다.
//
// ── 지금 방식과 그 한계 (알고 쓸 것) ───────────────────────────────────────
// 인스턴스 메모리에 LRU 로 들고 있는다. 비용 0, 한도 없음. 대신:
// - 인스턴스가 여러 개면 각자 따로 캐시한다(적중률이 그만큼 낮다).
// - 인스턴스가 내려가면 사라진다. 콜드 스타트는 wavu 를 직접 부른다.
// - 그래서 'wavu 장애를 오래된 사본으로 버티는' 능력이 약해졌다. 같은 인스턴스가
//   살아 있는 동안에만 STALE_SECONDS 까지 낡은 사본을 내준다.
//
// 메모리는 레코드 총량으로 제한한다(MAX_RECORDS). 30,233경기 한 명이 들어와도
// 오래 안 쓰인 항목을 밀어내며 상한을 지킨다.

import { fetchReplays, fetchRegion } from './client';
import { normalizeReplays, type NormalizeStats } from './normalize';
import type { MatchRecord } from '../tekken/models';
import type { Region } from './region';

/** 사본을 신선하다고 볼 시간. */
export const CACHE_SECONDS = 600;

/** 이 시간까지는 낡은 사본이라도 내준다 (wavu 가 막혔을 때만 쓰인다). */
const STALE_SECONDS = 6 * 3600;

/**
 * 메모리에 들고 있을 레코드 총량. 한 레코드가 대략 수백 바이트라
 * 12만 건이면 수십 MB 수준 — 함수 메모리(기본 1GB) 안에서 여유가 크다.
 */
const MAX_RECORDS = 120_000;

export interface CachedRecords {
  /** 이미 정규화된 레코드. 호출부는 normalizeReplays 를 다시 부르지 않는다. */
  records: MatchRecord[];
  myName: string;
  /** 정규화 때 걸러진 건수 — 화면이 '조용한 누락'을 드러내는 데 쓴다. */
  stats: NormalizeStats;
  /** wavu 에서 실제로 받아온 시각(epoch ms). */
  fetchedAt: number;
  /** wavu 수집에 실패해 낡은 사본을 내주는 중이면 true. */
  stale: boolean;
  /** 서버 지역 (시간대 추정용). 못 읽었으면 null — 화면은 KST 를 그대로 쓴다. */
  region: Region | null;
}

interface Entry {
  records: MatchRecord[];
  myName: string;
  stats: NormalizeStats;
  region: Region | null;
  fetchedAt: number;
  /** LRU 판정용 — 마지막으로 쓰인 시각. */
  usedAt: number;
}

const store = new Map<string, Entry>();

/** 같은 인스턴스에서 같은 식별코드 요청이 겹치면 한 번만 일하게 합친다. */
const inflight = new Map<string, Promise<CachedRecords>>();

/** 상한을 넘으면 가장 오래 안 쓰인 것부터 버린다. */
function evictIfNeeded(): void {
  let total = 0;
  for (const e of store.values()) total += e.records.length;
  if (total <= MAX_RECORDS) return;

  const byOldest = [...store.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
  for (const [id, e] of byOldest) {
    if (total <= MAX_RECORDS) break;
    store.delete(id);
    total -= e.records.length;
  }
}

const view = (e: Entry, stale: boolean): CachedRecords => ({
  records: e.records,
  myName: e.myName,
  stats: e.stats,
  fetchedAt: e.fetchedAt,
  stale,
  region: e.region,
});

async function load(id: string): Promise<CachedRecords> {
  const now = Date.now();
  const cached = store.get(id);
  if (cached && now - cached.fetchedAt < CACHE_SECONDS * 1000) {
    cached.usedAt = now;
    return view(cached, false);
  }

  try {
    const replays = await fetchReplays(id);
    // ★ 순차 — wavu 레이트리밋 원칙("요청을 한 번에 하나씩")을 따른다.
    //   Promise.all 로 묶지 말 것. 지역은 실패해도 null 이라 조회를 막지 않는다.
    const region = await fetchRegion(id);
    const { records, myName, stats } = normalizeReplays(replays, id);
    const fetchedAt = Date.now();
    store.set(id, { records, myName, stats, region, fetchedAt, usedAt: fetchedAt });
    evictIfNeeded();
    return { records, myName, stats, fetchedAt, stale: false, region };
  } catch (e) {
    // wavu 가 막혔거나 느리다. 너무 낡지 않은 사본이 있으면 그것을 준다 —
    // '10분 지난 데이터'가 '서비스 불가'보다 낫다.
    if (cached && now - cached.fetchedAt < STALE_SECONDS * 1000) {
      cached.usedAt = now;
      return view(cached, true);
    }
    throw e;
  }
}

/** 전체 이력을 정규화된 상태로 가져온다 (메모리 사본 우선, 없거나 낡았으면 wavu). */
export function getRecords(id: string): Promise<CachedRecords> {
  const running = inflight.get(id);
  if (running) return running;
  const p = load(id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** 캐시 상태 (/api/probe 전용). 인스턴스별 값이라 참고용이다. */
export function cacheStatus(): {
  entries: number;
  records: number;
  maxRecords: number;
  ttlSeconds: number;
} {
  let records = 0;
  for (const e of store.values()) records += e.records.length;
  return { entries: store.size, records, maxRecords: MAX_RECORDS, ttlSeconds: CACHE_SECONDS };
}
