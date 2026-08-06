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
import { FEATURE_NAMES, type FeatureEvent } from './ga-events';

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
  /**
   * 실제 조회 건수. player_lookup 이벤트를 센다 (app/page.tsx).
   *
   * **2026-08-04 배포부터 쌓인다.** 그 이전 기간에는 0 이 나온다 — 이벤트가
   * 없던 때라 '조회가 없었다'가 아니라 '셀 방법이 없었다'는 뜻이다.
   */
  lookups: number;
  /**
   * 페이지뷰. 탭·캐릭터필터·기간을 바꿀 때마다 올라가므로 조회 수가 아니라
   * **탐색 깊이**로 읽어야 한다. 실측 비율은 조회 1건당 9.3 이었다.
   */
  views: number;
  users: number;
  firstDate: string; // 'yyyy-MM-dd HH:mm' — 이 기간에 처음 조회된 날짜+시각
  lastDate: string; // 마지막으로 조회된 날짜+시각
  daysSeen: number; // 조회된 날의 수 (1이면 하루만 보고 끝난 ID)
}

/**
 * player_lookup 이벤트 수 → 식별코드별 실제 조회 건수.
 *
 * 커스텀 이벤트 파라미터가 아니라 표준 dimension(pagePath)으로 가른다 —
 * 파라미터로 넘기면 GA4 관리화면에서 맞춤 측정기준을 따로 등록해야 Data API 로
 * 읽을 수 있고, 등록 전 기간은 영영 안 나온다. pagePath 는 그런 준비가 없다.
 */
async function lookupCounts(days: number): Promise<Map<string, number>> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: { matchType: 'EXACT', value: 'player_lookup' },
            },
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'BEGINS_WITH', value: '/player/' },
            },
          },
        ],
      },
    },
    limit: 20000,
  });

  const out = new Map<string, number>();
  for (const r of rows) {
    const m = /^\/player\/([A-Za-z0-9-]+)/.exec(r.dimensionValues?.[0]?.value ?? '');
    if (!m) continue;
    const id = m[1].replace(/-/g, '');
    out.set(id, (out.get(id) ?? 0) + Number(r.metricValues?.[0]?.value ?? 0));
  }
  return out;
}

/**
 * 식별코드별 조회를 UI 언어(ko/en/ja)로 가른다. "이 ID 를 어느 언어로
 * 조회했나"를 보고 싶다는 요청(2026-08)에서 나왔다.
 *
 * lookupCounts 와 달리 **맞춤 이벤트 파라미터**(customEvent:ui_lang)를 쓴다 —
 * GA4 표준 dimension 중엔 "이 사이트에서 고른 언어"에 대응하는 게 없다
 * (표준 language 는 브라우저 설정, audience() 주석 참조). 그래서 이 함수는
 * lookupCounts 와 분리해 곁다리로만 쓴다: GA4 관리화면에서 이 파라미터를
 * 맞춤 측정기준으로 등록하기 전에는 GA API 가 이 dimension 이름 자체를
 * 모른다며 요청을 통째로 실패시킨다 — 그걸 핵심 조회 수 집계까지 끌고 가면
 * 등록 전엔 관리자 화면 전체가 죽는다. 호출부(route.ts)에서 allSettled 로
 * 감싸 이 리포트만 실패하게 한다.
 *
 * **등록 전 기간은 영영 안 나온다** — player_lookup 자체가 그렇듯, 등록 시점
 * 이후에 쌓인 데이터만 커버한다.
 */
export async function lookupLangByPlayer(
  days: number,
): Promise<Map<string, Record<string, number>>> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'customEvent:ui_lang' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: { matchType: 'EXACT', value: 'player_lookup' },
            },
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'BEGINS_WITH', value: '/player/' },
            },
          },
        ],
      },
    },
    limit: 20000,
  });

  const out = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const m = /^\/player\/([A-Za-z0-9-]+)/.exec(r.dimensionValues?.[0]?.value ?? '');
    if (!m) continue;
    const id = m[1].replace(/-/g, '');
    const lang = r.dimensionValues?.[1]?.value || '(unknown)';
    const count = Number(r.metricValues?.[0]?.value ?? 0);
    const cur = out.get(id) ?? {};
    cur[lang] = (cur[lang] ?? 0) + count;
    out.set(id, cur);
  }
  return out;
}

