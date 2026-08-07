// Part A — 실제 표본으로 멘트 파이프라인을 재현해 "이번 버그처럼 특정 소재(프로/리그/
// 감독)가 자격 미달 레이팅에서 나오는가"를 자동 검사한다. (docs/quip-monitoring.md 참조)
//
// 이 스크립트는 네트워크를 쓴다 — npm run check 체인(합성 입력, 네트워크 없음)에 넣지
// 않는다. .github/workflows/quip-simulation-check.yml 에서 매주 돈다.
//
// 실사고(2026-08-07): 레이팅 1447(승률 44%)인 유저가 승단만 하고도 "프로 무대에
// 입성했습니다. 이제는 승격이 아니라 잔류를 고민해야 할 때입니다"를 받았다.
// COACH_HIGH_MIN_RATING(1950) 게이트로 고쳤는데, 이 스크립트는 그 게이트가 나중에
// 다시 빠지는 회귀를 실제 표본으로 잡는다. scripts/check-fact-jokes.ts 의 합성 테스트가
// 1차 방어선(내가 상상한 입력), 이건 2차 방어선(실제 사람 기록)이다.
//
// 재현 파이프라인은 scripts/collect-quip-coverage.ts 와 동일하다(fetchReplays →
// normalizeReplays → sessionAdvice → buildQuipFacts → pickJoke/pickCoach) — 다만
// 그쪽은 "분포가 말이 되는가"를 사람이 읽는 리포트고, 이건 "게이트가 지켜지는가"를
// 기계가 판정하는 규칙검사라 목적이 다르다.

import * as fs from 'fs';
import * as path from 'path';
import { fetchReplays } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import { sessionAdvice } from '../lib/tekken/advice';
import { buildQuipFacts } from '../lib/tekken/quip-facts';
import { dateKey, type MatchRecord } from '../lib/tekken/models';
import { pickJoke, pickCoach, COACH_HIGH_MIN_RATING } from '../app/jokes';
import { seasonOf } from '../app/season-jokes';
import type { PlayerIndex } from '../lib/tekken/player-index';

const MIN_GAMES_FOR_ADVICE = 100; // sessionAdvice 가 null 을 주는 하한과 동일 (collect-quip-coverage.ts 참조)
const BOUNDARY_SAMPLE = 10; // COACH_HIGH_MIN_RATING 근방 우선 표본 — 버그가 실제로 걸리는 경계
const GENERAL_PER_BAND = 2; // 그 외 250점 구간별 일반 표본(정보성 분포 통계용)
const MAX_SAMPLE = 30;
const WAVU_GAP_MS = 900; // wavu 예의 (probe-quip-facts.ts / collect-quip-coverage.ts 와 동일)

// 이번 버그를 고칠 때 실제로 게이트한 소재의 정확한 어휘. 넓은 "프로스러운 톤" 탐지가
// 아니라 이 사고 계급을 겨눈 좁은 회귀 방지선이다 — 오탐을 0에 가깝게 유지하는 게 목적.
const HIGH_STAKES_KEYWORDS = ['프로', '리그', '감독', '코치', '승격'];

const INDEX_PATH = path.join(__dirname, '../lib/tekken/player-index-data.json');

