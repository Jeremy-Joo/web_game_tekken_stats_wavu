// stage_id → 스테이지명.
//
// **오래 막아뒀던 매핑이다.** 예전에는 이름을 알 방법이 없어 스테이지별 승률 탭을
// 만들었다가 뺐다(`#500 70.14%` 로 읽을 수 없었다). 2026-08-04 에 확보·검증했다.
// 전말과 근거는 docs/population-features.md 5-B.
//
// ── 목록이 닫혀 있다는 근거 ──────────────────────────────────────────
// 이름을 붙이기 전에 "22종이 전부인가"부터 확인했다. 독립 표본 셋이 전부 같은 22종을 준다.
//   전역 피드 최근      17,801경기 → 22종
//   전역 피드 14창 확대  64,161경기 → 22종
//   개인 이력 6계정     92,909경기 → 22종
// 가장 드문 것이 1.05% 이므로 0.05%짜리가 있었다면 64,161경기에서 30번쯤 나왔어야 한다.
//
// ── 근거의 급이 다르다 (아래 표의 `src`) ─────────────────────────────
//   map    ewgf 백엔드 tekken_enums.json 에 숫자→이름이 그대로 있다. 그 16개 키가
//          우리가 날짜로 잰 출시 16종과 **정확히 같다**(차집합 양쪽 공집합).
//   patch  공식 패치 노트. 우리가 잰 최초 등장일·game_version 과 자릿수까지 맞는다.
//          10601=v1.06.01 · 10801=v1.08.01 · 11001=v1.10.01
//   dlc    Steam DLC 출시일과 최초 등장일이 1~2일 차로 붙는다.
//   ⚠      아래 '남은 불확실' 참조.
//
// ── 새 스테이지가 추가되면 ───────────────────────────────────────────
// `#<숫자>` 로 표에 그대로 드러난다(chars.ts 와 같은 방식). 조용히 'Unknown' 으로
// 뭉치지 않는다 — 그러면 추가를 눈치 못 챈 채 집계가 섞인다. 드러나면 한 줄 추가하면 된다.
//
// ── 남은 불확실 (넣기 전에 알고 있을 것) ─────────────────────────────
//   2200 Baobab Horizon — 내부명이 공개된 적이 없다. 출시일 일치 + 소거법이다.
//   200/201 라벨 — ewgf 맵은 `200=Urban Square` 인데 **뒤집혀 있다.** 접미사 없는
//     이름이 언제나 기본인데(Arena·Genmaji 두 쌍에서 확인) `st02_NeoCity` 의 이름이
//     'Urban Square (Evening)' 이다. 데이터마이닝 이름에 기댄 것이라 공식 출처는 없다.
//     **다만 아래 MERGE 가 이 문제를 실질적으로 없앤다** — 둘을 묶으면 라벨이 안 나온다.

/** 원본 id → 이름. 변형까지 그대로 둔다(집계에서 묶는 것은 STAGE_MERGE 가 한다). */
export const STAGE_NAMES: Record<number, string> = {
  100: 'Arena', //                        map
  101: 'Arena (Underground)', //           map
  200: 'Urban Square (Evening)', //        map(정정) ⚠
  201: 'Urban Square', //                  map(정정) ⚠
  300: 'Yakushima', //                     map
  400: 'Coliseum of Fate', //              map
  500: 'Rebel Hangar', //                  map
  600: 'Pac-Pixels', //                    dlc  2025-07-07
  700: 'Fallen Destiny', //                map
  900: 'Descent into Subconscious', //     map
  1000: 'Sanctum', //                      map
  1100: 'Into the Stratosphere', //        map
  1200: 'Ortiz Farm', //                   map
  1300: 'Celebration on the Seine', //     map
  1400: 'Secluded Training Ground', //     map
  1500: 'Elegant Palace', //               map
  1600: 'Midnight Siege', //               map
  1700: 'Seaside Resort', //               patch v1.06.01 (무료)
  1800: 'Genmaji Temple', //               patch v1.08.01 (유료)
  1801: 'Genmaji Temple (Daytime)', //     patch v1.08.01
  1900: 'Phoenix Gate', //                 patch v1.10.01 (유료)
  2200: 'Baobab Horizon', //               dlc  2025-12-01 ⚠
};

/**
 * 집계할 때 하나로 묶는 변형 → 대표 id.
 *
 * **왜 200/201·1800/1801 만 묶고 100/101 은 안 묶나** — 빈도가 답했다.
 * 무료 스테이지 한 칸이 5.62% 인데(5% 넘는 15종의 평균), 쌍의 합이 이렇게 갈린다.
 *
 *   100+101    11.23% → 2.00칸   **서로 다른 두 스테이지.** 각자 한 칸을 차지한다
 *   200+201     5.74% → 1.02칸   한 스테이지의 두 변형. 합쳐서 한 칸
 *   1800+1801   2.20% → 0.39칸   한 스테이지의 두 변형 (유료라 한 칸을 못 채운다)
 *
 * 즉 Arena 와 Arena (Underground) 는 스테이지 선택에서 각각 뽑히지만,
 * Urban Square 의 낮/저녁은 **한 스테이지 안에서 갈리는 것**이다.
 * 묶지 않으면 같은 스테이지가 표에 두 줄로 갈라져 승률이 반씩 나뉜다.
 */
export const STAGE_MERGE: Record<number, number> = {
  201: 200,
  1801: 1800,
};

/** 묶은 뒤의 대표 이름. 변형 표기를 떼고 스테이지 이름만 남긴다. */
const MERGED_NAMES: Record<number, string> = {
  200: 'Urban Square',
  1800: 'Genmaji Temple',
};

/** 집계 키 — 변형을 대표 id 로 접는다. */
export function stageKey(id: number | null | undefined): number | null {
  if (id == null) return null;
  return STAGE_MERGE[id] ?? id;
}

/**
 * 화면에 낼 이름. **모르는 id 는 `#<id>` 로 남긴다** (chars.ts 와 같은 이유).
 * `null` 은 `#?` — 원본에 stage_id 가 없는 경기다. 숨기지 않는다.
 */
export function stageName(id: number | null | undefined): string {
  if (id == null) return '#?';
  const k = stageKey(id)!;
  return MERGED_NAMES[k] ?? STAGE_NAMES[k] ?? `#${k}`;
}
