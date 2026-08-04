// 승패 바코드 — 최근 경기를 시간 순서의 띠로.
//
// 승률 숫자는 연승·연패의 '리듬'을 뭉갠다. 55% 가 꾸준한 55% 인지, 10연승 뒤
// 8연패인지는 숫자로는 같다. 무드 멘트가 그 리듬을 말로 하니, 바로 아래에
// 근거를 그림으로 둔다.
//
// 서버가 문자열 하나로 내려준다 — 'W'/'L' 에 세션 경계 '|' 를 끼운 꼴.
//   "WWL|WLLLW|WW..."  (왼쪽이 과거, 오른쪽이 최근)
// 클라이언트가 경기 목록을 다시 뒤지게 하지 않는다. 120판이면 121바이트라
// 응답 크기 걱정도 없다.

import type { MatchRecord } from './models';
import { SESSION_GAP_MINUTES } from './aggregations';

/** 띠에 넣는 최대 경기 수. 240 으로 해봤더니 칸이 실오라기가 돼서 절반으로 줄였다. */
export const BARCODE_GAMES = 120;

/**
 * 최근 N 판을 'W'/'L' 문자열로. 세션이 바뀌는 지점(2시간 이상 공백)에 '|'.
 *
 * 경계 판정은 흐름 탭의 세션 정의(SESSION_GAP_MINUTES)와 같은 상수를 쓴다 —
 * 여기서 다른 값을 쓰면 "세션 1~5번째" 표와 띠의 묶음이 어긋난다.
 */
export function buildBarcodeSeq(records: MatchRecord[], n = BARCODE_GAMES): string {
  const ordered = [...records].sort((a, b) => a.dt.getTime() - b.dt.getTime()).slice(-n);
  let out = '';
  for (let i = 0; i < ordered.length; i++) {
    if (
      i > 0 &&
      ordered[i].dt.getTime() - ordered[i - 1].dt.getTime() > SESSION_GAP_MINUTES * 60_000
    )
      out += '|';
    out += ordered[i].result === 'W' ? 'W' : 'L';
  }
  return out;
}
