// Blob 을 **읽을 때 Advanced Operation 을 쓰지 않기** 위한 공용 경로.
//
// ── 왜 이 파일이 있나 (사고 이력) ──────────────────────────────────────────
// Blob 스토어가 정지됐다. 용량이 아니라 **작업 횟수** 때문이었다:
//
//   Storage      10.9 MB / 1 GB      여유
//   Data Transfer 64.3 MB / 10 GB    여유
//   Simple Ops      379 / 10,000     여유
//   Advanced Ops  2,100 / 2,000      ← 초과. 이것 때문에 정지됐다
//
// Vercel 과금 기준(공식 문서):
//   Advanced Operations = put() · copy() · list()          무료 2,000/월
//   Simple Operations   = URL 접근 중 캐시 MISS · head()    무료 10,000/월
//   캐시 HIT = 무료 · del() = 무료
//
// 그런데 예전 코드는 **읽을 때마다 list() 를 불렀다.** 사본이 있는지 확인하려고
// `list({ prefix })` 를 먼저 치고 그 결과의 url 을 받아 fetch 했다. 즉
//   전적 조회 1회 = Advanced 1회,  페이지 방문 1회 = Advanced 2회(list+put)
// 이 구조로는 한도 2,000 이 며칠 만에 소진된다(실제로 이틀 만에 소진됐다).
//
// ── 고친 방법 ──────────────────────────────────────────────────────────────
// `addRandomSuffix: false` 로 올리면 URL 이 **경로에서 결정된다**(공식 문서):
//   https://<스토어ID>.public.blob.vercel-storage.com/<pathname>
// 그러면 list() 로 물어볼 필요 없이 그 URL 을 바로 fetch 하면 된다.
// 없으면 404 가 오고, 그게 곧 '사본 없음'이다.
//
// **읽기 경로에서 list()·head() 를 부르지 말 것.** 이 파일을 거치면 그럴 일이 없다.

import { list } from '@vercel/blob';

/** 스토어 ID → 공개 URL 앞부분. */
const originOf = (storeId: string) =>
  `https://${storeId.replace(/^store_/, '')}.public.blob.vercel-storage.com`;

/**
 * 한 번 알아내면 인스턴스가 사는 동안 다시 알아내지 않는다.
 * (아래 fallback 의 list() 를 인스턴스당 1회로 묶어두는 역할도 겸한다)
 */
let cachedOrigin: string | null = null;

/**
 * put() 이 성공하면 응답의 url 이 **가장 확실한 출처**다. 공짜로 알 수 있으므로
 * 쓰기 쪽에서 이걸 불러 기억시켜 둔다.
 */
export function rememberOriginFrom(blobUrl: string): void {
  try {
    if (!cachedOrigin) cachedOrigin = new URL(blobUrl).origin;
  } catch {
    /* 형식이 예상과 다르면 그냥 무시한다 — 다음 경로로 알아내면 된다 */
  }
}

function originFromEnv(): string | null {
  // ① 문서화된 환경변수가 있으면 그걸 쓴다.
  const storeId = process.env.BLOB_STORE_ID;
  if (storeId) return originOf(storeId);

  // ② 토큰은 `vercel_blob_rw_<스토어ID>_<시크릿>` 형태다. 문서에 명시된 규격은
  //    아니라서 **못 읽어도 되는 것**으로 다룬다 — 어긋나면 ③ 으로 넘어간다.
  const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(process.env.BLOB_READ_WRITE_TOKEN ?? '');
  return m ? originOf(m[1]) : null;
}

/**
 * 공개 Blob URL 의 앞부분. 못 알아내면 null (= Blob 을 쓸 수 없는 환경).
 *
 * ③ 마지막 수단으로만 list() 를 쓴다. Advanced Operation 이지만 **인스턴스당 한 번**
 *    이고, 그나마도 ①②가 실패했을 때만이다. 요청마다 부르던 예전과는 완전히 다르다.
 */
export async function blobOrigin(): Promise<string | null> {
  if (cachedOrigin) return cachedOrigin;

  const fromEnv = originFromEnv();
  if (fromEnv) return (cachedOrigin = fromEnv);

  try {
    const { blobs } = await list({ limit: 1 });
    if (blobs[0]?.url) return (cachedOrigin = new URL(blobs[0].url).origin);
  } catch {
    /* 토큰 없음·정지 등 — 아래에서 null 을 준다 */
  }
  return null;
}

export type BlobRead =
  /** 파일이 있고 내용을 받았다. */
  | { ok: true; body: ArrayBuffer }
  /** 스토어는 멀쩡한데 그 경로에 파일이 없다. **'실패'가 아니다.** */
  | { ok: true; body: null }
  /** 못 읽었다 — 값을 모른다. '없다'와 반드시 구분해야 한다. */
  | { ok: false; body: null };

/**
 * 공개 Blob 을 경로로 바로 읽는다. list() 를 쓰지 않는다.
 *
 * 404 를 '없음'으로, 그 밖의 실패를 '모름'으로 갈라준다. 이 구분이 방문 카운터에서
 * 특히 중요하다 — '모름'을 0 으로 착각하고 쓰면 누적값이 통째로 날아간다.
 */
export async function readPublicBlob(pathname: string): Promise<BlobRead> {
  const origin = await blobOrigin();
  if (!origin) return { ok: false, body: null };

  try {
    const res = await fetch(`${origin}/${pathname}`, { cache: 'no-store' });
    if (res.status === 404) return { ok: true, body: null }; // 아직 없다 = 정상
    if (!res.ok) return { ok: false, body: null };
    return { ok: true, body: await res.arrayBuffer() };
  } catch {
    return { ok: false, body: null };
  }
}
