// 레이팅(wavu glicko2, myRank 아님) 구간대별 "순변화가 0을 넘는 손익분기 승률"을
// 실측한다 — docs/rank-threshold-research.md 의 자매 조사.
//
//   npx tsx scripts/build-rating-threshold-data.ts <admin export json 경로> [구간당 목표 인원] [feed-only]
//
// feed-only: admin export를 건너뛰고 전 구간을 wavu 피드로만 채운다. 2026-08-07
// 실측(admin export 위주)의 편향 검증용 — 결과를 rating-threshold-report-feedonly-*.json
// 에 따로 남긴다. 기존 체크포인트는 안 건드린다.
//
// 배경: lib/tekken/quip-facts.ts 의 DIVERGE_WIN_HI(60%)/DIVERGE_WIN_LO(48%)가
// **레이팅 구간과 무관하게 고정값**을 쓴다. 그런데 그 상수 옆 주석 자체가
// "손익분기 승률은 1600대 52% → 2400+ 64%로 오른다"(2026-08-05, 15명·363,237경기,
// 문서화 안 됨)고 말하고 있어 — 코드와 주석이 이미 모순이다.
//
// build-rank-threshold-data.ts 와 무엇이 다른가: 그 스크립트는 wavu가 그대로 주는
// myRank(단, 이산값)의 변화를 셌다. 이건 **wavu 레이팅(glicko2, 연속값)**의 변화를
// 센다 — docs/tekken8-rating-gain-loss-research.md 가 이미 밝혔듯 이 둘은 다른
// 숫자라 myRank 연구 결과를 레이팅 얘기에 그대로 못 쓴다. 그래서 별도 스크립트로
// 판다. 표본 선정(admin export 정찰 + wavu 피드 보강)은 그 스크립트와 같은 방식을
// 그대로 쓴다.
//
// 윈도우 크기는 DIVERGE_WINDOW(25판)로 맞춘다 — 실제 기능(diverge-jokes.ts)이
// 쓰는 창과 같아야 이 조사 결과를 그 기능에 바로 반영할 수 있다.

import * as fs from 'fs';
import * as path from 'path';
import { fetchReplays, normalizePolarisId } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import type { MatchRecord } from '../lib/tekken/models';

const BAND_WIDTH = 250;
const argTarget = Number(process.argv[3]);
const TARGET_PER_BAND = Number.isFinite(argTarget) && argTarget > 0 ? argTarget : 40;
const FEED_ONLY = process.argv[4] === 'feed-only';
const RATING_WINDOW = 25; // lib/tekken/quip-facts.ts 의 DIVERGE_WINDOW 와 동일
const WAVU_GAP_MS = 1200;
const FEED_STEP_SEC = 7000;
const FEED_API = 'https://wank.wavu.wiki/api/replays';
const MAX_FEED_WINDOWS = FEED_ONLY ? 120 : 40;

