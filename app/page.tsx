'use client';

// 단일 화면: 식별코드(1명 or 여러 명) + 기간 → /api/replays | /api/compare → 탭 + 표.
// 표 렌더는 서버가 준 TabData 를 그대로 그린다(집계는 전부 서버).
// 레이팅 추이 탭만 클라이언트에서 SVG 그래프를 추가로 그린다.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gaEvent } from '@/lib/ga-events';
import RankBadges from './RankBadges';
// 2026-08-05: 승률 비교·장기전 패턴 찾기 기능 잠시 중단 — 아래 사용처도 주석 처리됨.
// import SimilarPlayers from './SimilarPlayers';
import {
  TrendChart,
  DailyChart,
  ActivityHeatmap,
  RankChart,
  type SessionView,
  SessionChart,
  AdviceChart,
  type DailyStyle,
} from './charts';
import {
  LANGS,
  LANG_KEY,
  makeT,
  TAB_LABELS,
  cellText,
  colText,
  type Lang,
} from './i18n';
import { looksLikeId, toPolarisId } from '@/lib/wavu/token';
import { COMPARE_MIN_GAMES } from '@/lib/tekken/compare';
import {
  pickJoke,
  pickCoach,
  pickCondition,
  type Condition,
  type ConditionFacts,
} from './jokes';
import { seasonOf } from './season-jokes';
import type { QuipFacts } from '@/lib/tekken/quip-facts';
import WinLossCode from './WinLossCode';
import RandomPlayer from './RandomPlayer';
import ShareButton from './ShareButton';
import VisitorCount from './VisitorCount';
import SeoContent from './SeoContent';
import {
  pickCompareSummary,
  pickH2hQuip,
  pickCharsQuip,
  pickCommonQuip,
  type SummaryTone,
  type H2hTone,
  type CharsTone,
} from './compare-quips';

/**
 * 한 줄 멘트는 성격이 다른 두 갈래라 스위치도 따로 둔다.
 *   QUIPS  유머 — 컨디션 한 줄 + 흐름 탭 농담. 취향을 심하게 타서 끄고 싶어 하는 사람이 있다.
 *   COACH  조언 — 리플레이·확정딜캐·유튜브 권유. 유머는 싫지만 이건 원하는 경우가 있다.
 * 둘을 한 스위치로 묶으면 그 조합을 만들 수 없다.
 */
/**
 * 응답을 JSON 으로 읽되, **JSON 이 아닐 때 무슨 일이 있었는지 말해준다.**
 *
 * 그냥 res.json() 을 쓰면 본문이 비었을 때 "Unexpected end of JSON input" 이 뜬다.
 * 실제로 그랬다 — 138,560경기 플레이어를 비교하다 서버가 죽어 500 + 본문 0바이트를
 * 돌려줬는데, 화면에는 파서 오류만 떠서 원인을 짐작할 수 없었다.
 * 게다가 파싱이 res.ok 검사보다 **먼저** 터져 상태 코드조차 못 보고 있었다.
 */
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      /* 아래 공통 메시지로 떨어진다 */
    }
  }
  throw new Error(
    res.status >= 500
      ? `서버가 응답하지 못했습니다 (HTTP ${res.status}). 조회 대상이 너무 크거나 일시적인 문제일 수 있습니다.`
      : `응답을 읽지 못했습니다 (HTTP ${res.status}).`,
  );
}

const QUIPS_KEY = 'tkwavu_quips';
const COACH_KEY = 'tkwavu_coach';
/** 내 계정 고정 (브라우저에만 저장). */
const PIN_KEY = 'tkwavu_pin';

/**
 * 비교 결과 멘트에 쓸 값을 뽑는다. 전부 **개요 탭에 이미 있는 숫자**다 —
 * 서버에 새로 요청하지도, 다시 계산하지도 않는다.
 */
function compareFacts(tabs: TabData[]) {
  const ov = tabs.find((t) => t.key === 'overview');
  if (!ov || ov.columns.length < 3) return null;
  const names = ov.columns.slice(1); // 0번 컬럼은 '지표'
  const rowOf = (metric: string) => ov.rows.find((r) => String(r[0]) === metric);
  /** 그 지표에서 값이 가장 큰 사람과 1·2위 차이 */
  const topOf = (metric: string) => {
    const r = rowOf(metric);
    if (!r) return null;
    const vals = names.map((n, i) => ({ name: n, v: Number(r[i + 1]) }));
    if (vals.some((x) => !Number.isFinite(x.v))) return null;
    const sorted = [...vals].sort((a, b) => b.v - a.v);
    return { name: sorted[0].name, gap: sorted[0].v - sorted[1].v };
  };

  const rating = topOf('현재 레이팅');
  const form = topOf('최근 20경기 승률(%)');
  if (!rating || !form) return null;

  const charRow = rowOf('사용 캐릭터 수');
  const charCounts = charRow
    ? names
        .map((n, i) => ({ name: n, v: Number(charRow[i + 1]) }))
        .sort((a, b) => b.v - a.v)
    : [];

  return {
    ratingLeader: rating.name,
    ratingGap: Math.round(rating.gap),
    formLeader: form.name,
    charCounts,
  };
}

interface TabData {
  key: string;
  label: string;
  columns: string[];
  rows: (string | number | null)[][];
}

interface PlayerResponse {
  polarisId: string;
  myName: string;
  recordCount: number; // 필터 적용 후
  currentRating: number | null; // 마지막 경기 레이팅 — 조언 수위를 가른다
  totalCount: number; // 전체 이력
  firstDt: string | null;
  lastDt: string | null;
  tabs: TabData[];
  charCounts?: { name: string; games: number }[]; // 사용 캐릭터 (경기 수 내림차순)
  selectedChar?: string | null;
  stats?: { total: number; kept: number; dropped: number; dupes: number };
  seasons?: SeasonInfo[]; // 이 플레이어가 실제로 뛴 시즌들 (전체 이력 기준)
  advice?: {
    baselineWinRate: number;
    bands: { from: number; to: number; games: number; winRate: number; avgDelta: number; enough: boolean }[];
    goodUpTo: number | null;
    stopAfter: number | null;
    dropPp: number | null;
    dropsFromStart: boolean;
    noGainBands: { from: number; to: number }[];
    thinReason: 'few' | 'short' | null;
    reliable: boolean;
    recentDeltaPp: number;
    losingStreak: number;
    mood: 'blazing' | 'hot' | 'steady' | 'cooling' | 'cold' | 'frozen';
  } | null;
  /** 농담이 인용할 사실 (서버에서 계산해 실어 보낸다). 못 재면 null. */
  quipFacts?: QuipFacts | null;
  /** 승패 바코드 문자열 (lib/tekken/barcode.ts). 기간·캐릭터 필터를 따른다. */
  barcode?: string;
  filtered?: {
    start: string | null;
    end: string | null;
    season?: string | null;
    count: number;
  };
  /**
   * 시간대 탭을 조회 대상의 **현지 시각**으로 다시 묶은 표. KST 와 같으면 null.
   * (한국 유저·지역 불명이면 항상 null 이라 화면이 지금까지와 똑같다)
   */
  localTime?: TabData | null;
  /** 라운드 탭을 상대 캐릭터별로 묶은 것 (같은 탭 안의 보기 전환용). */
  roundByOpp?: TabData | null;
  /** 시즌 탭을 game_version 별로 묶은 것 (같은 탭 안의 보기 전환용). */
  seasonByVersion?: TabData | null;
  /** 서버 지역과 거기서 추정한 현지 시간대. lib/wavu/region.ts 참조. */
  timezone?: {
    region: { code: string; label: string } | null;
    offsetMinutes: number;
    offsetLabel: string;
    source: 'curve' | 'region' | 'default';
    fit: number | null;
  };
  /** stale=true 면 wavu 수집 실패로 지난 사본을 보는 중. */
  cache?: { fetchedAt?: number; stale?: boolean };
  error?: string;
}

interface CompareResponse {
  players: { polarisId: string; name: string; count: number }[];
  tabs: TabData[];
  seasons?: SeasonInfo[];
  filtered?: { start: string | null; end: string | null; season?: string | null };
  cache?: { stale?: boolean };
  error?: string;
}

type Mode = 'single' | 'compare';
type PeriodMode = 'all' | 'month' | 'year' | 'recent' | 'custom' | 'season';
/** '최근 N년' 프리셋 — 오늘 기준으로 N년 전부터. */
type RecentYears = 2 | 3 | 4;

/** 서버가 데이터에서 뽑아준 시즌 구간 (lib/tekken/seasons.ts). */
interface SeasonInfo {
  key: string; // 'S1' | 'S2' | ...
  start: string; // 'yyyy-MM-dd'
  end: string;
  games: number;
}

// 조회 **전에만** 쓰는 시즌 버튼 목록 — 표시용 기본값이다.
//
// 예전에는 여기에 시즌 경계 날짜를 적어두고 그 날짜로 필터링했다. 그러면 S4 가 열려도
// 아무도 손대지 않는 한 S4 는 영영 안 나타나고, 시즌 탭(game_version 기준)과 답이 갈렸다.
// 지금은 필터가 날짜가 아니라 season 키로 나가고(서버가 game_version 으로 판정),
// 버튼도 조회 직후 서버가 준 실제 목록으로 갈아끼운다.
// 그래서 새 시즌은 **첫 조회 즉시** 나타난다 — 이 상수를 고칠 필요가 없다.
const FALLBACK_SEASONS = ['S1', 'S2', 'S3'];

/** 닉네임 검색 결과 항목. */
interface Favorite {
  id: string;
  name: string;
}

/** 서버가 받는 비교 인원 상한 (api/compare 의 MAX_PLAYERS 와 같아야 한다). */
const MAX_COMPARE = 4;

const WIN_LOSS_COLS = new Set(['result', 'result_for_a']);
const ROW_CHUNK = 100; // 긴 표는 이 단위로 끊어 보여준다
const CHART_TABS = new Set(['trend', 'daily', 'sessions', 'rank']); // 그래프로 그릴 수 있는 탭
/**
 * 표 없이 그래프만 보여줄 탭.
 *
 * 레이팅 추이는 경기 하나가 한 줄이라 표로 보면 3만 줄짜리 숫자 나열이고,
 * 그 정보는 '전적 목록' 탭에 이미 더 읽기 좋게 있다. 토글 자체를 없앤다.
 * (데이터는 그대로 실려 있어 CSV·엑셀 다운로드에는 영향이 없다)
 */
const CHART_ONLY_TABS = new Set(['trend']);

function cellClass(col: string, v: string | number | null): string | undefined {
  if (!WIN_LOSS_COLS.has(col)) return undefined;
  if (v === 'W') return 'win';
  if (v === 'L') return 'loss';
  return undefined;
}

/** 현재 KST 기준 'YYYY-MM'. */
function currentMonth(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

/** 'YYYY-MM' → [1일, 말일]. */
function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}

/** '최근 N년' → [오늘(KST)로부터 N년 전, 오늘]. currentMonth 와 같은 KST 보정. */
function recentYearsRange(n: number): [string, string] {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const end = now.toISOString().slice(0, 10);
  const s = new Date(now);
  s.setUTCFullYear(s.getUTCFullYear() - n);
  return [s.toISOString().slice(0, 10), end];
}

