// wavu 전체 이력 캐시 — Vercel Blob 에 gzip 으로 보관한다.
//
// ── 왜 unstable_cache(Vercel Data Cache) 를 버렸나 ──────────────────────────
// Data Cache 는 **항목당 2MB 한도**가 있고, 넘으면 에러 없이 조용히 저장을 건너뛴다.
// 실측:  7,828경기 =  4.1MB (gzip 487KB)
//       30,233경기 = 15.2MB (gzip 1.86MB)
// 즉 전적이 많은 사람 — 남들이 가장 많이 찾아보는 사람 — 만 캐시가 안 걸렸다.
// 조회할 때마다 wavu 에서 15MB 를 새로 받고 있었고, 아무 경고도 없었다.
// (라이브 측정으로 확인: 2경기 플레이어는 재조회가 0.43s→0.26s 로 떨어지는데
//  30,233경기 플레이어는 반복해도 바닥을 치지 않았다.)
//
// Blob 은 용량 한도가 사실상 없다. gzip 으로 넣으니 30,233경기가 1.86MB 다.
// 덤이 하나 더 있다 — wavu 가 막혔을 때 **마지막 성공본을 그대로 내줄 수 있다.**
// 예전에는 wavu 가 503 이면 사이트 전체가 같이 멈췄다.
//
// 한계(알고 두는 것):
// - 인스턴스가 다르면 동시 갱신이 겹칠 수 있다. 겹쳐도 마지막 쓰기가 이기고
//   내용은 같으므로 해가 없다. 같은 인스턴스 안에서는 inflight 로 합친다.
// - 갱신을 담당한 요청은 gzip+업로드 시간을 더 쓴다(10분에 한 번). 그 대가로
//   나머지 요청 전부가 wavu 를 건드리지 않는다.

import { put } from '@vercel/blob';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { fetchReplays, fetchRegion } from './client';
import { readPublicBlob, rememberOriginFrom, blobOrigin } from './blob';
import { normalizeReplays, type NormalizeStats } from './normalize';
import {
  packRecords,
  unpackRecords,
  CODEC_VERSION,
  type PackedRecords,
} from '../tekken/codec';
import type { MatchRecord } from '../tekken/models';
import type { Region } from './region';

const gz = promisify(gzip);
const gunz = promisify(gunzip);

/** 사본을 신선하다고 볼 시간. */
export const CACHE_SECONDS = 600;

/**
 * 경로에 코덱 버전이 들어간다. 형식이 바뀌면 새 경로에 쓰고 옛 사본은 그냥 안 읽힌다 —
 * 마이그레이션도 삭제 작업도 없고, 옛 파일은 다음 갱신 때 자연히 쓸모없어진다.
 */
const keyFor = (id: string) => `cache/records/v${CODEC_VERSION}/${id}.json.gz`;

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
  /**
   * 서버 지역 (시간대 추정용). 못 읽었으면 null —
   * 그 경우 화면은 KST 를 그대로 쓴다(region.ts 참조).
   */
  region: Region | null;
}

interface Stored {
  fetchedAt: number;
  packed: PackedRecords;
  stats: NormalizeStats;
  /**
   * 지역은 나중에 추가된 필드다. 그 전에 쓰인 사본에는 없어서 undefined 가 온다 —
   * 이때는 null 로 다뤄 '지역 모름'(KST 유지)이 되고, 사본이 만료되는 대로
   * (CACHE_SECONDS) 다음 갱신에서 저절로 채워진다. 마이그레이션이 필요 없다.
   */
  region?: Region | null;
}

async function readBlob(id: string): Promise<Stored | null> {
  try {
    // ★ list() 를 쓰지 않는다 — Advanced Operation 이라 요청마다 부르면 한도가 녹는다.
    //   경로로 바로 읽는다 (lib/wavu/blob.ts 의 사고 이력 참조).
    const r = await readPublicBlob(keyFor(id));
    if (!r.body) return null; // 없거나 못 읽음 — 어느 쪽이든 wavu 에서 새로 받으면 된다
    const raw = await gunz(Buffer.from(r.body));
    const d = JSON.parse(raw.toString('utf8')) as Stored;
    if (typeof d?.fetchedAt !== 'number' || !d.packed) return null;
    return d;
  } catch {
    // 사본을 못 읽는 것은 치명적이지 않다 — wavu 에서 새로 받으면 된다.
    return null;
  }
}

