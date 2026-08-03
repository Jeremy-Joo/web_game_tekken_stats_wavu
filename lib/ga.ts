// Google Analytics Data API (GA4) 읽기.
//
// 왜 GA 인가: 조회 기록을 우리가 직접 Blob 에 쌓으면 Advanced Operation(월 2,000)을
// 조회 1건마다 태운다 — 실제로 그것 때문에 스토어가 정지됐다. GA 는 이미 같은 데이터를
// 수집하고 있고 읽기에 우리 쪽 비용이 없다. 그래서 '기록'은 GA 에 맡기고 '열람'만 만든다.
//
// 인증: 서비스 계정. Google 은 API 키 방식을 지원하지 않아 JWT(RS256) → 액세스 토큰
// 교환이 필요하다. 의존성을 늘리지 않으려고 node:crypto 로 직접 서명한다(표준 절차).
//
// 필요한 환경변수
//   GA_PROPERTY_ID        GA4 속성 ID (숫자만. 측정 ID인 G-XXXX 가 아니다)
//   GA_SERVICE_ACCOUNT    서비스 계정 JSON 전체 (또는 base64)
// 그리고 GA4 → 관리 → 속성 액세스 관리에서 그 서비스 계정 이메일을 '뷰어'로 추가해야 한다.

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export class GaError extends Error {}

function serviceAccount(): ServiceAccount {
  const raw = process.env.GA_SERVICE_ACCOUNT ?? '';
  if (!raw) throw new GaError('GA_SERVICE_ACCOUNT 환경변수가 없습니다.');
  // base64 로 넣어도 되게 (여러 줄 JSON 을 환경변수에 넣기 번거로운 경우)
  const json = raw.trim().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(json) as ServiceAccount;
  } catch {
    throw new GaError('GA_SERVICE_ACCOUNT 를 JSON 으로 읽지 못했습니다.');
  }
  if (!sa.client_email || !sa.private_key)
    throw new GaError('서비스 계정 JSON 에 client_email/private_key 가 없습니다.');
  return sa;
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 액세스 토큰은 1시간짜리라 인스턴스가 사는 동안 재사용한다. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;

  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  // 환경변수에 넣을 때 줄바꿈이 \n 문자열로 들어가는 경우가 흔하다
  const key = sa.private_key.replace(/\\n/g, '\n');
  const jwt = `${header}.${claim}.${b64url(signer.sign(key))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token)
    throw new GaError(`토큰 발급 실패: ${data.error_description ?? res.status}`);

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

interface ReportRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}

/** runReport 호출. dimensions/metrics 는 GA4 API 이름을 그대로 쓴다. */
export async function runReport(body: Record<string, unknown>): Promise<ReportRow[]> {
  const propertyId = (process.env.GA_PROPERTY_ID ?? '').replace(/\D/g, '');
  if (!propertyId) throw new GaError('GA_PROPERTY_ID 환경변수가 없습니다 (숫자 속성 ID).');

  const token = await accessToken();
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  const data = (await res.json()) as { rows?: ReportRow[]; error?: { message?: string } };
  if (!res.ok) throw new GaError(data.error?.message ?? `GA API ${res.status}`);
  return data.rows ?? [];
}

export interface PlayerView {
  id: string;
  name: string;
  views: number;
  users: number;
}

/**
 * /player/<식별코드> 페이지뷰 → 조회된 플레이어 목록.
 * 이름은 페이지 제목에서 뽑는다 — 제목이 "이름 (식별코드) — …" 형식이라 그대로 쓸 수 있다.
 */
export async function playerViews(days: number): Promise<PlayerView[]> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'BEGINS_WITH', value: '/player/' },
      },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 200,
  });

  // 같은 플레이어라도 쿼리(?tab=...)가 다르면 행이 갈라지므로 식별코드로 합친다
  const byId = new Map<string, PlayerView>();
  for (const r of rows) {
    const path = r.dimensionValues?.[0]?.value ?? '';
    const title = r.dimensionValues?.[1]?.value ?? '';
    const views = Number(r.metricValues?.[0]?.value ?? 0);
    const users = Number(r.metricValues?.[1]?.value ?? 0);
    const m = /^\/player\/([A-Za-z0-9-]+)/.exec(path);
    if (!m) continue;
    const id = m[1].replace(/-/g, '');
    // "이름 (식별코드) — 철권8 …" 에서 이름만
    const name = title.split('(')[0].trim() || id;
    const cur = byId.get(id);
    byId.set(id, {
      id,
      name: cur?.name && cur.name !== id ? cur.name : name,
      views: (cur?.views ?? 0) + views,
      users: Math.max(cur?.users ?? 0, users), // 사용자 수는 합산이 성립하지 않는다
    });
  }
  return [...byId.values()].sort((a, b) => b.views - a.views);
}

export interface DayCount {
  date: string;
  views: number;
  users: number;
}

/** 일별 전체 조회수·사용자수. */
export async function dailyTotals(days: number): Promise<DayCount[]> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
    limit: 400,
  });
  return rows.map((r) => {
    const d = r.dimensionValues?.[0]?.value ?? '';
    return {
      date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d,
      views: Number(r.metricValues?.[0]?.value ?? 0),
      users: Number(r.metricValues?.[1]?.value ?? 0),
    };
  });
}

export interface SourceRow {
  source: string;
  users: number;
}

/** 유입 경로 (어디서 왔는지). */
export async function trafficSources(days: number): Promise<SourceRow[]> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'sessionSourceMedium' }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit: 30,
  });
  return rows.map((r) => ({
    source: r.dimensionValues?.[0]?.value ?? '(unknown)',
    users: Number(r.metricValues?.[0]?.value ?? 0),
  }));
}