const OUT_DIR = path.join(__dirname, 'out');
const PROGRESS_PATH = path.join(OUT_DIR, FEED_ONLY ? 'rating-threshold-progress-feedonly.jsonl' : 'rating-threshold-progress.jsonl');
const REPORT_PREFIX = path.join(OUT_DIR, FEED_ONLY ? 'rating-threshold-report-feedonly' : 'rating-threshold-report');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bandOf = (rating: number) => Math.floor(rating / BAND_WIDTH) * BAND_WIDTH;

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '?';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${sec}초`;
  return `${sec}초`;
}
function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ═══════════════ 후보 목록 — build-rank-threshold-data.ts 와 동일한 방식 ═══════════════ */

interface AdminPlayer {
  id: string;
  rating?: number;
}
function loadAdminExport(p: string): AdminPlayer[] {
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as { players: AdminPlayer[] };
  return raw.players.filter((p) => typeof p.rating === 'number' && p.rating! > 0);
}

type Source = 'lookup' | 'feed';
interface Candidate {
  id: string;
  source: Source;
}
interface FeedReplay {
  battle_at: number;
  p1_polaris_id: string | null;
  p1_rating_before: number | null;
  p1_rating_change: number | null;
  p2_polaris_id: string | null;
  p2_rating_before: number | null;
  p2_rating_change: number | null;
}

async function buildCandidates(adminPath: string): Promise<Map<number, Candidate[]>> {
  const coverage = new Map<number, string[]>();
  if (FEED_ONLY) {
    console.log('\n── feed-only 모드 — admin export 건너뛰고 전 구간을 wavu 피드로만 채운다 ──');
  } else {
    const admin = loadAdminExport(adminPath);
    for (const p of admin) {
      const id = normalizePolarisId(p.id);
      if (!id) continue;
      const band = bandOf(p.rating!);
      const list = coverage.get(band) ?? coverage.set(band, []).get(band)!;
      if (!list.includes(id)) list.push(id);
    }

    console.log('\n── 1단계: admin export 정찰 ──');
    for (const [band, list] of [...coverage.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  ${band}~${band + BAND_WIDTH - 1}: ${list.length}명`);
    }
  }

  // 관측 범위(500~3249)의 모든 구간을 빈 배열로 먼저 깔아둔다 — 안 그러면 coverage에
  // 아예 없는 구간(feed-only 모드는 coverage가 통째로 비어 있음)이 short() 체크에서
  // 빠져 피드 보강을 통째로 건너뛴다(build-rank-threshold-data.ts와 같은 버그, 2026-08-07).
  const byBand = new Map<number, Candidate[]>();
  for (let b = 500; b <= 3000; b += BAND_WIDTH) byBand.set(b, []);
  const seenIds = new Set<string>();
  for (const [band, ids] of coverage) {
    const picked = [...ids].sort().slice(0, TARGET_PER_BAND);
    byBand.set(band, picked.map((id) => ({ id, source: 'lookup' as const })));
    for (const id of picked) seenIds.add(id);
  }

  const short = () => [...byBand.entries()].filter(([, list]) => list.length < TARGET_PER_BAND);
  if (short().length === 0) {
    console.log('모든 구간이 이미 충분함 — 피드 보강 생략');
    return byBand;
  }

  console.log('\n── 2단계: wavu 피드로 부족한 구간 보강 ──');
  let before: number | undefined;
  for (let w = 0; w < MAX_FEED_WINDOWS && short().length > 0; w++) {
    const url = before === undefined ? FEED_API : `${FEED_API}?before=${before}`;
    const res = await fetch(url, { headers: { 'accept-encoding': 'gzip' } });
    if (!res.ok) throw new Error(`피드 ${res.status} ${res.statusText} — ${url}`);
    const rows = (await res.json()) as FeedReplay[];
    if (!rows.length) break;

    for (const r of rows) {
      for (const side of [1, 2] as const) {
        const id = normalizePolarisId((side === 1 ? r.p1_polaris_id : r.p2_polaris_id) ?? '');
        const rb = side === 1 ? r.p1_rating_before : r.p2_rating_before;
        const rc = side === 1 ? r.p1_rating_change : r.p2_rating_change;
        if (!id || seenIds.has(id) || rb == null || rb <= 0) continue;
        const band = bandOf(rb + (rc ?? 0));
        const list = byBand.get(band) ?? byBand.set(band, []).get(band)!;
        if (list.length >= TARGET_PER_BAND) continue;
        seenIds.add(id);
        list.push({ id, source: 'feed' });
      }
    }

    const oldest = Math.min(...rows.map((r) => r.battle_at));
    before = oldest - FEED_STEP_SEC;
    console.log(`  피드 창 ${w + 1}/${MAX_FEED_WINDOWS}: +${rows.length}경기 · 부족 구간 ${short().length}개 남음`);
    await sleep(WAVU_GAP_MS);
  }

  console.log('\n── 최종 후보 구간별 인원 ──');
  for (const [band, list] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
    const feedN = list.filter((c) => c.source === 'feed').length;
    console.log(`  ${band}~${band + BAND_WIDTH - 1}: ${list.length}명 (feed ${feedN} / lookup ${list.length - feedN})`);
  }
  return byBand;
}

/* ═══════════════ 수집 + 레이팅 순변화 슬라이딩 윈도우 ═══════════════ */

