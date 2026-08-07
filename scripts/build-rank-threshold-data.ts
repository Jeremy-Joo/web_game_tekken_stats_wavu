// 레이팅 구간대별 "랭크가 오르는 데 필요한 승률"을 실측한다.
//
//   npx tsx scripts/build-rank-threshold-data.ts <admin export json 경로> [구간당 목표 인원]
//
// 구간당 목표 인원(기본 40)을 키우면 승률 버킷(10%p 단위)마다 표본이 늘어 정확도가
// 오르지만 그만큼 오래 걸린다. 권장 순서: 먼저 기본값(40)으로 빠르게 한 번 돌려
// scripts/out/rank-threshold-report-*.json 에서 n(표본 수)이 낮은 구간·버킷을
// 확인한 다음, 그 구간만 더 큰 값으로 다시 돌려 보강할 것 — 전 구간을 무작정
// 키우는 것보다 효율적이다. 이어하기가 되므로 값을 키워 다시 돌려도 이미 끝난
// 사람은 건너뛰고 늘어난 만큼만 새로 수집한다.
//
// 배경: "하위~중위권은 승률 40~48%로도 랭크가 오르고, 상위권(81~100%)은 55%+
// 필요하다"는 감각을 정확한 구간·수치로 확인하고 싶다는 요청(2026-08-07).
// docs/rank-point-attempt.md(반다이남코 랭크 포인트 자체를 복원하려다 실패)와는
// 다른 문제를 푼다 — 숨겨진 점수 공식을 복원하지 않고, wavu가 경기마다 그대로
// 주는 myRank(단, 0~37)가 실제로 오르내렸는지만 **직접 관측**한다.
//
// ── 3단계 ──────────────────────────────────────────────────────────────
// 1) 정찰(로컬, 순식간) — admin export(관리자 페이지에서 내려받은 조회 기록)로
//    레이팅 구간별 표본이 이미 몇 명 있는지 본다.
// 2) 보강(wavu 피드, 순차) — admin export는 "이 사이트를 검색한 사람"이라
//    편향이 있다(player-index.ts 머리말 참조). 비어 있거나 부족한 구간만
//    wavu 실시간 피드(scripts/build-rating-baseline.ts와 같은 방식)로 채운다.
// 3) 수집+분석(wavu, 순차, 이어하기) — 최종 후보자의 전체 경기 이력을 한 명씩
//    받아(wavu 예의 — 한 번에 하나씩), 캐릭터별로 나눠(**단은 캐릭터마다 따로
//    관리된다** — rank-point-attempt.md 경고) 슬라이딩 윈도우로 "이 구간
//    승률"과 "단이 올랐는가"를 기록한다.
//
// 이어하기: 처리한 사람은 즉시 JSONL에 한 줄씩 append. 다시 실행하면 이미 끝난
// id는 건너뛴다(collect-quip-coverage.ts와 같은 패턴).

import * as fs from 'fs';
import * as path from 'path';
import { fetchReplays, normalizePolarisId } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import type { MatchRecord } from '../lib/tekken/models';

const BAND_WIDTH = 250;
// 구간당 목표 표본(전체 이력 수집 대상) 인원 — 두 번째 인자로 덮어쓸 수 있다.
const argTarget = Number(process.argv[3]);
const TARGET_PER_BAND = Number.isFinite(argTarget) && argTarget > 0 ? argTarget : 40;
const WINDOW_SIZE = 30; // 슬라이딩 윈도우 크기(경기 수)
const WAVU_GAP_MS = 1200; // wavu 예의 — build-player-index.ts 와 동일
const FEED_STEP_SEC = 7000; // 피드 창 간격 — build-rating-baseline.ts 와 동일
const FEED_API = 'https://wank.wavu.wiki/api/replays';
const MAX_FEED_WINDOWS = 40; // 피드 보강이 끝없이 돌지 않게 하는 안전판

const OUT_DIR = path.join(__dirname, 'out');
const PROGRESS_PATH = path.join(OUT_DIR, 'rank-threshold-progress.jsonl');
const REPORT_PREFIX = path.join(OUT_DIR, 'rank-threshold-report');

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