/**
 * /player/<식별코드> 페이지뷰 → 조회된 플레이어 목록.
 * 이름은 페이지 제목에서 뽑는다 — 제목이 "이름 (식별코드) — …" 형식이라 그대로 쓸 수 있다.
 *
 * 조회 건수(lookups)와 탐색 깊이(views)는 원천이 다르다 — 위 lookupCounts 주석 참조.
 */
export async function playerViews(days: number): Promise<PlayerView[]> {
  // dateHourMinute 을 함께 뽑아 '언제 조회됐는지'를 분 단위까지 안다(처음엔 date,
  // 그다음 dateHour 로 갔다가 — 2026-08 피드백으로 "정확히 몇 시 몇 분"까지
  // 원한다고 해서 분 단위로 올렸다). date 보다 최대 1440배까지 행이 늘 수 있어
  // limit 을 넉넉히 준다 — 200 이면 활동이 많은 기간에 뒤쪽 플레이어가 잘려
  // 나간다. **'전체'(10년) 처럼 아주 넓은 기간에 조회량이 많으면 이 limit 도
  // 넘겨 뒤쪽이 잘릴 수 있다** — 그때는 dateHour(시 단위)로 한 단계 낮추는 게
  // 다음 대응이다. 서로 독립이라 같이 던진다. 하나가 실패하면 전체가 실패하는
  // 편이 낫다 — 조용히 0 으로 채우면 '조회가 없었다'와 구별되지 않는다.
  const [rows, lookups] = await Promise.all([
    runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }, { name: 'dateHourMinute' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'BEGINS_WITH', value: '/player/' },
      },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 20000,
    }),
    lookupCounts(days),
  ]);

  // 같은 플레이어라도 쿼리(?tab=...)·시각이 다르면 행이 갈라지므로 식별코드로 합친다
  const byId = new Map<string, PlayerView>();
  const daysById = new Map<string, Set<string>>();
  for (const r of rows) {
    const path = r.dimensionValues?.[0]?.value ?? '';
    const title = r.dimensionValues?.[1]?.value ?? '';
    // GA4 dateHourMinute 형식: 'yyyyMMddHHmm' (12자리, property 설정 시간대 기준).
    const rawDate = r.dimensionValues?.[2]?.value ?? '';
    const date =
      rawDate.length === 12
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)} ${rawDate.slice(8, 10)}:${rawDate.slice(10, 12)}`
        : rawDate;
    // daysSeen(조회된 '날'의 수)은 시각까지 섞으면 하루가 여러 개로 쪼개지므로
    // 날짜 부분만 따로 뗀다 — date 는 'yyyy-MM-dd HH:mm'라 앞 10자가 곧 날짜다.
    const dayOnly = date.slice(0, 10);
    const views = Number(r.metricValues?.[0]?.value ?? 0);
    const users = Number(r.metricValues?.[1]?.value ?? 0);
    // 리포트(/player/<id>/report)는 별도 페이지다. 여기에 섞으면 조회 화면을
    // 얼마나 만졌나(=깊이)에 리포트 열람이 더해져 값이 부푼다. 따로 센다(reportViews).
    if (path.includes('/report')) continue;
    const m = /^\/player\/([A-Za-z0-9-]+)/.exec(path);
    if (!m) continue;
    const id = m[1].replace(/-/g, '');
    if (dayOnly) {
      if (!daysById.has(id)) daysById.set(id, new Set());
      daysById.get(id)!.add(dayOnly);
    }

    // 제목은 "이름 (식별코드) — 철권8 …" 형식일 때만 이름으로 인정한다.
    // 화면 안 이동으로 기록된 조회는 기본 제목("철권8 전적 통계 — …")이 붙어 있어서,
    // 느슨하게 자르면 모든 플레이어 이름이 그 문구로 덮인다.
    // (정규식 대신 문자열 탐색 — 식별코드를 패턴에 끼워 넣을 때 이스케이프가 꼬이기 쉽다)
    const marker = `(${id})`;
    const at = title.indexOf(marker);
    const name = at > 0 ? title.slice(0, at).trim() : '';

    const cur = byId.get(id);
    byId.set(id, {
      id,
      name: cur?.name || name, // 한 행이라도 제대로 된 제목이 있으면 그걸 쓴다
      lookups: lookups.get(id) ?? 0, // 이미 식별코드로 합쳐진 값이라 더하지 않는다
      views: (cur?.views ?? 0) + views,
      users: Math.max(cur?.users ?? 0, users), // 사용자 수는 합산이 성립하지 않는다
      firstDate: cur?.firstDate && cur.firstDate < date ? cur.firstDate : date,
      lastDate: cur?.lastDate && cur.lastDate > date ? cur.lastDate : date,
      daysSeen: 0, // 아래에서 채운다 (같은 날 여러 행이 오므로 Set 으로 세야 정확하다)
    });
  }

  for (const [id, p] of byId) p.daysSeen = daysById.get(id)?.size ?? 0;

  // 가장 최근에 조회한 사람이 맨 위로 온다(2026-08 요청) — lastDate 는
  // 'yyyy-MM-dd HH:mm'이라 문자열 비교만으로 시간 순서가 그대로 맞는다.
  // 시각까지 똑같이 겹치는 드문 경우엔 예전 기준(조회 수, 없으면 페이지뷰)으로
  // 갈라 순서가 매번 흔들리지 않게 한다.
  const anyLookup = [...byId.values()].some((p) => p.lookups > 0);
  return [...byId.values()].sort((a, b) => {
    if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
    return anyLookup ? b.lookups - a.lookups || b.views - a.views : b.views - a.views;
  });
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

// ── 사용 패턴 ────────────────────────────────────────────────────────────

export interface TabRow {
  /** 탭 키 ('flow', 'total', …). 화면에서 한국어 이름으로 바꾼다. */
  key: string;
  views: number;
}

/**
 * 탭별 열람 수.
 *
 * pagePath 가 아니라 **pagePathPlusQueryString** 을 쓴다 — GA4 의 pagePath 는
 * 쿼리를 뺀 값이라 ?tab= 이 사라진다. 탭은 쿼리에만 있으므로 이 측정기준이어야 한다.
 *
 * 여기서는 페이지뷰가 오히려 맞는 지표다: '조회'는 대상 한 명당 한 번이지만,
 * 알고 싶은 건 "그 안에서 어느 탭을 열어봤나"라서 만진 횟수 자체가 답이다.
 */
export async function tabViews(days: number): Promise<TabRow[]> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePathPlusQueryString' }],
    metrics: [{ name: 'screenPageViews' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePathPlusQueryString',
        stringFilter: { matchType: 'CONTAINS', value: 'tab=' },
      },
    },
    limit: 20000,
  });

  const out = new Map<string, number>();
  for (const r of rows) {
    const m = /[?&]tab=([A-Za-z0-9_]+)/.exec(r.dimensionValues?.[0]?.value ?? '');
    if (!m) continue;
    out.set(m[1], (out.get(m[1]) ?? 0) + Number(r.metricValues?.[0]?.value ?? 0));
  }
  return [...out.entries()]
    .map(([key, views]) => ({ key, views }))
    .sort((a, b) => b.views - a.views);
}

export interface BreakdownRow {
  label: string;
  users: number;
}

/** 한 측정기준을 사용자 수로 집계하는 공통 함수. */
async function breakdown(days: number, dimension: string, limit = 12): Promise<BreakdownRow[]> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: dimension }],
    metrics: [{ name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    limit,
  });
  return rows.map((r) => ({
    label: r.dimensionValues?.[0]?.value || '(알 수 없음)',
    users: Number(r.metricValues?.[0]?.value ?? 0),
  }));
}

export interface Audience {
  devices: BreakdownRow[];
  countries: BreakdownRow[];
  languages: BreakdownRow[];
}

/**
 * 방문자 구성.
 *
 * language 는 **브라우저 언어 설정**이지 이 사이트에서 고른 UI 언어가 아니다.
 * UI 언어는 URL 에 없고 localStorage 에만 있어서 GA 가 알 방법이 없다 — 알고 싶으면
 * 이벤트 파라미터를 새로 보내야 하고, 그건 GA4 에서 맞춤 측정기준을 등록해야
 * Data API 로 읽힌다(lib/ga.ts 의 lookupCounts 주석과 같은 이유). 지금은 대략의
 * 구성만 봐도 충분해서 표준 측정기준으로 둔다.
 */
export async function audience(days: number): Promise<Audience> {
  const [devices, countries, languages] = await Promise.all([
    breakdown(days, 'deviceCategory', 6),
    breakdown(days, 'country', 10),
    breakdown(days, 'language', 10),
  ]);
  return { devices, countries, languages };
}

export interface FeatureRow {
  name: FeatureEvent;
  /** 이벤트 발생 횟수. */
  count: number;
  /** 그 기능을 한 번이라도 쓴 사람 수. */
  users: number;
}

/**
 * 기능별 사용량.
 *
 * eventName 하나로 가른다 — 이름을 기능마다 따로 둔 이유는 lib/ga-events.ts 주석 참조.
 * IN_LIST 로 우리 이름만 뽑아서, GA 가 자동으로 넣는 이벤트(page_view, scroll,
 * click, user_engagement …)가 목록을 덮지 않게 한다.
 *
 * **2026-08-04 배포부터 쌓인다.** 그 이전 기간은 전부 0 이며, 이는 '아무도 안 썼다'가
 * 아니라 '셀 방법이 없었다'는 뜻이다 — 화면에서 그렇게 구분해 보여준다.
 */
export async function featureUsage(days: number): Promise<FeatureRow[]> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: [...FEATURE_NAMES] },
      },
    },
    limit: 50,
  });

  const got = new Map(
    rows.map((r) => [
      r.dimensionValues?.[0]?.value ?? '',
      {
        count: Number(r.metricValues?.[0]?.value ?? 0),
        users: Number(r.metricValues?.[1]?.value ?? 0),
      },
    ]),
  );

  // 한 번도 안 쓰인 기능은 GA 가 행 자체를 안 준다. 목록에서 사라지면 '안 쓰인다'는
  // 사실이 안 보이므로, 우리가 아는 이름을 전부 채워 0 으로 남긴다.
  return FEATURE_NAMES.map((name) => ({
    name,
    count: got.get(name)?.count ?? 0,
    users: got.get(name)?.users ?? 0,
  })).sort((a, b) => b.count - a.count);
}

export interface ReportUse {
  views: number;
  users: number;
}

/**
 * 리포트 페이지 열람.
 *
 * **이 값은 과거 기간에도 나온다.** 리포트는 /player/<식별코드>/report 라는 별도
 * 페이지고 평범한 링크 이동이라, GA 를 붙인 날부터 페이지뷰로 쌓여 왔다.
 * report_open 이벤트를 새로 만들기 전의 기간도 여기서는 보인다.
 *
 * 이벤트와 세는 대상이 다르다는 점에 주의:
 *   report_open  조회 화면에서 '리포트 보기'를 **누른** 횟수
 *   이 함수       리포트 페이지가 **열린** 횟수 — 공유 링크로 바로 들어오거나
 *                즐겨찾기·새로고침·뒤로가기로 다시 연 것까지 포함한다
 * 그래서 보통 이쪽이 더 크고, 둘의 차이가 곧 '링크를 타고 온 사람'이다.
 */
export async function reportViews(days: number): Promise<ReportUse> {
  const rows = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'ENDS_WITH', value: '/report' },
      },
    },
    limit: 20000,
  });

  // 행이 플레이어별로 갈라져 온다. 사용자 수는 합산이 성립하지 않으므로
  // (같은 사람이 여러 플레이어의 리포트를 볼 수 있다) 최댓값을 하한으로 쓴다.
  let views = 0;
  let users = 0;
  for (const r of rows) {
    views += Number(r.metricValues?.[0]?.value ?? 0);
    users = Math.max(users, Number(r.metricValues?.[1]?.value ?? 0));
  }
  return { views, users };
}
