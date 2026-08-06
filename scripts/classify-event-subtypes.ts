// collect-quip-coverage.ts 의 'event' 분류를 milestone/peakFresh/comeback/winStreak/
// todaySameChar 다섯 갈래로 더 쪼갠다. 네트워크 없이, 이미 수집된 quip-progress-ko.jsonl
// 을 그대로 재사용한다 (2026-08-06, 사용자 요청 — event 34.6% 가 뭘로 구성됐는지).
//
// 방식: fact-jokes.ts 소스에서 각 함수의 ko 배열 리터럴을 텍스트로 뽑아 정규식 카탈로그를
// 만들고(extractKoTemplates 와 같은 기법), 실제 결과 텍스트를 그 카탈로그에 매칭한다.

import * as fs from 'fs';
import * as path from 'path';

const PROGRESS_PATH = path.join(__dirname, 'out/quip-progress-ko.jsonl');
const JOKES_SRC = fs.readFileSync(path.join(__dirname, '../app/fact-jokes.ts'), 'utf-8');

const EVENT_FUNCS = ['milestone', 'peakFresh', 'rankChange', 'comeback', 'winStreak', 'todaySameChar', 'clock'] as const;
type EventFunc = (typeof EVENT_FUNCS)[number];

/** 함수 본문에서 ko: [...] 블록의 백틱 리터럴을 전부 뽑는다. */
function extractFuncKoTemplates(fnName: string): string[] {
  const fnStart = JOKES_SRC.indexOf(`function ${fnName}(`);
  if (fnStart === -1) return [];
  // 다음 'function ' 선언 전까지를 이 함수 본문으로 본다 (파일이 함수 단위로 쭉 나열되는 구조).
  const nextFn = JOKES_SRC.indexOf('\nfunction ', fnStart + 1);
  const body = JOKES_SRC.slice(fnStart, nextFn === -1 ? JOKES_SRC.length : nextFn);

  const templates: string[] = [];
  // ko: [ ... ] 블록(들)을 찾는다 — clock 처럼 여러 개의 Pool 리터럴(if 분기마다)이 있을 수 있다.
  const koBlockRe = /ko:\s*\[([\s\S]*?)\],\s*\n\s*en:/g;
  let block: RegExpExecArray | null;
  while ((block = koBlockRe.exec(body))) {
    const re = /`([^`]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block[1]))) templates.push(m[1]);
  }
  return templates;
}

function templateToRegex(raw: string): RegExp {
  const pattern = raw
    .split(/\$\{[^}]*\}/g)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+?');
  return new RegExp(`^${pattern}$`);
}

const catalog: Record<EventFunc, RegExp[]> = {} as any;
for (const fn of EVENT_FUNCS) {
  catalog[fn] = extractFuncKoTemplates(fn).map(templateToRegex);
}

console.log('카탈로그 크기(고정+동적 템플릿 수):');
for (const fn of EVENT_FUNCS) console.log(`  ${fn.padEnd(16)} ${catalog[fn].length}개`);

// ── 실데이터 분류 ──────────────────────────────────────────────
const lines = fs.readFileSync(PROGRESS_PATH, 'utf-8').split('\n').filter((l) => l.trim());
const rows = lines.map((l) => JSON.parse(l));
const eventRows = rows.filter((r) => r.kind === 'result' && r.source === 'event');

console.log(`\n총 결과 ${rows.filter((r) => r.kind === 'result').length}개 중 event 분류 ${eventRows.length}개`);

const subCount: Record<string, number> = {};
const examples: Record<string, Map<string, number>> = {};
let unmatched = 0;
const unmatchedSamples: string[] = [];

for (const r of eventRows) {
  let matched: EventFunc | null = null;
  for (const fn of EVENT_FUNCS) {
    if (catalog[fn].some((re) => re.test(r.text))) {
      matched = fn;
      break;
    }
  }
  if (!matched) {
    unmatched++;
    if (unmatchedSamples.length < 10) unmatchedSamples.push(r.text);
    continue;
  }
  subCount[matched] = (subCount[matched] ?? 0) + 1;
  const m = (examples[matched] ??= new Map());
  m.set(r.text, (m.get(r.text) ?? 0) + 1);
}

console.log('\n══════════ event 세부 분류 ══════════');
const total = eventRows.length;
for (const fn of EVENT_FUNCS) {
  const c = subCount[fn] ?? 0;
  if (c === 0 && catalog[fn].length === 0) continue; // rankChange/clock 은 이제 event 가 아니므로 카탈로그가 있어도 0이 정상
  const pct = total ? Math.round((c / total) * 1000) / 10 : 0;
  console.log(`  ${fn.padEnd(16)} ${String(c).padStart(4)}개  (${pct}%)`);
  const top = [...(examples[fn]?.entries() ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [text, n] of top) console.log(`      x${n}  ${text}`);
}
if (unmatched > 0) {
  console.log(`\n  미분류(카탈로그와 매칭 안 됨): ${unmatched}개`);
  for (const s of unmatchedSamples) console.log(`      ?  ${s}`);
}
