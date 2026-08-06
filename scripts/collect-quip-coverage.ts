// 흐름 탭 멘트(app/jokes.ts pickJoke) 커버리지 점검 — 실제 유저 표본으로 돌린다.
// (npx tsx scripts/collect-quip-coverage.ts [이번 배치 최대 처리수] [입력JSON경로])
//
// 목적 (2026-08-06, 사용자 요청):
//  1. 같은 멘트가 너무 자주/거의 안 나오지 않는가 (분포 확인)
//  2. JOKES 기본 풀(app/jokes.ts)에서 실전에서 한 번도 안 뽑히는 문구가 있는가
//  3. mood/facts 판정이 실제 데이터에서 말이 되는가 (수동 확인용 원본 출력)
//
// 표본 소스: tekkenstats.com 관리자 통계(최근 90일 실조회 유저 목록 전체, players[].id).
// wavu 예의(요청 간 900ms)는 probe-quip-facts.ts 와 동일하게 지킨다 — 전체(2,425명)를
// 한 번에 돌리면 40분 넘게 걸려 백그라운드 실행 한도(10분)를 넘으므로, **이어하기**
// 가능하게 짰다: 처리한 사람은 JSONL 에 즉시 한 줄씩 append 하고, 다음 실행은 이미
// 끝난 id 를 건너뛴다. 요약 리포트는 매 실행 끝에 "지금까지 누적분 전체" 기준으로 다시 만든다.
//
// pickJoke 호출부(app/page.tsx:2758)를 그대로 재현한다 — mood/seed/pp/streak/season/facts
// 전부 서버(app/api/replays/[id]/route.ts)가 쓰는 순수 함수를 직접 불러 계산한다.

import * as fs from 'fs';
import * as path from 'path';
import { fetchReplays } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import { sessionAdvice } from '../lib/tekken/advice';
import { buildQuipFacts } from '../lib/tekken/quip-facts';
import { dateKey, type MatchRecord } from '../lib/tekken/models';
import { pickJoke, type Mood } from '../app/jokes';
import { factPools } from '../app/fact-jokes';
import { seasonOf, seasonPool } from '../app/season-jokes';

const DEFAULT_INPUT = 'C:\\Users\\jinho.joo\\Downloads\\tekken8stats_admin_90d_20260806_1200.json';
const MIN_GAMES_FOR_ADVICE = 100; // sessionAdvice 가 null 을 주는 하한(MIN_BAND_GAMES*2)과 동일

const argBatch = Number(process.argv[2]);
const BATCH_LIMIT = Number.isFinite(argBatch) && argBatch > 0 ? argBatch : Infinity;
const inputPath = process.argv[3] || DEFAULT_INPUT;

const MOODS: Mood[] = ['blazing', 'hot', 'steady', 'cooling', 'cold', 'frozen'];

const OUT_DIR = path.join(__dirname, 'out');
const PROGRESS_PATH = path.join(OUT_DIR, 'quip-progress-ko.jsonl');

interface PlayerRow {
  id: string;
  name: string;
  lookups: number;
}

type QuipSource = 'event' | 'rankChange' | 'clock' | 'state' | 'season' | 'trait' | 'base';

interface ResultRow {
  kind: 'result';
  id: string;
  name: string;
  games: number;
  mood: Mood;
  pp: number;
  streak: number;
  seed: number;
  text: string;
  daysSinceLast: number;
  stale: boolean; // daysSinceLast > STALE_DAYS(30) — advice.ts 가 mood 를 steady 로 강제하는 조건
  source: QuipSource; // 사후 분류 — 이 텍스트가 어느 풀에서 나왔는지 (사다리 확률 로직과 무관하게 소속 검사만 함)
}

