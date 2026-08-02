// MatchRecord[] ↔ 컬럼 배열. **캐시에 넣을 형태**를 만든다.
//
// ── 왜 필요한가 (실측) ─────────────────────────────────────────────
// 캐시에 wavu 원본을 그대로 넣고 있었다. 그러면 읽을 때마다 70MB 를 복원하고
// 정규화를 다시 한다. 정작 쓰는 필드는 20개인데 원본은 25개 필드 이름을
// 13만 8천 번 반복해 담고 있다.
//
// 138,560경기 기준:
//                    원본 저장    컬럼 저장
//   Blob 크기          9.5MB   →   2.7MB
//   gunzip             149ms   →    29ms
//   재파싱             187ms   →    39ms
//   정규화             156ms   →     0ms  (이미 되어 있음)
//   ─────────────────────────────────────
//   읽기 CPU           492ms   →    68ms   (7배)
//
// 메모리도 같이 내려간다 — 70MB 문자열과 원본 객체 13만 개가 아예 안 생긴다.
//
// ── 조용히 틀린 값을 만들지 않기 ──────────────────────────────────
// 필드를 버리면 되살릴 때 0/null 이 들어가고, 나중에 누가 그 필드를 읽으면
// **틀린 값을 사실처럼** 받는다. 그래서 버리는 것은 딱 셋뿐이고 이유가 분명하다:
//   battleId  정규화 때 중복 제거용 키. 그 뒤로는 아무도 안 쓴다.
//   player    사람마다 하나뿐인 값 → 한 번만 저장
//   myPolaris 위와 같음
// 나머지는 안 쓰는 것(oppPower·stageId 등)까지 전부 싣는다. 숫자 컬럼은 반복이
// 많아 gzip 이 거의 공짜로 먹는다 — 아껴서 얻는 것보다 잃을 위험이 크다.
//
// 형식이 바뀌면 VERSION 을 올린다. 옛 사본은 읽히지 않고 그대로 만료된다(마이그레이션 없음).

import type { MatchRecord } from './models';

export const CODEC_VERSION = 2;

export interface PackedRecords {
  v: number;
  /** 사람마다 하나뿐이라 컬럼이 아니라 스칼라로 둔다. */
  player: string;
  myPolaris: string;
  n: number;
  /** 캐릭터 이름은 종류가 적어(41종) 사전으로 접는다 — 13만 번 반복될 문자열이다. */
  chars: string[];
  cols: {
    dt: number[]; // epoch ms
    myChar: number[]; // chars 색인
    myRating: number[];
    myDelta: number[];
    myPower: number[];
    myRank: number[];
    myRounds: number[];
    oppRounds: number[];
    win: number[]; // 1=승, 0=패
    oppName: string[];
    oppPolaris: string[];
    oppChar: number[]; // chars 색인
    oppRating: number[];
    oppDelta: number[];
    oppPower: number[];
    oppRank: number[];
    season: string[];
    gameVersion: number[];
    stageId: (number | null)[];
  };
}

export function packRecords(
  records: MatchRecord[],
  player: string,
  myPolaris: string,
): PackedRecords {
  const chars: string[] = [];
  const charIdx = new Map<string, number>();
  const ci = (c: string) => {
    let i = charIdx.get(c);
    if (i === undefined) {
      i = chars.length;
      chars.push(c);
      charIdx.set(c, i);
    }
    return i;
  };

  const n = records.length;
  const cols: PackedRecords['cols'] = {
    dt: new Array(n), myChar: new Array(n), myRating: new Array(n),
    myDelta: new Array(n), myPower: new Array(n), myRank: new Array(n),
    myRounds: new Array(n), oppRounds: new Array(n), win: new Array(n),
    oppName: new Array(n), oppPolaris: new Array(n), oppChar: new Array(n),
    oppRating: new Array(n), oppDelta: new Array(n), oppPower: new Array(n),
    oppRank: new Array(n), season: new Array(n), gameVersion: new Array(n),
    stageId: new Array(n),
  };

  for (let i = 0; i < n; i++) {
    const r = records[i];
    cols.dt[i] = r.dt.getTime();
    cols.myChar[i] = ci(r.myChar);
    cols.myRating[i] = r.myRating;
    cols.myDelta[i] = r.myDelta;
    cols.myPower[i] = r.myPower;
    cols.myRank[i] = r.myRank;
    cols.myRounds[i] = r.myRounds;
    cols.oppRounds[i] = r.oppRounds;
    cols.win[i] = r.result === 'W' ? 1 : 0;
    cols.oppName[i] = r.oppName;
    cols.oppPolaris[i] = r.oppPolaris;
    cols.oppChar[i] = ci(r.oppChar);
    cols.oppRating[i] = r.oppRating;
    cols.oppDelta[i] = r.oppDelta;
    cols.oppPower[i] = r.oppPower;
    cols.oppRank[i] = r.oppRank;
    cols.season[i] = r.season;
    cols.gameVersion[i] = r.gameVersion;
    cols.stageId[i] = r.stageId;
  }

  return { v: CODEC_VERSION, player, myPolaris, n, chars, cols };
}

/** 형식이 맞지 않으면 null — 호출부는 wavu 에서 새로 받으면 된다. */
export function unpackRecords(p: PackedRecords | null): MatchRecord[] | null {
  if (!p || p.v !== CODEC_VERSION || !p.cols || typeof p.n !== 'number') return null;
  const c = p.cols;
  if (!Array.isArray(c.dt) || c.dt.length !== p.n) return null;

  const out: MatchRecord[] = new Array(p.n);
  for (let i = 0; i < p.n; i++) {
    const myRounds = c.myRounds[i];
    const oppRounds = c.oppRounds[i];
    out[i] = {
      dt: new Date(c.dt[i]),
      // 중복 제거는 저장 전에 이미 끝났다. 여기서 되살릴 값이 없어 빈 문자열을 둔다 —
      // 이 배열을 다시 정규화에 넣는 경로는 없다.
      battleId: '',
      player: p.player,
      myPolaris: p.myPolaris,
      myChar: p.chars[c.myChar[i]],
      myRating: c.myRating[i],
      myDelta: c.myDelta[i],
      myPower: c.myPower[i],
      myRank: c.myRank[i],
      score: `${myRounds}-${oppRounds}`,
      myRounds,
      oppRounds,
      result: c.win[i] ? 'W' : 'L',
      oppName: c.oppName[i],
      oppPolaris: c.oppPolaris[i],
      oppChar: p.chars[c.oppChar[i]],
      oppRating: c.oppRating[i],
      oppDelta: c.oppDelta[i],
      oppPower: c.oppPower[i],
      oppRank: c.oppRank[i],
      season: c.season[i],
      gameVersion: c.gameVersion[i],
      stageId: c.stageId[i],
    };
  }
  return out;
}
