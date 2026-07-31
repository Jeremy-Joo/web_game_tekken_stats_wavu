// 컬럼명 + 행(배열). 집계 결과이자 화면/엑셀 출력 단위.
// C# TekkenStats.Core/Table.cs 포팅.

export type Cell = string | number | null;

export class Table {
  columns: string[];
  rows: Cell[][] = [];

  constructor(...cols: string[]) {
    this.columns = [...cols];
  }

  add(...row: Cell[]): void {
    this.rows.push(row);
  }

  get count(): number {
    return this.rows.length;
  }

  removeColumn(col: string): void {
    const i = this.columns.indexOf(col);
    if (i < 0) return;
    this.columns.splice(i, 1);
    for (const r of this.rows) if (i < r.length) r.splice(i, 1);
  }
}