/* ═══════════════ 1단계 — admin export 정찰 ═══════════════ */

interface AdminPlayer {
  id: string;
  rating?: number;
}

function loadAdminExport(p: string): AdminPlayer[] {
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as { players: AdminPlayer[] };
  return raw.players.filter((p) => typeof p.rating === 'number' && p.rating! > 0);
}

/* ═══════════════ 2단계 — 후보 목록(정찰 + 피드 보강) ═══════════════ */

type Source = 'lookup' | 'feed';
interface Candidate {
  id: string;
  source: Source;
}

interface FeedReplay {
  battle_at: number;
  p1_polaris_id: string | null;
  p1_rank: number | null;
  p1_rating_before: number | null;
  p1_rating_change: number | null;
  p2_polaris_id: string | null;
  p2_rank: number | null;
  p2_rating_before: number | null;
  p2_rating_change: number | null;
}

/** admin export로 먼저 채우고, 구간별로 TARGET_PER_BAND 에 못 미치면 wavu 피드로 보강한다. */
async function buildCandidates(adminPath: string): Promise<Map<number, Candidate[]>> {
  // admin export 전체 커버리지(정찰용 — 화면에만 쓴다, 후보 목록에는 그대로 안 넣는다).
  const coverage = new Map<number, string[]>();
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

  // 실제 수집 대상은 구간당 TARGET_PER_BAND 로 캡을 건다 — 안 그러면 이미 충분한
  // 구간(예: 1500~1749 에 624명)까지 전부 수집 대상이 돼서 총 소요 시간이
  // 목표(구간당 최대 TARGET_PER_BAND)를 크게 넘어선다. id 정렬 후 앞에서부터
  // 뽑아 결정적으로 고른다(재현 가능하게).
  const byBand = new Map<number, Candidate[]>();
  const seenIds = new Set<string>();
  for (const [band, ids] of coverage) {
    const picked = [...ids].sort().slice(0, TARGET_PER_BAND);
    byBand.set(band, picked.map((id) => ({ id, source: 'lookup' as const })));
    for (const id of picked) seenIds.add(id);
  }

  const short = () =>
    [...byBand.entries()].filter(([, list]) => list.length < TARGET_PER_BAND);

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
        const id = normalizePolarisId(
          (side === 1 ? r.p1_polaris_id : r.p2_polaris_id) ?? '',
        );
        const rb = side === 1 ? r.p1_rating_before : r.p2_rating_before;
        const rc = side === 1 ? r.p1_rating_change : r.p2_rating_change;
        if (!id || seenIds.has(id) || rb == null || rb <= 0) continue;
        const band = bandOf(rb + (rc ?? 0));
        const list = byBand.get(band) ?? byBand.set(band, []).get(band)!;
        if (list.length >= TARGET_PER_BAND) continue; // 이 구간은 이미 충분
        seenIds.add(id);
        list.push({ id, source: 'feed' });
      }
    }

    const oldest = Math.min(...rows.map((r) => r.battle_at));
    before = oldest - FEED_STEP_SEC;
    console.log(
      `  피드 창 ${w + 1}/${MAX_FEED_WINDOWS}: +${rows.length}경기 · 부족 구간 ${short().length}개 남음`,
    );
    await sleep(WAVU_GAP_MS);
  }

  console.log('\n── 최종 후보 구간별 인원 ──');
  for (const [band, list] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
    const feedN = list.filter((c) => c.source === 'feed').length;
    console.log(`  ${band}~${band + BAND_WIDTH - 1}: ${list.length}명 (feed ${feedN} / lookup ${list.length - feedN})`);
  }

  return byBand;
}

/* ═══════════════ 3단계 — 이력 수집 + 슬라이딩 윈도우 분석 ═══════════════ */

