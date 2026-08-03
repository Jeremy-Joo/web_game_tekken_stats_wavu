# mood 기준선 — 통산 평균이 장기 사용자에게 고착되는 문제

`lib/tekken/advice.ts` 의 `mood`(농담 수위)가 **이력이 긴 사람에게 한 값으로 굳는다.**
원인과 해법, 그리고 같이 따라와야 하는 것들을 적어둔다.

상태: **미적용** (2026-08-03 분석)

---

## 1. 증상

- 꾸준히 성장한 사람 → 영구 `hot`. 오늘 연패 중이어도 "물이 올랐습니다"가 나온다.
- 전성기가 지난 사람 → 영구 `cold`. 오늘 5할을 쳐도 "게임을 끄는 것도 실력입니다"를 본다.

경기 수가 많을수록 심해진다. CLAUDE.md 가 "평균이 아니라 상단을 기준으로 설계할 것"이라고
경고한 바로 그 헤비 유저층(7,828 / 30,233경기)에서 어긋난다.

## 2. 원인 — 기준선 하나가 두 질문에 답하고 있다

`baselineWinRate` 는 **전체 이력 승률**이다 (`advice.ts:98`).
그런데 두 군데에서 서로 다른 의미로 쓰인다.

| 쓰이는 곳 | 묻는 것 | 통산 평균이 맞나 |
|---|---|---|
| 구간 분석 (`advice.ts:108`) | 세션 n번째 판이 **내 평소보다** 나쁜가 | **맞다** — 구간도 전체 이력에서 뽑으니 모집단이 같다 |
| mood (`advice.ts:118`) | 지금 **평소와 달라졌나** | **틀리다** — 5년 전 나와 비교하고 있다 |

```ts
const recent = ordered.slice(-RECENT_N);              // 20판
const recentWr = wr(...);
const recentDeltaPp = roundTo(recentWr - baselineWinRate, 1);   // ← 통산 평균과 비교
```

표본이 20 대 30,000 이라 최근 20판이 통산값을 흔들 수 없다.
그래서 편차의 부호가 한 방향으로 고정되고, mood 도 같이 고정된다.

### 랭크 매치메이킹이 문제를 한 겹 더 얹는다

랭크는 승률을 50%로 되돌리는 시스템이다. 실력이 오르면 상대도 세지므로
**승률은 제자리고 레이팅만 오른다.**
즉 이력이 긴 사람의 통산 승률은 실력이 아니라 **매칭 알고리즘의 수렴값**에 가깝다.
그 값을 기준선으로 쓰면 "평소보다 잘하고 있나"를 애초에 잴 수 없다.

## 3. 해법 — mood 전용 기준선을 따로 뽑는다

구간 분석 쪽 기준선은 **건드리지 않는다.** 거기서는 통산 평균이 맞고,
차트 baseline 으로도 나간다 (`app/page.tsx:2319`).

mood 만 **이동창(직전 200판)** 을 쓴다.

```ts
/** 최근 폼을 잴 표본 크기. 너무 작으면 그날 운에 흔들린다. */
const RECENT_N = 20;
/**
 * 최근 폼을 견줄 기준선의 크기 — **통산이 아니라 그 직전 200판이다.**
 * 통산 평균을 쓰면 이력이 긴 사람의 mood 가 고착된다. 30,233판을 한 사람은
 * 최근 20판이 통산값을 못 흔들어서, 성장한 사람은 영구 hot, 전성기가 지난
 * 사람은 오늘 5할을 쳐도 영구 cold 가 된다. 랭크는 승률을 50%로 되돌리므로
 * 통산 승률은 애초에 실력이 아니라 매칭의 수렴값이기도 하다.
 */
const FORM_BASE_N = 200;
```

```ts
// ── 최근 폼과 연패 (농담 수위를 고르는 근거) ──
const recent = ordered.slice(-RECENT_N);
const recentWr = wr(recent.filter((r) => r.result === 'W').length, recent.length);

// 기준선에서 최근 20판을 뺀다 — 재는 대상이 기준선에 섞이면 편차가 0 쪽으로 눌린다.
const formBase = ordered.slice(-(RECENT_N + FORM_BASE_N), -RECENT_N);
const formBaseline = formBase.length
  ? wr(formBase.filter((r) => r.result === 'W').length, formBase.length)
  : baselineWinRate; // 표본이 그것도 안 되면 통산으로 떨어진다

const recentDeltaPp = roundTo(recentWr - formBaseline, 1);
```

`SessionAdvice` 에 값을 실어 화면이 **무엇과 비교했는지** 말할 수 있게 한다:

