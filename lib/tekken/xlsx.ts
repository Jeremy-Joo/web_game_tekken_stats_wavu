// TabData[] → xlsx 버퍼. WPF/py 결과물과 같은 '시트 = 집계 하나' 구조.
// exceljs 는 무겁기 때문에 이 모듈은 xlsx 라우트에서만 import 한다 (동적 import).

import type { TabData } from './compute';

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
    const ws = wb.addWorksheet(sheetName(t.label));

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
