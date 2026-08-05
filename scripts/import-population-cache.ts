// tekken8_Stats_WPF 의 인구 리포트 도구가 이미 모아 둔 원본 캐시를 player-index 에
// 반영한다. wavu 를 다시 때리지 않는다 — 그 도구가 D:\TekkenResult\User\.cache\*.json
// 에 저장해 둔 파일이 wavu 응답과 필드까지 똑같은 스키마다
// (WavuApi.cs Replay ↔ lib/wavu/types.ts Replay, 둘 다 wavu 원문 그대로 snake_case).
// 그래서 여기서는 fetch 없이 파일만 읽어 사이트와 같은 정규화(normalizeReplays)·
// 같은 행 계산(buildRow)을 그대로 태운다 — 결과가 wavu 를 직접 불러 만든 행과
// 동일해야 하기 때문이다.
//
//   npx tsx scripts/import-population-cache.ts [캐시폴더] [인구리포트.xlsx]
//
// 이미 인덱스에 있는 ID 는 건드리지 않는다(build-player-index.ts 의 collect() 와
// 같은 정책 — 재수집은 refresh/recompute 가 따로 할 일이다). xlsx 는 조회수(Views)
// 채우기용— 없어도 동작하고, 그때는 lookups=0 으로 들어간다.

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { normalizeReplays } from '../lib/wavu/normalize';
import type { Replay } from '../lib/wavu/types';
import { buildRow, MIN_GAMES } from '../lib/tekken/build-row';
import type { PlayerIndex } from '../lib/tekken/player-index';

const FILE = path.join(__dirname, '..', 'lib', 'tekken', 'player-index-data.json');
const DEFAULT_CACHE_DIR = 'D:\\TekkenResult\\User\\.cache';
const DEFAULT_XLSX = 'D:\\TekkenResult\\User\\인구리포트_2281명_2026_0805_172936.xlsx';

const nowS = () => Math.floor(Date.now() / 1000);

function load(): PlayerIndex {
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as PlayerIndex;
}
function save(ix: PlayerIndex) {
  ix.updatedAt = nowS();
  ix.rows.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(FILE, JSON.stringify(ix, null, 1), 'utf8');
}

/** players 시트의 opp_polaris(3열)·Views(4열) — PopulationReport.cs BuildPlayers 의 컬럼 순서. */
async function loadViews(xlsxPath: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!fs.existsSync(xlsxPath)) {
    console.log(`(views 없음 — ${xlsxPath} 파일이 없어 lookups=0 으로 채움)`);
    return out;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheet = wb.getWorksheet('players');
  if (!sheet) return out;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 헤더
    const id = String(row.getCell(3).value ?? '').trim();
    const views = Number(row.getCell(4).value ?? 0);
    if (id) out.set(id, views);
  });
  return out;
}

interface CacheEntry {
  PolarisId: string;
  FetchedAt: string;
  Replays: Replay[];
}

async function main() {
  const cacheDir = process.argv[2] || DEFAULT_CACHE_DIR;
  const xlsxPath = process.argv[3] || DEFAULT_XLSX;

  if (!fs.existsSync(cacheDir)) {
    console.error(`캐시 폴더가 없습니다: ${cacheDir}`);
    process.exit(1);
  }

  const views = await loadViews(xlsxPath);
  console.log(`views 매핑 ${views.size}명`);

  const ix = load();
  const have = new Set(ix.rows.map((r) => r.id));
  console.log(`기존 인덱스 ${ix.rows.length}행`);

  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
  console.log(`캐시 파일 ${files.length}개\n`);

  let added = 0;
  let skippedThin = 0;
  let alreadyHave = 0;
  let failed = 0;

  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    if (have.has(id)) {
      alreadyHave++;
      continue;
    }

    try {
      const raw = fs.readFileSync(path.join(cacheDir, f), 'utf8');
      const entry = JSON.parse(raw) as CacheEntry;
      if (!entry.Replays || entry.Replays.length === 0) {
        failed++;
        continue;
      }

      const { records, myName } = normalizeReplays(entry.Replays, entry.PolarisId || id);

      if (records.length < MIN_GAMES) {
        if (!ix.skipped[id] || ix.skipped[id].games < records.length) {
          ix.skipped[id] = { games: records.length, at: nowS() };
        }
        skippedThin++;
        continue;
      }

      const row = buildRow(id, myName || id, records, 'lookup', views.get(id) ?? 0);
      ix.rows.push(row);
      have.add(id);
      delete ix.skipped[id];
      added++;

      if (added % 100 === 0) {
        console.log(`  ${added}명 추가...`);
        save(ix); // 중간 저장 — 끊겨도 이어서
      }
    } catch (e) {
      console.log(`  실패 ${id}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  save(ix);
  console.log(
    `\n추가 ${added} / 이미있음 ${alreadyHave} / 500판 미달 ${skippedThin} / 실패 ${failed}`,
  );
  console.log(`인덱스 총 ${ix.rows.length}행`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