function daysSinceLast(records: MatchRecord[]): number {
  if (!records.length) return 0;
  const last = records.reduce((a, b) => (a.dt > b.dt ? a : b)).dt;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return Math.max(
    0,
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dateKey(last)}T00:00:00Z`)) / 86_400_000),
  );
}

function selectSample(index: PlayerIndex): { id: string; rating: number }[] {
  const rows = index.rows.map((r) => ({ id: r.id, rating: r.rating }));
  const picked = new Map<string, { id: string; rating: number }>();

  // 1) 임계값(COACH_HIGH_MIN_RATING) 근방 우선 — 버그가 실제로 걸리는 경계다.
  const byDistance = [...rows].sort((a, b) => {
    const da = Math.abs(a.rating - COACH_HIGH_MIN_RATING);
    const db = Math.abs(b.rating - COACH_HIGH_MIN_RATING);
    return da - db || a.id.localeCompare(b.id);
  });
  for (const r of byDistance) {
    if (picked.size >= BOUNDARY_SAMPLE) break;
    picked.set(r.id, r);
  }

  // 2) 나머지는 250점 구간별로 골고루 — 결정적 선택(id 정렬)이라 CI 실패가 재현 가능하다.
  const byBand = new Map<number, { id: string; rating: number }[]>();
  for (const r of rows) {
    if (picked.has(r.id)) continue;
    const band = Math.floor(r.rating / 250) * 250;
    const arr = byBand.get(band);
    if (arr) arr.push(r);
    else byBand.set(band, [r]);
  }
  for (const [, bandRows] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
    if (picked.size >= MAX_SAMPLE) break;
    const sorted = [...bandRows].sort((a, b) => a.id.localeCompare(b.id));
    for (const r of sorted.slice(0, GENERAL_PER_BAND)) {
      if (picked.size >= MAX_SAMPLE) break;
      picked.set(r.id, r);
    }
  }

  return [...picked.values()];
}

interface Violation {
  id: string;
  rating: number;
  mood: string;
  source: 'pickJoke' | 'pickCoach';
  text: string;
  keyword: string;
}

const sleep = () => new Promise((r) => setTimeout(r, WAVU_GAP_MS));

async function main() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error(`플레이어 인덱스가 없습니다: ${INDEX_PATH}`);
    process.exit(1);
  }
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')) as PlayerIndex;
  const sample = selectSample(index);
  console.log(`표본 ${sample.length}명 선정 (임계값 ${COACH_HIGH_MIN_RATING} 근방 우선 ${BOUNDARY_SAMPLE}명 포함)`);

  const violations: Violation[] = [];
  const moodDist: Record<string, number> = {};
  const sourceDist: Record<string, number> = {};

  for (let i = 0; i < sample.length; i++) {
    const { id } = sample[i];
    try {
      const replays = await fetchReplays(id);
      const { records } = normalizeReplays(replays, id);
      if (records.length < MIN_GAMES_FOR_ADVICE) {
        console.log(`[${i + 1}/${sample.length}] ${id}  SKIP(표본 부족, ${records.length}판)`);
        await sleep();
        continue;
      }
      const staleDays = daysSinceLast(records);
      const advice = sessionAdvice(records, undefined, staleDays);
      if (!advice) {
        console.log(`[${i + 1}/${sample.length}] ${id}  SKIP(advice 없음)`);
        await sleep();
        continue;
      }
      const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const facts = buildQuipFacts({
        records,
        allRecords: records,
        today,
        tzOffsetMinutes: 9 * 60,
        tzKnown: true,
      });
      if (!facts) {
        console.log(`[${i + 1}/${sample.length}] ${id}  SKIP(facts 없음)`);
        await sleep();
        continue;
      }
      const rating = facts.currentRating;
      const last = records.reduce((a, b) => (a.dt > b.dt ? a : b));
      const season = seasonOf(last.dt);
      moodDist[advice.mood] = (moodDist[advice.mood] ?? 0) + 1;

      const seed = records.length + advice.losingStreak * 7;
      const joke = pickJoke(advice.mood, 'ko', seed, advice.recentDeltaPp, advice.losingStreak, season, facts);
      const coachSeed = records.length * 3 + Math.round(advice.recentDeltaPp);
      const coach = pickCoach(advice.mood, 'ko', coachSeed, rating, advice.baselineWinRate);

      if (joke.text) sourceDist[joke.source] = (sourceDist[joke.source] ?? 0) + 1;

      for (const [source, text] of [
        ['pickJoke', joke.text],
        ['pickCoach', coach],
      ] as const) {
        if (!text) continue;
        for (const kw of HIGH_STAKES_KEYWORDS) {
          if (text.includes(kw) && rating < COACH_HIGH_MIN_RATING) {
            violations.push({ id, rating, mood: advice.mood, source, text, keyword: kw });
          }
        }
      }
      console.log(`[${i + 1}/${sample.length}] ${id}  rating=${rating} mood=${advice.mood}  ok`);
    } catch (e) {
      console.log(`[${i + 1}/${sample.length}] ${id}  ERROR ${String(e)}`);
    }
    await sleep();
  }

  console.log('\n무드 분포(정보용):', moodDist);
  console.log('사다리 출처 분포(정보용, pickJoke만):', sourceDist);

  if (violations.length > 0) {
    console.log(`\n✗ 게이트 위반 ${violations.length}건:`);
    for (const v of violations) {
      console.log(
        `  player=${v.id} rating=${v.rating} mood=${v.mood} source=${v.source} matched="${v.keyword}"\n` +
          `    text: "${v.text}"\n` +
          `    COACH_HIGH_MIN_RATING=${COACH_HIGH_MIN_RATING} (레이팅 미달)`,
      );
    }
    process.exit(1);
  }
  console.log(`\n✓ ${sample.length}명 표본, 위반 없음`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