/** CSV 문자열 생성 (BOM 포함 → 엑셀에서 한글 정상). */
function toCsv(tab: TabData, lang: Lang): string {
  const esc = (v: string | number | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [tab.columns.map((c) => esc(colText(lang, c))).join(',')];
  for (const r of tab.rows) lines.push(r.map(esc).join(','));
  return '﻿' + lines.join('\r\n');
}

/**
 * 파일명으로 쓸 수 있게 다듬는다.
 *
 * 이름은 wavu 닉네임에서 그대로 온다. 실제로 이런 게 있다 —
 * `셀렌` 뒤에 U+3164(한글 채움 문자)가 둘 붙은 것, `플레이어 네임을 입력해주세요`,
 * 그리고 비교 모드는 네 명 이름을 `_vs_` 로 이어 붙인다.
 * 경로 구분자·제어문자가 섞이면 브라우저마다 다르게 처리하고, 길면 잘린다.
 */
function safeFileName(raw: string): string {
  const cleaned = raw
    // 경로 구분자·예약 문자
    .replace(/[\\/:*?"<>|]/g, '_')
    // 제어문자
    .replace(/[\u0000-\u001f\u007f]/g, '')
    // 눈에 안 보이는 채움·방향 문자. 실제 닉네임 '셀렌'이 U+3164 로 끝난다.
    .replace(/[\u115f\u1160\u3164\u200b-\u200f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, ''); // 숨김 파일로 만들지 않는다
  return cleaned.slice(0, 80).trim() || 'tekken';
}


/**
 * 문자열을 파일로 저장한다.
 *
 * ── 예전 구현의 문제 셋 (JSON 전체 다운로드가 먹통이라는 제보에서 나왔다) ──
 *  1. `click()` **직후에** `revokeObjectURL` 을 불렀다. 브라우저가 blob 을 아직
 *     읽기 전이라 다운로드가 조용히 실패할 수 있다. 크기가 클수록·기기가 느릴수록
 *     잘 걸린다.
 *  2. `<a>` 를 문서에 붙이지 않았다. 파이어폭스와 일부 모바일 브라우저는
 *     문서에 없는 앵커의 `.click()` 으로는 다운로드를 시작하지 않는다.
 *  3. 그래서 **아무 일도 안 일어난 것처럼 보이고**, 사용자는 다시 누른다.
 *     누를 때마다 수 MB 문자열과 Blob 이 새로 생겨 결국 탭이 죽는다.
 *     제보의 '다운'은 이 경로일 가능성이 크다 — 한 번 누른 비용은 14ms 뿐이다.
 */
function downloadBlob(content: string, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // 정리는 다음 태스크로 미룬다. 10초면 어떤 기기에서도 다운로드가 시작되고 남는다.
  // (0ms 나 즉시 해제는 위 1번 문제를 그대로 다시 만든다)
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
}

/* ── 일별 탭 롤업 (월/분기/반기/연) ─────────────────────────────
   일별 rows: [Date, my_char, Games, W, L, WinRate(%), RatingDelta, EndRating]
   를 기간 키로 다시 묶는다. 합산은 W/L/Δ, EndRating 은 기간 내 마지막 날 값. */

type DailyGran = 'day' | 'month' | 'quarter' | 'half' | 'year' | 'season';

/** 일별 탭의 그래프 보기. 'heat' 만 DailyChart 가 아니라 ActivityHeatmap 이 그린다. */
type DailyView = DailyStyle | 'heat';

const DAILY_STYLE_LABEL: Record<DailyView, Record<Lang, string>> = {
  updown: { ko: '승▲ 패▼', en: 'W▲ L▼', ja: '勝▲ 敗▼' },
  stack: { ko: '누적', en: 'Stacked', ja: '積み上げ' },
  rate: { ko: '승률 라인', en: 'Win rate', ja: '勝率ライン' },
  heat: { ko: '달력', en: 'Calendar', ja: 'カレンダー' },
};
const DAILY_STYLES: DailyView[] = ['updown', 'stack', 'rate', 'heat'];

const GRAN_LABEL: Record<DailyGran, Record<Lang, string>> = {
  day: { ko: '일별', en: 'Daily', ja: '日別' },
  month: { ko: '월별', en: 'Monthly', ja: '月別' },
  quarter: { ko: '분기별', en: 'Quarterly', ja: '四半期' },
  half: { ko: '반기별', en: 'Half-yearly', ja: '半期' },
  year: { ko: '연별', en: 'Yearly', ja: '年別' },
  season: { ko: '시즌별', en: 'By season', ja: 'シーズン別' },
};

function periodKey(date: string, g: DailyGran, seasons: SeasonInfo[]): string {
  if (g === 'day') return date;
  if (g === 'season') {
    // 경계는 서버가 데이터에서 뽑아준 구간을 그대로 쓴다 — 날짜 하드코딩 없음.
    for (const s of seasons) if (date >= s.start && date <= s.end) return s.key;
    return '?';
  }
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  if (g === 'month') return date.slice(0, 7);
  if (g === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  if (g === 'half') return `${y}-H${m <= 6 ? 1 : 2}`;
  return y;
}

/** 일별 데이터가 걸친 범위에 맞는 집계 단위만 제시 (2개 그룹 이상 생길 때만). */
function granOptions(tab: TabData, seasons: SeasonInfo[]): DailyGran[] {
  const dates = tab.rows.map((r) => String(r[0]));
  const opts: DailyGran[] = ['day'];
  for (const g of ['month', 'quarter', 'half', 'year', 'season'] as DailyGran[]) {
    if (new Set(dates.map((d) => periodKey(d, g, seasons))).size >= 2) opts.push(g);
  }
  return opts;
}

/* ── 상대전적 탭 보기 옵션 ────────────────────────────────────────
   전부 나열하면 1,000행이 넘고(실측 7,828경기 → 1,009명), 2~3판 만난 상대가
   섞여 승률이 100%/0% 로 튄다. '몇 판 이상 만난 상대만' + '강점/약점 순'으로
   좁혀야 실제로 읽을 수 있다. 한 명 모드의 강점/약점 매치업과 같은 취지다. */

type H2hView = 'all' | 'strong' | 'weak';
/**
 * 두 컨트롤이 같은 눈금을 쓴다. 어느 쪽이든 **데이터가 받쳐주는 값만** 화면에 나온다
 * (h2hMinOptions / h2hTopOptions 가 걸러낸다) — 상대가 300명인데 '상위 5000명'
 * 버튼이 보이거나, 최다 대전이 939판인데 '2500판 이상' 버튼이 보이는 일은 없다.
 */
const H2H_STEPS = [10, 50, 100, 250, 500, 1000, 2500, 5000];
/** 최소 경기수 — 'N판 이상 붙어본 상대만'. 0 = 전체. */
const H2H_MINS = [0, ...H2H_STEPS];
/** 보여줄 인원 — 정렬 기준 상위 N명만. 0 = 전체. */
const H2H_TOPS = [...H2H_STEPS, 0];
/**
 * '마지막으로 만난 날' 기준.
 *   0     전체
 *   양수  최근 N일 안에 만난 상대
 *   음수  |N|일보다 **이전에** 마지막으로 만난 상대 (요즘 안 보이는 옛 상대)
 */
const H2H_DAYS = [0, 30, 90, 365, -365];

const H2H_VIEW_LABEL: Record<H2hView, Record<Lang, string>> = {
  all: { ko: '전체', en: 'All', ja: '全体' },
  strong: { ko: '강점 (승률 높은 순)', en: 'Strong (best WR)', ja: '得意 (勝率順)' },
  weak: { ko: '약점 (승률 낮은 순)', en: 'Weak (worst WR)', ja: '苦手 (勝率順)' },
};

const H2H_DAY_LABEL = (d: number, lang: Lang): string => {
  if (d === 0) return { ko: '전체', en: 'All', ja: '全体' }[lang];
  if (d < 0)
    return { ko: '1년 이상 전', en: 'Over 1 year ago', ja: '1年以上前' }[lang];
  if (d === 365) return { ko: '1년 이내', en: 'Within 1 year', ja: '1年以内' }[lang];
  return { ko: `${d}일 이내`, en: `${d} days`, ja: `${d}日以内` }[lang];
};

/** 이 탭에 쓸 수 있는 최소 경기수 선택지 (행이 남는 값만). 비교 모드 맞대결 탭이면 null. */
function h2hMinOptions(tab: TabData): number[] | null {
  const gi = tab.columns.indexOf('Games');
  if (gi < 0 || tab.columns.indexOf('WinRate(%)') < 0) return null;
  return H2H_MINS.filter((m) => m === 0 || tab.rows.some((r) => Number(r[gi]) >= m));
}

/** 지금 남은 행 수보다 작은 선택지만 (300명인데 '상위 500명' 버튼은 의미가 없다). */
function h2hTopOptions(count: number): number[] {
  const opts = H2H_TOPS.filter((n) => n === 0 || n < count);
  return opts.length > 1 ? opts : [];
}

/**
 * 상대전적 좁히기.
 *
 * `days` 는 **'그 상대를 마지막으로 만난 날'** 기준이다 — "최근 3개월 안에 붙어본 상대 중
 * 내가 약한 사람"을 뽑는 용도. 승/패 수 자체는 조회 기간 전체의 누적이다.
 * '그 기간 동안의 전적'이 필요하면 위쪽 조회 기간(월별/시즌/직접입력)을 쓰면 된다 —
 * 그건 서버가 다시 집계하므로 정확하다.
 */
function filterH2h(
  tab: TabData,
  min: number,
  days: number,
  view: H2hView,
): TabData {
  const gi = tab.columns.indexOf('Games');
  const wi = tab.columns.indexOf('WinRate(%)');
  const li = tab.columns.indexOf('LastPlayed');
  if (gi < 0 || wi < 0) return tab;

  let rows = min > 0 ? tab.rows.filter((r) => Number(r[gi]) >= min) : tab.rows;
  if (days !== 0 && li >= 0) {
    // KST 기준 날짜 문자열끼리 비교 (LastPlayed 도 KST 'yyyy-MM-dd HH:mm:ss')
    const cutoff = new Date(Date.now() + 9 * 3600_000 - Math.abs(days) * 86400_000)
      .toISOString()
      .slice(0, 10);
    rows = rows.filter((r) => {
      const last = String(r[li]).slice(0, 10);
      return days > 0 ? last >= cutoff : last < cutoff; // 음수 = 그 이전에 마지막으로 만남
    });
  }
  const g = (r: (string | number | null)[]) => Number(r[gi]);
  const w = (r: (string | number | null)[]) => Number(r[wi]);

  // 경계(정확히 50%)는 강점 쪽에 넣는다 — aggregations.buildStrong 과 같은 규칙이라
  // 같은 상대가 강점/약점에 동시에 나타나지 않는다.
  if (view === 'strong')
    rows = rows.filter((r) => w(r) >= 50).sort((a, b) => w(b) - w(a) || g(b) - g(a));
  else if (view === 'weak')
    rows = rows.filter((r) => w(r) < 50).sort((a, b) => w(a) - w(b) || g(b) - g(a));

  return { ...tab, rows };
}

/* ── 시간대 탭: '구분' 열 대신 보기 전환 ──────────────────────────
   서버는 하루 시간대(24행)와 요일(7행)을 'Unit' 열로 묶어 한 표에 담아 보낸다.
   화면에서는 둘을 섞어 보여줄 이유가 없으므로 버튼으로 고르고, 구분 열은 지운다.
   (엑셀/CSV 에는 Unit 이 남아 있어야 두 표를 구분할 수 있으니 서버 형식은 그대로 둔다) */

type TimeView = '시간대' | '요일';

const TIME_VIEW_LABEL: Record<TimeView, Record<Lang, string>> = {
  시간대: { ko: '하루 시간대', en: 'Hour of day', ja: '時間帯' },
  요일: { ko: '요일별', en: 'By weekday', ja: '曜日別' },
};

/* 시각 기준 — 한국 시간(이 사이트의 고정 기준) vs 조회 대상의 현지 시간.
   외국 유저는 KST 축에서 "새벽에 몰아서 한다"처럼 보인다. 숫자는 맞지만
   해석이 통째로 틀리므로 축을 바꿔 볼 수 있게 한다. (lib/wavu/region.ts) */
type TzView = 'kst' | 'local';

/** 'Unit' 열로 묶인 표에서 한 묶음만 남기고 그 열은 없앤다. */
function pickUnit(tab: TabData, unit: string): TabData {
  const ui = tab.columns.indexOf('Unit');
  if (ui < 0) return tab;
  const drop = <T,>(arr: T[]) => arr.filter((_, i) => i !== ui);
  return {
    ...tab,
    columns: drop(tab.columns),
    rows: tab.rows.filter((r) => r[ui] === unit).map(drop),
  };
}

function rollupDaily(tab: TabData, g: DailyGran, seasons: SeasonInfo[]): TabData {
  if (g === 'day') return tab;
  interface Agg {
    period: string;
    char: string;
    w: number;
    l: number;
    delta: number;
    end: number;
    lastDate: string;
  }
  const m = new Map<string, Agg>();
  for (const r of tab.rows) {
    const [date, char, , w, l, , delta, end] = r as [
      string, string, number, number, number, number, number, number,
    ];
    const p = periodKey(date, g, seasons);
    const k = `${p}|${char}`;
    let x = m.get(k);
    if (!x) m.set(k, (x = { period: p, char, w: 0, l: 0, delta: 0, end: 0, lastDate: '' }));
    x.w += w;
    x.l += l;
    x.delta += delta;
    if (date > x.lastDate) {
      x.lastDate = date;
      x.end = end;
    }
  }
  const rows = [...m.values()].sort(
    (a, b) =>
      (a.period < b.period ? 1 : a.period > b.period ? -1 : 0) ||
      b.w + b.l - (a.w + a.l) ||
      (a.char.toUpperCase() < b.char.toUpperCase() ? -1 : 1),
  );
  return {
    key: 'daily',
    label: tab.label,
    columns: ['Period', 'my_char', 'Games', 'W', 'L', 'WinRate(%)', 'RatingDelta', 'EndRating'],
    rows: rows.map((x) => {
      const games = x.w + x.l;
      return [
        x.period, x.char, games, x.w, x.l,
        games ? Math.round((x.w * 10000) / games) / 100 : 0,
        x.delta, x.end,
      ];
    }),
  };
}

/**
 * 비교 표 우위 하이라이트 — 행 안에서 플레이어 간 비교가 성립하는 값만.
 * 반환: 행(row)을 받아 하이라이트할 컬럼 인덱스 집합을 주는 함수 (해당 없으면 null).
 * 행 단위 계산이라 검색 필터/더보기로 행 순서가 바뀌어도 안전하다.
 */
function makeRowHighlighter(
  tab: TabData,
): ((row: (string | number | null)[]) => Set<number>) | null {
  const cols = tab.columns;

  if (tab.key === 'overview') {
    // 지표별 방향: high=클수록 우위, low=작을수록 우위. 없으면 하이라이트 안 함.
    const DIR: Record<string, 'high' | 'low'> = {
      '경기 승률(%)': 'high',
      '라운드 승률(%)': 'high',
      '접전 승률(%)': 'high',
      '완승 비율(%)': 'high',
      '완패 비율(%)': 'low',
      '최고 레이팅': 'high',
      '최고 텍켄파워': 'high',
    };
    return (row) => {
      const hs = new Set<number>();
      const dir = DIR[String(row[0])];
      if (!dir) return hs;
      const vals = row.slice(1).map(Number);
      const best = dir === 'high' ? Math.max(...vals) : Math.min(...vals);
      vals.forEach((v, j) => {
        if (v === best) hs.add(j + 1);
      });
      return hs;
    };
  }

  if (tab.key === 'season') {
    // [Season, 지표, 플레이어...] — 승률 행만
    return (row) => {
      const hs = new Set<number>();
      if (!String(row[1]).includes('승률')) return hs;
      const vals = row.slice(2).map(Number);
      const best = Math.max(...vals);
      if (best <= 0) return hs;
      vals.forEach((v, j) => {
        if (v === best) hs.add(j + 2);
      });
      return hs;
    };
  }

  if (tab.key === 'chars' || tab.key === 'vs_common') {
    // *_wr(%) 컬럼들끼리 비교
    const wrCols = cols
      .map((c, j) => (c.endsWith('_wr(%)') ? j : -1))
      .filter((j) => j >= 0);
    if (wrCols.length < 2) return null;
    return (row) => {
      const hs = new Set<number>();
      const vals = wrCols.map((j) => Number(row[j]));
      const best = Math.max(...vals);
      if (best <= 0) return hs;
      wrCols.forEach((j, k) => {
        if (vals[k] === best) hs.add(j);
      });
      return hs;
    };
  }

  if (tab.key === 'h2h') {
    // 맞대결: a_wins vs b_wins 큰 쪽
    const ai = cols.indexOf('a_wins');
    const bi = cols.indexOf('b_wins');
    if (ai < 0 || bi < 0) return null;
    return (row) => {
      const hs = new Set<number>();
      const a = Number(row[ai]);
      const b = Number(row[bi]);
      if (a > b) hs.add(ai);
      else if (b > a) hs.add(bi);
      return hs;
    };
  }

  return null;
}

function DataTable({
  tab,
  rowHl,
  lang = 'ko',
  onCompare,
  pickedIds,
}: {
  tab: TabData;
  rowHl?: ((row: (string | number | null)[]) => Set<number>) | null;
  lang?: Lang;
  /** 주어지면 '나와 비교' 열이 생긴다 (한 명 모드 전용). */
  onCompare?: (oppPolaris: string, oppName: string) => void;
  /** 이미 비교 목록에 담긴 식별코드 — 버튼이 담긴 상태로 보인다. */
  pickedIds?: Set<string>;
}) {
  const tt = makeT(lang);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(ROW_CHUNK);

  // 탭이 바뀌면 검색/표시 개수 초기화
  useEffect(() => {
    setQuery('');
    setLimit(ROW_CHUNK);
  }, [tab.key]);

  const filtered = useMemo(() => {
    if (!query.trim()) return tab.rows;
    const q = query.trim().toLowerCase();
    return tab.rows.filter((r) =>
      r.some((v) => v !== null && String(v).toLowerCase().includes(q)),
    );
  }, [tab.rows, query]);

  const visible = filtered.slice(0, limit);
  const searchable = tab.rows.length > 30;

  /* 상대 식별코드가 있는 표(전적 목록·상대전적·공통 상대)의 열 역할.
     한 셀에 두 동작을 겹쳐 놓지 않는다 — 예전에는 이름/ID 아무 데나 누르면
     '비교 목록에 담기'였고 그 옆 ↗ 만 조회였는데, 이름을 누르면 조회로 갈 거라
     기대하는 쪽이 많았다. 지금은 열마다 동작이 하나다.
       · 상대 이름     — 링크 없음 (글자만)
       · 상대 식별코드 — 그 사람 조회 (새 창. 보던 표를 잃지 않는다)
       · 나와 비교     — 비교 목록에 담기 (아래에서 끼워 넣는 표시용 열) */
  const polIdx = tab.columns.indexOf('opp_polaris');
  const nameIdx = tab.columns.indexOf('opp_name'); // 칩에 보일 닉네임
  // '나와 비교' 열은 데이터가 아니라 화면에서만 끼운다 —
  // CSV·엑셀·API 응답의 컬럼 구성을 건드리지 않기 위해서다.
  const cmpCol = !!onCompare && polIdx >= 0;

  return (
    <>
      {searchable && (
        <div className="table-tools">
          <input
            type="text"
            placeholder={tt('searchInTable')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="hint">
            {query ? `${filtered.length}${tt('matched')}` : ''}
            {tab.rows.length}
            {tt('totalRows')}
          </span>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {tab.columns.map((c, j) => (
                <Fragment key={c}>
                  <th title={c !== colText(lang, c) ? c : undefined}>{colText(lang, c)}</th>
                  {cmpCol && j === polIdx && (
                    <th className="cmp-col">{tt('cmpCol')}</th>
                  )}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const hl = rowHl ? rowHl(r) : null;
              return (
                <tr key={i}>
                  {r.map((v, j) => {
                    const pol = polIdx >= 0 ? String(r[polIdx] ?? '') : '';
                    const oppName = nameIdx >= 0 ? String(r[nameIdx] ?? '') : '';
                    // 식별코드 열만 링크다 — 누르면 그 사람 조회로 넘어간다.
                    const linked = v !== null && pol && j === polIdx;
                    const picked = pickedIds?.has(pol) ?? false;
                    return (
                      <Fragment key={j}>
                        <td
                          className={
                            [cellClass(tab.columns[j], v), hl?.has(j) ? 'hl' : undefined]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                        >
                          {linked ? (
                            <a
                              className="plink"
                              href={`/player/${encodeURIComponent(pol)}`}
                              target="_blank"
                              rel="noreferrer"
                              title={tt('openPlayer')}
                            >
                              {v}
                            </a>
                          ) : v === null ? (
                            ''
                          ) : typeof v === 'string' ? (
                            cellText(lang, v)
                          ) : (
                            v
                          )}
                        </td>
                        {/* 나와 비교 — 누르면 비교 목록에 담기만 한다(화면은 그대로).
                            다 고르면 검색칸 아래 목록에서 새 창으로 열거나 복사한다. */}
                        {cmpCol && j === polIdx && (
                          <td className="cmp-col">
                            {pol && (
                              <button
                                type="button"
                                className={picked ? 'cmp-btn on' : 'cmp-btn'}
                                aria-pressed={picked}
                                title={
                                  picked
                                    ? tt('already')(oppName || pol)
                                    : `${oppName || pol} — ${tt('addToCompare')}`
                                }
                                onClick={() => onCompare?.(pol, oppName)}
                              >
                                {picked ? '✓' : '⚔'}
                              </button>
                            )}
                          </td>
                        )}
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="row">
          <button className="ghost" onClick={() => setLimit((n) => n + ROW_CHUNK * 2)}>
            {tt('loadMore')} ({limit} / {filtered.length})
          </button>
        </div>
      )}
      {visible.length === 0 && <p className="hint">{tt('noRows')}</p>}
    </>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('single');
  const [id, setId] = useState('');
  const [ids, setIds] = useState(''); // 비교 모드: 쉼표/공백 구분
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [seasonSel, setSeasonSel] = useState(''); // 'S1' | 'S2' | ... (periodMode==='season')
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxMsg, setXlsxMsg] = useState('');
  const [h2hMin, setH2hMin] = useState(0); // 상대전적: 최소 경기수
  const [h2hDays, setH2hDays] = useState(0); // 상대전적: 만난 시기
  const [h2hTop, setH2hTop] = useState(0); // 상대전적: 상위 N명만 (0=전체)
  const [timeView, setTimeView] = useState<TimeView>('시간대');
  // 시간대 탭의 시각 기준. 조회 대상이 외국이면 '현지'가 기본이다 —
  // 그 사람에게 KST 축은 의미가 없고, 기본값이 오독을 만들면 안 되기 때문이다.
  // (한국·지역 불명이면 애초에 localTime 이 없어서 이 전환 자체가 안 나온다)
  const [tzView, setTzView] = useState<TzView>('local');
  // 라운드 탭 보기. 기본은 '내 캐릭터별' — 지금까지의 동작을 그대로 둔다.
  const [roundView, setRoundView] = useState<'my' | 'opp'>('my');
  // 시즌 탭 보기. 기본은 '시즌별' — 지금까지의 동작을 그대로 둔다.
  // 버전별은 같은 시즌 안의 밸런스 패치까지 갈라 보고 싶을 때만 쓴다.
  const [seasonView, setSeasonView] = useState<'season' | 'version'>('season');
  // 상대전적에서 눌러 담은 비교 대상 (나는 제외 — 목록을 만들 때 앞에 붙인다)
  const [picked, setPicked] = useState<Favorite[]>([]);
  const [pickMsg, setPickMsg] = useState('');
  const [h2hView, setH2hView] = useState<H2hView>('all');
  // 비교 표에서 표본 미달(5경기 미만) 행 숨기기 — 3판 100% 가 39판 55% 위에 뜨는 걸 막는다
  const [hideThin, setHideThin] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [recentYears, setRecentYears] = useState<RecentYears>(2);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * 조회에 걸린 시간(초). 전적이 많은 사람은 10초 넘게 걸리는데, 그동안 화면이
   * 멈춘 것처럼 보이면 사람들은 새로고침하거나 버튼을 다시 누른다.
   * 숫자가 올라가는 것만 보여줘도 "돌아가는 중"이라는 게 전달된다.
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 300);
    return () => clearInterval(iv);
  }, [loading]);
  const [error, setError] = useState('');
  const [single, setSingle] = useState<PlayerResponse | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [activeTab, setActiveTab] = useState('');

  /**
   * 마지막으로 player_lookup 을 보낸 대상. '탭을 눌렀을 뿐'과 '새로 조회했다'를
   * 가른다 — 아래 주소창 동기화 effect 는 탭·필터가 바뀔 때도 돌기 때문이다.
   */
  const lastLookupRef = useRef('');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [dailyGran, setDailyGran] = useState<DailyGran>('day');
  const [dailyStyle, setDailyStyle] = useState<DailyView>('updown');
  /**
   * 레이팅 추이 가로축. 'date' 는 실제 시간이라 정직하지만, 몰아서 치는 사람은
   * 하루치가 1~2px 에 뭉쳐 세션 하나가 수직선이 된다(실측: Paul 52경기가 0px).
   * 'game' 은 경기 순번이라 어느 구간이든 고르게 퍼진다.
   */
  const [trendX, setTrendX] = useState<'date' | 'game'>('game');
  /** 세션 그래프 형태. 'length' 는 판수×증감 산점도 — '길게 치면 손해인가'에 답한다. */
  const [sessView, setSessView] = useState<SessionView>('bars');
  const [charSel, setCharSel] = useState(''); // ''=전체, 그 외=해당 캐릭터만 집계
  const [lang, setLangState] = useState<Lang>('ko');
  const t = makeT(lang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  };

  // 비교 표 우위 하이라이트 on/off
  const [hlOn, setHlOn] = useState(true);

  // 통합 입력: 닉네임이 여러 명과 일치할 때 고를 후보 (pendingToken = 어느 입력 항목이었는지)
  const [searchMsg, setSearchMsg] = useState('');
  const [results, setResults] = useState<Favorite[]>([]);
  const [pendingToken, setPendingToken] = useState('');
  // 칩 선택의 동작: replace = 조회 중 모호한 항목 교체 후 재조회, append = 비교 목록에 추가
  const [resultsMode, setResultsMode] = useState<'replace' | 'append'>('replace');

  // 비교 모드: 검색해서 목록에 추가하는 보조 입력
  const [addQ, setAddQ] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  // 닉네임 검색 시 과거 닉네임까지 포함할지 (wavu 는 개명 이력도 검색해준다)
  const [inclHistory, setInclHistory] = useState(false);
  // 두 트랙 모두 기본 켜짐. 통계만 보고 싶은 사람이 각각 끌 수 있어야 한다.
  // CSV/JSON 저장 상태. 반복 클릭을 막고 실패를 화면에 낸다(예전엔 조용히 실패했다).
  const [dlBusy, setDlBusy] = useState(false);
  const [dlMsg, setDlMsg] = useState('');
  const [showQuips, setShowQuipsState] = useState(true);
  const [showCoach, setShowCoachState] = useState(true);
  const remember = (key: string, v: boolean) => {
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const setShowQuips = (v: boolean) => {
    setShowQuipsState(v);
    remember(QUIPS_KEY, v);
  };
  const setShowCoach = (v: boolean) => {
    setShowCoachState(v);
    remember(COACH_KEY, v);
  };

  /**
   * 내 계정 고정.
   *
   * 최근 조회 목록은 있었지만 **매번 다시 눌러야 했다.** 자기 전적을 보러 오는
   * 사람이 대부분인데 들어올 때마다 같은 동작을 반복하게 만들 이유가 없다.
   * 고정해두면 다음 방문에 자동으로 조회된다. 브라우저에만 남는다(서버 저장 없음).
   */
  const [pinned, setPinnedState] = useState<Favorite | null>(null);
  /** 복원 직후 한 번만 자동 조회한다. run 이 아직 정의되기 전이라 ref 로 넘긴다. */
  const autoRunRef = useRef<string | null>(null);
  const setPinned = (f: Favorite | null) => {
    setPinnedState(f);
    try {
      if (f) localStorage.setItem(PIN_KEY, JSON.stringify(f));
      else localStorage.removeItem(PIN_KEY);
    } catch {
      /* ignore */
    }
  };

  // 최근 조회한 플레이어 (이 브라우저에만 저장, 최대 8명)
  const [recent, setRecent] = useState<Favorite[]>([]);
  const pushRecent = (items: Favorite[]) => {
    setRecent((prev) => {
      const merged = [...items, ...prev.filter((r) => !items.some((i) => i.id === r.id))].slice(0, 8);
      try {
        localStorage.setItem('tkwavu_recent', JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      return merged;
    });
  };


  // 과거 버전이 저장해둔 값 정리 (입력 ID·관리자 비밀번호는 더 이상 저장하지 않는다)
  useEffect(() => {
    try {
      localStorage.removeItem('tkwavu');
      localStorage.removeItem('tkwavu_admin_pw');
      const l = localStorage.getItem(LANG_KEY) as Lang | null;
      if (l && ['ko', 'en', 'ja'].includes(l)) setLangState(l);
      if (localStorage.getItem(QUIPS_KEY) === '0') setShowQuipsState(false);
      if (localStorage.getItem(COACH_KEY) === '0') setShowCoachState(false);
      const rc = localStorage.getItem('tkwavu_recent');
      if (rc) {
        const arr = JSON.parse(rc) as Favorite[];
        if (Array.isArray(arr)) setRecent(arr.filter((f) => f && f.id).slice(0, 8));
      }
      const pin = localStorage.getItem(PIN_KEY);
      if (pin) {
        const f = JSON.parse(pin) as Favorite;
        if (f && f.id) {
          setPinnedState(f);
          // 주소로 들어온 조회(?id=)가 있으면 그쪽이 우선이다 — 공유 링크를 덮지 않는다.
          if (!new URLSearchParams(window.location.search).get('id')) {
            setId(f.id);
            autoRunRef.current = f.id;
          }
        }
      }
    } catch {
      /* ignore */
    }
    // 방문 집계: 같은 브라우저 세션에서는 한 번만 센다
    const counted = sessionStorage.getItem('tkwavu_visited');
  }, []);

  /**
   * 입력 항목 하나를 식별코드로 해석한다.
   * 식별코드 표기(looksLikeId)면 그대로 쓰고, 아니면 닉네임으로 wavu 검색.
   * 검색 결과가 정확히 1명이면 그 식별코드, 여러 명이면 후보를 돌려준다.
   *
   * 표기만 보고 고른 것은 `guess: true` 로 표시한다 — 12자 영숫자 닉네임은
   * 여전히 식별코드와 구분이 안 되므로, 호출부가 빗나갔을 때 되돌릴 수 있어야 한다.
   * `forceSearch` 는 그 되돌리기용(표기 판정을 건너뛰고 닉네임으로만 해석).
   */
  const resolveToken = async (
    tok: string,
    opts?: { forceSearch?: boolean },
  ): Promise<
    | { id: string; name?: string; guess?: boolean }
    | { choices: Favorite[] }
    | { error: string }
  > => {
    if (!opts?.forceSearch && looksLikeId(tok))
      return { id: toPolarisId(tok), guess: true };
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(tok)}${inclHistory ? '&history=1' : ''}`,
    );
    const data = await readJson<{ results?: Favorite[]; error?: string }>(res);
    if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
    const found = data.results ?? [];
    if (found.length === 0)
      return { error: `'${tok}' 닉네임 검색 결과가 없습니다.` };
    if (found.length === 1) return { id: found[0].id, name: found[0].name };
    return { choices: found };
  };


  /**
   * 기간 상태 → **공유 URL** 파라미터 (서버 쿼리가 아니라 화면 상태 복원용).
   * 주소창 동기화와 '즉시 비교(새 창)'가 같은 형식을 쓰도록 한 곳에 모았다 —
   * 갈라지면 새 창만 기간이 초기화되는 식으로 조용히 어긋난다.
   */
  const periodShareParams = useCallback((): URLSearchParams => {
    const sp = new URLSearchParams();
    if (periodMode === 'all') return sp;
    sp.set('pm', periodMode);
    if (periodMode === 'month') sp.set('mo', month);
    if (periodMode === 'year') sp.set('yr', year);
    if (periodMode === 'recent') sp.set('ry', String(recentYears));
    if (periodMode === 'season') sp.set('sn', seasonSel);
    if (periodMode === 'custom') {
      if (start) sp.set('st', start);
      if (end) sp.set('en', end);
    }
    return sp;
  }, [periodMode, month, year, recentYears, seasonSel, start, end]);

  /** 기간 모드 → 실제 start/end 쿼리. */
  const periodQuery = useCallback((): URLSearchParams => {
    const q = new URLSearchParams();
    if (periodMode === 'month' && month) {
      const [s, e] = monthRange(month);
      q.set('start', s);
      q.set('end', e);
    } else if (periodMode === 'year' && year) {
      q.set('start', `${year}-01-01`);
      q.set('end', `${year}-12-31`);
    } else if (periodMode === 'recent') {
      const [s, e] = recentYearsRange(recentYears);
      q.set('start', s);
      q.set('end', e);
    } else if (periodMode === 'custom') {
      if (start) q.set('start', start);
      if (end) q.set('end', end);
    } else if (periodMode === 'season' && seasonSel) {
      // 날짜가 아니라 시즌 키로 보낸다 — 서버가 game_version 으로 판정한다.
      q.set('season', seasonSel);
    }
    return q;
  }, [periodMode, month, year, recentYears, start, end, seasonSel]);

  /**
   * 조회. 입력칸의 각 항목(식별코드 또는 닉네임)을 resolveToken 으로 해석한 뒤 실행.
   * 닉네임이 여러 명과 일치하면 칩을 띄우고 멈춘다 — 칩 선택 시 해당 항목만 바꿔 재실행.
   * setState 반영 전에 재실행할 수 있도록 override 인자를 받는다.
   */
  const run = useCallback(
    async (
      overrideId?: string,
      overrideIds?: string,
      overrideChar?: string,
      /** 모드까지 바꾸면서 바로 실행할 때 (setMode 는 다음 렌더에나 반영되므로 필요). */
      overrideMode?: Mode,
    ) => {
      const inputId = overrideId ?? id;
      const inputIds = overrideIds ?? ids;
      const charFilter = overrideChar !== undefined ? overrideChar : charSel;
      const runMode = overrideMode ?? mode;
      setLoading(true);
      setError('');
      setResults([]);
      setSearchMsg('');
      try {
        if (runMode === 'single') {
          const tok = inputId.trim();
          if (!tok) throw new Error(t('needInput'));
          const r = await resolveToken(tok);
          if ('error' in r) throw new Error(r.error);
          if ('choices' in r) {
            setPendingToken(tok);
            setResultsMode('replace');
            setResults(r.choices);
            setSearchMsg(t('multiFound')(tok));
            return;
          }
          if (r.id !== tok) setId(r.id); // 닉네임 → 찾은 식별코드를 입력칸에 반영
          const q = periodQuery();
          if (charFilter) q.set('char', charFilter);
          let res = await fetch(`/api/replays/${encodeURIComponent(r.id)}?${q}`);

          // 표기만 보고 식별코드로 넘겼는데 없는 코드였다면 닉네임으로 다시 해석한다.
          // 12자 영숫자 닉네임은 표기가 식별코드와 완전히 겹쳐 사전 판별이 불가능하다.
          // 판정이 빗나가도 조회가 404 로 끝나지 않게 하는 안전망.
          if (res.status === 404 && r.guess) {
            const alt = await resolveToken(tok, { forceSearch: true });
            if ('choices' in alt) {
              setPendingToken(tok);
              setResultsMode('replace');
              setResults(alt.choices);
              setSearchMsg(t('multiFound')(tok));
              return;
            }
            // 양쪽 다 실패 — 한쪽 메시지만 보이면 원인을 오해하므로 둘 다 밝힌다
            if ('error' in alt) throw new Error(t('noMatch')(tok));
            setId(alt.id);
            res = await fetch(`/api/replays/${encodeURIComponent(alt.id)}?${q}`);
          }

          const data = await readJson<PlayerResponse>(res);
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setSingle(data);
          setCompare(null);
          // 공유 URL 로 복원된 탭은 유지하되, 이 결과에 없는 탭이면 첫 탭으로
          setActiveTab((prev) =>
            data.tabs.some((tb) => tb.key === prev) ? prev : (data.tabs[0]?.key ?? ''),
          );
          pushRecent([{ id: data.polarisId, name: data.myName || data.polarisId }]);
        } else {
          // 닉네임에 공백이 올 수 있으므로 쉼표로만 구분한다
          const tokens = inputIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (tokens.length < 2) throw new Error(t('needTwo'));
          const resolved: string[] = [];
          for (const tok of tokens) {
            const r = await resolveToken(tok);
            if ('error' in r) throw new Error(r.error);
            if ('choices' in r) {
              setPendingToken(tok);
              setResultsMode('replace');
              setResults(r.choices);
              setSearchMsg(t('multiFound')(tok));
              return;
            }
            resolved.push(r.id);
          }
          const joined = resolved.join(', ');
          if (joined !== inputIds.trim()) setIds(joined); // 해석된 식별코드로 입력칸 갱신
          const q = periodQuery();
          q.set('ids', resolved.join(','));
          const res = await fetch(`/api/compare?${q}`);
          const data = await readJson<CompareResponse>(res);
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setCompare(data);
          setSingle(null);
          // 누른 횟수가 아니라 성사된 횟수를 센다 — 오타로 실패한 시도까지 세면
          // '이 기능이 쓰이나'라는 물음에 답이 안 된다.
          gaEvent('compare_run');
          // 단일 모드와 동일하게 — 공유 URL 의 tab= 이 조회 완료로 덮이지 않게 보존
          setActiveTab((prev) =>
            data.tabs.some((tb) => tb.key === prev) ? prev : (data.tabs[0]?.key ?? ''),
          );
          pushRecent(data.players.map((pl) => ({ id: pl.polarisId, name: pl.name })));
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, id, ids, charSel, periodQuery, lang, inclHistory],
  );

  /** 캐릭터 칩 선택 → 그 캐릭터 경기만으로 전 탭 재집계 (''=전체). */
  const pickChar = (c: string) => {
    setCharSel(c);
    run(undefined, undefined, c);
  };

  /**
   * 기간(시즌·월·연·직접입력)을 바꾸면 **자동으로 다시 조회한다.**
   *
   * 예전에는 S2 를 눌러도 화면이 그대로라 조회 버튼을 또 눌러야 했다.
   * 버튼을 눌렀는데 아무 일도 안 일어나면 고장으로 보인다.
   *
   * 주의한 것들:
   *  - 조회 결과가 없으면(첫 조회 전) 아무것도 하지 않는다. 빈 입력으로 요청이 나간다.
   *  - 400ms 묶어서 보낸다. 직접입력은 시작일·종료일을 연달아 고르는데,
   *    그때마다 조회하면 요청이 두 번 나간다.
   *  - 이미 조회 중이면 건너뛴다(loadingRef — 타임아웃 안에서 loading 은 옛 값이다).
   */
  const loadingRef = useRef(false);
  loadingRef.current = loading;
  const periodSig = `${periodMode}|${month}|${year}|${recentYears}|${seasonSel}|${start}|${end}`;
  const periodFirstRef = useRef(true);
  useEffect(() => {
    if (periodFirstRef.current) {
      periodFirstRef.current = false;
      return;
    }
    if (mode === 'single' ? !single : !compare) return;
    const t = setTimeout(() => {
      if (!loadingRef.current) run();
    }, 400);
    return () => clearTimeout(t);
    // periodSig 하나만 본다 — run/single 을 넣으면 조회할 때마다 다시 조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodSig]);

  /**
   * 표의 '나와 비교' 를 눌렀을 때 — **비교 목록에 담기만 한다.**
   *
   * 예전에는 곧바로 비교 조회로 넘어갔는데, 보던 상대전적 표가 사라지고
   * 한 명하고만 비교할 수 있었다. 표를 그대로 둔 채 여러 명을 골라 담고,
   * 다 고르면 새 창에서 열거나 복사해 쓰는 편이 실제 흐름에 맞는다.
   */
  const addPick = (oppPolaris: string, oppName: string) => {
    const me = single?.polarisId;
    if (!me || !oppPolaris || me === oppPolaris) return;
    const label = oppName ? `${oppName} (${oppPolaris})` : oppPolaris;
    if (picked.some((p) => p.id === oppPolaris)) {
      setPickMsg(t('already')(oppName || oppPolaris));
      return;
    }
    // 서버 상한이 4명이고 그중 한 자리는 '나'가 쓴다
    if (picked.length + 1 >= MAX_COMPARE) {
      setPickMsg(t('pickFull')(MAX_COMPARE));
      return;
    }
    setPicked((prev) => [...prev, { id: oppPolaris, name: oppName }]);
    setPickMsg(t('added')(label));
  };

  /** 표의 '나와 비교' 버튼이 이미 담긴 행을 알아보는 데 쓴다. */
  const pickedSet = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);

  /** 비교 목록 = 나 + 고른 상대들. 복사·새 창 양쪽이 같은 값을 쓴다. */
  const pickedIds = single ? [single.polarisId, ...picked.map((p) => p.id)] : [];
  const pickedText = pickedIds.join(', ');

  const copyPicked = async () => {
    try {
      await navigator.clipboard.writeText(pickedText);
      setPickMsg(t('copied'));
    } catch {
      // 클립보드 권한이 없거나 http 인 환경 — 입력칸을 직접 고르게 안내한다
      setPickMsg(t('copyFail'));
    }
  };

  /** 새 창에서 비교 — 지금 화면(상대전적)을 유지한 채 결과를 따로 본다. */
  const openCompare = () => {
    if (!single || picked.length === 0) return;
    const sp = periodShareParams();
    sp.set('ids', pickedIds.join(','));
    window.open(`/?${sp}`, '_blank', 'noopener');
  };

  // ── 공유 URL: 조회 상태(모드·기간·캐릭터·탭)를 주소에 싣고, 열릴 때 복원한다 ──
  // 복원은 2단계: (1) 파라미터 → 상태 반영, (2) 상태가 커밋된 다음 렌더에서 run().
  // (같은 이펙트에서 바로 run() 하면 periodQuery 가 이전 상태를 캡처하기 때문)
  const bootRef = useRef(false);
  const [bootRun, setBootRun] = useState(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    // /player/<식별코드> 로 들어온 경우 경로에서 읽는다 (쿼리 ?id= 도 계속 지원)
    const m = window.location.pathname.match(/^\/player\/([^/?#]+)/);
    const qid = m ? decodeURIComponent(m[1]).replace(/[^A-Za-z0-9]/g, '') : sp.get('id');
    const qids = sp.get('ids');
    if (!qid && !qids) return;
    if (qids) {
      setMode('compare');
      setIds(qids.split(',').join(', '));
    } else if (qid) {
      setId(qid);
    }
    const pmRaw = sp.get('pm');
    // 예전 공유 링크는 시즌을 pm=s1|s2|s3 로 실었다. 계속 열리게 받아준다.
    if (pmRaw && /^s\d+$/i.test(pmRaw)) {
      setPeriodMode('season');
      setSeasonSel(pmRaw.toUpperCase());
    } else {
      const pm = pmRaw as PeriodMode | null;
      if (pm && ['all', 'month', 'year', 'recent', 'custom', 'season'].includes(pm)) {
        setPeriodMode(pm);
        if (pm === 'month' && sp.get('mo')) setMonth(sp.get('mo')!);
        if (pm === 'year' && sp.get('yr')) setYear(sp.get('yr')!);
        if (pm === 'recent' && sp.get('ry') && [2, 3, 4].includes(Number(sp.get('ry'))))
          setRecentYears(Number(sp.get('ry')) as RecentYears);
        if (pm === 'season' && sp.get('sn')) setSeasonSel(sp.get('sn')!);
        if (pm === 'custom') {
          if (sp.get('st')) setStart(sp.get('st')!);
          if (sp.get('en')) setEnd(sp.get('en')!);
        }
      }
    }
    if (sp.get('ch')) setCharSel(sp.get('ch')!);
    if (sp.get('tab')) setActiveTab(sp.get('tab')!);
    // 값을 대조해서 넣는다 — 주소는 남이 고칠 수 있고, 모르는 값이 들어오면
    // 화면 상태가 어느 버튼과도 안 맞는 자리에 걸린다.
    if (sp.get('rv') === 'opp') setRoundView('opp');
    if (sp.get('tz') === 'kst') setTzView('kst');
    if (sp.get('sv') === 'version') setSeasonView('version');
    setBootRun(true);
  }, []);

  useEffect(() => {
    if (!bootRun) return;
    setBootRun(false);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootRun]);

  // 조회 결과가 있는 동안 상태 변화를 주소창에 반영 (replaceState — 히스토리 오염 없음)
  useEffect(() => {
    // 현재 모드의 결과가 있을 때만 쓴다 — 결과 표시 중 모드만 토글하면
    // (mode 는 바뀌었는데 그 모드의 결과는 없음) URL 의 id/ids 가 지워지는 것을 방지
    if (mode === 'single' ? !single : !compare) return;
    const sp = periodShareParams();
    // 단일은 /player/<식별코드> 를 기본 주소로 쓴다 (wavu·tknow 와 같은 형식).
    // 비교는 대상이 여럿이라 쿼리로 유지한다.
    const single1 = mode === 'single' && single;
    if (!single1 && mode === 'compare' && compare)
      sp.set('ids', compare.players.map((p) => p.polarisId).join(','));
    if (periodMode !== 'all') {
      sp.set('pm', periodMode);
      if (periodMode === 'month') sp.set('mo', month);
      if (periodMode === 'year') sp.set('yr', year);
      if (periodMode === 'recent') sp.set('ry', String(recentYears));
      if (periodMode === 'season') sp.set('sn', seasonSel);
      if (periodMode === 'custom') {
        if (start) sp.set('st', start);
        if (end) sp.set('en', end);
      }
    }
    if (mode === 'single' && charSel) sp.set('ch', charSel);
    if (activeTab) sp.set('tab', activeTab);
    // 탭 안의 보기 전환도 싣는다. tab 을 실으면서 이걸 빼면, "라운드 탭 보라"는
    // 링크를 받은 사람이 **다른 표**를 보게 된다 — 상대 캐릭터별 라운드는 링크로
    // 짚어 보여주는 게 존재 이유라 특히 그렇다.
    // 기본값일 때는 싣지 않는다(pm 과 같은 방침) — 흔한 주소를 길게 만들지 않는다.
    if (roundView === 'opp') sp.set('rv', 'opp');
    if (tzView === 'kst') sp.set('tz', 'kst');
    if (seasonView === 'version') sp.set('sv', 'version');
    const qs = sp.toString();
    const path = single1
      ? `/player/${encodeURIComponent(single.polarisId)}`
      : '/';
    // ★ 제목을 replaceState 보다 **먼저** 바꾼다. 순서가 뒤집히면 안 된다.
    //
    // GA4 향상된 측정은 History API 변경을 감지해 그 시점의 document.title 을
    // 스냅샷한다. 예전에는 replaceState 가 먼저였고, GA 는 아직 안 바뀐 기본 제목
    // ('철권8 전적 통계 — …')을 /player/<id> 조회로 기록했다. 그 제목에는
    // '(식별코드)'가 없어서 관리자 화면의 이름 추출(lib/ga.ts)이 전부 빈칸이 됐다.
    // 실제로 145명 중 이름이 남은 건 직접 링크로 들어왔거나 탭을 눌러 이 effect 가
    // 한 번 더 돈 15명뿐이었다.
    if (single1) {
      const who = single.myName ? `${single.myName} (${single.polarisId})` : single.polarisId;
      document.title = `${who} — 철권8 전적 통계 | Tekken 8 Stats`;
    }

    const url = qs ? `${path}?${qs}` : path;

    // 주소가 그대로면 아무것도 하지 않는다. replaceState 는 값이 같아도 기록 이벤트를
    // 발생시켜서, 상태만 흔들리고 주소는 그대로인 경우에 페이지뷰가 헛으로 쌓인다.
    const here = window.location.pathname + window.location.search;
    if (here !== url) window.history.replaceState(null, '', url);

    // ── 조회 수는 여기서 센다 ──────────────────────────────────────
    // 페이지뷰(향상된 측정)는 탭·필터를 만질 때마다 올라가서 '조회 수'가 못 된다.
    // 대상이 바뀐 순간에만 이벤트를 하나 보내고, 관리자 집계는 이걸 쓴다.
    // 향상된 측정 자체는 GA4 관리화면 설정이라 코드로 끌 수 없어서, 끄는 대신
    // 정확한 신호를 따로 만든다 — 페이지뷰는 '탐색 깊이'로 계속 쓸모가 있다.
    const target = single1 ? `p:${single.polarisId}` : `c:${sp.get('ids') ?? ''}`;
    if (target !== lastLookupRef.current) {
      lastLookupRef.current = target;
      // document.title 을 바꾼 뒤에 보낸다 — GA 는 이벤트 시점의 제목을 붙이고,
      // 관리자 화면은 그 제목에서 이름을 뽑는다(lib/ga.ts 의 marker 주석 참조).
      // page_path 는 넣지 않는다 — GA4 파라미터가 아니고(UA 시절 이름),
      // pagePath 측정기준은 page_location 에서 파생된다. 바로 위에서 주소를
      // 이미 맞춰 뒀으므로 location.href 가 곧 이 조회의 주소다.
      window.gtag?.('event', 'player_lookup', {
        page_title: document.title,
        page_location: window.location.href,
      });
    }
  }, [
    single,
    compare,
    mode,
    activeTab,
    charSel,
    periodMode,
    month,
    year,
    start,
    end,
    seasonSel,
    roundView,
    tzView,
    seasonView,
  ]);

  /** 비교 목록에 식별코드 추가 (중복 제외). */
  const appendToIds = (fid: string, name?: string) => {
    setIds((prev) => {
      const list = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.includes(fid)) {
        setSearchMsg(t('already')(name ?? fid));
        return prev;
      }
      setSearchMsg(t('added')(name ? `${name} (${fid})` : fid));
      return [...list, fid].join(', ');
    });
  };

  /**
   * 후보 칩 선택.
   * - replace: 조회 중 모호했던 항목을 바꿔 즉시 재조회
   * - append: 비교 목록에 덧붙이기만 (계속 검색해서 더 추가할 수 있게 조회는 안 함)
   */
  // 고정해둔 계정을 복원 직후 한 번 자동 조회한다.
  useEffect(() => {
    const target = autoRunRef.current;
    if (!target) return;
    autoRunRef.current = null;
    run(target);
  }, [run]);

  /** 최근 조회 칩 → 모드에 맞게 입력칸 채우기 (단일=교체, 비교=덧붙임). */
  const fillFromChip = (f: Favorite) => {
    if (mode === 'single') {
      setId(f.id);
      setCharSel('');
    } else {
      appendToIds(f.id, f.name);
    }
  };

  const pickResult = (f: Favorite) => {
    setResults([]);
    setSearchMsg('');
    if (resultsMode === 'append') {
      appendToIds(f.id, f.name);
      return;
    }
    if (mode === 'single') {
      setId(f.id);
      run(f.id);
    } else {
      const newIds = ids
        .split(',')
        .map((s) => (s.trim() === pendingToken ? f.id : s.trim()))
        .filter(Boolean)
        .join(', ');
      setIds(newIds);
      run(undefined, newIds);
    }
  };

  /** 비교 모드 보조 검색: 닉네임/ID 를 해석해 목록에 추가. 여러 명이면 칩으로 고르게. */
  const searchAndAdd = async () => {
    const tok = addQ.trim();
    if (!tok) return;
    setAddBusy(true);
    setSearchMsg('');
    setResults([]);
    try {
      const r = await resolveToken(tok);
      if ('error' in r) {
        setSearchMsg(r.error);
      } else if ('choices' in r) {
        setResultsMode('append');
        setResults(r.choices);
        setSearchMsg(t('addPick')(tok));
      } else {
        appendToIds(r.id, r.name);
        setAddQ('');
      }
    } finally {
      setAddBusy(false);
    }
  };

  const xlsxHref = (() => {
    const q = periodQuery();
    if (mode === 'single' && single) {
      if (charSel) q.set('char', charSel);
      return `/api/xlsx/${encodeURIComponent(single.polarisId)}?${q}`;
    }
    if (mode === 'compare' && compare) {
      q.set('ids', compare.players.map((p) => p.polarisId).join(','));
      return `/api/xlsx/compare?${q}`;
    }
    return null;
  })();

  const tabs = mode === 'single' ? single?.tabs : compare?.tabs;
  const current = tabs?.find((t) => t.key === activeTab) ?? tabs?.[0];
  const chartOnly = current ? CHART_ONLY_TABS.has(current.key) : false;

  // wavu 가 막혀 지난 사본을 보고 있는가. null 이면 정상(신선한 데이터).
  const staleMinutes = (() => {
    const c = mode === 'single' ? single?.cache : compare?.cache;
    if (!c?.stale) return null;
    const at = (c as { fetchedAt?: number }).fetchedAt;
    return at ? Math.max(1, Math.round((Date.now() - at) / 60000)) : 10;
  })();

  // 엑셀 예상 소요 — 실측(30,233경기 ≈ 27.6초)에서 뽑은 대략치. 정확할 필요는 없고
  // "금방 끝날 일이 아니다"를 미리 알리는 게 목적이다.
  const xlsxGames =
    mode === 'single'
      ? (single?.recordCount ?? 0)
      : (compare?.players.reduce((s, p) => s + p.count, 0) ?? 0);
  const xlsxEtaSec = Math.round(xlsxGames / 1100);

  // 시즌 목록 — 조회 결과가 있으면 그것이 정답(데이터에서 파생), 없으면 표시용 기본값.
  const seasons: SeasonInfo[] =
    (mode === 'single' ? single?.seasons : compare?.seasons) ?? [];
  const seasonList = seasons.length ? seasons.map((s) => s.key) : FALLBACK_SEASONS;

  // 일별 탭: 조회 범위가 넓으면 월/분기/반기/연 집계 단위 제공
  const dailyOpts = current?.key === 'daily' ? granOptions(current, seasons) : null;
  const effGran: DailyGran =
    dailyOpts && dailyOpts.includes(dailyGran) ? dailyGran : 'day';

  // 상대전적 탭: 최소 경기수 → 만난 시기 → 강점/약점 정렬 → 상위 N명
  // (자르기는 정렬 뒤에 해야 '강점 상위 10명'이 뜻대로 나온다)
  const h2hOpts = current?.key === 'h2h' ? h2hMinOptions(current) : null;
  const effH2hMin = h2hOpts && h2hOpts.includes(h2hMin) ? h2hMin : 0;
  const h2hFiltered =
    current?.key === 'h2h' && h2hOpts
      ? filterH2h(current, effH2hMin, h2hDays, h2hView)
      : null;
  const h2hTopOpts = h2hFiltered ? h2hTopOptions(h2hFiltered.rows.length) : null;
  const effH2hTop = h2hTopOpts?.includes(h2hTop) ? h2hTop : 0;

  // 현지 시각 표는 한 명 모드에서만, 그리고 KST 와 실제로 다를 때만 존재한다.
  const localTimeTab = mode === 'single' ? (single?.localTime ?? null) : null;
  const tz = mode === 'single' ? single?.timezone : undefined;

  // 상대 캐릭터별 라운드 표도 한 명 모드에서만 온다 (비교 모드에는 없다).
  const roundOppTab = mode === 'single' ? (single?.roundByOpp ?? null) : null;

  // 버전별 시즌 표도 한 명 모드 전용. 버전이 하나뿐이면(=한 패치 안에서만 뛴
  // 사람) 전환해봐야 같은 한 줄이라 전환 자체를 안 그린다.
  const seasonVersionTab =
    mode === 'single' && (single?.seasonByVersion?.rows.length ?? 0) > 1
      ? (single?.seasonByVersion ?? null)
      : null;

  const displayTab =
    current?.key === 'daily'
      ? rollupDaily(current, effGran, seasons)
      : h2hFiltered
        ? effH2hTop > 0
          ? { ...h2hFiltered, rows: h2hFiltered.rows.slice(0, effH2hTop) }
          : h2hFiltered
        : current?.key === 'time'
          ? // 현지 시각 표는 서버가 같이 보내준 것으로 갈아끼운다 (재조회 없음).
            pickUnit(
              tzView === 'local' && localTimeTab ? localTimeTab : current,
              timeView,
            )
          : // 라운드도 같은 방식 — 상대 캐릭터별 표로 갈아끼운다.
            current?.key === 'round' && roundView === 'opp' && roundOppTab
            ? roundOppTab
            : // 시즌도 같은 방식 — game_version 별 표로 갈아끼운다.
              current?.key === 'season' && seasonView === 'version' && seasonVersionTab
              ? seasonVersionTab
              : current;

  // 비교 표(캐릭터·상대 캐릭·공통 상대)에서 표본이 얇은 행을 걸러낼 수 있는가.
  // 실측: 39행 중 3행이 5경기 미만이었고 그중 둘이 '3전 100%' 였다.
  const thinCols = displayTab
    ? displayTab.columns
        .map((c, i) => (c.endsWith('_games') ? i : -1))
        .filter((i) => i >= 0)
    : [];
  const thinnable = mode === 'compare' && thinCols.length >= 2;
  const shownTab =
    thinnable && hideThin && displayTab
      ? {
          ...displayTab,
          // 아무도 기준을 못 채운 행만 숨긴다. 한쪽만 많이 한 매치업은
          // '상대는 안 한다'는 정보 자체가 비교거리라 남긴다.
          rows: displayTab.rows.filter((r) =>
            thinCols.some((i) => Number(r[i]) >= COMPARE_MIN_GAMES),
          ),
        }
      : displayTab;

  // 오늘의 요약 (단일 조회): 일별 탭에서 오늘(KST) 행 합산 + 전적 목록 첫 행에서 현재 레이팅
  const summary = useMemo(() => {
    if (!single) return null;
    const daily = single.tabs.find((tb) => tb.key === 'daily');
    const matches = single.tabs.find((tb) => tb.key === 'matches');
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    let w = 0;
    let l = 0;
    let delta = 0;
    for (const r of daily?.rows ?? []) {
      if (r[0] === today) {
        w += Number(r[3]);
        l += Number(r[4]);
        delta += Number(r[6]);
      }
    }
    const lastRow = matches?.rows[0];
    return {
      w, l, delta,
      games: w + l,
      rating: lastRow ? Number(lastRow[4]) : null,
      lastDt: lastRow ? String(lastRow[0]).slice(0, 10) : null,
    };
  }, [single]);

  /**
   * 요약 카드 아래 한 줄 — **마지막 세션**을 기준으로 지금 컨디션을 말한다.
   *
   * 세션 탭은 (세션 × 캐릭터)로 쪼개져 있어서 같은 세션 라벨의 행을 다 합쳐야
   * 그 세션의 진짜 성적이 된다. 최신 세션이 첫 행이다(서버가 최신 우선 정렬).
   */
  const condition = useMemo(() => {
    if (!single || !summary) return null;
    const sess = single.tabs.find((tb) => tb.key === 'sessions');
    const first = sess?.rows[0];
    if (!first) return null;

    const label = String(first[0]);
    let games = 0;
    let wins = 0;
    let losses = 0;
    let delta = 0;
    for (const r of sess!.rows) {
      if (String(r[0]) !== label) continue; // 같은 세션의 캐릭터별 행들
      games += Number(r[4]);
      wins += Number(r[5]);
      losses += Number(r[6]);
      delta += Number(r[8]);
    }

    // 마지막 경기로부터 며칠 지났나 (KST 날짜끼리)
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000);
    const last = summary.lastDt ? new Date(`${summary.lastDt}T00:00:00Z`) : null;
    const days = last
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(todayKst.toISOString().slice(0, 10)) - last.getTime()) / 86400000,
          ),
        )
      : 0;

    const kind: Condition =
      summary.games > 0 ? 'today'
      : days >= 7 ? 'rusty'
      : delta > 0 ? 'endedWell'
      : delta < 0 ? 'endedBadly'
      : 'endedFlat';

    const facts: ConditionFacts =
      kind === 'today'
        ? { days, games: summary.games, wins: summary.w, losses: summary.l, delta: summary.delta }
        : { days, games, wins, losses, delta };

    // 씨앗: 조회가 같으면 문구도 같게. 세션 성적이 바뀌면 문구도 바뀐다.
    const seed = single.recordCount + games * 3 + Math.abs(delta) + days * 11;
    return pickCondition(kind, lang, seed, facts);
  }, [single, summary, lang]);

  /** 비교 결과 맨 위 한 줄 — 현재 순위와 최근 흐름이 엇갈리는지가 핵심이다. */
  const compareQuip = useMemo(() => {
    if (mode !== 'compare' || !compare || !showQuips) return null;
    const f = compareFacts(compare.tabs);
    if (!f) return null;
    const tone: SummaryTone =
      f.ratingLeader !== f.formLeader ? 'flipping'
      : f.ratingGap < 50 ? 'tight'
      : f.ratingGap >= 300 ? 'blowout'
      : 'sameLeader';
    const seed = f.ratingGap * 3 + compare.players.reduce((s, p) => s + p.count, 0);
    return pickCompareSummary(tone, lang, seed, {
      leader: f.ratingLeader,
      gap: f.ratingGap,
      formLeader: f.formLeader,
      players: compare.players.length,
    });
  }, [mode, compare, showQuips, lang]);

  /**
   * 맞대결 신호 — **서로 붙은 기록이 있을 때만** 개요 위에 한 줄.
   *
   * '맞대결 상세'는 탭 여덟 개 중 하나라 있는 줄도 모르고 지나친다. 표를 여기 옮기는 게
   * 아니라 **있다는 것만 알리고 그 탭으로 보낸다.** 없으면 아예 안 그린다 —
   * compare.ts 가 기록 없는 쌍의 탭 자체를 감추는 것과 같은 기준이다.
   *
   * 농담이 아니라 사실이라 `showQuips`(한 줄 멘트 체크박스)와 무관하게 나온다.
   */
  const h2hHint = useMemo(() => {
    if (mode !== 'compare' || !compare) return null;
    const h2h = compare.tabs.find((tb) => tb.key === 'h2h');
    const detail = compare.tabs.find((tb) => tb.key === 'h2h_detail');
    if (!h2h || !detail || h2h.rows.length === 0) return null;
    const c = h2h.columns;
    const [ai, bi, gi, awi, bwi] = ['player_a', 'player_b', 'games', 'a_wins', 'b_wins'].map(
      (k) => c.indexOf(k),
    );
    if ([ai, bi, gi, awi, bwi].some((i) => i < 0)) return null;
    // 가장 많이 붙은 쌍 하나만 말한다 — 4명이면 쌍이 여섯까지 나오는데
    // 다 나열하면 '한 줄'이 아니라 표가 된다. 나머지는 개수로만 밝힌다.
    const row = [...h2h.rows].sort((x, y) => Number(y[gi]) - Number(x[gi]))[0];
    return {
      pairs: h2h.rows.length,
      a: String(row[ai]),
      b: String(row[bi]),
      games: Number(row[gi]),
      aWins: Number(row[awi]),
      bWins: Number(row[bwi]),
    };
  }, [mode, compare]);

  /** 탭별 한 줄 — 맞대결 / 캐릭터 폭 / 공통 상대. 해당 탭에서만 보인다. */
  const tabQuip = useMemo(() => {
    if (mode !== 'compare' || !compare || !showQuips || !current) return null;

    if (current.key === 'h2h' && current.rows.length > 0) {
      const c = current.columns;
      const [ai, bi, gi, awi, wri] = ['player_a', 'player_b', 'games', 'a_wins', 'a_winrate(%)'].map((k) => c.indexOf(k));
      // 가장 많이 붙은 쌍 하나만 말한다 — 여러 쌍을 나열하면 멘트가 아니라 표가 된다
      const row = [...current.rows].sort((x, y) => Number(y[gi]) - Number(x[gi]))[0];
      const games = Number(row[gi]);
      const aWr = Number(row[wri]);
      const aLeads = aWr >= 50;
      const facts = {
        leader: String(row[aLeads ? ai : bi]),
        loser: String(row[aLeads ? bi : ai]),
        games,
        wr: aLeads ? aWr : Math.round((100 - aWr) * 100) / 100,
      };
      const tone: H2hTone =
        games < 10 ? 'few' : facts.wr >= 65 ? 'dominant' : facts.wr >= 55 ? 'edge' : 'even';
      return pickH2hQuip(tone, lang, games + Number(row[awi]), facts);
    }

    if (current.key === 'chars') {
      const f = compareFacts(compare.tabs);
      if (!f || f.charCounts.length < 2) return null;
      const most = f.charCounts[0];
      const least = f.charCounts[f.charCounts.length - 1];
      const tone: CharsTone =
        most.v >= least.v * 2 ? 'wide' : most.v <= 5 ? 'narrow' : 'similar';
      return pickCharsQuip(tone, lang, most.v * 7 + least.v, {
        most: most.name,
        mostN: most.v,
        least: least.name,
        leastN: least.v,
      });
    }

    if (current.key === 'vs_common' && current.rows.length > 0) {
      // 공통 상대 전체에서 평균 승률이 가장 높은 사람 (표본 가중 없이 단순 평균)
      const wrCols = current.columns
        .map((c, i) => (c.endsWith('_wr(%)') ? i : -1))
        .filter((i) => i >= 0);
      if (wrCols.length < 2) return null;
      const avgs = wrCols.map((i) => ({
        name: current.columns[i].replace(/_wr\(%\)$/, ''),
        v: current.rows.reduce((s, r) => s + Number(r[i]), 0) / current.rows.length,
      }));
      avgs.sort((a, b) => b.v - a.v);
      return pickCommonQuip(lang, current.rows.length, {
        count: current.rows.length,
        leader: avgs[0].name,
      });
    }
    return null;
  }, [mode, compare, showQuips, current, lang]);

  // 닉네임이 그대로 파일명이 된다 — 경로 구분자·제어문자·보이지 않는 문자가
  // 섞여 들어오므로 반드시 다듬는다(safeFileName 주석 참조).
  const baseName = safeFileName(
    mode === 'single'
      ? single?.myName || single?.polarisId || 'tekken'
      : compare?.players.map((p) => p.name).join('_vs_') || 'compare',
  );

  const downloadCsv = () => {
    if (!displayTab || dlBusy) return;
    gaEvent('download_csv');
    setDlBusy(true);
    setDlMsg('');
    try {
      downloadBlob(
        toCsv(displayTab, lang),
        'text/csv;charset=utf-8',
        `${baseName}_${displayTab.key}.csv`,
      );
    } catch (e) {
      setDlMsg(`${t('dlFailed')} (${(e as Error).message})`);
    } finally {
      setDlBusy(false);
    }
  };
  /**
   * 전체 결과를 JSON 한 파일로.
   *
   * 들여쓰기를 뺐다. 21,197경기 기준 2.73MB → 1.46MB 로 절반이 된다(실측).
   * 기계가 읽는 파일이라 사람이 볼 들여쓰기가 필요 없고, 큰 payload 에서
   * 문자열+Blob 두 벌을 들고 있는 순간의 메모리 피크가 그만큼 낮아진다.
   *
   * busy 를 두는 이유는 속도가 아니다(직렬화는 14ms 다). 예전에는 다운로드가
   * **조용히 실패**해서 사용자가 반복해서 눌렀고, 누를 때마다 수 MB 가 새로
   * 할당됐다. 그 반복이 탭을 죽인다.
   */
  const downloadJson = () => {
    if (!tabs || dlBusy) return;
    gaEvent('download_json');
    const payload = mode === 'single' ? single : compare;
    if (!payload) return;
    setDlBusy(true);
    setDlMsg('');
    try {
      downloadBlob(JSON.stringify(payload), 'application/json', `${baseName}_stats.json`);
    } catch (e) {
      setDlMsg(`${t('dlFailed')} (${(e as Error).message})`);
    } finally {
      setDlBusy(false);
    }
  };

  /**
   * 엑셀 다운로드.
   *
   * 예전에는 <a href> 였다. 그러면 30,233경기(실측 27.6초) 같은 경우 클릭 후
   * 30초 가까이 **아무 표시도 없이** 브라우저만 멈춰 있고, 서버가 429/504 를 줘도
   * 오류 JSON 이 파일로 저장돼 버렸다. fetch 로 바꿔 상태와 오류를 화면에 낸다.
   */
  const downloadXlsx = async () => {
    if (!xlsxHref || xlsxBusy) return;
    gaEvent('download_xlsx');
    setXlsxBusy(true);
    setXlsxMsg('');
    try {
      const res = await fetch(xlsxHref);
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      // 서버가 RFC 5987 로 실어 보낸 한글 파일명을 그대로 쓴다
      const cd = res.headers.get('content-disposition') ?? '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = m ? decodeURIComponent(m[1]) : `${baseName}.xlsx`;
      a.rel = 'noopener';
      a.style.display = 'none';
      // downloadBlob 과 같은 이유로 문서에 붙이고, 해제는 미룬다.
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 10_000);
    } catch (e) {
      setXlsxMsg((e as Error).message);
    } finally {
      setXlsxBusy(false);
    }
  };

  const yearOptions = (() => {
    const now = new Date().getFullYear();
    const ys: string[] = [];
    for (let y = now; y >= 2024; y--) ys.push(String(y)); // 철권8 데이터는 2024-03부터
    return ys;
  })();

  /**
   * 메인(초기 화면)으로 — 결과를 닫고 맨 위로. 입력값과 즐겨찾기는 유지.
   *
   * 주소도 루트로 되돌린다. 조회 중에는 주소가 /player/<식별코드> 로 바뀌어 있는데,
   * 결과만 닫고 주소를 그대로 두면 화면은 초기 상태인데 새로고침하면 그 사람이
   * 다시 조회된다 — 눈에 보이는 것과 주소가 어긋난다.
   *
   * replaceState 를 쓰는 이유: 히스토리를 늘리지 않으려는 것이다(주소창 동기화와 같은 방침).
   * 전체 새로고침(location.href)이 아니라서 입력칸과 최근 조회가 살아 있다.
   */
  const goHome = () => {
    setSingle(null);
    setCompare(null);
    setError('');
    setActiveTab('');
    // 다음에 같은 사람을 다시 조회하면 그것도 한 건이다. 안 비우면 안 세어진다.
    lastLookupRef.current = '';
    setPicked([]);
    setPickMsg('');
    // 여기도 제목이 먼저다 (위 effect 의 주석 참조 — GA 가 변경 시점의 제목을 읽는다)
    document.title = '철권 전적 검색 — 철권8 랭크전 전적 통계 | Tekken 8 Stats';
    window.history.replaceState(null, '', '/');
    window.scrollTo({ top: 0 });
  };

  return (
    <main>
      <div className="titlebar">
        <h1>
          <button className="home-btn" onClick={goHome} title="Home">
            {t('title')}
          </button>
        </h1>
        <div className="lang-switch">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={lang === l.code ? 'on' : ''}
              onClick={() => {
                gaEvent('lang_switch');
                setLang(l.code);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* 제목줄과 조작줄을 가른다. 붙어 있으면 '철권8 전적 통계 [한국어]…[한 명]…'
          이 한 덩어리로 읽혀서 어디까지가 제목인지 눈이 못 잡는다. */}
      <hr className="head-rule" />

      {/* 넓으면 한 줄(모드 왼쪽 · 링크 오른쪽), 좁으면 두 줄로 세운다.
          링크를 자기 컨테이너로 뺐더니 모바일 줄바꿈은 잡혔는데 PC 에서 빈 줄이
          하나 생겼다 — 감싸는 컨테이너를 두어 방향만 바꾼다. */}
      <div className="head-row">
      <div className="mode-switch">
        <button
          className={mode === 'single' ? 'on' : ''}
          onClick={() => setMode('single')}
        >
          {t('single')}
        </button>
        <button
          className={mode === 'compare' ? 'on' : ''}
          onClick={() => setMode('compare')}
        >
          {t('compare')}
        </button>
      </div>

      {/* 바깥 링크는 자기 줄에 둔다. 모드 버튼과 같은 컨테이너에 있으면 폭이
          모자랄 때 링크 중 하나만 위로 딸려 올라간다(모바일에서 실제로 그랬다). */}
      <div className="link-row">
        <a
          className="tier-link"
          href="https://season-end-web.vercel.app/tekken-tier"
          target="_blank"
          rel="noreferrer"
          title={
            lang === 'ko'
              ? '시즌별 티어 분포 (상위 %)'
              : lang === 'ja'
                ? 'シーズン別ティア分布 (上位%)'
                : 'Rank distribution by season (top %)'
          }
        >
          {lang === 'ko' ? '철권 티어' : lang === 'ja' ? '鉄拳ティア' : 'Tekken Tier'}
        </a>
        {/* 잡기 풀기는 티어 분포와 다른 기능이라 버튼을 나눈다 —
            한 버튼에 묶여 있으면 어디로 가는지 눌러봐야 안다. */}
        <a
          className="tier-link"
          href="https://season-end-web.vercel.app/throwBreak"
          target="_blank"
          rel="noreferrer"
          title={
            lang === 'ko'
              ? '잡기 풀기 반응 연습 (1·2·양손)'
              : lang === 'ja'
                ? '投げ抜けの反応練習 (1・2・両手)'
                : 'Throw break reaction trainer'
          }
        >
          {lang === 'ko' ? '잡기 풀기 연습' : lang === 'ja' ? '投げ抜け練習' : 'Throw Break'}
        </a>
        <a
          className="tier-link"
          href="https://tekken8-tube.vercel.app/"
          target="_blank"
          rel="noreferrer"
          title={
            lang === 'ko'
              ? '캐릭터별 콤보·확정반격 영상 모음 (매시간 갱신)'
              : lang === 'ja'
                ? 'キャラ別コンボ・確定反撃動画まとめ (毎時更新)'
                : 'Combo and punish video guides by character (hourly)'
          }
        >
          {lang === 'ko' ? '철권8 영상모음' : lang === 'ja' ? '鉄拳8 動画' : 'Tekken 8 Tube'}
        </a>
      </div>
      </div>

      <div className="panel">
        {mode === 'single' ? (
          <>
            <label htmlFor="pid">{t('idOrNick')}</label>
            <div className="row id-row">
              <input
                id="pid"
                className="id-input"
                type="text"
                placeholder={t('idPlaceholder')}
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setCharSel('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button onClick={() => run()} disabled={loading}>
                {loading ? (elapsed ? t('queryingSec')(elapsed) : t('querying')) : t('query')}
              </button>
            </div>

            {/* 상대전적에서 눌러 담은 비교 목록.
                여기서 끝내지 않고 '복사'(여러 명 비교에 붙여넣기)와
                '즉시 비교'(새 창) 두 갈래를 준다 — 보던 표를 잃지 않게. */}
            {picked.length > 0 && (
              <div className="pick-box">
                <div className="pick-head">
                  <span className="ctl-label">
                    {t('pickLabel')(pickedIds.length, MAX_COMPARE)}
                  </span>
                  <button
                    className="ghost"
                    onClick={() => {
                      setPicked([]);
                      setPickMsg('');
                    }}
                  >
                    {t('clearBtn')}
                  </button>
                </div>
                <div className="pick-chips">
                  <span className="chip me">
                    {single?.myName || single?.polarisId} · {t('meLabel')}
                  </span>
                  {picked.map((p) => (
                    <span key={p.id} className="chip">
                      {p.name || p.id}
                      <button
                        className="chip-x"
                        title={t('remove')}
                        onClick={() =>
                          setPicked((v) => v.filter((x) => x.id !== p.id))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="row">
                  <input
                    className="pick-text"
                    readOnly
                    value={pickedText}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={t('pickTextLabel')}
                  />
                  <button className="ghost" onClick={copyPicked}>
                    {t('copyBtn')}
                  </button>
                  <button onClick={openCompare}>{t('compareNow')}</button>
                </div>
                {pickMsg && <p className="hint">{pickMsg}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <label htmlFor="pids">{t('idsLabel')}</label>
            <div className="row id-row">
              <input
                id="pids"
                type="text"
                placeholder="ex) ID, ID"
                value={ids}
                onChange={(e) => setIds(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && run()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button onClick={() => run()} disabled={loading}>
                {loading ? (elapsed ? t('queryingSec')(elapsed) : t('querying')) : t('query')}
              </button>
            </div>

            <label htmlFor="addq" style={{ marginTop: '0.8rem' }}>
              {t('addLabel')}
            </label>
            <div className="row id-row">
              <input
                id="addq"
                className="id-input"
                type="text"
                placeholder={t('addPlaceholder')}
                value={addQ}
                onChange={(e) => setAddQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !addBusy && searchAndAdd()}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="ghost" onClick={searchAndAdd} disabled={addBusy}>
                {addBusy ? t('searching') : t('addBtn')}
              </button>
            </div>
          </>
        )}

        <label className="hl-toggle" style={{ marginTop: '0.6rem' }}>
          <input
            type="checkbox"
            checked={inclHistory}
            onChange={(e) => setInclHistory(e.target.checked)}
          />
          {t('historyOpt')}
        </label>
        <label className="hl-toggle">
          <input
            type="checkbox"
            checked={showQuips}
            onChange={(e) => setShowQuips(e.target.checked)}
          />
          {t('quipsOpt')}
        </label>
        <label className="hl-toggle">
          <input
            type="checkbox"
            checked={showCoach}
            onChange={(e) => setShowCoach(e.target.checked)}
          />
          {t('coachOpt')}
        </label>

        {/* 고정된 계정은 **한 줄로만** 밝힌다.
            칩마다 버튼을 붙이면 버튼이 여럿인 줄이 되어 i18n.ts 의
            "아이콘은 두지 않는다 — 시선이 분산되고 줄바꿈을 예측할 수 없다" 와
            같은 문제가 생긴다. 고정하는 동작은 조회 결과 쪽에 둔다 —
            방금 본 사람을 고정하는 게 실제 흐름이다. */}
        {pinned && (
          <p className="pin-line">
            {t('pinnedLabel')} <b>{pinned.name}</b>
            <button className="ghost small" onClick={() => setPinned(null)}>
              {t('unpin')}
            </button>
          </p>
        )}

        {recent.length > 0 && (
          <div className="fav-chips recent-chips">
            <span className="hint" style={{ margin: 0 }}>{t('recent')}:</span>
            {recent.map((r) => (
              <button
                key={r.id}
                className="chip"
                title={r.id}
                onClick={() => fillFromChip(r)}
              >
                {r.name}
              </button>
            ))}
            <button
              className="ghost small"
              onClick={() => {
                setRecent([]);
                setPinned(null);
                try {
                  localStorage.removeItem('tkwavu_recent');
                } catch {
                  /* ignore */
                }
              }}
            >
              {t('clearBtn')}
            </button>
          </div>
        )}

        {searchMsg && <p className="hint">{searchMsg}</p>}
        {results.length > 0 && (
          <div className="fav-chips">
            {results.map((r) => (
              <button
                key={r.id}
                className="chip"
                title={r.id}
                onClick={() => pickResult(r)}
              >
                {r.name} <span className="chip-id">{r.id}</span>
              </button>
            ))}
          </div>
        )}

        <label style={{ marginTop: '0.8rem' }}>{t('period')}</label>
        <div className="mode-switch period">
          {(
            [
              ['all', t('periodAll')],
              ['month', t('periodMonth')],
              ['year', t('periodYear')],
              ['custom', t('periodCustom')],
            ] as [PeriodMode, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              className={periodMode === k ? 'on' : ''}
              onClick={() => setPeriodMode(k)}
            >
              {label}
            </button>
          ))}
          {/* 시즌 버튼은 조회 결과가 알려준 실제 시즌으로 만든다.
              조회 전에는 표시용 기본 목록. 새 시즌이 열리면 첫 조회 즉시 나타난다. */}
          {seasonList.map((s) => (
            <button
              key={s}
              className={periodMode === 'season' && seasonSel === s ? 'on' : ''}
              onClick={() => {
                setPeriodMode('season');
                setSeasonSel(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {periodMode === 'month' && (
          <div className="row">
            <input
              type="month"
              value={month}
              min="2024-03"
              max={currentMonth()}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        )}
        {periodMode === 'year' && (
          <div className="row">
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
        )}
        {periodMode === 'season' && seasonSel && (
          <p className="hint" style={{ marginTop: '0.2rem' }}>
            {(() => {
              const s = seasons.find((x) => x.key === seasonSel);
              return s
                ? `${s.start} ~ ${s.end} (${s.games.toLocaleString()}${t('games')})`
                : seasonSel;
            })()}
          </p>
        )}
        {periodMode === 'custom' && (
          <div className="row">
            <span>
              <label htmlFor="start">{t('startDate')}</label>
              <input
                id="start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </span>
            <span>
              <label htmlFor="end">{t('endDate')}</label>
              <input
                id="end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </span>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {/* wavu 수집 실패 → 지난 사본으로 버티는 중. 예전에는 이때 사이트가 통째로 멈췄다. */}
        {staleMinutes !== null && (
          <p className="warn">{t('staleWarn')(staleMinutes)}</p>
        )}
        {/* 8초를 넘기면 "멈췄나?" 싶어진다. 그때부터 기다려도 된다고 말해준다. */}
        {loading && elapsed >= 8 && <p className="warn">{t('longWait')}</p>}
        <p className="hint">{t('firstHint')}</p>
        {mode === 'compare' && <p className="hint">{t('compareHint')}</p>}
      </div>

      {single && (
        <>
          <p className="meta">
            <b>{single.myName || single.polarisId}</b>
            {single.selectedChar ? <b> — {single.selectedChar}</b> : null} ·{' '}
            {single.filtered?.count}
            {t('games')}
            {single.filtered?.start || single.filtered?.end
              ? ` (${single.filtered?.start ?? ''} ~ ${single.filtered?.end ?? ''}, ${t('totalSuffix')} ${single.totalCount})`
              : ''}
            {single.firstDt ? ` · ${single.firstDt.slice(0, 10)} ~ ${single.lastDt?.slice(0, 10)}` : ''}
            {/* 방금 조회한 사람을 그 자리에서 고정한다. 비교 모드에는 안 나온다. */}
            {pinned?.id === single.polarisId ? (
              <span className="pin-state">{t('pinnedHere')}</span>
            ) : (
              <button
                className="ghost small pin-set"
                onClick={() =>
                  setPinned({ id: single.polarisId, name: single.myName || single.polarisId })
                }
                title={t('pinHint')}
              >
                {t('pinSet')}
              </button>
            )}
          </p>
          {/* 캐릭터별 현재 단 — wavu 값 그대로, 추정 없음 */}
          <RankBadges polarisId={single.polarisId} lang={lang} />
          {summary && (
            <div className="sum-card">
              <div className="sum-block">
                <span className="sum-label">{t('sumToday')}</span>
                {summary.games > 0 ? (
                  <span className="sum-value">
                    <b className="sw">{summary.w}{t('winChar')}</b>{' '}
                    <b className="sl">{summary.l}{t('lossChar')}</b>{' '}
                    <span className="sum-sub">
                      {Math.round((summary.w * 1000) / summary.games) / 10}%
                    </span>
                  </span>
                ) : (
                  <span className="sum-value sum-muted">{t('sumNoToday')}</span>
                )}
              </div>
              {summary.games > 0 && (
                <div className="sum-block">
                  <span className="sum-label">Δ</span>
                  <span className={`sum-value ${summary.delta >= 0 ? 'sw' : 'sl'}`}>
                    {summary.delta > 0 ? `+${summary.delta}` : summary.delta}
                  </span>
                </div>
              )}
              {summary.rating !== null && summary.rating > 0 && (
                <div className="sum-block">
                  <span className="sum-label">{t('sumRating')}</span>
                  <span className="sum-value">{summary.rating.toLocaleString()}</span>
                </div>
              )}
              {summary.games === 0 && summary.lastDt && (
                <div className="sum-block">
                  <span className="sum-label">{t('sumLastDay')}</span>
                  <span className="sum-value sum-date">{summary.lastDt}</span>
                </div>
              )}
            </div>
          )}
          {/* 마지막 세션 기준 컨디션 한 줄 (멘트 끄면 안 나온다) */}
          {showQuips && condition && (
            <p className="condition">
              {condition}
              <span className="quips-off">{t('quipsOff')}</span>
            </p>
          )}
          {single.charCounts && single.charCounts.length > 1 && (
            <div className="char-chips">
              <span className="hint" style={{ margin: 0 }}>{t('charLabel')}:</span>
              <button
                className={`chip${charSel === '' ? ' on' : ''}`}
                onClick={() => pickChar('')}
              >
                {t('charAll')}
              </button>
              {single.charCounts.map((c) => (
                <button
                  key={c.name}
                  className={`chip${charSel === c.name ? ' on' : ''}`}
                  onClick={() => pickChar(c.name)}
                >
                  {c.name} <span className="chip-id">{c.games}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {compare && (
        <>
          <p className="meta compare-meta">
            {compare.players.map((p, i) => (
              <span key={p.polarisId}>
                {i > 0 && <span className="vs"> vs </span>}
                <b>{p.name}</b> <span className="cnt">({p.count})</span>
              </span>
            ))}
          </p>
          {/* 비교 요약 한 줄 — 현재 순위와 최근 흐름이 엇갈리는지 */}
          {compareQuip && (
            <p className="condition">
              {compareQuip}
              <span className="quips-off">{t('quipsOff')}</span>
            </p>
          )}
          {/* 맞대결이 있다는 신호. 이미 그 탭을 보고 있으면 같은 말을 두 번 하지 않는다. */}
          {h2hHint && current?.key !== 'h2h' && current?.key !== 'h2h_detail' && (
            <p className="h2h-hint">
              <button type="button" onClick={() => setActiveTab('h2h_detail')}>
                {t('h2hHint')(h2hHint.a, h2hHint.b, h2hHint.games, h2hHint.aWins, h2hHint.bWins)}
                {h2hHint.pairs > 1 && ` ${t('h2hHintMore')(h2hHint.pairs - 1)}`}
              </button>
            </p>
          )}
        </>
      )}

      {/* 랜덤 조회 — 곁가지라 조회 폼 아래에 접어둔다.
          모드까지 넘기는 이유: 비교 모드에서 눌렀을 때도 한 명 조회로 가야 한다. */}
      <RandomPlayer
        lang={lang}
        onPick={(rid) => {
          setId(rid);
          setIds('');
          setMode('single');
          setCharSel('');
          run(rid, undefined, '', 'single');
        }}
      />

      {tabs && (
        <>
          <div className="row dl-row">
            {/* 리포트는 한 명 조회일 때만 — 비교는 대상이 여럿이라 한 장으로 요약되지 않는다 */}
            {/* 리포트는 서버 렌더라 localStorage 의 언어를 못 읽는다 — 링크로 넘겨준다 */}
            {mode === 'single' && single && (
              <a
                className="btn-link report-btn"
                href={`/player/${single.polarisId}/report${lang === 'ko' ? '' : `?lang=${lang}`}`}
                onClick={() => gaEvent('report_open')}
              >
                {t('reportBtn')}
              </a>
            )}
            {/* 공유 — 주소창에 이미 상태가 들어가 있지만(replaceState) 폰에서는
                주소를 복사하기가 번거롭다. 버튼 하나로 그 마찰을 없앤다.
                한 명·여러 명 모드 모두에 둔다. */}
            <ShareButton
              lang={lang}
              title={
                mode === 'single' && single
                  ? `${single.myName || single.polarisId} — ${t('title')}`
                  : t('title')
              }
            />
            {xlsxHref && (
              <button className="ghost" onClick={downloadXlsx} disabled={xlsxBusy}>
                {xlsxBusy ? t('xlsxBusy') : t('xlsxBtn')}
              </button>
            )}
            <button className="ghost" onClick={downloadCsv} disabled={dlBusy}>
              {t('csvBtn')}
            </button>
            <button className="ghost" onClick={downloadJson} disabled={dlBusy}>
              {t('jsonBtn')}
            </button>
          </div>
          {dlMsg && <p className="error">{dlMsg}</p>}
          {/* 오래 걸릴 조회에만 예상 시간을 미리 알린다 (실측 기반 근사) */}
          {xlsxHref && !xlsxBusy && xlsxEtaSec >= 5 && (
            <p className="hint">{t('xlsxEta')(xlsxEtaSec)}</p>
          )}
          {xlsxMsg && <p className="error">{xlsxMsg}</p>}

          <div className="tabs">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                className={tb.key === (current?.key ?? '') ? 'on' : ''}
                onClick={() => setActiveTab(tb.key)}
              >
                {TAB_LABELS[tb.key]?.[lang] ?? tb.label}
              </button>
            ))}
          </div>

          {mode === 'compare' && (
            <div className="hl-row">
              <label className="hl-toggle">
                <input
                  type="checkbox"
                  checked={hlOn}
                  onChange={(e) => setHlOn(e.target.checked)}
                />
                {t('hlToggle')}
              </label>
              <span className="hl-period">
                {t('periodPrefix')}:{' '}
                {compare?.filtered?.start || compare?.filtered?.end
                  ? `${compare?.filtered?.start ?? t('begin')} ~ ${compare?.filtered?.end ?? t('today')}`
                  : t('periodAll')}
              </span>
            </div>
          )}

          {current && CHART_TABS.has(current.key) ? (
            <>
              <div className="mode-switch period">
                {/* 그래프만 있는 탭은 토글을 내지 않는다 */}
                {!chartOnly && (
                  <>
                    <button
                      className={view === 'chart' ? 'on' : ''}
                      onClick={() => setView('chart')}
                    >
                      {t('chart')}
                    </button>
                    <button
                      className={view === 'table' ? 'on' : ''}
                      onClick={() => setView('table')}
                    >
                      {t('table')}
                    </button>
                  </>
                )}
                {current.key === 'sessions' && view === 'chart' && (
                  <>
                    <span className="gran-sep" />
                    <button
                      className={sessView === 'bars' ? 'on' : ''}
                      onClick={() => setSessView('bars')}
                    >
                      {t('sessBars')}
                    </button>
                    <button
                      className={sessView === 'length' ? 'on' : ''}
                      onClick={() => setSessView('length')}
                    >
                      {t('sessLength')}
                    </button>
                  </>
                )}
                {current.key === 'trend' && (
                  <>
                    <button
                      className={trendX === 'game' ? 'on' : ''}
                      onClick={() => setTrendX('game')}
                    >
                      {t('trendByGame')}
                    </button>
                    <button
                      className={trendX === 'date' ? 'on' : ''}
                      onClick={() => setTrendX('date')}
                    >
                      {t('trendByDate')}
                    </button>
                  </>
                )}
                {current.key === 'daily' && view === 'chart' && (
                  <>
                    <span className="gran-sep" />
                    {DAILY_STYLES.map((st) => (
                      <button
                        key={st}
                        className={dailyStyle === st ? 'on' : ''}
                        onClick={() => setDailyStyle(st)}
                      >
                        {DAILY_STYLE_LABEL[st][lang]}
                      </button>
                    ))}
                  </>
                )}
                {/* 활동(히트맵)은 항상 일 단위라 기간 묶음이 아무 일도 안 한다 — 숨긴다. */}
                {dailyStyle !== 'heat' && dailyOpts && dailyOpts.length > 1 && (
                  <>
                    <span className="gran-sep" />
                    {dailyOpts.map((g) => (
                      <button
                        key={g}
                        className={effGran === g ? 'on' : ''}
                        onClick={() => setDailyGran(g)}
                      >
                        {GRAN_LABEL[g][lang]}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {chartOnly || view === 'chart' ? (
                current.key === 'trend' ? (
                  <TrendChart rows={current.rows} lang={lang} seasons={single?.seasons} xAxis={trendX} />
                ) : current.key === 'rank' ? (
                  <RankChart rows={current.rows} lang={lang} />
                ) : current.key === 'daily' ? (
                  dailyStyle === 'heat' ? (
                    // 히트맵은 항상 일 단위다 — 기간 묶음(rollupDaily)을 적용한
                    // displayTab 이 아니라 원본 행을 넘긴다.
                    <ActivityHeatmap rows={current.rows} lang={lang} />
                  ) : (
                    <DailyChart rows={displayTab!.rows} lang={lang} style={dailyStyle} />
                  )
                ) : (
                  <SessionChart
                    rows={current.rows}
                    lang={lang}
                    view={sessView}
                    selectedChar={single?.selectedChar ?? null}
                  />
                )
              ) : (
                <DataTable tab={displayTab ?? current} lang={lang} />
              )}
            </>
          ) : (
            current && (
              <>
                {current.key === 'matches' &&
                  single?.filtered &&
                  single.filtered.count > current.rows.length && (
                    <p className="hint">
                      {t('trendLimit')(current.rows.length, single.filtered.count)}
                    </p>
                  )}

                {/* 상대전적: 몇 판 이상 만난 상대만 + 강점/약점 순 */}
                {h2hOpts && (
                  <>
                    <div className="mode-switch period">
                      <span className="ctl-label">{t('minGames')}</span>
                      {h2hOpts.map((m) => (
                        <button
                          key={m}
                          className={effH2hMin === m ? 'on' : ''}
                          onClick={() => setH2hMin(m)}
                        >
                          {m === 0 ? t('periodAll') : `${m}+`}
                        </button>
                      ))}
                      <span className="gran-sep" />
                      <span className="ctl-label">{t('metSince')}</span>
                      {H2H_DAYS.map((d) => (
                        <button
                          key={d}
                          className={h2hDays === d ? 'on' : ''}
                          onClick={() => setH2hDays(d)}
                        >
                          {H2H_DAY_LABEL(d, lang)}
                        </button>
                      ))}
                    </div>
                    <div className="mode-switch period">
                      {(['all', 'strong', 'weak'] as H2hView[]).map((v) => (
                        <button
                          key={v}
                          className={h2hView === v ? 'on' : ''}
                          onClick={() => setH2hView(v)}
                        >
                          {H2H_VIEW_LABEL[v][lang]}
                        </button>
                      ))}
                      {/* 정렬 뒤에 자르므로 '강점 상위 10명'처럼 뜻대로 동작한다 */}
                      {h2hTopOpts && h2hTopOpts.length > 0 && (
                        <>
                          <span className="gran-sep" />
                          <span className="ctl-label">{t('showTop')}</span>
                          {h2hTopOpts.map((n) => (
                            <button
                              key={n}
                              className={effH2hTop === n ? 'on' : ''}
                              onClick={() => setH2hTop(n)}
                            >
                              {n === 0 ? t('periodAll') : n}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* 흐름: 이 사람 데이터로 뽑은 권장 판수.
                    단정하지 않는다 — 표본이 얇거나 꺾이는 지점이 없으면 그렇게 말한다. */}
                {current.key === 'flow' && single?.advice && (
                  <div className="advice">
                    {/* 농담 + 연습 권유 — 수위는 실제 숫자로 정하고(advice.mood),
                        문구는 조회 결과에서 나온 씨앗으로 고른다(같은 조회 = 같은 문구).
                        멘트를 끄면 권장 판수 분석만 남는다. */}
                    {showQuips && (
                      <p className={`advice-mood mood-${single.advice.mood}`}>
                        {pickJoke(
                          single.advice.mood,
                          lang,
                          single.recordCount + single.advice.losingStreak * 7,
                          single.advice.recentDeltaPp,
                          single.advice.losingStreak,
                          // 계절은 **마지막 경기 날짜**로 정한다(조회 시점이 아니라).
                          // 반년 쉰 사람에게 지난 계절 농담이 나가는 게, 안 친 계절의
                          // 농담이 나가는 것보다 낫다 — 문구가 데이터를 따라간다는 규칙은 같다.
                          summary?.lastDt
                            ? seasonOf(new Date(`${summary.lastDt}T00:00:00Z`))
                            : null,
                          // 마일스톤·승단·실력차 같은 축. 우선순위 사다리는 pickJoke 안에 있다.
                          single.quipFacts ?? null,
                        )}
                      </p>
                    )}
                    {/* 무드 멘트의 근거 — 최근 승패를 시간 순서의 띠로. 멘트를 꺼도
                        남긴다(조언과 같은 방침 — 이건 유머가 아니라 데이터다). */}
                    {single.barcode && <WinLossCode seq={single.barcode} lang={lang} />}
                    {/* 조언은 유머와 독립이다 — 유머를 꺼도 이건 볼 수 있어야 한다 */}
                    {showCoach && (
                      <p className="advice-coach">
                        {/* 아이콘은 붙이지 않는다 — 배경색과 글자색만으로 이미
                            농담 줄과 구분되고, 문장 앞의 그림이 읽기를 방해했다. */}
                        {pickCoach(
                          single.advice.mood,
                          lang,
                          // 농담과 다른 씨앗 — 같은 짝만 반복해서 나오지 않게
                          single.recordCount * 3 + Math.round(single.advice.recentDeltaPp),
                          // 중상위 이상에게는 다른 조언 묶음이 나간다 (jokes.COACH_HIGH_MIN_RATING)
                          single.currentRating,
                        )}
                      </p>
                    )}
                    {single.advice.reliable ? (
                      <>
                        {/* 판정 갈래마다 문장이 하나씩 대응한다 — 여기서는 씨앗을 쓰지 않는다.
                            같은 데이터에 두 문장이 후보로 남는 순간 분석문이 농담이 된다.
                            dropsFromStart 를 불리언으로 받는 이유: stopAfter===0 이 falsy 라
                            예전에는 "꺾이는 지점이 없었습니다"(정반대)로 조용히 떨어졌다. */}
                        <p className="advice-main">
                          {single.advice.dropsFromStart
                            ? t('adviceFromStart')(single.advice.dropPp ?? 0)
                            : single.advice.stopAfter
                              ? (single.advice.dropPp ?? 0) >= 6
                                ? t('adviceStopSharp')(
                                    single.advice.goodUpTo ?? single.advice.stopAfter,
                                    single.advice.stopAfter,
                                    single.advice.dropPp ?? 0,
                                  )
                                : t('adviceStopMild')(
                                    single.advice.goodUpTo ?? single.advice.stopAfter,
                                    single.advice.stopAfter,
                                    single.advice.dropPp ?? 0,
                                  )
                              : t('adviceNoDrop')(single.advice.goodUpTo ?? 0)}
                        </p>
                        {/* 승률만 봐서는 안 보이는 구간. 여러 개면 첫 구간만 말한다 —
                            나열하면 문장이 길어지고 요지가 흐려진다. */}
                        {single.advice.noGainBands.length > 0 && (
                          <p className="advice-main advice-sub">
                            {t('adviceNoGain')(
                              single.advice.noGainBands[0].from,
                              single.advice.noGainBands[0].to,
                            )}
                          </p>
                        )}
                        {/* 구간 12개를 텍스트로 나열하면 화면을 넘어가고 꺾이는
                            지점이 안 보인다. 같은 값을 납작한 선 그래프로 낸다. */}
                        <AdviceChart
                          bands={single.advice.bands}
                          baseline={single.advice.baselineWinRate}
                          stopAfter={single.advice.stopAfter}
                          lang={lang}
                        />
                      </>
                    ) : (
                      <p className="advice-main">
                        {single.advice.thinReason === 'short'
                          ? t('adviceThinShort')(single.recordCount)
                          : t('adviceThin')}
                      </p>
                    )}
                    <p className="hint">{t('adviceCaveat')}</p>
                    {(showQuips || showCoach) && (
                      <p className="hint quips-off">{t('quipsOff')}</p>
                    )}
                  </div>
                )}

                {/* 비교 탭별 한 줄 — 맞대결 / 캐릭터 폭 / 공통 상대 */}
                {tabQuip && <p className="advice-mood mood-steady">{tabQuip}</p>}

                {/* 시간대: 하루 시간대 / 요일별 */}
                {current.key === 'time' && (
                  <div className="mode-switch period">
                    {(['시간대', '요일'] as TimeView[]).map((v) => (
                      <button
                        key={v}
                        className={timeView === v ? 'on' : ''}
                        onClick={() => setTimeView(v)}
                      >
                        {TIME_VIEW_LABEL[v][lang]}
                      </button>
                    ))}
                  </div>
                )}

                {/* 라운드 보기 전환 — 기본은 내 캐릭터별(지금까지의 동작).
                    캐릭터별 상세에서는 'my' 가 1행 + ALL 뿐이라 이 전환이 사실상 본체다. */}
                {current.key === 'round' && roundOppTab && (
                  <div className="mode-switch period">
                    <button
                      className={roundView === 'my' ? 'on' : ''}
                      onClick={() => setRoundView('my')}
                    >
                      {t('roundByMine')}
                    </button>
                    <button
                      className={roundView === 'opp' ? 'on' : ''}
                      onClick={() => {
                        // 이미 그 보기면 세지 않는다 — 같은 버튼을 두 번 눌러도 사용은 한 번이다.
                        if (roundView !== 'opp') gaEvent('round_by_opp');
                        setRoundView('opp');
                      }}
                    >
                      {t('roundByOpp')}
                    </button>
                  </div>
                )}

                {/* 시즌 보기 전환 — 기본은 시즌별(지금까지의 동작).
                    버전이 하나뿐인 사람에겐 seasonVersionTab 이 null 이라 안 그린다. */}
                {current.key === 'season' && seasonVersionTab && (
                  <div className="mode-switch period">
                    <button
                      className={seasonView === 'season' ? 'on' : ''}
                      onClick={() => setSeasonView('season')}
                    >
                      {t('seasonBySeason')}
                    </button>
                    <button
                      className={seasonView === 'version' ? 'on' : ''}
                      onClick={() => {
                        // 이미 그 보기면 세지 않는다 — 같은 버튼을 두 번 눌러도 사용은 한 번이다.
                        if (seasonView !== 'version') gaEvent('season_by_version');
                        setSeasonView('version');
                      }}
                    >
                      {t('seasonByVersion')}
                    </button>
                  </div>
                )}

                {/* 시각 기준 전환 — 조회 대상이 외국일 때만 나온다.
                    (한국·지역 불명이면 localTimeTab 이 없어 아예 안 그린다) */}
                {current.key === 'time' && localTimeTab && tz && (
                  <div className="mode-switch period">
                    <button
                      className={tzView === 'local' ? 'on' : ''}
                      onClick={() => setTzView('local')}
                    >
                      {t('tzLocal')(tz.offsetLabel)}
                    </button>
                    <button
                      className={tzView === 'kst' ? 'on' : ''}
                      onClick={() => {
                        // 기본은 현지 시각이다 — KST 로 바꾸는 쪽만 센다.
                        if (tzView !== 'kst') gaEvent('tz_kst');
                        setTzView('kst');
                      }}
                    >
                      {t('tzKst')}
                    </button>
                  </div>
                )}

                {/* 지역 표시 — 추정을 숨기지 않는다. 틀렸을 때 사용자가 알아챌 수
                    있어야 하고, 지역을 못 읽었으면 그것도 말해야 한다. */}
                {current.key === 'time' && tz && (
                  <p className="hint tz-note">
                    {tz.region
                      ? t('tzRegion')(tz.region.label, tz.offsetLabel)
                      : t('tzUnknown')}
                    {tz.source === 'curve' && ' ' + t('tzByCurve')}
                  </p>
                )}

                {/* 흐름 탭: 장기전 조언(위) 과 항목별 표(아래) 사이 — 그 흐름을
                    보러 온 사람이 그 자리에서 바로 비슷한 실력대 상대도 찾아본다.
                    2026-08-05: 승률 비교·장기전 패턴 찾기 기능 잠시 중단 — 숨김
                    처리(재개 시 아래 주석 해제).
                {current.key === 'flow' && mode === 'single' && single && (
                  <SimilarPlayers polarisId={single.polarisId} lang={lang} />
                )}
                */}

                {/* 비교 표: 표본이 얇은 행 숨기기 */}
                {thinnable && (
                  <label className="hl-toggle">
                    <input
                      type="checkbox"
                      checked={hideThin}
                      onChange={(e) => setHideThin(e.target.checked)}
                    />
                    {t('hideThin')(COMPARE_MIN_GAMES)}
                  </label>
                )}

                <DataTable
                  tab={shownTab ?? current}
                  lang={lang}
                  rowHl={
                    mode === 'compare' && hlOn ? makeRowHighlighter(current) : null
                  }
                  // 한 명 모드에서만 '나와 비교'가 성립한다 (상대 식별코드가 있는 표에 붙는다)
                  onCompare={mode === 'single' && single ? addPick : undefined}
                  pickedIds={pickedSet}
                />
              </>
            )
          )}
        </>
      )}


      {/* 설명·FAQ — 색인되는 페이지가 홈 한 장뿐이라 여기가 유일하게 늘릴 수 있는 본문이다.
          결과가 떠 있을 때는 방해가 되므로 감춘다(그때는 사람이 이미 원하는 걸 찾았다). */}
      {!tabs && <SeoContent lang={lang} />}

      <footer>
        {/* 출처·무관 고지는 아래 disclaimer 한 줄이 다 말한다. 예전에는 여기에
            "데이터: wank.wavu.wiki … Bandai Namco 와 무관합니다"가 따로 있었는데
            같은 말을 두 번 하는 셈이라 걷어냈다. */}
        {/* 크레딧은 번역하지 않는다 — 이름·이메일이고, 감사 문구도 원문이 영어다.
            언어를 바꿔도 같은 사람을 같은 표기로 부르는 게 맞다. */}
        {/* 고지가 먼저다 — 이 사이트가 무엇인지(비공식 팬사이트)와 자료 출처를
            먼저 밝히고, 그다음이 만든 사람이다. */}
        <span className="disclaimer">{t('disclaimer')}</span>
        <span className="credits">
          <span className="credit-block">
            Developed by Jeremio
            <br />
            Jinho.ju@live.com
          </span>
          <span className="credit-block">
            Special thanks to 물방개하영훈
            <br />
            for the original idea and invaluable support.
          </span>
        </span>
        {/* 맨 마지막 줄. 아는 사람만 읽으면 되는 농담이라 제일 흐리게 둔다. */}
        <span className="footer-joke">{t('footerJoke')}</span>
        {/* 맨 아래 방문자 수. 값을 못 받으면 아무것도 안 그린다. */}
        <VisitorCount lang={lang} />
      </footer>
    </main>
  );
}
