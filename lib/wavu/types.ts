// wank.wavu.wiki 가 돌려주는 replay 원본 스키마.
//
//   GET https://wank.wavu.wiki/player/<POLARIS_ID>/replays
//   Accept: application/json
//
// 실측(2026-07-31): 한 번의 요청으로 해당 플레이어의 **전체 이력**이 온다.
// 페이지네이션 없음 — 7,808건(2024-03-28~) 이 489KB(gzip)로 왔다.
// 필드는 스네이크케이스이고 캐릭터/단은 숫자 ID 다.

/** wavu replay 한 건. p1/p2 중 어느 쪽이 '나'인지는 polaris_id 로 판별한다. */
export interface Replay {
  battle_at: number; // epoch seconds (UTC)
  battle_id: string; // 중복 제거 키
  battle_type: number; // 실측상 2(랭크전)만 존재
  game_version: number; // 1xxxx=S1, 2xxxx=S2, 3xxxx=S3
  stage_id: number | null;
  winner: number; // 1 = p1 승, 2 = p2 승

  p1_name: string | null;
  p1_polaris_id: string | null;
  p1_chara_id: number | null;
  p1_power: number | null; // 테켄 파워
  p1_rank: number | null; // 단(숫자). 사이트가 이름을 노출하지 않아 숫자 그대로 쓴다.
  p1_rating_before: number | null; // glicko2 레이팅(경기 전)
  p1_rating_change: number | null; // 이 경기로 인한 변동
  p1_rounds: number | null;
  p1_user_id: number | null;

  p2_name: string | null;
  p2_polaris_id: string | null;
  p2_chara_id: number | null;
  p2_power: number | null;
  p2_rank: number | null;
  p2_rating_before: number | null;
  p2_rating_change: number | null;
  p2_rounds: number | null;
  p2_user_id: number | null;
}