interface WindowRow {
  kind: 'window';
  playerId: string;
  source: Source;
  char: string;
  band: number; // 윈도우 시작 시점 레이팅이 속한 구간
  winRate: number; // 0~1
  rankStart: number;
  rankEnd: number;
  rankDelta: number;
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
type ProgressRow = WindowRow | DoneRow | SkipRow;

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

/** 한 캐릭터의 경기를 시간순으로 슬라이딩 윈도우(WINDOW_SIZE)로 잘라 승률·단 변화를 뽑는다. */
function analyzeChar(records: MatchRecord[]): Omit<WindowRow, 'kind' | 'playerId' | 'source'>[] {
  const sorted = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const out: Omit<WindowRow, 'kind' | 'playerId' | 'source'>[] = [];
  for (let i = 0; i + WINDOW_SIZE <= sorted.length; i += WINDOW_SIZE) {
    const win = sorted.slice(i, i + WINDOW_SIZE);
    const wins = win.filter((r) => r.result === 'W').length;
    out.push({
      char: win[0].myChar,
      band: bandOf(win[0].myRating),
      winRate: Math.round((wins / WINDOW_SIZE) * 1000) / 1000,
      rankStart: win[0].myRank,
      rankEnd: win[win.length - 1].myRank,
      rankDelta: win[win.length - 1].myRank - win[0].myRank,
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
    `\n── 3단계: 경기 이력 수집 ── 전체 ${all.length}명 · 기존 완료 ${doneIds.size}명 · 이번 실행 대상 ${remaining.length}명`,
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
        if (charRecords.length < WINDOW_SIZE) continue;
        for (const w of analyzeChar(charRecords)) {
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

/* ═══════════════ 4단계 — 집계 리포트 ═══════════════ */

function report() {
  const rows = loadProgress().filter((r): r is WindowRow => r.kind === 'window');
  const byBand = new Map<number, WindowRow[]>();
  for (const r of rows) (byBand.get(r.band) ?? byBand.set(r.band, []).get(r.band)!).push(r);

  // 승률을 10%p 단위로 나눠, 구간별·승률 구간별 평균 단 변화를 본다.
  // 회귀·곡선적합을 쓰지 않는다 — docs/rank-point-attempt.md가 "자기검증"으로
  // 신뢰를 잃은 전례가 있어, 관측치를 그대로 세는 쪽이 더 정직하다.
  const winRateBucket = (wr: number) => Math.min(90, Math.floor(wr * 10) * 10);

  const summary: Record<string, Record<string, { n: number; avgDelta: number }>> = {};
  for (const [band, list] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
    const key = `${band}~${band + BAND_WIDTH - 1}`;
    summary[key] = {};
    const byWr = new Map<number, WindowRow[]>();
    for (const r of list) (byWr.get(winRateBucket(r.winRate)) ?? byWr.set(winRateBucket(r.winRate), []).get(winRateBucket(r.winRate))!).push(r);
    for (const [wr, wl] of [...byWr.entries()].sort((a, b) => a[0] - b[0])) {
      const avgDelta = wl.reduce((s, r) => s + r.rankDelta, 0) / wl.length;
      summary[key][`${wr}~${wr + 9}%`] = { n: wl.length, avgDelta: Math.round(avgDelta * 100) / 100 };
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = `${REPORT_PREFIX}-${stamp}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ windowSize: WINDOW_SIZE, bandWidth: BAND_WIDTH, summary }, null, 2), 'utf-8');

  console.log('\n══════════════ 구간대별 승률 → 평균 단 변화 (윈도우 30판 기준) ══════════════');
  for (const [band, wrTable] of Object.entries(summary)) {
    console.log(`\n레이팅 ${band}:`);
    for (const [wr, v] of Object.entries(wrTable)) {
      console.log(`  승률 ${wr.padEnd(8)} n=${String(v.n).padEnd(4)} 평균 단 변화 ${v.avgDelta >= 0 ? '+' : ''}${v.avgDelta}`);
    }
  }
  console.log(`\n결과 파일: ${outPath}`);
}

/* ═══════════════ 진입점 ═══════════════ */

async function main() {
  const adminPath = process.argv[2];
  if (!adminPath || !fs.existsSync(adminPath)) {
    console.error('사용법: npx tsx scripts/build-rank-threshold-data.ts <admin export json 경로>');
    process.exit(1);
  }
  const byBand = await buildCandidates(adminPath);
  await collectAndAnalyze(byBand);
  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
