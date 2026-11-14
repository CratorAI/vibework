import { useLayoutEffect, useRef, useState } from 'react';
import type { LegacySheet } from './parse';

export function columnLabel(column: number): string {
  let value = column + 1, label = '';
  while (value > 0) { value--; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26); }
  return label;
}
const tableClass = 'border-separate border-spacing-0 text-meta tabular-nums select-text';
const cellClass = 'max-w-[320px] truncate border-r border-b px-3 py-1 whitespace-nowrap';
const rowHeaderClass = 'sticky left-0 border-r border-b bg-background px-2 py-1 text-right font-normal text-muted-foreground';

/** Measure one representative row, then keep its widths for every scroll position.
 * Canvas chooses the widest saved value in each column; the browser still does
 * the final table/font/padding measurement, including the original 320px cap.
 */
export function LegacyTable({ sheet }: { sheet: LegacySheet }) {
  const root = useRef<HTMLDivElement>(null), probe = useRef<HTMLTableElement>(null);
  const [sample, setSample] = useState<string[] | null>(null);
  const [metrics, setMetrics] = useState<{ widths: number[]; row: number; header: number } | null>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  const columns = sheet.rows[0]?.length ?? 0;
  useLayoutEffect(() => {
    const measure = () => {
      const style = getComputedStyle(root.current!);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const cache = new Map<string, number>();
      const widest = Array<string>(columns).fill(''), widths = Array<number>(columns).fill(-1);
      for (const row of sheet.rows) row.forEach((value, c) => {
        // tabular-nums makes every decimal digit as wide as zero in the table.
        const text = value.replace(/[0-9]/g, '0');
        let width = cache.get(text);
        if (width === undefined) { width = ctx.measureText(text).width; cache.set(text, width); }
        if (width > widths[c]) { widths[c] = width; widest[c] = value; }
      });
      setSample(widest); setMetrics(null);
    };
    measure();
    document.fonts.addEventListener('loadingdone', measure);
    return () => document.fonts.removeEventListener('loadingdone', measure);
  }, [sheet, columns]);
  useLayoutEffect(() => {
    if (!sample || !probe.current) return;
    const table = probe.current;
    setMetrics({ widths: [...table.tHead!.rows[0].cells].map(c => c.getBoundingClientRect().width), row: table.tBodies[0].rows[0].getBoundingClientRect().height, header: table.tHead!.getBoundingClientRect().height });
  }, [sample]);
  useLayoutEffect(() => {
    const el = root.current!;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    const observer = new ResizeObserver(update); observer.observe(el); update();
    return () => observer.disconnect();
  }, []);
  const start = metrics ? Math.max(0, Math.min(sheet.rows.length - 1, Math.floor((view.top - metrics.header) / metrics.row) - 5)) : 0;
  const end = metrics ? Math.min(sheet.rows.length, Math.ceil((view.top + view.height) / metrics.row) + 5) : 0;
  const header = <thead><tr><th className="sticky top-0 left-0 z-20 border-r border-b bg-muted px-2 py-1" />
    {Array.from({ length: columns }, (_, c) => <th key={c} scope="col" className="sticky top-0 z-10 border-r border-b bg-muted px-3 py-1 font-normal text-muted-foreground">{columnLabel(c)}</th>)}
  </tr></thead>;
  const spacer = (rows: number) => rows > 0 && <tr aria-hidden="true"><td colSpan={columns + 1} style={{ height: rows * metrics!.row, padding: 0, border: 0, lineHeight: 0 }} /></tr>;
  return <div ref={root} className="min-h-0 flex-1 overflow-auto text-meta tabular-nums" onScroll={e => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}>
    {!metrics ? <table ref={probe} data-measuring aria-label={sheet.name} className={`${tableClass} invisible`} style={{ width: 'max-content' }}>
      {header}<tbody><tr><th scope="row" className={rowHeaderClass}>{sheet.rows.length}</th>{(sample ?? Array<string>(columns).fill('')).map((value, c) => <td key={c} className={cellClass}>{value}</td>)}</tr></tbody>
    </table> : <table className={tableClass} aria-label={sheet.name} aria-rowcount={sheet.rows.length + 1} style={{ tableLayout: 'fixed', width: metrics.widths.reduce((a, b) => a + b, 0) }}>
      <colgroup>{metrics.widths.map((width, c) => <col key={c} style={{ width }} />)}</colgroup>
      {header}<tbody>{spacer(start)}{sheet.rows.slice(start, end).map((row, i) => <tr key={start + i} aria-rowindex={start + i + 2} style={{ height: metrics.row }}>
        <th scope="row" className={rowHeaderClass}>{start + i + 1}</th>{row.map((value, c) => <td key={c} title={value} className={cellClass}>{value}</td>)}
      </tr>)}{spacer(sheet.rows.length - end)}</tbody>
    </table>}
  </div>;
}