/** 결과 텍스트가 어느 풀에서 왔는지 사후 분류한다 (선택 로직을 다시 구현하지 않고 소속 검사만). */
function classifySource(
  text: string,
  mood: Mood,
  lang: 'ko',
  season: ReturnType<typeof seasonOf> | null,
  facts: Parameters<typeof factPools>[0],
): QuipSource {
  const pools = factPools(facts, lang, mood);
  if (pools.events.some((arr) => arr.includes(text))) return 'event';
  if (pools.rankChange.includes(text)) return 'rankChange';
  if (pools.clock.includes(text)) return 'clock';
  if (pools.state.includes(text)) return 'state';
  if (season) {
    const up = ['blazing', 'hot', 'steady'].includes(mood) ? 'up' : 'down';
    if (seasonPool(season, up as 'up' | 'down', lang).includes(text)) return 'season';
  }
  if (pools.traits.includes(text)) return 'trait';
  return 'base';
}

interface SkipRow {
  kind: 'skip';
  id: string;
  reason: 'too_few_games' | 'no_advice' | 'empty_text' | 'error';
  detail?: string;
}

type ProgressRow = ResultRow | SkipRow;

/** app/api/replays/[id]/route.ts 의 daysSinceLast 를 그대로 옮긴 것. */
function daysSinceLast(records: MatchRecord[]): number {
  if (!records.length) return 0;
  const last = records.reduce((a, b) => (a.dt > b.dt ? a : b)).dt;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return Math.max(
    0,
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dateKey(last)}T00:00:00Z`)) / 86_400_000),
  );
}

/**
 * app/jokes.ts 소스를 텍스트로 읽어 JOKES[mood].ko 배열의 백틱 리터럴을 전부 뽑는다.
 * (JOKES 자체가 export 안 되므로 — 프로덕션 코드를 건드리지 않고 정적 분석만으로 접근)
 * 동적(${...} 포함) 문구는 정규식 패턴으로, 고정 문구는 원문 그대로 반환한다.
 */
function extractKoTemplates(jokesSrc: string): Record<Mood, { raw: string; dynamic: boolean }[]> {
  const jokesStart = jokesSrc.indexOf('const JOKES: Record<Mood, Record<Lang, Joke[]>> = {');
  const jokesEnd = jokesSrc.indexOf('\nfunction pick<T>', jokesStart);
  const block = jokesSrc.slice(jokesStart, jokesEnd);

  const out = {} as Record<Mood, { raw: string; dynamic: boolean }[]>;
  for (let i = 0; i < MOODS.length; i++) {
    const mood = MOODS[i];
    const startMarker = `\n  ${mood}: {`;
    const start = block.indexOf(startMarker);
    if (start === -1) {
      out[mood] = [];
      continue;
    }
    const nextMoodStart =
      i + 1 < MOODS.length ? block.indexOf(`\n  ${MOODS[i + 1]}: {`, start + 1) : block.length;
    const moodBlock = block.slice(start, nextMoodStart === -1 ? block.length : nextMoodStart);

    const koStart = moodBlock.indexOf('ko: [');
    const enStart = moodBlock.indexOf('\n    en:', koStart);
    const koBlock = moodBlock.slice(koStart, enStart === -1 ? moodBlock.length : enStart);

    const templates: { raw: string; dynamic: boolean }[] = [];
    const re = /`([^`]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(koBlock))) {
      templates.push({ raw: m[1], dynamic: m[1].includes('${') });
    }
    out[mood] = templates;
  }
  return out;
}

/** 동적 템플릿(백틱 안에 ${...})을 매치용 정규식으로 바꾼다. */
function templateToRegex(raw: string): RegExp {
  const pattern = raw
    .split(/\$\{[^}]*\}/g)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+?');
  return new RegExp(`^${pattern}$`);
}

function loadProgress(): ProgressRow[] {
  if (!fs.existsSync(PROGRESS_PATH)) return [];
  const lines = fs.readFileSync(PROGRESS_PATH, 'utf-8').split('\n').filter((l) => l.trim());
  return lines.map((l) => JSON.parse(l) as ProgressRow);
}

function appendProgress(row: ProgressRow) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(PROGRESS_PATH, JSON.stringify(row) + '\n', 'utf-8');
}

async function main() {
  const inputRaw = fs.readFileSync(inputPath, 'utf-8');
  const input = JSON.parse(inputRaw) as { players: PlayerRow[] };

  const already = loadProgress();
  const doneIds = new Set(already.map((r) => r.id));
  console.log(`기존 누적 진행: ${already.length}명 (진행 파일: ${PROGRESS_PATH})`);

  const remaining = input.players.filter((p) => !doneIds.has(p.id));
  const targets = remaining.slice(0, BATCH_LIMIT);
  console.log(
    `이번 배치: ${targets.length}명 처리 예정 (전체 ${input.players.length}명 중 남은 ${remaining.length}명)`,
  );

  for (let i = 0; i < targets.length; i++) {
    const { id } = targets[i];
    let logSuffix = '';
    try {
      const replays = await fetchReplays(id);
      const { records, myName } = normalizeReplays(replays, id);

      if (records.length < MIN_GAMES_FOR_ADVICE) {
        appendProgress({ kind: 'skip', id, reason: 'too_few_games', detail: `${records.length}판` });
        logSuffix = `SKIP(too_few_games, ${records.length}판)`;
      } else {
        const staleDays = daysSinceLast(records);
        const advice = sessionAdvice(records, undefined, staleDays);
        if (!advice) {
          appendProgress({ kind: 'skip', id, reason: 'no_advice' });
          logSuffix = 'SKIP(no_advice)';
        } else {
          const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
          const facts = buildQuipFacts({
            records,
            allRecords: records,
            today,
            tzOffsetMinutes: 9 * 60,
            tzKnown: true,
          });
          const last = records.reduce((a, b) => (a.dt > b.dt ? a : b));
          const season = seasonOf(last.dt);
          const seed = records.length + advice.losingStreak * 7;
          const text = pickJoke(
            advice.mood,
            'ko',
            seed,
            advice.recentDeltaPp,
            advice.losingStreak,
            season,
            facts,
          );
          if (!text) {
            appendProgress({ kind: 'skip', id, reason: 'empty_text' });
            logSuffix = 'SKIP(empty_text)';
          } else {
            const source = classifySource(text, advice.mood, 'ko', season, facts);
            appendProgress({
              kind: 'result',
              id,
              name: myName || id,
              games: records.length,
              mood: advice.mood,
              pp: advice.recentDeltaPp,
              streak: advice.losingStreak,
              seed,
              text,
              daysSinceLast: staleDays,
              stale: staleDays > 30,
              source,
            });
            logSuffix = `mood=${advice.mood} src=${source} → ${text}`;
          }
        }
      }
    } catch (e) {
      appendProgress({ kind: 'skip', id, reason: 'error', detail: String(e) });
      logSuffix = `ERROR ${String(e)}`;
    }
    console.log(`[${i + 1}/${targets.length} | 누적 ${already.length + i + 1}] ${id}  ${logSuffix}`);
    await new Promise((r) => setTimeout(r, 900)); // wavu 예의
  }

  // ── 누적 전체로 커버리지 분석 (이번 배치 + 지금까지 전부) ──────────────
  const all = loadProgress();
  const results = all.filter((r): r is ResultRow => r.kind === 'result');
  const skips = all.filter((r): r is SkipRow => r.kind === 'skip');

  const jokesSrc = fs.readFileSync(path.join(__dirname, '../app/jokes.ts'), 'utf-8');
  const catalog = extractKoTemplates(jokesSrc);

  const byMood: Record<string, ResultRow[]> = {};
  for (const r of results) (byMood[r.mood] ??= []).push(r);

  const freq = new Map<string, number>();
  for (const r of results) freq.set(r.text, (freq.get(r.text) ?? 0) + 1);
  const freqSorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);

  const coverageReport: Record<
    string,
    { catalogSize: number; staticCount: number; dynamicCount: number; staticSeen: number; staticUnseen: string[] }
  > = {};
  for (const mood of MOODS) {
    const templates = catalog[mood];
    const staticTemplates = templates.filter((t) => !t.dynamic);
    const seenTexts = new Set((byMood[mood] ?? []).map((r) => r.text));
    const staticUnseen = staticTemplates.filter((t) => !seenTexts.has(t.raw)).map((t) => t.raw);
    coverageReport[mood] = {
      catalogSize: templates.length,
      staticCount: staticTemplates.length,
      dynamicCount: templates.length - staticTemplates.length,
      staticSeen: staticTemplates.length - staticUnseen.length,
      staticUnseen,
    };
  }

  const dynamicHit: Record<string, number> = {};
  for (const mood of MOODS) {
    const dynTemplates = catalog[mood].filter((t) => t.dynamic);
    const texts = (byMood[mood] ?? []).map((r) => r.text);
    let hit = 0;
    for (const t of dynTemplates) {
      const re = templateToRegex(t.raw);
      if (texts.some((x) => re.test(x))) hit++;
    }
    dynamicHit[mood] = hit;
  }

  const moodDist: Record<string, number> = {};
  for (const r of results) moodDist[r.mood] = (moodDist[r.mood] ?? 0) + 1;

  const staleCount = results.filter((r) => r.stale).length;
  const nonStale = results.filter((r) => !r.stale);
  const moodDistNonStale: Record<string, number> = {};
  for (const r of nonStale) moodDistNonStale[r.mood] = (moodDistNonStale[r.mood] ?? 0) + 1;

  const sourceDist: Record<string, number> = {};
  for (const r of results) sourceDist[r.source] = (sourceDist[r.source] ?? 0) + 1;

  const out = {
    generatedAt: new Date().toISOString(),
    totalPlayerPool: input.players.length,
    processedTotal: all.length,
    remainingTotal: input.players.length - all.length,
    sampleUsed: results.length,
    skipped: skips.length,
    skipReasons: skips.reduce<Record<string, number>>((acc, s) => {
      acc[s.reason] = (acc[s.reason] ?? 0) + 1;
      return acc;
    }, {}),
    sourceDistribution: sourceDist,
    staleCount,
    stalePct: results.length ? Math.round((staleCount / results.length) * 1000) / 10 : 0,
    moodDistribution: moodDist,
    moodDistributionNonStale: moodDistNonStale,
    distinctTexts: freq.size,
    top20Repeated: freqSorted.slice(0, 20),
    coverageByMood: Object.fromEntries(
      MOODS.map((m) => [
        m,
        {
          ...coverageReport[m],
          dynamicSeenApprox: dynamicHit[m],
        },
      ]),
    ),
    results,
    skips,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(OUT_DIR, `quip-coverage-ko-${stamp}.json`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');

  console.log('\n══════════════ 누적 요약 (전체 진행 기준) ══════════════');
  console.log(`전체 풀 ${out.totalPlayerPool}명 중 처리 ${out.processedTotal}명, 남음 ${out.remainingTotal}명`);
  console.log(`표본 ${results.length}명 사용 / ${skips.length}명 스킵`, out.skipReasons);
  console.log('사다리 출처 분포(source):', sourceDist);
  console.log(`stale(30일+ 공백, mood 강제 steady): ${staleCount}명 (${out.stalePct}%)`);
  console.log('mood 분포(전체):', moodDist);
  console.log('mood 분포(stale 제외, 기존 실측치와 비교용):', moodDistNonStale);
  console.log(`서로 다른 멘트 문자열: ${freq.size}개`);
  console.log('가장 많이 반복된 상위 10개:');
  for (const [text, c] of freqSorted.slice(0, 10)) console.log(`  x${c}  ${text}`);
  console.log('\nmood별 기본 풀 커버리지 (고정 문구 기준):');
  for (const mood of MOODS) {
    const c = coverageReport[mood];
    console.log(
      `  ${mood.padEnd(8)} 고정 ${c.staticSeen}/${c.staticCount} 노출` +
        `  (동적 ${c.dynamicCount}개 중 근사 ${dynamicHit[mood]}개 매치)`,
    );
  }
  console.log(`\n결과 파일: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
