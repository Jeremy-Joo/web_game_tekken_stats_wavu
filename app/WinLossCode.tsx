'use client';

// 승패 바코드 — 무드 멘트 바로 아래에 붙는 근거 그림.
//
// 멘트는 "지금 흐름이 어떻다"를 말로 하고, 이 띠는 같은 것을 그림으로 보여준다.
// 승률 숫자로는 안 보이는 것 — 꾸준한 55% 와 '10연승 뒤 8연패'의 차이 — 이
// 띠의 결로 드러난다.
//
// 읽는 법을 배우지 않아도 되게 세 가지를 겹쳤다:
//   위 칸 = 승, 아래 칸 = 패   (색만으로 가르지 않는다 — 색약이어도 위치로 읽힌다)
//   세로 틈 = 세션 경계        (연승이 하루였는지 며칠에 걸쳤는지)
//   왼쪽 = 과거, 오른쪽 = 최근

import type { Lang } from './i18n';

const TXT = {
  legend: {
    ko: (n: number, w: number, l: number) => `최근 ${n}판 ${w}승 ${l}패`,
    en: (n: number, w: number, l: number) => `Last ${n}: ${w}W ${l}L`,
    ja: (n: number, w: number, l: number) => `直近${n}戦 ${w}勝${l}敗`,
  },
  how: {
    ko: '위 칸 = 승 · 아래 칸 = 패 · 세로 틈 = 세션 경계 · 오른쪽이 최근',
    en: 'top = win · bottom = loss · gap = new session · newest on the right',
    ja: '上 = 勝ち · 下 = 負け · 隙間 = セッション境界 · 右が最近',
  },
  ago: {
    ko: (k: number, w: boolean) => `${k}판 전 · ${w ? '승' : '패'}`,
    en: (k: number, w: boolean) => `${k} games ago · ${w ? 'win' : 'loss'}`,
    ja: (k: number, w: boolean) => `${k}戦前 · ${w ? '勝ち' : '負け'}`,
  },
} as const;

/** 한 판의 가로 폭(뷰박스 단위). 세션 틈은 한 판 폭과 같게 — 눈에 걸리는 최소 크기다. */
const UNIT = 3;
const BAR_W = 2.3;
const H = 34;
const TOP = { y: 1, h: 14 };
const BOT = { y: 19, h: 14 };

export default function WinLossCode({ seq, lang }: { seq: string; lang: Lang }) {
  const games = seq.replace(/\|/g, '');
  // 열 판도 안 되면 결이 안 생긴다 — 안 그리는 편이 낫다.
  if (games.length < 10) return null;

  const wins = (games.match(/W/g) ?? []).length;
  const bars: string[] = [];
  let x = 0;
  let seen = 0;
  for (const ch of seq) {
    if (ch === '|') {
      x += UNIT;
      continue;
    }
    seen++;
    const win = ch === 'W';
    const box = win ? TOP : BOT;
    bars.push(
      `<rect x="${x.toFixed(1)}" y="${box.y}" width="${BAR_W}" height="${box.h}" rx="0.8" class="${
        win ? 'wlc-w' : 'wlc-l'
      }"><title>${TXT.ago[lang](games.length - seen + 1, win)}</title></rect>`,
    );
    x += UNIT;
  }

  return (
    <div className="wlc">
      <p className="wlc-head">
        <b>{TXT.legend[lang](games.length, wins, games.length - wins)}</b>
        <span>{TXT.how[lang]}</span>
      </p>
      <svg
        viewBox={`0 0 ${x.toFixed(1)} ${H}`}
        preserveAspectRatio="none"
        className="wlc-svg"
        role="img"
        aria-label={TXT.legend[lang](games.length, wins, games.length - wins)}
        // 문자열 조립이라 dangerouslySetInnerHTML 을 쓴다 — 내용은 서버가 만든
        // W/L/| 문자열에서만 나오므로 사용자 입력이 섞일 경로가 없다.
        dangerouslySetInnerHTML={{ __html: `<line x1="0" y1="17" x2="${x.toFixed(1)}" y2="17" class="wlc-mid"/>${bars.join('')}` }}
      />
    </div>
  );
}
