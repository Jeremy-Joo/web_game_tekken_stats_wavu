// Part B — GA 실사용 분포로 멘트 "풀"(무드×사다리단계) 편중을 매주 점검한다.
// (npx tsx scripts/check-quip-usage-drift.ts, docs/quip-monitoring.md 참조)
//
// Part A(check-quip-simulation.ts)와 다른 계급을 본다 — 그쪽은 "이 문구가 이 맥락에
// 나오면 안 된다"(구조), 이건 "이 풀이 너무 자주/전혀 안 나온다"(실사용 분포). 2026-08-06
// 사고(승단·연승·오늘 몰림 멘트가 실측 이벤트의 68% 차지)와 같은 계급을 다시 자동으로
// 잡으려는 것 — 다만 이번엔 사람이 GA 원자료를 내려받지 않아도 되게 자동화했다.
//
// **경고만 낸다, 실패시키지 않는다** — Part A 의 키워드 대조와 달리 GA 분포 판정은
// 노이즈가 섞인다(이 사이트 트래픽 규모에서 하루 단위는 특히). ::warning:: 로 남기고
// GitHub Actions 요약에서 사람이 훑어보게 한다.
//
// GA_SERVICE_ACCOUNT 는 Vercel 환경변수에만 있어 여기서 GA 를 직접 못 부른다
// (scripts/build-player-index.ts 머리말과 같은 사정) — 운영 admin API 를 통해 받는다.

const PROD = 'https://tekkenstats.com';
const DAYS = 28; // admin 화면 기본 범위(isAdminRangeDays)와 동일 — 노이즈를 줄이려 누적
const DOMINANCE_THRESHOLD = 0.6; // 2026-08-06 편중 사고(68%)를 참고한 눈금

// GA4 맞춤 측정기준(quip_pool, rating_bucket) 등록일. 등록 전 데이터는 전부 0 이라
// '아무도 안 봤다'가 아니라 '셀 방법이 없었다'는 뜻이다(lib/ga.ts quipUsage 주석 참조).
// 2026-08-07 GA4 콘솔에서 quip_pool·rating_bucket 두 맞춤 측정기준 등록 완료.
const CUSTOM_DIMENSIONS_REGISTERED_AT: string | null = '2026-08-07';
const GRACE_PERIOD_DAYS = 14;

// day_theme 은 별도 등록일이다(quip_pool·rating_bucket보다 나중에 등록됨) — 두 유예
// 기간을 따로 둔다. 여기 날짜를 등록한 실제 날짜로 갱신할 것.
const DAY_THEME_REGISTERED_AT: string | null = '2026-08-09';

interface QuipPoolRow {
  pool: string;
  ratingBucket: string;
  dayTheme: string;
  count: number;
  users: number;
}

const KNOWN_DAY_THEMES = ['movie', 'movieQuote', 'justiceHistory', 'realEstateTax', 'wildlife'] as const;

function withinGracePeriodOf(registeredAt: string | null): boolean {
  if (!registeredAt) return true;
  const elapsedDays = (Date.now() - Date.parse(`${registeredAt}T00:00:00Z`)) / 86_400_000;
  return elapsedDays < GRACE_PERIOD_DAYS;
}

