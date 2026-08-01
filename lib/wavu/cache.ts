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

import { list, put } from '@vercel/blob';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { fetchReplays } from './client';
import type { Replay } from './types';

const gz = promisify(gzip);
const gunz = promisify(gunzip);

/** 사본을 신선하다고 볼 시간. */
export const CACHE_SECONDS = 600;

const keyFor = (id: string) => `cache/replays/${id}.json.gz`;

export interface CachedReplays {
  replays: Replay[];
  /** wavu 에서 실제로 받아온 시각(epoch ms). */
  fetchedAt: number;
  /** wavu 수집에 실패해 낡은 사본을 내주는 중이면 true. */
  stale: boolean;
}

interface Stored {
  fetchedAt: number;
  replays: Replay[];
}

async function readBlob(id: string): Promise<Stored | null> {
  try {
    const path = keyFor(id);
    const { blobs } = await list({ prefix: path, limit: 1 });
    const b = blobs.find((x) => x.pathname === path);
    if (!b) return null;
    const res = await fetch(b.url, { cache: 'no-store' });
    if (!res.ok) return null;
    const raw = await gunz(Buffer.from(await res.arrayBuffer()));
    const d = JSON.parse(raw.toString('utf8')) as Stored;
    if (!Array.isArray(d?.replays) || typeof d.fetchedAt !== 'number') return null;
    return d;
  } catch {
    // 사본을 못 읽는 것은 치명적이지 않다 — wavu 에서 새로 받으면 된다.
    return null;
  }
}

async function writeBlob(id: string, stored: Stored): Promise<void> {
  try {
    const body = await gz(Buffer.from(JSON.stringify(stored)));
    await put(keyFor(id), body, {
      access: 'public',
      contentType: 'application/gzip',
      addRandomSuffix: false,
      allowOverwrite: true,
      // 경로가 고정이라 덮어쓴 뒤 CDN 이 옛 내용을 내주면 안 된다.
      cacheControlMaxAge: 0,
    });
  } catch {
    // Blob 미설정(로컬 개발 등)이어도 조회 자체는 굴러가야 한다.
    // 이 경우 캐시만 없는 셈이고 동작은 예전과 같다.
  }
}

/** 같은 인스턴스에서 같은 식별코드 요청이 겹치면 한 번만 일하게 합친다. */
const inflight = new Map<string, Promise<CachedReplays>>();

async function load(id: string): Promise<CachedReplays> {
  const cached = await readBlob(id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_SECONDS * 1000)
    return { replays: cached.replays, fetchedAt: cached.fetchedAt, stale: false };

  try {
    const replays = await fetchReplays(id);
    const fetchedAt = Date.now();
    await writeBlob(id, { fetchedAt, replays });
    return { replays, fetchedAt, stale: false };
  } catch (e) {
    // wavu 가 막혔거나 느리다. 낡았더라도 사본이 있으면 그것을 준다 —
    // '10분 지난 데이터'가 '서비스 불가'보다 낫다. 사본이 없을 때만 에러를 올린다.
    if (cached)
      return { replays: cached.replays, fetchedAt: cached.fetchedAt, stale: true };
    throw e;
  }
}

/** 전체 이력을 가져온다 (Blob 사본 우선, 없거나 낡았으면 wavu). */
export function getReplays(id: string): Promise<CachedReplays> {
  const running = inflight.get(id);
  if (running) return running;
  const p = load(id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
