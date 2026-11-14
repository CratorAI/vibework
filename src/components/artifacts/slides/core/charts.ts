/**
 * Data-driven SVG charts for chart slides. Data comes from the slide's
 * Markdown table: first column = categories, other columns = series.
 * Colours are CSS variables from the theme (--s1..--s5, --muted, --accent),
 * so a chart follows its slide's surface. Sizes are slide pixels.
 */

import { parseNumber, type Block } from "./parse";
import { runsText } from "./inline";

export const CHART_TYPES = ["bar", "hbar", "stacked", "line", "area", "pie", "donut"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartSpec {
  type: ChartType;
  categories: string[];
  series: { name: string; values: (number | null)[] }[];
  unit: string;
  prefix: string;
  suffix: string;
  highlight: string | null;
  zero: boolean | null;
  decimals: number;
  warnings: string[];
}

const ALIASES: Record<string, ChartType> = {
  column: "bar",
  columns: "bar",
  bars: "bar",
  horizontal: "hbar",
  "horizontal-bar": "hbar",
  barh: "hbar",
  "stacked-bar": "stacked",
  lines: "line",
  pie: "pie",
  doughnut: "donut",
};

export function chartType(v: string | undefined): ChartType {
  const k = (v || "bar").trim().toLowerCase();
  if ((CHART_TYPES as readonly string[]).includes(k)) return k as ChartType;
  return ALIASES[k] ?? "bar";
}

/** Build a chart spec from a table block and the slide directive. */
export function chartSpec(table: Extract<Block, { type: "table" }>, d: Record<string, string>): ChartSpec {
  const warnings: string[] = [];
  const header = table.header.map((h) => runsText(h.runs).trim());
  const categories = table.rows.map((r) => (r[0] ? runsText(r[0].runs).trim() : ""));
  let decimals = 0;
  const series = header.slice(1).map((name, k) => ({
    name,
    values: table.rows.map((r, ri) => {
      const cell = r[k + 1];
      if (!cell) return null;
      const raw = runsText(cell.runs);
      const v = parseNumber(raw);
      if (v === null && raw.trim() && !/^[-—–]$|^n\/?a$/i.test(raw.trim())) warnings.push(`Row ${ri + 1}, "${name}": "${raw.trim()}" is not a number.`);
      const dec = /\.(\d+)/.exec(raw.replace(/,/g, ""));
      if (dec) decimals = Math.max(decimals, Math.min(2, dec[1].length));
      return v;
    }),
  }));
  if (!series.length) warnings.push("Chart table needs at least two columns (categories, then one column per series).");
  const unit = (d.unit || "").trim();
  return {
    type: chartType(d.chart),
    categories,
    series,
    unit,
    prefix: d.prefix ?? "",
    suffix: d.suffix ?? (unit === "%" ? "%" : ""),
    highlight: d.highlight ? d.highlight.trim() : null,
    zero: d.zero === undefined ? null : !/^(false|no|0)$/i.test(d.zero.trim()),
    decimals,
    warnings,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatValue(v: number, spec: Pick<ChartSpec, "prefix" | "suffix" | "decimals">, decimals = spec.decimals): string {
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (v < 0 ? "−" : "") + spec.prefix + s + spec.suffix;
}

/** "Nice" axis ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): { ticks: number[]; step: number } {
  if (lo === hi) {
    hi = lo === 0 ? 1 : lo + Math.abs(lo) * 0.5;
    if (lo > 0) lo = 0;
  }
  const span = hi - lo;
  const raw = span / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, step };
}

function stepDecimals(step: number): number {
  if (step >= 1) return 0;
  return Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
}

/** Rough text width in slide pixels (proportional fonts). */
function textW(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += /[0-9]/.test(ch) ? 0.58 : /[il.,:;'|!]/.test(ch) ? 0.3 : /[mwMW%]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.66 : ch === " " ? 0.28 : 0.53;
  return w * size;
}

function colourFor(spec: ChartSpec, seriesIndex: number, category: string | null): string {
  if (spec.highlight) {
    const hit = category !== null ? category.toLowerCase() === spec.highlight.toLowerCase() : spec.series[seriesIndex]?.name.toLowerCase() === spec.highlight.toLowerCase();
    return hit ? "var(--accent)" : "var(--muted)";
  }
  return `var(--s${(seriesIndex % 5) + 1})`;
}

function roundedBar(x: number, y: number, w: number, h: number, r: number, up: boolean): string {
  if (h <= 0 || w <= 0) return "";
  r = Math.min(r, w / 2, h);
  if (up) return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

function roundedHBar(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0 || w <= 0) return "";
  r = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function legend(spec: ChartSpec, x: number, y: number, maxW: number): { svg: string; h: number } {
  if (spec.series.length < 2 || spec.type === "pie" || spec.type === "donut") return { svg: "", h: 0 };
  let cx = x;
  let cy = y;
  const parts: string[] = [];
  spec.series.forEach((s, k) => {
    const w = 18 + 12 + textW(s.name, 21) + 36;
    if (cx + w > x + maxW && cx > x) {
      cx = x;
      cy += 34;
    }
    const isLine = spec.type === "line" || spec.type === "area";
    parts.push(
      isLine
        ? `<rect x="${cx}" y="${cy - 3}" width="22" height="5" rx="2.5" style="fill:${colourFor(spec, k, null)}"/>`
        : `<rect x="${cx}" y="${cy - 9}" width="17" height="17" rx="3" style="fill:${colourFor(spec, k, null)}"/>`,
      `<text class="lg" x="${cx + (isLine ? 32 : 28)}" y="${cy + 7}">${esc(s.name)}</text>`,
    );
    cx += w + (isLine ? 4 : 0);
  });
  return { svg: parts.join(""), h: cy - y + 34 };
}

/** Render a chart as an SVG string sized w×h (slide pixels). */
export function renderChart(spec: ChartSpec, w: number, h: number): string {
  const n = spec.categories.length;
  if (!n || !spec.series.length) {
    return `<svg class="ch" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><text class="tick" x="0" y="40">Add a table: first column categories, then one numeric column per series.</text></svg>`;
  }
  let body: string;
  switch (spec.type) {
    case "hbar":
      body = hbar(spec, w, h);
      break;
    case "line":
    case "area":
      body = line(spec, w, h, spec.type === "area");
      break;
    case "pie":
    case "donut":
      body = pie(spec, w, h, spec.type === "donut");
      break;
    default:
      body = bars(spec, w, h, spec.type === "stacked");
  }
  return `<svg class="ch" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMinYMin meet" role="img">${body}</svg>`;
}

function valueAxis(spec: ChartSpec, lo: number, hi: number, x0: number, x1: number, yOf: (v: number) => number): { svg: string } {
  const { ticks, step } = niceTicks(lo, hi);
  const dec = stepDecimals(step);
  const parts: string[] = [];
  for (const t of ticks) {
    const y = yOf(t);
    parts.push(`<line class="${t === 0 ? "base" : "grid"}" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/>`);
    parts.push(`<text class="tick" x="${x0 - 16}" y="${y + 7}" text-anchor="end">${esc(formatValue(t, spec, dec))}</text>`);
  }
  return { svg: parts.join("") };
}

function axisRange(spec: ChartSpec, stacked: boolean, forceZero: boolean): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  if (stacked) {
    for (let c = 0; c < spec.categories.length; c++) {
      let pos = 0;
      let neg = 0;
      for (const s of spec.series) {
        const v = s.values[c] ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      hi = Math.max(hi, pos);
      lo = Math.min(lo, neg);
    }
  } else {
    for (const s of spec.series) for (const v of s.values) if (v !== null) {
      hi = Math.max(hi, v);
      lo = Math.min(lo, v);
    }
  }
  if (!isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (forceZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  } else {
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
    lo = lo - pad;
    hi = hi + pad;
    if (lo < 0 && Math.min(...spec.series.flatMap((s) => s.values.filter((v): v is number => v !== null))) >= 0) lo = 0;
  }
  const { ticks } = niceTicks(lo, hi);
  return { lo: ticks[0], hi: ticks[ticks.length - 1] };
}

function tickLabelWidth(spec: ChartSpec, lo: number, hi: number): number {
  const { ticks, step } = niceTicks(lo, hi);
  const dec = stepDecimals(step);
  return Math.max(...ticks.map((t) => textW(formatValue(t, spec, dec), 20))) + 18;
}

function bars(spec: ChartSpec, w: number, h: number, stacked: boolean): string {
  const n = spec.categories.length;
  const k = spec.series.length;
  const out: string[] = [];
  const lg = legend(spec, 0, 14, w);
  const top = (lg.h ? lg.h + 22 : 0) + (spec.unit ? 40 : 10) + (k === 1 || stacked ? 34 : 6);
  const { lo, hi } = axisRange(spec, stacked, true);
  const left = tickLabelWidth(spec, lo, hi);
  const catLines = spec.categories.map((c) => c);
  const band = (w - left) / n;
  const catSize = band < 90 ? 18 : 21;
  const wrap = spec.categories.some((c) => textW(c, catSize) > band - 12);
  const bottom = wrap ? 78 : 52;
  const plotH = h - top - bottom;
  const yOf = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  out.push(lg.svg);
  if (spec.unit) out.push(`<text class="unit" x="0" y="${(lg.h ? lg.h + 22 : 0) + 20}">${esc(spec.unit)}</text>`);
  // gridlines (baseline drawn after bars)
  const axis = valueAxis(spec, lo, hi, left, w, yOf);
  out.push(axis.svg.replace(/<line class="base"[^>]*\/>/, ""));
  const groupW = band * (k === 1 || stacked ? 0.58 : 0.74);
  const barW = Math.min(stacked || k === 1 ? 132 : 76, k === 1 || stacked ? groupW : (groupW - (k - 1) * 6) / k);
  const showVals = n * (stacked ? 1 : k) <= 16;
  for (let c = 0; c < n; c++) {
    const cx = left + band * c + band / 2;
    const cat = spec.categories[c];
    const isHi = !!spec.highlight && cat.toLowerCase() === spec.highlight.toLowerCase();
    if (stacked) {
      let pos = 0;
      let neg = 0;
      const x = cx - barW / 2;
      const segs: { v: number; s: number }[] = spec.series.map((s, si) => ({ v: s.values[c] ?? 0, s: si }));
      const lastPos = segs.map((sg) => sg.v > 0).lastIndexOf(true);
      for (const sg of segs) {
        if (!sg.v) continue;
        const a = sg.v >= 0 ? pos : neg;
        const b = a + sg.v;
        if (sg.v >= 0) pos = b;
        else neg = b;
        const y1 = yOf(Math.max(a, b));
        const y2 = yOf(Math.min(a, b));
        const isTop = sg.v > 0 && sg.s === lastPos;
        const d = isTop ? roundedBar(x, y1, barW, y2 - y1, 4, true) : `M${x},${y1}H${x + barW}V${y2}H${x}Z`;
        out.push(`<path d="${d}" style="fill:${colourFor(spec, sg.s, null)};stroke:var(--bg);stroke-width:2"/>`);
      }
      if (showVals) out.push(`<text class="val" x="${cx}" y="${yOf(pos) - 14}" text-anchor="middle">${esc(formatValue(pos, spec))}</text>`);
    } else {
      spec.series.forEach((s, si) => {
        const v = s.values[c];
        if (v === null) return;
        const x = k === 1 ? cx - barW / 2 : cx - (barW * k + 6 * (k - 1)) / 2 + si * (barW + 6);
        const y0 = yOf(0);
        const yv = yOf(v);
        const fill = k === 1 ? (spec.highlight ? (isHi ? "var(--accent)" : "var(--muted)") : "var(--s1)") : colourFor(spec, si, null);
        const d = v >= 0 ? roundedBar(x, yv, barW, y0 - yv, 4, true) : roundedBar(x, y0, barW, yv - y0, 4, false);
        out.push(`<path d="${d}" style="fill:${fill}"/>`);
        if (showVals) {
          const lo = !!spec.highlight && k === 1 && !isHi;
          const ty = v >= 0 ? yv - 14 : yv + 30;
          out.push(`<text class="val${lo ? " lo" : ""}" x="${x + barW / 2}" y="${ty}" text-anchor="middle"${k > 2 ? ' style="font-size:18px"' : ""}>${esc(formatValue(v, spec))}</text>`);
        }
      });
    }
    // category label (wrap to two lines when needed)
    const label = catLines[c];
    const cls = `cat${isHi ? " hi" : ""}`;
    if (wrap && textW(label, catSize) > band - 12) {
      const words = label.split(/\s+/);
      let l1 = "";
      let idx = 0;
      while (idx < words.length && textW((l1 + " " + words[idx]).trim(), catSize) <= band - 12) l1 = (l1 + " " + words[idx++]).trim();
      if (!l1) l1 = words[idx++] ?? "";
      const l2 = words.slice(idx).join(" ");
      out.push(`<text class="${cls}" x="${cx}" y="${top + plotH + 34}" text-anchor="middle" style="font-size:${catSize}px">${esc(l1)}</text>`);
      if (l2) out.push(`<text class="${cls}" x="${cx}" y="${top + plotH + 34 + catSize + 6}" text-anchor="middle" style="font-size:${catSize}px">${esc(l2)}</text>`);
    } else {
      out.push(`<text class="${cls}" x="${cx}" y="${top + plotH + 36}" text-anchor="middle" style="font-size:${catSize}px">${esc(label)}</text>`);
    }
  }
  out.push(`<line class="base" x1="${left}" x2="${w}" y1="${yOf(0)}" y2="${yOf(0)}"/>`);
  return out.join("");
}

function hbar(spec: ChartSpec, w: number, h: number): string {
  const n = spec.categories.length;
  const s = spec.series[0];
  const out: string[] = [];
  const labelW = Math.min(w * 0.36, Math.max(...spec.categories.map((c) => textW(c, 22))) + 28);
  const vals = s.values.map((v) => v ?? 0);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const valW = Math.max(...vals.map((v) => textW(formatValue(v, spec), 22))) + 20;
  const top = spec.unit ? 44 : 8;
  const plotW = w - labelW - valW;
  const row = (h - top) / n;
  const barH = Math.min(52, row * 0.62);
  const xOf = (v: number) => labelW + ((v - min) / (max - min || 1)) * plotW;
  if (spec.unit) out.push(`<text class="unit" x="${labelW}" y="20">${esc(spec.unit)}</text>`);
  for (let c = 0; c < n; c++) {
    const cat = spec.categories[c];
    const v = s.values[c];
    const cy = top + row * c + row / 2;
    const isHi = !!spec.highlight && cat.toLowerCase() === spec.highlight.toLowerCase();
    out.push(`<text class="cat${isHi ? " hi" : ""}" x="${labelW - 24}" y="${cy + 8}" text-anchor="end" style="font-size:22px">${esc(cat)}</text>`);
    if (v === null) continue;
    const x0 = xOf(0);
    const x1 = xOf(v);
    const fill = spec.highlight ? (isHi ? "var(--accent)" : "var(--muted)") : "var(--s1)";
    const d = v >= 0 ? roundedHBar(x0, cy - barH / 2, x1 - x0, barH, 4) : `M${x1},${cy - barH / 2}H${x0}V${cy + barH / 2}H${x1}Z`;
    out.push(`<path d="${d}" style="fill:${fill}"/>`);
    const lo = !!spec.highlight && !isHi;
    out.push(`<text class="val${lo ? " lo" : ""}" x="${Math.max(x0, x1) + 14}" y="${cy + 8}">${esc(formatValue(v, spec))}</text>`);
  }
  out.push(`<line class="base" x1="${xOf(0)}" x2="${xOf(0)}" y1="${top - 6}" y2="${h}"/>`);
  return out.join("");
}

function line(spec: ChartSpec, w: number, h: number, area: boolean): string {
  const n = spec.categories.length;
  const k = spec.series.length;
  const out: string[] = [];
  const lg = k > 4 ? legend(spec, 0, 14, w) : { svg: "", h: 0 };
  const top = (lg.h ? lg.h + 22 : 0) + (spec.unit ? 44 : 14);
  const forceZero = spec.zero ?? area;
  const { lo, hi } = axisRange(spec, false, forceZero);
  const left = tickLabelWidth(spec, lo, hi);
  // direct labels at the line ends (≤ 4 series), so reserve room on the right
  const endLabels = k <= 4;
  const right = endLabels
    ? Math.max(...spec.series.map((s) => {
        const last = [...s.values].reverse().find((v) => v !== null);
        return Math.max(textW(k > 1 ? s.name : "", 21), textW(last != null ? formatValue(last, spec) : "", 22));
      })) + 40
    : 24;
  const bottom = 52;
  const plotH = h - top - bottom;
  const plotW = w - left - right;
  const inset = Math.min(36, plotW / Math.max(1, n - 1) / 2);
  const xOf = (c: number) => left + inset + (n === 1 ? (plotW - 2 * inset) / 2 : ((plotW - 2 * inset) * c) / (n - 1));
  const yOf = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  out.push(lg.svg);
  if (spec.unit) out.push(`<text class="unit" x="0" y="${(lg.h ? lg.h + 22 : 0) + 22}">${esc(spec.unit)}</text>`);
  out.push(valueAxis(spec, lo, hi, left, left + plotW, yOf).svg);
  // category labels: thin out when crowded
  const every = Math.max(1, Math.ceil((n * Math.max(...spec.categories.map((c) => textW(c, 20)))) / (plotW * 0.8)));
  spec.categories.forEach((c, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    const isHi = !!spec.highlight && c.toLowerCase() === spec.highlight.toLowerCase();
    out.push(`<text class="cat${isHi ? " hi" : ""}" x="${xOf(i)}" y="${top + plotH + 38}" text-anchor="middle">${esc(c)}</text>`);
  });
  const hiIdx = spec.highlight ? spec.categories.findIndex((c) => c.toLowerCase() === spec.highlight!.toLowerCase()) : -1;
  if (hiIdx >= 0) out.push(`<line class="lead" x1="${xOf(hiIdx)}" x2="${xOf(hiIdx)}" y1="${top}" y2="${top + plotH}" stroke-dasharray="4 6"/>`);
  const ends: { y: number; name: string; val: string; colour: string }[] = [];
  // draw series in reverse so the first series sits on top
  for (let si = k - 1; si >= 0; si--) {
    const s = spec.series[si];
    const colour = `var(--s${(si % 5) + 1})`;
    const pts = s.values.map((v, i) => (v === null ? null : [xOf(i), yOf(v)] as const));
    const segs: (readonly [number, number])[][] = [];
    let cur: (readonly [number, number])[] = [];
    for (const p of pts) {
      if (p) cur.push(p);
      else if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length) segs.push(cur);
    for (const seg of segs) {
      const d = seg.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
      if (area && seg.length > 1) {
        const base = yOf(Math.max(lo, Math.min(0, hi)));
        out.push(`<path d="${d}L${seg[seg.length - 1][0].toFixed(1)},${base}L${seg[0][0].toFixed(1)},${base}Z" style="fill:${colour};fill-opacity:${k > 1 ? 0.12 : 0.16}"/>`);
      }
      out.push(`<path d="${d}" style="fill:none;stroke:${colour};stroke-width:4;stroke-linejoin:round;stroke-linecap:round"/>`);
    }
    if (hiIdx >= 0 && pts[hiIdx]) {
      const [x, y] = pts[hiIdx]!;
      out.push(`<circle cx="${x}" cy="${y}" r="8" style="fill:${colour};stroke:var(--bg);stroke-width:3"/>`);
      out.push(`<text class="val" x="${x}" y="${y - 22}" text-anchor="middle">${esc(formatValue(s.values[hiIdx]!, spec))}</text>`);
    }
    let lastI = -1;
    for (let i = n - 1; i >= 0; i--) if (s.values[i] !== null) {
      lastI = i;
      break;
    }
    if (lastI >= 0) {
      const [x, y] = pts[lastI]!;
      if (lastI !== hiIdx) out.push(`<circle cx="${x}" cy="${y}" r="7" style="fill:${colour};stroke:var(--bg);stroke-width:3"/>`);
      ends.push({ y, name: s.name, val: formatValue(s.values[lastI]!, spec), colour });
    }
  }
  if (endLabels) {
    // push labels apart vertically
    const lineH = k > 1 ? 52 : 30;
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < lineH) ends[i].y = ends[i - 1].y + lineH;
    const x = left + plotW + 22;
    for (const e of ends) {
      if (k > 1) {
        out.push(`<text class="val" x="${x}" y="${e.y - 2}">${esc(e.val)}</text>`);
        out.push(`<text class="lg" x="${x}" y="${e.y + 24}" style="font-size:19px">${esc(e.name)}</text>`);
      } else {
        out.push(`<text class="val" x="${x}" y="${e.y + 8}">${esc(e.val)}</text>`);
      }
    }
  }
  return out.join("");
}

function pie(spec: ChartSpec, w: number, h: number, donut: boolean): string {
  const s = spec.series[0];
  const vals = s.values.map((v) => Math.max(0, v ?? 0));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const out: string[] = [];
  const R = Math.min(h / 2 - 8, w * 0.27);
  const cx = R + 8;
  const cy = h / 2;
  const r0 = donut ? R * 0.6 : 0;
  let a = -Math.PI / 2;
  const colour = (i: number) => {
    if (spec.highlight) return spec.categories[i].toLowerCase() === spec.highlight.toLowerCase() ? "var(--accent)" : "var(--muted)";
    return i < 5 ? `var(--s${i + 1})` : "var(--muted)";
  };
  vals.forEach((v, i) => {
    if (v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    const a2 = a + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(2)},${(cy + Math.sin(ang) * r).toFixed(2)}`;
    let d: string;
    if (sweep >= Math.PI * 2 - 1e-6) {
      d = `M${cx - R},${cy}A${R},${R} 0 1,1 ${cx + R},${cy}A${R},${R} 0 1,1 ${cx - R},${cy}Z` + (r0 ? `M${cx - r0},${cy}A${r0},${r0} 0 1,0 ${cx + r0},${cy}A${r0},${r0} 0 1,0 ${cx - r0},${cy}Z` : "");
    } else if (r0) {
      d = `M${p(a, R)}A${R},${R} 0 ${large},1 ${p(a2, R)}L${p(a2, r0)}A${r0},${r0} 0 ${large},0 ${p(a, r0)}Z`;
    } else {
      d = `M${cx},${cy}L${p(a, R)}A${R},${R} 0 ${large},1 ${p(a2, R)}Z`;
    }
    out.push(`<path d="${d}" style="fill:${colour(i)};stroke:var(--bg);stroke-width:3;stroke-linejoin:round" fill-rule="evenodd"/>`);
    a = a2;
  });
  if (donut) {
    out.push(`<text class="total" x="${cx}" y="${cy + 14}" text-anchor="middle">${esc(formatValue(vals.reduce((x, y) => x + y, 0), spec))}</text>`);
    out.push(`<text class="totl" x="${cx}" y="${cy + 50}" text-anchor="middle">${esc(s.name || "Total")}</text>`);
  }
  // legend table on the right: swatch, name, share, value
  const lx = cx + R + 88;
  const rowH = Math.min(64, (h - 40) / vals.length);
  const startY = cy - (rowH * vals.length) / 2 + rowH / 2;
  vals.forEach((v, i) => {
    const y = startY + i * rowH;
    const isHi = !!spec.highlight && spec.categories[i].toLowerCase() === spec.highlight.toLowerCase();
    out.push(`<rect x="${lx}" y="${y - 10}" width="20" height="20" rx="3" style="fill:${colour(i)}"/>`);
    out.push(`<text class="cat${isHi ? " hi" : ""}" x="${lx + 40}" y="${y + 8}" style="font-size:24px">${esc(spec.categories[i])}</text>`);
    const pct = Math.round((v / total) * 1000) / 10;
    out.push(`<text class="val" x="${w}" y="${y + 8}" text-anchor="end" style="font-size:24px">${esc(pct.toFixed(pct % 1 ? 1 : 0))}%</text>`);
    if (spec.prefix || spec.suffix || spec.unit) out.push(`<text class="tick" x="${w - 110}" y="${y + 8}" text-anchor="end">${esc(formatValue(v, spec))}</text>`);
    out.push(`<line class="grid" x1="${lx}" x2="${w}" y1="${y + rowH / 2}" y2="${y + rowH / 2}"/>`);
  });
  return out.join("");
}