interface RatingWindowRow {
  kind: 'window';
  playerId: string;
  source: Source;
  char: string;
  band: number; // 윈도우 시작 시점 레이팅이 속한 구간
  winRate: number;
  netDelta: number; // 윈도우 안 myDelta 합 — 순 레이팅 변화
}
interface DoneRow {
  kind: 'done';
  playerId: string;
  windows: number;
}
interface SkipRow {
  kind: 'skip';
  playerId: string;
  reason: 'too_few_games' | 'error';
  detail?: string;
}
type ProgressRow = RatingWindowRow | DoneRow | SkipRow;

function loadProgress(): ProgressRow[] {
  if (!fs.existsSync(PROGRESS_PATH)) return [];
  return fs
    .readFileSync(PROGRESS_PATH, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as ProgressRow);
}
function appendProgress(row: ProgressRow) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(PROGRESS_PATH, JSON.stringify(row) + '\n', 'utf-8');
}

/** 한 캐릭터의 경기를 시간순 25판 윈도우로 잘라 승률·순 레이팅 변화를 뽑는다. */
function analyzeCharRating(records: MatchRecord[]): Omit<RatingWindowRow, 'kind' | 'playerId' | 'source'>[] {
  const sorted = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const out: Omit<RatingWindowRow, 'kind' | 'playerId' | 'source'>[] = [];
  for (let i = 0; i + RATING_WINDOW <= sorted.length; i += RATING_WINDOW) {
    const win = sorted.slice(i, i + RATING_WINDOW);
    const wins = win.filter((r) => r.result === 'W').length;
    const netDelta = win.reduce((s, r) => s + r.myDelta, 0);
    out.push({
      char: win[0].myChar,
      band: bandOf(win[0].myRating),
      winRate: Math.round((wins / RATING_WINDOW) * 1000) / 1000,
      netDelta: Math.round(netDelta * 10) / 10,
    });
  }
  return out;
}

async function collectAndAnalyze(byBand: Map<number, Candidate[]>) {
  const all = [...byBand.values()].flat();
  const already = loadProgress();
  const doneIds = new Set(already.filter((r) => r.kind !== 'window').map((r) => (r as DoneRow | SkipRow).playerId));
  const remaining = all.filter((c) => !doneIds.has(c.id));

  console.log(
    `\n── 3단계: 경기 이력 수집(레이팅 순변화) ── 전체 ${all.length}명 · 기존 완료 ${doneIds.size}명 · 이번 실행 대상 ${remaining.length}명`,
  );

  const startedAt = Date.now();
  for (let i = 0; i < remaining.length; i++) {
    const { id, source } = remaining[i];
    try {
      const replays = await fetchReplays(id);
      const { records } = normalizeReplays(replays, id);

      const byChar = new Map<string, MatchRecord[]>();
      for (const r of records) (byChar.get(r.myChar) ?? byChar.set(r.myChar, []).get(r.myChar)!).push(r);

      let windowCount = 0;
      for (const [, charRecords] of byChar) {
        if (charRecords.length < RATING_WINDOW) continue;
        for (const w of analyzeCharRating(charRecords)) {
          appendProgress({ kind: 'window', playerId: id, source, ...w });
          windowCount++;
        }
      }
      appendProgress({ kind: 'done', playerId: id, windows: windowCount });

      const elapsed = Date.now() - startedAt;
      const avg = elapsed / (i + 1);
      const eta = avg * (remaining.length - i - 1);
      console.log(
        `[${doneIds.size + i + 1}/${all.length}] ${id}  윈도우 ${windowCount}개  ` +
          `경과 ${fmtDuration(elapsed)} · 남은 ${remaining.length - i - 1}명 · ` +
          `예상 소요 ${fmtDuration(eta)} · 완료 예정 ${fmtClock(Date.now() + eta)}`,
      );
    } catch (e) {
      appendProgress({ kind: 'skip', playerId: id, reason: 'error', detail: String(e) });
      console.log(`[${doneIds.size + i + 1}/${all.length}] ${id}  ERROR ${String(e)}`);
    }
    await sleep(WAVU_GAP_MS);
  }
}

/* ═══════════════ 집계 ═══════════════ */

const MAX_WINDOWS_PER_PLAYER_PER_BAND = 5; // build-rank-threshold-data.ts 와 같은 이유