async function fetchQuipUsage(): Promise<QuipPoolRow[]> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD 환경변수가 없습니다.');
  const res = await fetch(`${PROD}/api/admin/quip-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, days: DAYS }),
  });
  if (!res.ok) throw new Error(`admin/quip-usage ${res.status}`);
  const data = (await res.json()) as { rows?: QuipPoolRow[] };
  return data.rows ?? [];
}

async function main() {
  if (withinGracePeriodOf(CUSTOM_DIMENSIONS_REGISTERED_AT)) {
    console.log(
      `유예 기간(quip_pool·rating_bucket 등록 후 ${GRACE_PERIOD_DAYS}일, 또는 아직 미등록) — 건너뜀`,
    );
    return;
  }

  const rows = await fetchQuipUsage();
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  if (totalCount === 0) {
    console.log('::warning::quip_shown 이벤트가 0건입니다 — 맞춤 측정기준 등록·배포 상태를 확인하세요.');
    return;
  }

  const byPool = new Map<string, number>();
  for (const r of rows) byPool.set(r.pool, (byPool.get(r.pool) ?? 0) + r.count);

  console.log(`최근 ${DAYS}일 quip_shown 총 ${totalCount}건`);
  for (const [pool, count] of [...byPool.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((count / totalCount) * 1000) / 10;
    console.log(`  ${pool.padEnd(10)} ${count}건 (${pct}%)`);
    if (count / totalCount > DOMINANCE_THRESHOLD) {
      console.log(
        `::warning::풀 "${pool}"이 전체 quip_shown 의 ${pct}% 를 차지합니다 ` +
          `(임계값 ${DOMINANCE_THRESHOLD * 100}%) — 2026-08-06 편중 사고와 같은 패턴인지 확인하세요.`,
      );
    }
  }

  // event/rankChange/clock/state/season/trait/base 중 하나가 통째로 0건이면
  // (lib/ga.ts quipUsage 의 0행 채움) 게이트 로직이 그 풀을 막고 있는 건 아닌지 확인할 거리.
  const zeroPools = rows.filter((r) => r.count === 0).map((r) => r.pool);
  if (zeroPools.length > 0) {
    console.log(`::warning::0건인 풀: ${zeroPools.join(', ')} — 의도된 것인지 확인하세요.`);
  }

  // ── 요일 테마(day_theme) — 별도 등록일이라 유예 기간도 따로 본다 ──────────
  // pool 축과 달리 'none'(주말·미배정)이 구조적으로 절반 이상을 차지하는 게 정상이라
  // 'none'을 총량에서 빼고, **테마가 실제로 나간 것들끼리만** 편중을 본다. 그래야
  // "월요일 조회가 많아서 movie가 40%"같은 정상적 편차와 "en/ja 폴백으로 한 테마가
  // 거의 안 뜬다"같은 실제 버그를 구분할 수 있다.
  if (withinGracePeriodOf(DAY_THEME_REGISTERED_AT)) {
    console.log(`day_theme 유예 기간(등록 후 ${GRACE_PERIOD_DAYS}일, 또는 아직 미등록) — 건너뜀`);
    return;
  }

  const themedRows = rows.filter((r) => r.dayTheme !== 'none' && r.dayTheme !== 'all' && r.dayTheme !== 'unknown');
  const themedTotal = themedRows.reduce((s, r) => s + r.count, 0);
  if (themedTotal === 0) {
    console.log('::warning::day_theme 이 실린 quip_shown 이 0건입니다 — day_theme 맞춤 측정기준 등록 상태를 확인하세요.');
    return;
  }

  const byDayTheme = new Map<string, number>();
  for (const r of themedRows) byDayTheme.set(r.dayTheme, (byDayTheme.get(r.dayTheme) ?? 0) + r.count);

  console.log(`최근 ${DAYS}일 요일 테마 노출(주말·미배정 제외) 총 ${themedTotal}건`);
  for (const [theme, count] of [...byDayTheme.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((count / themedTotal) * 1000) / 10;
    console.log(`  ${theme.padEnd(16)} ${count}건 (${pct}%)`);
    if (count / themedTotal > DOMINANCE_THRESHOLD) {
      console.log(
        `::warning::요일 테마 "${theme}"가 노출된 요일 테마 중 ${pct}% 를 차지합니다 ` +
          `(임계값 ${DOMINANCE_THRESHOLD * 100}%) — 주간 셔플이 고르게 도는지 확인하세요.`,
      );
    }
  }

  // 5개 중 하나가 통째로 0건이면 그 테마의 en/ja 풀이 비어 특정 언어에서 전혀 안
  // 뜨거나, 요일 셔플·sixState 게이트에 버그가 있다는 신호일 수 있다.
  const zeroThemes = KNOWN_DAY_THEMES.filter((t) => !byDayTheme.has(t));
  if (zeroThemes.length > 0) {
    console.log(`::warning::0건인 요일 테마: ${zeroThemes.join(', ')} — 의도된 것인지 확인하세요.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
