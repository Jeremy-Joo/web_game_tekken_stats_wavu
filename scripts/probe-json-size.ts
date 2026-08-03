// 'JSON 전체' 다운로드가 만드는 문자열 크기를 잰다.
// (npm run probe:json -- <식별코드> ...)
//
// 제보: 이 버튼을 누르면 브라우저가 죽는다. 원인 후보는 셋인데 전부 크기에서 온다 —
//   1) JSON.stringify(payload, null, 1) 로 **들여쓰기해서** 몇 배로 부풀린다
//   2) 그 큰 문자열을 만들고 Blob 으로 또 한 벌 복사한다 (메모리 2배)
//   3) 전부 메인 스레드 동기 작업이라 그동안 화면이 멈춘다
// 실제로 몇 MB 인지 재야 대책의 크기를 정할 수 있다.

import { fetchReplays } from '../lib/wavu/client';
import { normalizeReplays } from '../lib/wavu/normalize';
import { computeFromRecords } from '../lib/tekken/compute';

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('식별코드를 하나 이상 주세요.');
  process.exit(1);
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(2);

async function main() {
  for (const id of ids) {
    const replays = await fetchReplays(id);
    const { records, myName } = normalizeReplays(replays, id);
    // 화면이 받는 것과 같은 모양 (route.ts 의 matchesLimit: 1000)
    const result = computeFromRecords(records, id, myName, { matchesLimit: 1000 });

    const compact = JSON.stringify(result);
    const pretty = JSON.stringify(result, null, 1);
    const rows = result.tabs.reduce((n, t) => n + t.rows.length, 0);

    console.log(
      `${(myName || id).padEnd(16)} ${String(records.length).padStart(6)}판  ` +
        `탭 ${result.tabs.length}개 / 행 ${String(rows).padStart(6)}  ` +
        `compact ${mb(compact.length).padStart(6)}MB  ` +
        `pretty ${mb(pretty.length).padStart(6)}MB  ` +
        `(${(pretty.length / compact.length).toFixed(1)}배)`,
    );
    await new Promise((r) => setTimeout(r, 900));
  }
  console.log(
    '\n비교 모드는 이 payload 가 인원수만큼(2~4명) 한 객체에 들어간다 — 곱하기 2~4.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
