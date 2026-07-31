import type { Replay } from './types';
import { charName } from './chars';
import { kstFromEpoch, seasonOf, type MatchRecord } from '../tekken/models';

export interface NormalizeStats {
  total: number; // 원본 replay 수
  kept: number; // 정상 변환 수
  dropped: number; // 필수 필드 결손으로 제외 (조용한 누락 방지용으로 UI에 노출)
  dupes: number; // battle_id 중복 제거 수
}

export interface NormalizeResult {
  records: MatchRecord[];
  myName: string;
  stats: NormalizeStats;
}

/**
 * wavu Replay[] → '나' 관점 MatchRecord[].
 *
 * - p1/p2 어느 쪽이 '나'인지는 polaris_id 로 판별한다.
 * - `winner` 필드로 승패를 정한다. wavu 는 무승부를 저장하지 않는 것으로 보이나
 *   (전 필드 라운드가 정수), 만약 rounds 가 같아도 winner 를 신뢰한다.
 * - myRating 은 경기 **후** 값(before + change). 사이트 표시(경기 전 값 + 변동)와
 *   대조해 before/change 의미를 실측으로 확인했다.
 * - 정렬은 시간 오름차순으로 맞춰서 반환한다(이후 집계가 순서에 의존).
 */
export function normalizeReplays(
  replays: Replay[],
  polarisId: string,
): NormalizeResult {
  const records: MatchRecord[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let dupes = 0;

  // 최신 이름 추적: battle_at 이 가장 큰 경기의 내 이름
  let myName = '';
  let nameAt = -1;

  for (const b of replays) {
    const meP1 = b.p1_polaris_id === polarisId;
    const meP2 = b.p2_polaris_id === polarisId;
    if (!meP1 && !meP2) {
      dropped++;
      continue;
    }
    if (b.battle_id && seen.has(b.battle_id)) {
      dupes++;
      continue;
    }
    if (b.battle_id) seen.add(b.battle_id);

    const me = meP1 ? ('p1' as const) : ('p2' as const);
    const op = meP1 ? ('p2' as const) : ('p1' as const);

    const myRounds = b[`${me}_rounds`];
    const oppRounds = b[`${op}_rounds`];
    if (
      b.battle_at == null ||
      myRounds == null ||
      oppRounds == null ||
      b.winner == null
    ) {
      dropped++;
      continue;
    }

    const iWon = (b.winner === 1) === meP1;

    const myBefore = b[`${me}_rating_before`] ?? 0;
    const myChange = b[`${me}_rating_change`] ?? 0;
    const opBefore = b[`${op}_rating_before`] ?? 0;
    const opChange = b[`${op}_rating_change`] ?? 0;

    if (b.battle_at >= nameAt) {
      nameAt = b.battle_at;
      myName = b[`${me}_name`] ?? myName;
    }

    records.push({
      dt: kstFromEpoch(b.battle_at),
      battleId: b.battle_id ?? `${b.battle_at}:${b[`${op}_polaris_id`] ?? ''}`,

      player: b[`${me}_name`] ?? '',
      myPolaris: polarisId,
      myChar: charName(b[`${me}_chara_id`]),
      myRating: myBefore + myChange,
      myDelta: myChange,
      myPower: b[`${me}_power`] ?? 0,
      myRank: b[`${me}_rank`] ?? 0,

      score: `${myRounds}-${oppRounds}`,
      myRounds,
      oppRounds,
      result: iWon ? 'W' : 'L',

      oppName: b[`${op}_name`] ?? '',
      oppPolaris: b[`${op}_polaris_id`] ?? '',
      oppChar: charName(b[`${op}_chara_id`]),
      oppRating: opBefore + opChange,
      oppDelta: opChange,
      oppPower: b[`${op}_power`] ?? 0,
      oppRank: b[`${op}_rank`] ?? 0,

      season: seasonOf(b.game_version ?? 0),
      gameVersion: b.game_version ?? 0,
      stageId: b.stage_id,
    });
  }

  records.sort((a, b) => a.dt.getTime() - b.dt.getTime());

  return {
    records,
    myName,
    stats: {
      total: replays.length,
      kept: records.length,
      dropped,
      dupes,
    },
  };
}

/** 기간 필터 (KST 날짜 문자열 'yyyy-MM-dd', 양끝 포함). */
export function filterByDate(
  records: MatchRecord[],
  start?: string,
  end?: string,
): MatchRecord[] {
  if (!start && !end) return records;
  return records.filter((r) => {
    const d = r.dt.toISOString().slice(0, 10); // dt 는 KST 벽시계를 UTC 에 담음
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}
