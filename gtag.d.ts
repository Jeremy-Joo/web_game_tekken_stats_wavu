// gtag 전역 선언.
//
// app/layout.tsx 의 인라인 스크립트가 `function gtag(){...}` 를 전역에 만든다.
// 타입은 거기서 오지 않으므로 여기서 알려준다.
//
// 옵셔널(`?`)인 이유: GA_ID 환경변수가 없으면 layout 이 스크립트 자체를 넣지 않는다.
// 로컬 개발과 저장소를 복제한 경우가 그렇다 — 호출부는 반드시 `gtag?.(...)` 로 쓴다.

export {};

declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'js' | 'set',
      target: string,
      params?: Record<string, unknown>,
    ) => void;
  }
}
