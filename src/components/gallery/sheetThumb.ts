import { SSF } from 'xlsx';

export interface PreviewCell {
  text: string;
  number: number | null;
  format: string | number | null;
}

/** Reuse the Excel formatter used by the legacy sheet view, without an editor. */
export function sheetPreviewRows(rows: PreviewCell[][]): string[][] {
  return rows.map(row => row.map(cell => {
    if (cell.number !== null && cell.format !== null) {
      try { return String(SSF.format(cell.format, cell.number)).slice(0, 48); }
      catch { /* Unsupported format: retain the reader's text. */ }
    }
    return cell.text;
  }));
}
