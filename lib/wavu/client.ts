import type { Replay } from './types';
import { parseRegionHtml, type Region } from './region';

export const WAVU_BASE = 'https://wank.wavu.wiki';

/** 식별코드에서 영숫자만 남긴다. `-` 를 넣어 붙여넣는 사람이 많아서. */
export function normalizePolarisId(raw: string): string {
  return (raw ?? '').replace(/[^A-Za-z0-9]/g, '');
}

export class WavuError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'not_found' | 'blocked' | 'bad_response' | 'network',
  ) {
    super(message);
    this.name = 'WavuError';
  }
}

/**
 * 해당 플레이어의 **전체** 랭크전 이력을 한 번에 받아온다.
 *
 * `Accept: application/json` 이 핵심이다. 이 헤더가 없으면 같은 URL 이 HTML 페이지를
 * 돌려준다. `Accept-Encoding` 도 필수 — wavu 문서가 /api 계열은 압축 수락을 요구한다고
 * 명시한다. (fetch 는 기본으로 붙여주지만 의도를 남겨둔다.)
 *
 * 페이지네이션은 하지 않는다. 필요가 없기도 하고, `?before=` 로 넘기는 경로는
 * Cloudflare 챌린지(403 Cf-Mitigated: challenge)에 막힌다.
 */
export async function fetchReplays(polarisId: string): Promise<Replay[]> {
  const id = normalizePolarisId(polarisId);
  if (!id) throw new WavuError('식별코드가 비었습니다.', 400, 'not_found');

  const url = `${WAVU_BASE}/player/${encodeURIComponent(id)}/replays`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        // wavu 는 레이트리밋을 건다. 문서상 "요청을 하나씩만 보내면 안 걸린다".
        // 누가 보내는 요청인지 알 수 있게 UA 를 남긴다.
        'User-Agent': 'tekken-stats-wavu (personal stats viewer)',
      },
      cache: 'no-store',
    });
  } catch (e) {
    throw new WavuError(
      `wavu 에 연결하지 못했습니다: ${(e as Error).message}`,
      0,
      'network',
    );
  }

  if (res.status === 403 || res.status === 429) {
    throw new WavuError(
      res.status === 429
        ? 'wavu 레이트리밋에 걸렸습니다. 잠시 후 다시 시도하세요.'
        : 'wavu 가 요청을 차단했습니다(Cloudflare). 잠시 후 다시 시도하세요.',
      res.status,
      'blocked',
    );
  }
  if (res.status === 404) {
    throw new WavuError('그런 식별코드의 플레이어가 없습니다.', 404, 'not_found');
  }
  if (!res.ok) {
    throw new WavuError(`wavu 응답 오류 (HTTP ${res.status})`, res.status, 'bad_response');
  }

  // 없는 식별코드면 wavu 는 404 가 아니라 **200 + HTML 에러 페이지**를 돌려준다(실측).
  // 그래서 content-type 이 JSON 이 아니면 먼저 '없는 플레이어'로 안내하고,
  // 진짜 구조 변화(JSON 요청이 다른 형식을 받는 경우)는 그다음 의심한다.
  const ctype = res.headers.get('content-type') ?? '';
  if (!ctype.includes('json')) {
    const body = await res.text();
    if (body.includes('Error • Wavu Wank')) {
      throw new WavuError(
        `'${id}' 플레이어를 찾을 수 없습니다. 식별코드를 확인하세요.`,
        404,
        'not_found',
      );
    }
    throw new WavuError(
      `wavu 가 JSON 대신 ${ctype || '알 수 없는 형식'} 을 돌려줬습니다. 사이트 구조가 바뀌었을 수 있습니다.`,
      res.status,
      'bad_response',
    );
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new WavuError('wavu 응답이 배열이 아닙니다.', res.status, 'bad_response');
  }
  return data as Replay[];
}

/**
 * 플레이어의 서버 지역(Asia/America/…). 시간대 추정에 쓴다.
 *
 * **JSON 이 아니라 HTML 을 판다** — /replays JSON 에 지역 필드가 없어서다
 * (필드 24개 전수 확인). 파싱 규칙과 실패 판정은 region.ts 에 있다.
 *
 * `?before=` 나 `/opps` 와 달리 이 경로(`/player/<id>`)는 Cloudflare 에 막히지
 * 않는다(실측 200). 그래도 남의 HTML 이므로 **없어도 되는 값**으로 다룬다 —
 * 실패는 전부 null 이고, 지역을 몰라도 조회 자체는 그대로 굴러간다.
 *
 * 호출 순서 주의: wavu 레이트리밋 회피 원칙상 **replays 와 동시에 보내지 않는다.**
 * 반드시 순차로 부를 것(Promise.all 금지 — cache.ts 참조).
 */
export async function fetchRegion(polarisId: string): Promise<Region | null> {
  const id = normalizePolarisId(polarisId);
  if (!id) return null;

  let res: Response;
  try {
    res = await fetch(`${WAVU_BASE}/player/${encodeURIComponent(id)}`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'tekken-stats-wavu (personal stats viewer)',
      },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const parsed = parseRegionHtml(await res.text());
  if (!parsed.ok) {
    // 조용히 넘어가되 흔적은 남긴다. 지역을 못 읽으면 화면은 '지역 모름'으로
    // 표시되고 시간대는 KST 로 유지된다 — 틀린 시간대를 만들어내지는 않는다.
    console.warn(`[wavu] 지역 파싱 실패 (${parsed.reason}) id=${id}`);
    return null;
  }
  return parsed.region;
}