async function writeBlob(id: string, stored: Stored): Promise<void> {
  try {
    const body = await gz(Buffer.from(JSON.stringify(stored)));
    const res = await put(keyFor(id), body, {
      access: 'public',
      contentType: 'application/gzip',
      // ★ 이 둘이 있어야 URL 이 경로에서 결정된다 — 읽을 때 list() 를 안 쓰는 전제다.
      addRandomSuffix: false,
      allowOverwrite: true,
      // 경로가 고정이라 덮어쓴 뒤 CDN 이 옛 내용을 내주면 안 된다.
      cacheControlMaxAge: 0,
    });
    // 응답의 url 이 공개 URL 앞부분의 가장 확실한 출처다. 공짜로 알 수 있으니 기억해 둔다.
    rememberOriginFrom(res.url);
  } catch (e) {
    // Blob 미설정(로컬 개발 등)이어도 조회 자체는 굴러가야 한다.
    // 이 경우 캐시만 없는 셈이고 동작은 예전과 같다.
    //
    // 다만 **조용히 넘어가지는 않는다.** 프로덕션에서 스토어가 안 붙어 있으면
    // 이 자리가 매번 실패하면서 캐시가 통째로 없는 상태가 되는데, 응답은 정상이라
    // 몇 달을 모른 채 지날 수 있다(실제로 그랬다 — 조회할 때마다 wavu 에서
    // 15MB 를 새로 받고 있었다). 상태 확인은 /api/probe 의 blob 항목으로 한다.
    console.warn(`[cache] Blob 저장 실패 — 캐시 없이 동작 중: ${(e as Error).message}`);
  }
}

/**
 * Blob 스토어가 실제로 쓸 수 있는 상태인지 확인한다 (/api/probe 전용).
 *
 * `list()` 만 봐서는 부족하다 — 캐시가 필요한 것은 **쓰기**고, 토큰 권한이나
 * 스토어 연결이 어긋나면 읽기만 되는 경우가 있다. 그래서 작은 파일을
 * 실제로 쓰고 다시 읽어 왕복을 확인한다. 경로는 고정이라 쌓이지 않는다.
 */
export async function probeBlob(): Promise<{
  ok: boolean;
  hasToken: boolean;
  canRead: boolean;
  canWrite: boolean;
  error: string | null;
}> {
  const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;
  let canWrite = false;
  let error: string | null = null;

  // 읽기는 공개 URL 로 확인한다 — list() 를 쓰면 확인하는 행위 자체가 한도를 깎는다.
  // (probe 는 사람이 부르는 것이라 잦지 않지만, 여기서도 원칙을 지킨다)
  const canRead = (await blobOrigin()) !== null;

  try {
    // 쓰기만은 실제로 써봐야 안다. Advanced Operation 1회를 쓰는 유일한 자리다 —
    // 캐시가 되는지는 **쓰기**에 달렸고, 읽기만 되는 상태가 실제로 존재하기 때문이다
    // (스토어 정지가 정확히 그 모양이었다: 목록·읽기는 되고 쓰기만 막힘).
    const mark = `probe ${Date.now()}`;
    const { url } = await put('probe/blob-check.txt', mark, {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    rememberOriginFrom(url);
    const back = await fetch(url, { cache: 'no-store' });
    canWrite = back.ok && (await back.text()) === mark;
  } catch (e) {
    error = (e as Error).message;
  }

  return { ok: canRead && canWrite, hasToken, canRead, canWrite, error };
}

/** 같은 인스턴스에서 같은 식별코드 요청이 겹치면 한 번만 일하게 합친다. */
const inflight = new Map<string, Promise<CachedRecords>>();

/** 사본에서 복원. 형식이 안 맞으면 null 을 돌려 wavu 재수집으로 떨어진다. */
function fromCache(cached: Stored, stale: boolean): CachedRecords | null {
  const records = unpackRecords(cached.packed);
  if (!records) return null;
  return {
    records,
    myName: cached.packed.player,
    stats: cached.stats,
    fetchedAt: cached.fetchedAt,
    stale,
    region: cached.region ?? null,
  };
}

async function load(id: string): Promise<CachedRecords> {
  const cached = await readBlob(id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_SECONDS * 1000) {
    const hit = fromCache(cached, false);
    if (hit) return hit;
  }

  try {
    const replays = await fetchReplays(id);
    // ★ 순차 — wavu 레이트리밋 원칙("요청을 한 번에 하나씩")을 따른다.
    //   Promise.all 로 묶지 말 것. 지역은 실패해도 null 이라 조회를 막지 않는다.
    const region = await fetchRegion(id);
    const { records, myName, stats } = normalizeReplays(replays, id);
    const fetchedAt = Date.now();
    // 원본이 아니라 **정규화된 레코드**를 저장한다 — 읽는 쪽이 다시 정규화하지 않게.
    // (크기·속도 실측은 lib/tekken/codec.ts 주석 참조)
    await writeBlob(id, {
      fetchedAt,
      packed: packRecords(records, myName, id),
      stats,
      region,
    });
    return { records, myName, stats, fetchedAt, stale: false, region };
  } catch (e) {
    // wavu 가 막혔거나 느리다. 낡았더라도 사본이 있으면 그것을 준다 —
    // '10분 지난 데이터'가 '서비스 불가'보다 낫다. 사본이 없을 때만 에러를 올린다.
    if (cached) {
      const old = fromCache(cached, true);
      if (old) return old;
    }
    throw e;
  }
}

/** 전체 이력을 정규화된 상태로 가져온다 (Blob 사본 우선, 없거나 낡았으면 wavu). */
export function getRecords(id: string): Promise<CachedRecords> {
  const running = inflight.get(id);
  if (running) return running;
  const p = load(id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
