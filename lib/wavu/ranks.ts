// rank(단) 숫자 → 이름.
//
// **stages.ts 와 같은 사정이다.** wavu 는 JSON 에도 HTML 에도 단 이름을 안 쓴다.
// 그래서 지금까지 표와 그래프가 `27 → 28` 처럼 숫자만 보여줬다. 2026-08-05 에
// 확보·검증했다.
//
// 이름은 **영어명만** 쓴다. 아래 출처가 전부 영어이고, 한글명은 검증된 출처를
// 못 찾았다. 지어내면 stages.ts 가 피하려던 그 상황이 된다.
//
// ── 목록이 닫혀 있다는 근거 ──────────────────────────────────────────
// 0~37 이 전부다(38단). tlounge 가 게임 배지를 번호별 파일로 올려두는데,
//   /ranks/37.webp → HTTP 200
//   /ranks/38.webp → HTTP 404
// 실측 데이터와도 맞는다: 전역 피드 6,311경기(단 12,622개)에서 0~36 이 나오고
// 37 만 안 나온다. 37 은 ∞(최상위)라 안 나오는 게 정상이다.
//
// ── 근거의 급이 다르다 (아래 표의 주석) ──────────────────────────────
//   map  ewgf 백엔드 tekken_enums.json 의 dan_names 에 숫자→이름이 그대로 있다.
//        다만 이 파일은 0~29 까지뿐이라 30 이상을 못 덮는다(마지막 갱신 2025-11).
//   img  tlounge 의 /ranks/<번호>.webp 배지 이미지를 직접 열어 읽었다.
//        30~37 은 이 방법으로만 확인했다.
//
// 두 출처가 겹치는 구간에서 어긋나지 않는지 먼저 봤다 — 28 이 양쪽 모두
// 'Tekken God Supreme' 이다. 그러니 tlounge 의 파일 번호는 wavu 의 rank 값과
// 같은 체계다. 이게 확인되기 전에는 30~37 을 붙일 수 없었다.
//
// 교차 확인: 시즌2 에서 '신의 파괴자' 9단계가 추가됐고 오브 7개를 모으면 최상위에
// 간다는 서술과, base(29) + I~VII(30~36) + ∞(37) = 9 가 정확히 맞는다.

/** 번호가 곧 인덱스다. 빈 자리가 없으므로 배열로 둔다. */
export const RANK_NAMES: readonly string[] = [
  'Beginner', //             0   map
  '1st Dan', //              1   map
  '2nd Dan', //              2   map
  'Fighter', //              3   map
  'Strategist', //           4   map
  'Combatant', //            5   map
  'Brawler', //              6   map
  'Ranger', //               7   map
  'Cavalry', //              8   map
  'Warrior', //              9   map
  'Assailant', //           10   map
  'Dominator', //           11   map
  'Vanquisher', //          12   map
  'Destroyer', //           13   map
  'Eliminator', //          14   map
  'Garyu', //               15   map
  'Shinryu', //             16   map
  'Tenryu', //              17   map
  'Mighty Ruler', //        18   map
  'Flame Ruler', //         19   map
  'Battle Ruler', //        20   map
  'Fujin', //               21   map
  'Raijin', //              22   map
  'Kishin', //              23   map
  'Bushin', //              24   map
  'Tekken King', //         25   map
  'Tekken Emperor', //      26   map
  'Tekken God', //          27   map
  'Tekken God Supreme', //  28   map + img (두 출처가 일치하는 지점)
  'God of Destruction', //  29   map + img
  'God of Destruction I', //    30   img
  'God of Destruction II', //   31   img
  'God of Destruction III', //  32   img
  'God of Destruction IV', //   33   img
  'God of Destruction V', //    34   img
  'God of Destruction VI', //   35   img
  'God of Destruction VII', //  36   img
  'God of Destruction ∞', //    37   img — 배지에 무한대 기호가 그려져 있다
];

/**
 * 숫자 → 이름. 모르는 번호는 **숫자를 문자열로** 돌려준다.
 *
 * null 이나 '?' 로 지우지 않는 이유: 새 단이 추가되면(시즌4) 여기가 먼저 낡는데,
 * 그때 화면에서 정보가 사라지는 것보다 `38` 이라고 나오는 편이 낫다.
 * 지금까지의 동작이 그것이기도 하다.
 */
export function rankName(rank: number | null | undefined): string {
  if (rank == null) return '';
  return RANK_NAMES[rank] ?? String(rank);
}

/**
 * 이름 → 숫자. rankName 의 역함수다.
 *
 * 승단 그래프가 이걸 쓴다 — 표는 이름을 싣고, 그래프는 세로축을 그려야 해서
 * 숫자가 필요하다. 표에 숫자 열을 따로 더하지 않으려고 되돌리는 쪽을 택했다.
 * 이름이 전부 서로 달라서 되돌릴 수 있다.
 */
const INDEX_BY_NAME = new Map(RANK_NAMES.map((n, i) => [n, i]));

export function rankIndex(name: string): number | null {
  const i = INDEX_BY_NAME.get(name);
  if (i != null) return i;
  // rankName 이 이름을 모를 때 숫자를 그대로 냈으므로, 그 경우를 되돌린다.
  const n = Number(name);
  return Number.isInteger(n) ? n : null;
}
