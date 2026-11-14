/**
 * Cheap static previews for the Artifacts page: a whiteboard's shapes as a
 * small SVG scene, and a dashboard's title with its first metric tiles. No
 * editor, canvas library or chart code is loaded for these.
 */

import { format, number, parse, reference } from "@/components/artifacts/data/core";

export type BoardShape =
  | { kind: "rect" | "ellipse" | "diamond" | "frame"; x: number; y: number; w: number; h: number; stroke: string; fill: string; dashed: boolean }
  | { kind: "line"; points: [number, number][]; stroke: string; dashed: boolean; arrow: boolean }
  | { kind: "text"; x: number; y: number; size: number; text: string; color: string; anchor: "start" | "middle" | "end" };

export interface BoardThumb {
  viewBox: [number, number, number, number];
  shapes: BoardShape[];
}

/** Most shapes drawn in a thumbnail (the rest are left out). */
const MAX_SHAPES = 400;

const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value) && value !== "transparent" ? value : fallback;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** The board's shapes and their bounds, or null for anything that is not a board. */
export function boardThumb(source: string): BoardThumb | null {
  let scene: { elements?: unknown };
  try {
    scene = JSON.parse(source);
  } catch {
    return null;
  }
  if (!Array.isArray(scene?.elements)) return null;
  const shapes: BoardShape[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const raw of scene.elements as Record<string, unknown>[]) {
    if (shapes.length >= MAX_SHAPES) break;
    if (!raw || typeof raw !== "object" || raw.isDeleted) continue;
    const x = num(raw.x), y = num(raw.y), w = num(raw.width), h = num(raw.height);
    const stroke = color(raw.strokeColor, "#1e1e1e");
    const dashed = raw.strokeStyle === "dashed" || raw.strokeStyle === "dotted";
    switch (raw.type) {
      case "rectangle":
      case "ellipse":
      case "diamond":
      case "frame": {
        const kind = raw.type === "rectangle" ? "rect" : (raw.type as "ellipse" | "diamond" | "frame");
        shapes.push({ kind, x, y, w, h, stroke: kind === "frame" ? "#868e96" : stroke, fill: color(raw.backgroundColor, "none"), dashed: dashed || kind === "frame" });
        grow(x, y); grow(x + w, y + h);
        break;
      }
      case "arrow":
      case "line":
      case "freedraw": {
        const points = (Array.isArray(raw.points) ? raw.points : [])
          .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
          .map(([px, py]) => [x + num(px), y + num(py)] as [number, number]);
        if (points.length < 2) break;
        shapes.push({ kind: "line", points, stroke, dashed, arrow: raw.type === "arrow" && raw.endArrowhead != null });
        points.forEach(([px, py]) => grow(px, py));
        break;
      }
      case "text": {
        const text = String(raw.text ?? "").split("\n")[0].slice(0, 80);
        if (!text.trim()) break;
        const size = num(raw.fontSize) || 16;
        const align = raw.textAlign === "center" ? "middle" : raw.textAlign === "right" ? "end" : "start";
        const tx = align === "middle" ? x + w / 2 : align === "end" ? x + w : x;
        shapes.push({ kind: "text", x: tx, y: y + size, size, text, color: stroke, anchor: align });
        grow(x, y); grow(x + w, y + h);
        break;
      }
    }
  }
  if (shapes.length === 0 || !Number.isFinite(minX)) return null;
  const pad = Math.max(maxX - minX, maxY - minY) * 0.04 + 8;
  return { viewBox: [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2], shapes };
}

export interface DashboardThumb {
  title: string;
  period: string;
  metrics: { label: string; value: string }[];
}

/** A metric block's source file and range, for its thumbnail value. */
export type MetricSource = ReturnType<typeof reference>;

/** The sources of the first metric tiles (at most four), by block line. */
export function metricSources(source: string): Map<number, MetricSource> {
  const out = new Map<number, MetricSource>();
  for (const block of parse(source).blocks.filter((b) => b.kind === "metric").slice(0, 4)) {
    if (!block.options.data) continue;
    try { out.set(block.line, reference(block.options.data)); } catch { /* shown as "—" */ }
  }
  return out;
}

/**
 * A dashboard's title, period and first metric tiles (at most four).
 * `sheets` holds what a tile's `data:` source read (its rows, header first)
 * by block line; a tile whose source could not be read shows "—".
 */
export function dashboardThumb(source: string, sheets: Map<number, string[][]> = new Map()): DashboardThumb {
  const d = parse(source);
  const metrics: DashboardThumb["metrics"] = [];
  for (const block of d.blocks) {
    if (block.kind !== "metric" || metrics.length >= 4) continue;
    const read = sheets.get(block.line);
    let raw = "";
    if (read) {
      // As the dashboard page: a header row, then the first value row.
      raw = read.slice(1).find((r) => r.length >= 2 && number(r[1] ?? "") !== null)?.[1]?.trim() ?? "";
    } else {
      const row = block.rows.find((r) => r.length >= 2 && !/^label$/i.test(r[0].trim()) && !/^-+:?$/.test(r[1].trim()));
      raw = row?.[1]?.trim() ?? "";
    }
    const n = number(raw);
    const value = n === null ? (raw && !/\.(csv|xlsx)\b/i.test(raw) ? raw : "—") : format(n, block.options.format ?? "number");
    metrics.push({ label: block.title, value: `${value}${n !== null && block.options.unit ? ` ${block.options.unit}` : ""}` });
  }
  return { title: d.title, period: d.period, metrics };
}
