// 404 — 없는 주소로 왔을 때.
//
// 기본 404 를 그대로 두면 공유 링크가 깨졌을 때 그냥 이탈한다. 이 사이트에서
// 404 가 나는 거의 유일한 경우는 '식별코드가 잘못됐거나 그 사람 전적이 없을 때'라
// 그 상황을 짚어주고 검색으로 되돌려 보낸다.

import './globals.css';

export const metadata = {
  title: '찾을 수 없습니다 — 철권8 전적 통계',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p className="sub">
        주소가 잘못됐거나, 그 식별코드로 된 랭크전 기록이 없습니다.
      </p>

      <div className="panel">
        <p style={{ margin: '0 0 0.8rem', fontSize: '0.92rem', lineHeight: 1.7 }}>
          이런 경우일 수 있습니다:
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.9, fontSize: '0.9rem' }}>
          <li>식별코드를 잘못 입력했습니다 (12자리 영숫자입니다)</li>
          <li>랭크전 기록이 없는 계정입니다 — 이 사이트는 랭크전만 다룹니다</li>
          <li>공유받은 링크가 오래돼 주소 형식이 바뀌었습니다</li>
        </ul>
        <div className="row">
          <a className="btn-link" href="/">
            검색 화면으로
          </a>
        </div>
      </div>

      <footer>
        <span className="byline">
          식별코드를 모르면 검색 화면에서 닉네임으로 찾을 수 있습니다.
        </span>
      </footer>
    </main>
  );
}
