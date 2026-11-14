import { invoke } from "@tauri-apps/api/core";
import { DesignThumbnail } from './DesignThumbnail';
import { useEffect, useRef, useState } from 'react';
import { FileText } from '@/lib/icons';
import { artifactTypeById, resolveArtifactType } from '@/components/artifacts/registry';
import { ArtifactTypeChip } from '@/components/artifacts/typeColor';
import { getTheme } from '@/components/artifacts/slides/core/themes';
import { readArtifact, sheetHead, sheetRange, statArtifact } from '@/tauri/artifacts';
import { MAX_PDF_THUMB_BYTES, pdfFirstPage } from './pdfThumb';
import type { GalleryItem } from '@/tauri/gallery';
import { boardThumb, dashboardThumb, metricSources, type BoardThumb, type DashboardThumb } from './boardThumb';

// No editor imports, markdown HTML, iframe, or generated code execution here.
// The existing read API is whole-file: refuse large files before calling it.
const MAX_TEXT_BYTES = 128 * 1024;
const HEAD_CHARS = 8000;
/** CSS width of the page in a PDF card (the card is about 250px wide). */
const PDF_THUMB_WIDTH = 232;
type Preview = { text?: string; url?: string; rows?: string[][]; page?: string; doc?: { title: string; lines: string[] }; deck?: { title: string; slides: number }; board?: BoardThumb; dashboard?: DashboardThumb };
/** Whiteboards are JSON with every shape's geometry: read bigger ones than plain text. */
const MAX_BOARD_BYTES = 2 * 1024 * 1024;
/** Office files are read whole (binary): leave big ones as icons */
const MAX_OFFICE_THUMB_BYTES = 15 * 1024 * 1024;
const cache = new Map<string, Promise<Preview>>();
/** Bounded concurrency per pool: reads and sheet heads 4 at a time, PDF pages one at a time. */
const pools = { read: { size: 4, active: 0, queue: [] as (() => void)[] }, pdf: { size: 1, active: 0, queue: [] as (() => void)[] } };
async function limited<T>(pool: keyof typeof pools, load: () => Promise<T>): Promise<T> {
  const p = pools[pool];
  if (p.active >= p.size) await new Promise<void>(resolve => p.queue.push(resolve));
  p.active++;
  try { return await load(); }
  finally { p.active--; p.queue.shift()?.(); }
}
function loadPreview(item: GalleryItem, kind: string): Promise<Preview> {
  const key = `${item.sessionId}:${item.path}:${item.modifiedMs}:${item.sizeBytes}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = (async (): Promise<Preview> => {
    if (kind === 'motion') return limited('pdf', async () => ({url:await invoke<string>('motion_thumbnail',{sessionId:item.sessionId,path:item.path})}));
    if (XLSX.test(item.name)) return limited('read', async () => ({ rows: await sheetHead(item.sessionId, item.path) }));
    if (kind === 'design') {
      if (item.sizeBytes > 2 * 1024 * 1024) return {};
      return limited('read', async () => ({text:(await readArtifact(item.sessionId,item.path)).text??''}));
    }
    if (kind === 'xls') {
      if (item.sizeBytes > MAX_OFFICE_THUMB_BYTES) return {};
      return limited('read', async () => {
        const file = await readArtifact(item.sessionId, item.path);
        if (!file.base64) return {};
        const { decodeBase64 } = await import('@/components/artifacts/viewers/useArtifactFile');
        const { loadLegacyWorkbook } = await import('@/components/artifacts/xls/load');
        const book = await loadLegacyWorkbook(decodeBase64(file.base64));
        const sheet = book.sheets.find(s => !s.hidden) ?? book.sheets[0];
        return { rows: sheet.rows.slice(0, 6).map(r => r.slice(0, 5)) };
      });
    }
    if (kind === 'docx' || kind === 'pptx') {
      if (item.sizeBytes > MAX_OFFICE_THUMB_BYTES) return {};
      return limited('read', async () => {
        const file = await readArtifact(item.sessionId, item.path);
        if (!file.base64) return {};
        const [{ docxHead, pptxHead }, { decodeBase64 }] = await Promise.all([import('@/components/artifacts/office/head'), import('@/components/artifacts/viewers/useArtifactFile')]);
        const bytes = decodeBase64(file.base64);
        return kind === 'docx' ? { doc: docxHead(bytes) } : { deck: pptxHead(bytes) };
      });
    }
    if (kind === 'pdf') {
      if (item.sizeBytes > MAX_PDF_THUMB_BYTES) return {};
      return limited('pdf', async () => ({ page: (await pdfFirstPage(item.sessionId, item.path, PDF_THUMB_WIDTH)) ?? undefined }));
    }
    if (kind === 'whiteboard' || kind === 'data') {
      if (item.sizeBytes > (kind === 'whiteboard' ? MAX_BOARD_BYTES : MAX_TEXT_BYTES)) return {};
      return limited('read', async () => {
        const text = (await readArtifact(item.sessionId, item.path)).text ?? '';
        if (kind === 'data') return { dashboard: dashboardThumb(text, await metricValues(item.sessionId, text)) };
        return { board: boardThumb(text) ?? undefined };
      });
    }
    return limited('read', async () => {
      const stat = await statArtifact(item.sessionId, item.path);
      if (kind === 'image' || kind === 'svg') return { url: stat.url };
      if (stat.kind !== 'text' || stat.size > MAX_TEXT_BYTES) return {};
      const file = await readArtifact(item.sessionId, item.path);
      return { text: file.text?.slice(0, HEAD_CHARS) };
    });
  })().catch(() => ({}));
  if (cache.size >= 160) cache.delete(cache.keys().next().value!);
  cache.set(key, pending);
  return pending;
}
const XLSX = /\.(xlsx|xlsm)$/i;
/** CSV sources read for a dashboard thumbnail are small or skipped. */
const MAX_CSV_BYTES = 256 * 1024;
/**
 * What the first metric tiles' `data:` sources hold, read cheaply: an .xlsx
 * range through the same Rust reader as the sheet thumbnail (the values the
 * file stores, no spreadsheet engine), a small CSV as text. A source that is
 * missing or unreadable is left out and its tile shows "—".
 */
async function metricValues(sessionId: string, source: string): Promise<Map<number, string[][]>> {
  const out = new Map<number, string[][]>();
  await Promise.all([...metricSources(source)].map(async ([line, ref]) => {
    try {
      if (XLSX.test(ref.path) && ref.sheet) {
        out.set(line, await sheetRange(sessionId, ref.path, ref.sheet, ref.r1, ref.c1, Math.min(ref.r2, ref.r1 + 9), ref.c2));
      } else if (/\.csv$/i.test(ref.path)) {
        const stat = await statArtifact(sessionId, ref.path);
        if (stat.size > MAX_CSV_BYTES) return;
        const { parseCsv } = await import('@/components/artifacts/sheet/csv');
        out.set(line, parseCsv((await readArtifact(sessionId, ref.path)).text ?? '').rows);
      }
    } catch { /* missing or unreadable: "—" */ }
  }));
  return out;
}
const plain = (text: string) => text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/^#{1,6}\s+/, '').trim();
export function opening(text: string) {
  const meta = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)?.[1] ?? '';
  const body = text.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '').replace(/<!--[\s\S]*?-->/g, '');
  const title = plain(body.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? meta.match(/^title:\s*(.+)$/m)?.[1] ?? '');
  const lines = body.split('\n').filter(line => !line.includes('|')).map(plain).filter(line => line && line !== title && !/^[-|: ]+$/.test(line)).slice(0, 8);
  return { title, lines, meta };
}
/** Bounded CSV/TSV sample, including quoted commas and embedded newlines. */
export function sampleRows(text: string, separator: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length && rows.length < 6; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === separator || c === '\n')) {
      row.push(cell.slice(0, 48)); cell = '';
      if (c === '\n') { rows.push(row.slice(0, 5)); row = []; }
    } else if (c !== '\r') cell += c;
  }
  if (rows.length < 6 && (cell || row.length)) rows.push([...row, cell.slice(0, 48)].slice(0, 5));
  return rows;
}
/** The tiny sheet used for CSV and workbook cards: first row as the header. */
function SheetGrid({ rows }: { rows: string[][] }) {
  const width = Math.max(1, ...rows.map(row => row.length));
  return <div data-preview="sheet" className="mx-4 w-full overflow-hidden rounded border bg-card text-foreground"><table className="w-full table-fixed text-[10px] leading-4"><tbody>{rows.map((row, r) => <tr key={r} className={r === 0 ? 'bg-muted font-medium' : ''}>{Array.from({ length: width }, (_, c) => <td key={c} className="truncate border-b border-r px-1.5 py-1 text-left last:border-r-0">{row[c] ?? ''}</td>)}</tr>)}</tbody></table></div>;
}
/** A whiteboard's shapes as a small static SVG (outlines, fills, arrows, first lines of text). */
function BoardScene({ board }: { board: BoardThumb }) {
  const [x, y, w, h] = board.viewBox;
  const stroke = Math.max(w, h) / 220;
  return (
    <svg data-preview="whiteboard" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="size-full p-3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {board.shapes.map((s, i) => {
        const dash = 'dashed' in s && s.dashed ? `${stroke * 3} ${stroke * 2.5}` : undefined;
        switch (s.kind) {
          case 'rect':
          case 'frame':
            return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={Math.min(s.w, s.h) * 0.12} fill={s.kind === 'frame' ? 'none' : s.fill} stroke={s.stroke} strokeWidth={stroke} strokeDasharray={dash} />;
          case 'ellipse':
            return <ellipse key={i} cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} fill={s.fill} stroke={s.stroke} strokeWidth={stroke} strokeDasharray={dash} />;
          case 'diamond':
            return <polygon key={i} points={`${s.x + s.w / 2},${s.y} ${s.x + s.w},${s.y + s.h / 2} ${s.x + s.w / 2},${s.y + s.h} ${s.x},${s.y + s.h / 2}`} fill={s.fill} stroke={s.stroke} strokeWidth={stroke} strokeDasharray={dash} />;
          case 'line': {
            const [ex, ey] = s.points[s.points.length - 1];
            const [px, py] = s.points[s.points.length - 2];
            const angle = Math.atan2(ey - py, ex - px);
            const head = stroke * 5;
            return (
              <g key={i} stroke={s.stroke} strokeWidth={stroke}>
                <polyline points={s.points.map((p) => p.join(',')).join(' ')} strokeDasharray={dash} />
                {s.arrow && <polyline points={`${ex - head * Math.cos(angle - 0.5)},${ey - head * Math.sin(angle - 0.5)} ${ex},${ey} ${ex - head * Math.cos(angle + 0.5)},${ey - head * Math.sin(angle + 0.5)}`} />}
              </g>
            );
          }
          case 'text':
            return <text key={i} x={s.x} y={s.y} fontSize={s.size} textAnchor={s.anchor} fill={s.color} fontFamily="var(--font-sans)">{s.text}</text>;
        }
      })}
    </svg>
  );
}

/** A dashboard's title and its first metric tiles, as its page opens with them. */
function DashboardTiles({ dashboard, name }: { dashboard: DashboardThumb; name: string }) {
  return (
    <div data-preview="dashboard" className="mx-5 mt-5 flex h-full w-full flex-col overflow-hidden rounded-t-[3px] border border-b-0 bg-card px-3.5 pt-3 text-left text-foreground">
      <div className="line-clamp-1 text-[11px] font-semibold leading-4">{dashboard.title || name}</div>
      {dashboard.period && <div className="line-clamp-1 text-[9px] leading-[14px] text-muted-foreground">{dashboard.period}</div>}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {dashboard.metrics.map((m, i) => (
          <div key={i} className="min-w-0 rounded-[3px] border px-2 py-1.5">
            <div className="truncate text-[8.5px] leading-3 text-muted-foreground">{m.label}</div>
            <div className="mt-0.5 truncate text-[12px] font-semibold leading-4 tabular-nums">{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GalleryPreview({ item }: { item: GalleryItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Preview>({});
  const type = item.typeHint === 'motion' ? artifactTypeById('motion') : resolveArtifactType(item.name);
  const kind = type?.id ?? '';
  const csv = /\.(csv|tsv)$/i.test(item.name);
  const readable = ['motion', 'design', 'doc', 'markdown', 'slides', 'image', 'svg', 'pdf', 'docx', 'pptx', 'xls', 'whiteboard', 'data'].includes(kind) || csv || XLSX.test(item.name);
  useEffect(() => {
    setPreview({});
    if (!item.exists || !readable || !ref.current) return;
    let cancelled = false;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void loadPreview(item, kind).then(value => { if (!cancelled) setPreview(value); });
    }, { rootMargin: '120px' });
    observer.observe(ref.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [item.sessionId, item.path, item.modifiedMs, item.sizeBytes, item.exists, kind, readable]);
  const Icon = type?.icon ?? FileText;
  let content = <ArtifactTypeChip typeId={item.typeHint === 'motion' ? 'motion' : undefined} fileName={item.name} icon={Icon} />;
  if (preview.url) content = <img src={preview.url} alt="" loading="lazy" decoding="async" className="size-full object-contain" onError={() => setPreview({})} />;
  else if (preview.page) content = <img data-preview="pdf" src={preview.page} alt="" decoding="async" className="mx-5 mt-5 h-full w-[calc(100%-40px)] self-start rounded-t-[3px] border border-b-0 object-cover object-top" onError={() => setPreview({})} />;
  else if (preview.rows?.length) content = <SheetGrid rows={preview.rows} />;
  else if (preview.board) content = <BoardScene board={preview.board} />;
  else if (preview.dashboard) content = <DashboardTiles dashboard={preview.dashboard} name={item.name} />;
  else if (preview.deck) content = <div data-preview="pptx" className="mx-5 flex aspect-[16/9] w-full flex-col justify-center rounded-[3px] border bg-card px-4 text-left text-foreground"><div className="line-clamp-3 text-sm font-semibold leading-snug">{preview.deck.title || item.name}</div><div className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{preview.deck.slides === 1 ? '1 slide' : `${preview.deck.slides} slides`}</div></div>;
  else if (preview.doc) content = <div data-preview="docx" className="mx-5 mt-5 h-full w-full overflow-hidden rounded-t-[3px] border border-b-0 bg-card px-4 pt-3.5 text-left text-foreground"><div className="mb-1.5 line-clamp-2 text-[11px] font-semibold leading-4">{preview.doc.title || item.name}</div><div className="space-y-1 text-[9px] leading-[14px] text-muted-foreground">{preview.doc.lines.map((line, i) => <p className="line-clamp-2" key={i}>{line}</p>)}</div></div>;
  else if (preview.text && csv) content = <SheetGrid rows={sampleRows(preview.text, item.name.endsWith('.tsv') ? '\t' : ',')} />;
  else if (preview.text) {
    const { title, lines, meta } = opening(preview.text);
    if (kind === 'design') {
      content = <DesignThumbnail source={preview.text}/>;
    } else if (kind === 'slides') {
      const theme = getTheme(meta.match(/^theme:\s*([^\s]+)\s*$/m)?.[1]);
      const surface = theme[theme.surfaces.title ?? theme.mode];
      content = <div data-preview="slides" className="flex size-full flex-col justify-center p-5 text-left" style={{ background: surface.bg, color: surface.ink, fontFamily: theme.fonts.head }}><div className="line-clamp-3 text-sm font-semibold leading-snug">{title || item.name}</div><div className="mt-2 line-clamp-2 text-[10px] leading-4 opacity-70">{lines[0]}</div></div>;
    } else {
      content = <div data-preview="document" className="mx-5 mt-5 h-full w-full overflow-hidden rounded-t-[3px] border border-b-0 bg-card px-4 pt-3.5 text-left text-foreground"><div className="mb-1.5 line-clamp-2 text-[11px] font-semibold leading-4">{title || item.name}</div><div className="space-y-1 text-[9px] leading-[14px] text-muted-foreground">{lines.map((line, i) => <p className="line-clamp-2" key={i}>{line}</p>)}</div></div>;
    }
  }
  return <div ref={ref} aria-hidden="true" className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-t-lg bg-muted/50">{content}</div>;
}
