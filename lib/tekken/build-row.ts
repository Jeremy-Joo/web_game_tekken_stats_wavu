// player-index 행 하나를 경기 목록에서 계산한다.
//
// scripts/build-player-index.ts(wavu 실시간 수집)와
// scripts/import-population-cache.ts(로컬에 이미 있는 원본 캐시 일괄 반영)가
// 이 함수를 공유한다 — 수집 경로가 둘이어도 "경기 목록 → 행" 규칙은 하나여야
// 두 경로의 결과가 어긋나지 않는다. build-player-index.ts 는 스크립트라 맨
// 아래서 main() 을 바로 실행하므로, import 만 해도 부수효과가 도는 걸 피하려고
// 순수 함수만 이 파일로 뺐다.

import { sessionAdvice, DROP_PP } from './advice';
import type { MatchRecord } from './models';
import type { PlayerIndexRow } from './player-index';

/** 이 판수 미만이면 인덱스에 안 담는다 — 표본이 너무 얇다. */
export const MIN_GAMES = 500;
/** 캐릭터별 승률을 인덱스에 담으려면 그 캐릭터로 최소 이만큼은 쳤어야 한다 — 그 아래는 승률이 노이즈다. */
export const MIN_CHAR_GAMES = 20;

const nowS = () => Math.floor(Date.now() / 1000);

export function buildRow(
  id: string,
  name: string,
  records: MatchRecord[],
  source: PlayerIndexRow['source'],
  lookups: number,
): PlayerIndexRow {
  const ord = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime());
  const last = ord[ord.length - 1];

  const wins = ord.filter((r) => r.result === 'W').length;
  const recent = ord.slice(-200);
  const recentW = recent.filter((r) => r.result === 'W').length;

  // 캐릭터별로 묶는다 — mainChar/mainCharGames 는 여기서 같이 뽑고,
  // 승률 검색(similarity.ts)이 쓸 chars 도 이 한 번의 순회로 만든다.
  const byChar = new Map<string, MatchRecord[]>();
  for (const r of ord) {
    const list = byChar.get(r.myChar) ?? [];
    list.push(r);
    byChar.set(r.myChar, list);
  }
  let mainChar = '';
  let mainCharGames = 0;
  for (const [c, list] of byChar) if (list.length > mainCharGames) ((mainChar = c), (mainCharGames = list.length));

  const chars: PlayerIndexRow['chars'] = {};
  for (const [c, list] of byChar) {
    if (list.length < MIN_CHAR_GAMES) continue; // 그 아래는 승률이 노이즈다
    const w = list.filter((r) => r.result === 'W').length;
    const recentList = list.slice(-100);
    const recentWchar = recentList.filter((r) => r.result === 'W').length;
    chars[c] = {
      games: list.length,
      wrOverall: Math.round((w * 1000) / list.length) / 10,
      wrRecent: Math.round((recentWchar * 1000) / recentList.length) / 10,
    };
  }

  let peak = 0;
  for (const r of ord) if (r.myRating > peak) peak = r.myRating;

  // 장기전 패턴은 캐릭터로 안 자른다 — 세션은 캐릭터를 넘나드는 시간 구조라
  // 자르면 왜곡된다(player-index.ts 머리말 참조). 계정 전체(ord) 기준이다.
  const adv = sessionAdvice(ord);

  // '상승' — advice.ts 의 하락 탐지(stopAfter/dropPp)를 그대로 대칭 이동한 것이다.
  // advice.ts 는 이 계산을 안 한다(그 파일은 '중단 권장'만 판단하면 된다) — 여기서만
  // 쓰는 값이라 여기서 계산한다. advice.ts 의 DROP_PP 를 그대로 재사용해 두 기준이
  // 어긋나지 않게 한다.
  let riseAfter: number | null = null;
  let risePp: number | null = null;
  if (adv) {
    for (const b of adv.bands.filter((x) => x.enough)) {
      if (b.winRate > adv.baselineWinRate + DROP_PP) {
        riseAfter = b.from - 1;
        risePp = Math.round((b.winRate - adv.baselineWinRate) * 10) / 10;
        break;
      }
    }
  }

  return {
    id,
    name,
    source,
    fetchedAt: nowS(),
    games: ord.length,
    // dt 는 KST 벽시계를 UTC 필드에 담은 Date — epoch 로 되돌릴 때 9시간을 빼야
    // 실제 UTC 시각이 된다 (models.ts 시각 규약).
    lastPlayed: Math.floor(last.dt.getTime() / 1000) - 9 * 3600,
    lastVersion: last.gameVersion,
    wrOverall: Math.round((wins * 1000) / ord.length) / 10,
    wrRecent200: Math.round((recentW * 1000) / recent.length) / 10,
    rating: last.myRating,
    peakRating: peak,
    mainChar,
    mainCharGames,
    chars,
    stopAfter: adv?.stopAfter ?? null,
    dropPp: adv?.dropPp ?? null,
    riseAfter,
    risePp,
    adviceReliable: adv?.reliable ?? false,
    lookups,
  };
}
