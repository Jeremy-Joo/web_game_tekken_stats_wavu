// TabData[] → xlsx 버퍼. WPF/py 결과물과 같은 '시트 = 집계 하나' 구조.
// exceljs 는 무겁기 때문에 이 모듈은 xlsx 라우트에서만 import 한다 (동적 import).

import { TAB_GROUP, type TabData, type TabGroup } from './compute';

/**
 * 묶음별 시트 탭 색.
 *
 * 이름을 늘리지 않고 덩어리를 보이게 하는 방법이다. 번호 접두어('01 흐름')를 쓰면
 * 나중에 시트를 사이에 끼울 때 전부 다시 매겨야 하고, 이름이 길어져 탭이 좁아진다.
 *
 * 엑셀 기본 팔레트에서 골라 서로 충분히 다르게 뒀다. argb 라 앞 두 자리는 불투명도다.
 */
const GROUP_COLOR: Record<TabGroup, string> = {
  summary: 'FF4472C4', // 파랑 — 요약
  mine: 'FF70AD47', // 초록 — 내 캐릭터
  versus: 'FFED7D31', // 주황 — 상대
  when: 'FF7030A0', // 보라 — 언제
  change: 'FF2E9BA6', // 청록 — 변화
  raw: 'FF808080', // 회색 — 원자료
};

/** 엑셀 시트명 제약(31자, \ / ? * [ ] : 금지)에 맞게 자른다. */
function sheetName(label: string): string {
  return label.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet';
}

export async function tabsToXlsx(
  tabs: TabData[],
  meta: { title: string; subtitle?: string },
): Promise<Buffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'tekken-stats-wavu';

  for (const t of tabs) {
    // 모르는 키가 오면 색을 안 칠한다 — 잘못된 묶음으로 보이게 하느니 없는 편이 낫다.
    const color = GROUP_COLOR[TAB_GROUP[t.key]];
    const ws = wb.addWorksheet(
      sheetName(t.label),
      color ? { properties: { tabColor: { argb: color } } } : undefined,
    );

    // 첫 행: 제목 메모 (WPF 리포트의 상단 캡션과 같은 역할)
    ws.addRow([`${meta.title} — ${t.label}${meta.subtitle ? ` (${meta.subtitle})` : ''}`]);
    ws.getRow(1).font = { bold: true };

    const header = ws.addRow(t.columns);
    header.font = { bold: true };
    header.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      c.border = { bottom: { style: 'thin' } };
    });

    for (const r of t.rows) ws.addRow(r.map((c) => (c === null ? '' : c)));

    // 컬럼 폭: 헤더/데이터 표시 폭 기준 (py autofit_columns 의 간이판)
    t.columns.forEach((col, i) => {
      let w = String(col).length;
      for (const r of t.rows) {
        const v = r[i];
        if (v !== null && v !== undefined) w = Math.max(w, String(v).length);
      }
      ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 8), 40);
    });

    ws.views = [{ state: 'frozen', ySplit: 2 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