```ts
/** 최근 폼을 견준 기준선(직전 200판 승률). 통산 평균(baselineWinRate)과 다르다. */
formBaseline: number;
```

입구 조건이 `records.length >= MIN_BAND_GAMES * 2`(=100)라
`formBase` 는 최소 80판이 보장된다. 폴백은 그 조건이 느슨해질 때를 위한 방어다.

## 4. 임계값(`>= 7 / <= -5 / <= -12`)은 손대지 않아도 된다

기준선을 짧게 잡으면 기준선 자체가 흔들리니 임계값을 다시 맞춰야 할 것 같지만, 아니다.
승률 표준편차는 `50/√n`%p 이고, 두 구간 차이의 sd 는 제곱합의 제곱근이다.

| 기준선 | 기준선 sd | `recentDeltaPp` 총 sd |
|---|---|---|
| 통산 30,000판 (현재) | 0.3%p | 11.2%p |
| 직전 200판 (제안) | 3.5%p | **11.7%p** |

recent 20 의 노이즈(11.2%p)가 워낙 커서, 기준선을 30,000판에서 200판으로 줄여도
총 분산은 **5%밖에 안 는다.** mood 분포는 사실상 그대로 유지되면서 고착만 사라진다.

창 크기는 100 으로 줄여도 12.1%p 라 여유가 있다.
200 을 고른 이유는 헤비 유저 기준 대략 2주치라 **"요즘"이라는 말과 체감이 맞아서**다.

## 5. 같이 따라와야 하는 것

### (a) 문구의 '평균'

13줄이 통산 평균을 전제한 표현을 쓴다 (`app/jokes.ts:40, 43, 62, 130, …`):

```
평균 대비 +${pp}%p
${pp}%p above your average
```

→ `평소보다` / `than usual` 로 바꾼다. 뜻이 넓어지는 방향이라 오독이 안 생긴다.

### (b) 리포트 문구

`app/player/[id]/report/strings.ts:123` 의 `vsAverage`:

```
최근 20판이 평균 대비 ${pp}%p
```

→ `최근 20판이 직전 200판 대비 ${pp}%p`.
공유용 카드라 오히려 근거가 명확해져서 더 어울린다.

### (c) 회귀 테스트 — `npm run check` 에 물릴 것

**mood 가 틀려도 화면은 멀쩡하다.** CLAUDE.md 가 "조용히 깨지는 곳"에 테스트를 붙이라고
정해둔 부류다. `scripts/check-advice.ts` 에 합성 이력 두 개를 넣는다:

| 합성 이력 | 마지막 20판 | 기대 mood | 현재 결과 |
|---|---|---|---|
| 승률 30%→55% 우상향, 5,000판 | 55% 근처 | `steady` | `hot` ❌ |
| 승률 60%→50% 하락, 5,000판 | 50% 근처 | `steady` | `cold` ❌ |

네트워크가 필요 없는 순수 함수 테스트라 `check` 쪽에 맞다(`validate` 아님).

## 6. 덤 — 같은 뿌리의 두 번째 고착

`recent` 가 **언제 친 20판인지**를 보지 않는다.
반년 쉰 사람의 mood 는 반년 전 폼이고, 흐름 탭은 그걸 현재형으로 말한다 —
"오늘은 아무도 당신에게 훈수 둘 수 없습니다".

요약 카드 쪽엔 이미 `rusty` 컨디션이 있으니 mood 에도 같은 가드를 두면 된다:

```ts
// 오래 쉰 사람의 '최근 폼'은 현재가 아니다 — 단정하지 않고 steady 로 내린다.
const mood: SessionAdvice['mood'] = daysSince > 30 ? 'steady' : (…기존 식…);
```

**주의**: `Date.now()` 를 여기서 직접 부르면 안 된다.
시각은 `lib/tekken/models.ts` 의 KST 벽시계 규약을 따라야 하고,
`app/page.tsx` 가 이미 `days` 를 계산해 `ConditionFacts` 로 넘기고 있다.
→ `sessionAdvice` 가 인자로 받는 편이 규약을 두 곳에 적지 않는 길이다.

## 7. 적용 순서

1. `lib/tekken/advice.ts` — `FORM_BASE_N`, `formBaseline`, `recentDeltaPp` 수정 + 인터페이스에 `formBaseline` 추가
2. `scripts/check-advice.ts` 신규 + `package.json` 의 `check` 에 연결 → **먼저 빨간불 확인**
3. `app/jokes.ts` · `app/player/[id]/report/strings.ts` 문구 조정
4. `npm run check` → `npm run validate` → 헤비 유저(30,233경기) 실조회로 mood 육안 확인