function capHeavyUsers(rows: RatingWindowRow[]): RatingWindowRow[] {
  const byPlayerBand = new Map<string, RatingWindowRow[]>();
  for (const r of rows) {
    const key = `${r.playerId}::${r.band}`;
    (byPlayerBand.get(key) ?? byPlayerBand.set(key, []).get(key)!).push(r);
  }
  const out: RatingWindowRow[] = [];
  for (const list of byPlayerBand.values()) {
    if (list.length <= MAX_WINDOWS_PER_PLAYER_PER_BAND) {
      out.push(...list);
      continue;
    }
    const step = list.length / MAX_WINDOWS_PER_PLAYER_PER_BAND;
    for (let i = 0; i < MAX_WINDOWS_PER_PLAYER_PER_BAND; i++) out.push(list[Math.floor(i * step)]);
  }
  return out;
}

function report() {
  const rawRows = loadProgress().filter((r): r is RatingWindowRow => r.kind === 'window');
  const rows = capHeavyUsers(rawRows);
  console.log(
    `\n헤비 유저 캡 적용: 원본 윈도우 ${rawRows.length}개 → 캡 후 ${rows.length}개 ` +
      `((플레이어,구간) 당 최대 ${MAX_WINDOWS_PER_PLAYER_PER_BAND}개)`,
  );

  const byBand = new Map<number, RatingWindowRow[]>();
  for (const r of rows) (byBand.get(r.band) ?? byBand.set(r.band, []).get(r.band)!).push(r);

  const winRateBucket = (wr: number) => Math.min(90, Math.floor(wr * 10) * 10);

  const summary: Record<string, Record<string, { n: number; players: number; avgNetDelta: number }>> = {};
  for (const [band, list] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
    const key = `${band}~${band + BAND_WIDTH - 1}`;
    summary[key] = {};
    const byWr = new Map<number, RatingWindowRow[]>();
    for (const r of list) (byWr.get(winRateBucket(r.winRate)) ?? byWr.set(winRateBucket(r.winRate), []).get(winRateBucket(r.winRate))!).push(r);
    for (const [wr, wl] of [...byWr.entries()].sort((a, b) => a[0] - b[0])) {
      const avgNetDelta = wl.reduce((s, r) => s + r.netDelta, 0) / wl.length;
      const players = new Set(wl.map((r) => r.playerId)).size;
      summary[key][`${wr}~${wr + 9}%`] = { n: wl.length, players, avgNetDelta: Math.round(avgNetDelta * 100) / 100 };
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = `${REPORT_PREFIX}-${stamp}.json`;
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ratingWindow: RATING_WINDOW, bandWidth: BAND_WIDTH, maxWindowsPerPlayerPerBand: MAX_WINDOWS_PER_PLAYER_PER_BAND, summary }, null, 2),
    'utf-8',
  );

  console.log(`\n══════════════ 구간대별 승률 → 평균 순 레이팅 변화 (윈도우 ${RATING_WINDOW}판, 헤비 유저 캡) ══════════════`);
  for (const [band, wrTable] of Object.entries(summary)) {
    console.log(`\n레이팅 ${band}:`);
    for (const [wr, v] of Object.entries(wrTable)) {
      console.log(`  승률 ${wr.padEnd(8)} n=${String(v.n).padEnd(5)} (${v.players}명) 평균 순변화 ${v.avgNetDelta >= 0 ? '+' : ''}${v.avgNetDelta}`);
    }
  }
  console.log(`\n결과 파일: ${outPath}`);
}

/* ═══════════════ 진입점 ═══════════════ */

async function main() {
  const adminPath = process.argv[2];
  if (!adminPath || !fs.existsSync(adminPath)) {
    console.error('사용법: npx tsx scripts/build-rating-threshold-data.ts <admin export json 경로> [구간당 목표 인원] [feed-only]');
    process.exit(1);
  }
  console.log(`구간당 목표 인원: ${TARGET_PER_BAND}명${argTarget ? '' : ' (기본값)'}${FEED_ONLY ? ' · feed-only 모드' : ''}`);
  const byBand = await buildCandidates(adminPath);
  await collectAndAnalyze(byBand);
  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
