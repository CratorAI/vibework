/**
 * A small reader for PowerPoint (.pptx) decks, enough to show each slide
 * legibly: slide size, background, text boxes and placeholders (with the
 * positions and text styles they inherit from their layout and master),
 * pictures, basic shapes (rectangles, rounded rectangles, ellipses, lines)
 * and simple tables. Charts and SmartArt are not drawn: their frame shows a
 * neutral placeholder naming the chart (its title, type and series, when the
 * file has them). Animations and exact typography are out of scope.
 *
 * Output is static HTML (text escaped, pictures as data: URLs) for the
 * sandboxed viewer; slides are laid out in percentages of the slide and
 * container-query units, so they scale to any width without scripts.
 */

import { unzipSync } from "fflate";
import { escapeHtml, OFFICE_PAGE_CSP } from "./shared";

const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
};
/** EMU per CSS pixel (96 dpi) */
const EMU_PX = 9525;
/** Pictures bigger than this are shown as a placeholder (keeps each page small) */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type Files = Record<string, Uint8Array>;

export interface Deck {
  /** Slide size in px (96 dpi) */
  width: number;
  height: number;
  slides: SlideRef[];
  files: Files;
  theme: Theme;
}

export interface SlideRef {
  path: string;
  /** Title placeholder text, else the first text on the slide, else "" */
  title: string;
}

interface Theme {
  colors: Record<string, string>;
  fonts: { major: string; minor: string };
}

interface Part {
  path: string;
  doc: Document;
  rels: Map<string, { target: string; type: string }>;
}

interface Xfrm {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

const decoder = new TextDecoder();

function xml(files: Files, path: string): Document | null {
  const bytes = files[path];
  if (!bytes) return null;
  const doc = new DOMParser().parseFromString(decoder.decode(bytes), "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
}

/** Resolve a relationship target against the part that names it */
function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function relsOf(files: Files, path: string): Part["rels"] {
  const dir = path.split("/").slice(0, -1).join("/");
  const name = path.split("/").pop();
  const doc = xml(files, `${dir}/_rels/${name}.rels`);
  const map: Part["rels"] = new Map();
  if (!doc) return map;
  for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (!id || !target || rel.getAttribute("TargetMode") === "External") continue;
    map.set(id, { target: resolve(path, target), type: rel.getAttribute("Type") ?? "" });
  }
  return map;
}

function part(files: Files, path: string): Part | null {
  const doc = xml(files, path);
  return doc ? { path, doc, rels: relsOf(files, path) } : null;
}

function relOfType(p: Part, suffix: string): string | null {
  for (const rel of p.rels.values()) if (rel.type.endsWith(suffix)) return rel.target;
  return null;
}

/** Direct children in a namespace with a local name */
function kids(el: Element | null | undefined, ns: string, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === name);
}
function kid(el: Element | null | undefined, ns: string, name: string): Element | null {
  return kids(el, ns, name)[0] ?? null;
}
/** First descendant in a namespace with a local name */
function find(el: Element | Document | null | undefined, ns: string, name: string): Element | null {
  return el ? (el.getElementsByTagNameNS(ns, name)[0] ?? null) : null;
}
const num = (v: string | null | undefined, fallback = 0) => {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ── Colours ────────────────────────────────────────────────────────────────

function readTheme(files: Files, master: Part | null): Theme {
  const theme: Theme = { colors: {}, fonts: { major: "", minor: "" } };
  const path = master && relOfType(master, "/theme");
  const doc = path ? xml(files, path) : null;
  const scheme = find(doc, NS.a, "clrScheme");
  for (const c of Array.from(scheme?.children ?? [])) {
    const srgb = find(c, NS.a, "srgbClr")?.getAttribute("val");
    const sys = find(c, NS.a, "sysClr")?.getAttribute("lastClr");
    const value = srgb ?? sys;
    if (value) theme.colors[c.localName] = `#${value}`;
  }
  theme.fonts.major = find(find(doc, NS.a, "majorFont"), NS.a, "latin")?.getAttribute("typeface") ?? "";
  theme.fonts.minor = find(find(doc, NS.a, "minorFont"), NS.a, "latin")?.getAttribute("typeface") ?? "";
  return theme;
}

const SCHEME_ALIAS: Record<string, string> = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}
/** lumMod / lumOff / tint / shade, approximately (in HSL lightness) */
function adjust(hex: string, el: Element): string {
  let [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  for (const m of Array.from(el.children)) {
    const v = num(m.getAttribute("val"), 100000) / 100000;
    if (m.localName === "lumMod") l *= v;
    else if (m.localName === "lumOff") l += v;
    else if (m.localName === "tint") l = l + (1 - l) * (1 - v);
    else if (m.localName === "shade") l *= v;
  }
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  [r, g, b] = [r1 + m0, g1 + m0, b1 + m0];
  return rgbToHex([r * 255, g * 255, b * 255]);
}

/** The colour inside a fill-like element (solidFill, a gradient's first stop), with its alpha */
function colorIn(el: Element | null, theme: Theme): string | null {
  if (!el) return null;
  const c = Array.from(el.children).find((k) => ["srgbClr", "schemeClr", "sysClr", "prstClr"].includes(k.localName));
  if (!c) return null;
  let hex: string | null = null;
  if (c.localName === "srgbClr") hex = `#${c.getAttribute("val")}`;
  else if (c.localName === "sysClr") hex = `#${c.getAttribute("lastClr") ?? "000000"}`;
  else if (c.localName === "prstClr") hex = ({ black: "#000000", white: "#ffffff", red: "#ff0000", blue: "#0000ff", green: "#008000" } as Record<string, string>)[c.getAttribute("val") ?? ""] ?? null;
  else {
    const name = c.getAttribute("val") ?? "";
    hex = theme.colors[SCHEME_ALIAS[name] ?? name] ?? null;
  }
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  hex = adjust(hex, c);
  const alpha = kid(c, NS.a, "alpha");
  if (alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${num(alpha.getAttribute("val"), 100000) / 100000})`;
  }
  return hex;
}

/** A fill (solid, or a gradient's first stop) from an element holding one; "none" for noFill */
function fillOf(el: Element | null, theme: Theme): string | null {
  if (!el) return null;
  if (kid(el, NS.a, "noFill")) return "none";
  const solid = kid(el, NS.a, "solidFill");
  if (solid) return colorIn(solid, theme);
  const grad = kid(el, NS.a, "gradFill");
  if (grad) return colorIn(find(grad, NS.a, "gs"), theme);
  return null;
}

// ── Placeholders and inherited text styles ─────────────────────────────────

interface Ph {
  type: string;
  idx: string | null;
}

function phOf(shape: Element): Ph | null {
  const nv = Array.from(shape.children).find((c) => c.localName.startsWith("nv"));
  const ph = find(nv ?? null, NS.p, "ph");
  if (!ph) return null;
  return { type: ph.getAttribute("type") ?? "obj", idx: ph.getAttribute("idx") };
}

/** The shape in a layout or master that a placeholder inherits from */
function matchPh(p: Part | null, ph: Ph): Element | null {
  if (!p) return null;
  const tree = find(p.doc, NS.p, "spTree");
  const shapes = tree ? Array.from(tree.getElementsByTagNameNS(NS.p, "sp")) : [];
  const typeOf = (t: string) => (t === "ctrTitle" ? "title" : t === "subTitle" ? "body" : t);
  if (ph.idx) {
    const byIdx = shapes.find((s) => phOf(s)?.idx === ph.idx);
    if (byIdx) return byIdx;
  }
  return shapes.find((s) => typeOf(phOf(s)?.type ?? "") === typeOf(ph.type)) ?? shapes.find((s) => phOf(s)?.type === ph.type) ?? null;
}

function xfrmOf(spPr: Element | null): Xfrm | null {
  const x = kid(spPr, NS.a, "xfrm") ?? kid(spPr, NS.p, "xfrm");
  const off = kid(x, NS.a, "off");
  const ext = kid(x, NS.a, "ext");
  if (!x || !off || !ext) return null;
  return {
    x: num(off.getAttribute("x")),
    y: num(off.getAttribute("y")),
    w: num(ext.getAttribute("cx")),
    h: num(ext.getAttribute("cy")),
    rot: num(x.getAttribute("rot")) / 60000,
  };
}

/** Text-level properties found along a placeholder's inheritance chain */
interface Level {
  sz?: number;
  b?: boolean;
  i?: boolean;
  color?: string;
  algn?: string;
  bullet?: string | null;
  marL?: number;
  indent?: number;
  font?: string;
}

function levelFrom(lvlPPr: Element | null, theme: Theme): Level {
  if (!lvlPPr) return {};
  const out: Level = {};
  const algn = lvlPPr.getAttribute("algn");
  if (algn) out.algn = algn;
  if (lvlPPr.hasAttribute("marL")) out.marL = num(lvlPPr.getAttribute("marL"));
  if (lvlPPr.hasAttribute("indent")) out.indent = num(lvlPPr.getAttribute("indent"));
  if (kid(lvlPPr, NS.a, "buNone")) out.bullet = null;
  const ch = kid(lvlPPr, NS.a, "buChar");
  if (ch) out.bullet = ch.getAttribute("char") ?? "•";
  if (kid(lvlPPr, NS.a, "buAutoNum")) out.bullet = "#";
  const def = kid(lvlPPr, NS.a, "defRPr");
  if (def) Object.assign(out, runProps(def, theme));
  return out;
}

function runProps(rPr: Element, theme: Theme): Level {
  const out: Level = {};
  if (rPr.hasAttribute("sz")) out.sz = num(rPr.getAttribute("sz")) / 100;
  if (rPr.hasAttribute("b")) out.b = rPr.getAttribute("b") === "1" || rPr.getAttribute("b") === "true";
  if (rPr.hasAttribute("i")) out.i = rPr.getAttribute("i") === "1" || rPr.getAttribute("i") === "true";
  const color = colorIn(kid(rPr, NS.a, "solidFill"), theme);
  if (color) out.color = color;
  const latin = kid(rPr, NS.a, "latin")?.getAttribute("typeface");
  if (latin) out.font = latin;
  return out;
}

/** lvl1pPr…lvl9pPr of a list style element */
function listLevel(listStyle: Element | null, level: number, theme: Theme): Level {
  return levelFrom(kid(listStyle, NS.a, `lvl${level + 1}pPr`), theme);
}

// ── Rendering ──────────────────────────────────────────────────────────────

interface Ctx {
  deck: Deck;
  slide: Part;
  layout: Part | null;
  master: Part | null;
  /** Converts slide EMU to percentages and font points to cqw */
  pctX: (emu: number) => string;
  pctY: (emu: number) => string;
  cq: (px: number) => string;
}

function fontFamily(name: string | undefined, theme: Theme): string {
  let f = name ?? "";
  if (f === "+mj-lt") f = theme.fonts.major;
  if (f === "+mn-lt" || f.startsWith("+")) f = theme.fonts.minor;
  const safe = f.replace(/["\\<>]/g, "");
  return safe ? `"${safe}", -apple-system, "Helvetica Neue", Arial, sans-serif` : `-apple-system, "Helvetica Neue", Arial, sans-serif`;
}

function textOf(txBody: Element | null): string {
  if (!txBody) return "";
  return kids(txBody, NS.a, "p")
    .map((p) => Array.from(p.getElementsByTagNameNS(NS.a, "t")).map((t) => t.textContent ?? "").join(""))
    .filter((t) => t.trim())
    .join(" ")
    .trim();
}

function renderText(ctx: Ctx, shape: Element, ph: Ph | null): string {
  const txBody = kid(shape, NS.p, "txBody");
  if (!txBody) return "";
  const theme = ctx.deck.theme;
  const layoutShape = ph ? matchPh(ctx.layout, ph) : null;
  const masterShape = ph ? matchPh(ctx.master, ph) : null;
  const txStyles = find(ctx.master?.doc, NS.p, "txStyles");
  const isTitle = ph && (ph.type === "title" || ph.type === "ctrTitle");
  const masterStyle = ph ? (isTitle ? kid(txStyles, NS.p, "titleStyle") : kid(txStyles, NS.p, "bodyStyle")) : kid(txStyles, NS.p, "otherStyle");
  const chain = [
    kid(txBody, NS.a, "lstStyle"),
    kid(kid(layoutShape, NS.p, "txBody"), NS.a, "lstStyle"),
    kid(kid(masterShape, NS.p, "txBody"), NS.a, "lstStyle"),
    masterStyle,
  ];
  const inherited = (level: number): Level => {
    const out: Level = {};
    for (const style of chain.slice().reverse()) Object.assign(out, listLevel(style, level, theme));
    if (!ph && out.bullet === undefined) out.bullet = null;
    return out;
  };

  const bodyPr = kid(txBody, NS.a, "bodyPr") ?? kid(kid(layoutShape, NS.p, "txBody"), NS.a, "bodyPr");
  const anchor = bodyPr?.getAttribute("anchor") ?? (isTitle ? "ctr" : "t");
  const autofit = find(bodyPr, NS.a, "normAutofit");
  const scale = num(autofit?.getAttribute("fontScale"), 100000) / 100000;
  const inset = (name: string, def: number) => ctx.cq(num(bodyPr?.getAttribute(name), def) / EMU_PX);
  const vertical = { t: "flex-start", ctr: "center", b: "flex-end" }[anchor] ?? "flex-start";
  const wrap = bodyPr?.getAttribute("wrap") !== "none";

  const numbering = new Map<number, number>();
  const paragraphs = kids(txBody, NS.a, "p").map((p) => {
    const pPr = kid(p, NS.a, "pPr");
    const level = num(pPr?.getAttribute("lvl"));
    const style: Level = { ...inherited(level), ...levelFrom(pPr, theme) };
    const runs: string[] = [];
    let firstSize = style.sz;
    for (const r of Array.from(p.children)) {
      if (r.localName === "br") {
        runs.push("<br>");
        continue;
      }
      if (r.localName !== "r" && r.localName !== "fld") continue;
      const rPr = kid(r, NS.a, "rPr");
      const props: Level = { ...style, ...(rPr ? runProps(rPr, theme) : {}) };
      const text = kid(r, NS.a, "t")?.textContent ?? "";
      if (!text) continue;
      firstSize ??= props.sz;
      const css = [
        props.sz ? `font-size:${ctx.cq((props.sz * scale * 96) / 72)}` : "",
        props.b ? "font-weight:700" : "",
        props.i ? "font-style:italic" : "",
        rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none" ? "text-decoration:underline" : "",
        rPr?.getAttribute("strike") && rPr.getAttribute("strike") !== "noStrike" ? "text-decoration:line-through" : "",
        props.color ? `color:${props.color}` : "",
        props.font && props.font !== style.font ? `font-family:${escapeHtml(fontFamily(props.font, theme))}` : "",
      ].filter(Boolean).join(";");
      runs.push(`<span style="${css}">${escapeHtml(text)}</span>`);
    }
    const hasText = runs.some((r) => r !== "<br>");
    const sz = ((firstSize ?? style.sz ?? 18) * scale * 96) / 72;
    const align = { l: "left", ctr: "center", r: "right", just: "justify" }[style.algn ?? "l"] ?? "left";
    const marL = (style.marL ?? 0) / EMU_PX;
    const indent = (style.indent ?? 0) / EMU_PX;
    let bullet = "";
    if (hasText && style.bullet) {
      let mark = style.bullet;
      if (mark === "#") {
        const n = (numbering.get(level) ?? 0) + 1;
        numbering.set(level, n);
        mark = `${n}.`;
      }
      bullet = `<span class="bu">${escapeHtml(mark)}</span>`;
    }
    const lnSpc = find(pPr, NS.a, "spcPct");
    const lineHeight = lnSpc ? num(lnSpc.getAttribute("val"), 100000) / 100000 * 1.2 : isTitle ? 1.1 : 1.2;
    const spcBef = find(kid(pPr, NS.a, "spcBef"), NS.a, "spcPts");
    const before = spcBef ? ctx.cq((num(spcBef.getAttribute("val")) / 100) * (96 / 72)) : "0";
    const css = [
      `font-size:${ctx.cq(sz)}`,
      `text-align:${align}`,
      `line-height:${lineHeight.toFixed(2)}`,
      `margin:${before} 0 0 ${ctx.cq(marL)}`,
      bullet ? `text-indent:${ctx.cq(indent)}` : "",
      style.color ? `color:${style.color}` : "",
      style.b ? "font-weight:700" : "",
      style.i ? "font-style:italic" : "",
      style.font ? `font-family:${escapeHtml(fontFamily(style.font, theme))}` : "",
    ].filter(Boolean).join(";");
    return `<p style="${css}">${bullet}${runs.join("") || "&#8203;"}</p>`;
  });

  const box = [
    `justify-content:${vertical}`,
    `padding:${inset("tIns", 45720)} ${inset("rIns", 91440)} ${inset("bIns", 45720)} ${inset("lIns", 91440)}`,
    wrap ? "" : "white-space:nowrap",
    `font-family:${escapeHtml(fontFamily(isTitle ? "+mj-lt" : "+mn-lt", theme))}`,
  ].filter(Boolean).join(";");
  return `<div class="tx" style="${box}">${paragraphs.join("")}</div>`;
}

function pictureSrc(ctx: Ctx, owner: Part, el: Element): string | null {
  const blip = find(el, NS.a, "blip");
  const id = blip?.getAttributeNS(NS.r, "embed");
  const target = id ? owner.rels.get(id)?.target : null;
  const bytes = target ? ctx.deck.files[target] : null;
  if (!target || !bytes || bytes.length > MAX_IMAGE_BYTES) return null;
  const ext = target.split(".").pop()?.toLowerCase() ?? "";
  const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" }[ext];
  if (!mime) return null;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}

/** What kind of chart a plot-area element draws, in words. */
const CHART_KINDS: Record<string, string> = {
  barChart: "Bar chart", bar3DChart: "Bar chart", lineChart: "Line chart", line3DChart: "Line chart",
  pieChart: "Pie chart", pie3DChart: "Pie chart", ofPieChart: "Pie chart", doughnutChart: "Doughnut chart",
  areaChart: "Area chart", area3DChart: "Area chart", scatterChart: "Scatter chart", bubbleChart: "Bubble chart",
  radarChart: "Radar chart", stockChart: "Stock chart", surfaceChart: "Surface chart", surface3DChart: "Surface chart",
};

/** Text of a chart title or series name: rich text runs, or a cached string. */
function chartText(el: Element | null): string {
  if (!el) return "";
  const runs = Array.from(el.getElementsByTagNameNS(NS.a, "t")).map((t) => t.textContent ?? "").join("");
  if (runs.trim()) return runs.trim();
  return Array.from(el.getElementsByTagNameNS(NS.c, "v")).map((v) => v.textContent ?? "").join(" ").trim();
}

/** A chart's title, kind and series names, from the chart part a frame points at. */
export function chartInfo(files: Files, owner: Part, frame: Element): { title: string; kind: string; series: string[] } | null {
  const data = find(frame, NS.a, "graphicData");
  const uri = data?.getAttribute("uri") ?? "";
  if (uri.endsWith("/diagram")) return { title: "", kind: "Diagram", series: [] };
  if (!uri.includes("chart")) return null;
  const ref = data ? Array.from(data.getElementsByTagName("*")).find((e) => e.localName === "chart") : null;
  const id = ref?.getAttributeNS(NS.r, "id");
  const target = id ? owner.rels.get(id)?.target : null;
  const doc = target ? xml(files, target) : null;
  // Newer chart types (waterfall, funnel, treemap…) live in "chartex" parts.
  if (!doc) return { title: "", kind: "Chart", series: [] };
  const chart = Array.from(doc.getElementsByTagName("*")).find((e) => e.localName === "chart" && e !== doc.documentElement) ?? doc.documentElement;
  const title = Array.from(chart.children).find((e) => e.localName === "title");
  const plot = Array.from(chart.getElementsByTagName("*")).find((e) => e.localName === "plotArea");
  let kind = "Chart";
  const series: string[] = [];
  for (const el of Array.from(plot?.children ?? [])) {
    const name = CHART_KINDS[el.localName];
    if (name && kind === "Chart") {
      const dir = Array.from(el.children).find((c) => c.localName === "barDir")?.getAttribute("val");
      kind = el.localName.startsWith("bar") && dir === "col" ? "Column chart" : name;
    }
    if (name) {
      for (const ser of Array.from(el.children).filter((c) => c.localName === "ser")) {
        const label = chartText(Array.from(ser.children).find((c) => c.localName === "tx") ?? null);
        if (label && !series.includes(label)) series.push(label);
      }
    }
  }
  return { title: chartText(title ?? null).slice(0, 120), kind, series: series.slice(0, 4) };
}

/** A neutral stand-in for a chart or diagram the viewer does not draw. */
function chartPlaceholder(pos: string, info: { title: string; kind: string; series: string[] }): string {
  const first = info.title ? `${info.kind === "Diagram" ? "Diagram" : "Chart"}: ${info.title}` : info.kind;
  const second = info.title ? (info.kind === "Diagram" ? "" : info.kind) : info.series.join(", ");
  const icon = info.kind === "Diagram"
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/></svg>`;
  return `<div class="chart" style="${pos}" title="Charts are not drawn in this view">${icon}<div class="chart-title">${escapeHtml(first)}</div>${second ? `<div class="chart-meta">${escapeHtml(second)}</div>` : ""}</div>`;
}

type Transform = (x: Xfrm) => Xfrm;
const identity: Transform = (x) => x;

function renderShapes(ctx: Ctx, owner: Part, tree: Element, transform: Transform, skipPlaceholders: boolean): string {
  const out: string[] = [];
  const theme = ctx.deck.theme;
  for (const el of Array.from(tree.children)) {
    const name = el.localName;
    if (name === "grpSp") {
      const g = kid(kid(el, NS.p, "grpSpPr"), NS.a, "xfrm");
      const off = kid(g, NS.a, "off"), ext = kid(g, NS.a, "ext"), chOff = kid(g, NS.a, "chOff"), chExt = kid(g, NS.a, "chExt");
      let inner = transform;
      if (off && ext && chOff && chExt) {
        const sx = num(ext.getAttribute("cx")) / (num(chExt.getAttribute("cx")) || 1);
        const sy = num(ext.getAttribute("cy")) / (num(chExt.getAttribute("cy")) || 1);
        const ox = num(off.getAttribute("x")), oy = num(off.getAttribute("y"));
        const cx = num(chOff.getAttribute("x")), cy = num(chOff.getAttribute("y"));
        inner = (x) => transform({ x: ox + (x.x - cx) * sx, y: oy + (x.y - cy) * sy, w: x.w * sx, h: x.h * sy, rot: x.rot });
      }
      out.push(renderShapes(ctx, owner, el, inner, skipPlaceholders));
      continue;
    }
    if (!["sp", "pic", "cxnSp", "graphicFrame"].includes(name)) continue;
    const ph = phOf(el);
    if (ph && skipPlaceholders) continue;
    if (ph && ["dt", "ftr", "sldNum"].includes(ph.type) && !textOf(kid(el, NS.p, "txBody"))) continue;
    const spPr = kid(el, NS.p, "spPr");
    let xfrm = name === "graphicFrame" ? xfrmOf(el) : xfrmOf(spPr);
    if (!xfrm && ph) {
      xfrm = xfrmOf(kid(matchPh(ctx.layout, ph), NS.p, "spPr")) ?? xfrmOf(kid(matchPh(ctx.master, ph), NS.p, "spPr"));
    }
    if (!xfrm) continue;
    const t = transform(xfrm);
    const pos = `left:${ctx.pctX(t.x)};top:${ctx.pctY(t.y)};width:${ctx.pctX(t.w)};height:${ctx.pctY(t.h)}${t.rot ? `;transform:rotate(${t.rot}deg)` : ""}`;

    if (name === "pic") {
      const src = pictureSrc(ctx, owner, el);
      out.push(src ? `<img class="pic" style="${pos}" src="${src}" alt="">` : `<div class="pic missing" style="${pos}"></div>`);
      continue;
    }
    if (name === "graphicFrame") {
      const tbl = find(el, NS.a, "tbl");
      if (!tbl) {
        const chart = chartInfo(ctx.deck.files, owner, el);
        out.push(chart ? chartPlaceholder(pos, chart) : `<div class="pic missing" style="${pos}"></div>`);
        continue;
      }
      const rows = kids(tbl, NS.a, "tr").map((tr) => {
        const cells = kids(tr, NS.a, "tc").map((tc) => {
          if (tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1") return "";
          const span = tc.getAttribute("gridSpan");
          const rowSpan = tc.getAttribute("rowSpan");
          const fill = fillOf(kid(tc, NS.a, "tcPr"), theme);
          const attrs = `${span ? ` colspan="${num(span, 1)}"` : ""}${rowSpan ? ` rowspan="${num(rowSpan, 1)}"` : ""}${fill && fill !== "none" ? ` style="background:${fill}"` : ""}`;
          const paras = kids(kid(tc, NS.a, "txBody"), NS.a, "p").map((p) => {
            const runs = Array.from(p.getElementsByTagNameNS(NS.a, "r")).map((r) => {
              const rPr = kid(r, NS.a, "rPr");
              const props = rPr ? runProps(rPr, theme) : {};
              const css = [props.sz ? `font-size:${ctx.cq((props.sz * 96) / 72)}` : "", props.b ? "font-weight:700" : "", props.i ? "font-style:italic" : "", props.color ? `color:${props.color}` : ""].filter(Boolean).join(";");
              return `<span style="${css}">${escapeHtml(kid(r, NS.a, "t")?.textContent ?? "")}</span>`;
            });
            return `<div>${runs.join("") || "&#8203;"}</div>`;
          });
          return `<td${attrs}>${paras.join("")}</td>`;
        });
        return `<tr>${cells.join("")}</tr>`;
      });
      out.push(`<div class="tbl" style="${pos}"><table>${rows.join("")}</table></div>`);
      continue;
    }

    // Shapes, text boxes, placeholders, connectors
    const layoutSpPr = ph ? kid(matchPh(ctx.layout, ph), NS.p, "spPr") : null;
    const geom = kid(spPr, NS.a, "prstGeom")?.getAttribute("prst") ?? (kid(spPr, NS.a, "custGeom") ? "rect" : "rect");
    let fill = fillOf(spPr, theme) ?? fillOf(layoutSpPr, theme);
    const styleFill = find(kid(el, NS.p, "style"), NS.a, "fillRef");
    if (!fill && styleFill && num(styleFill.getAttribute("idx")) > 0) fill = colorIn(styleFill, theme);
    const ln = kid(spPr, NS.a, "ln");
    let stroke = ln ? fillOf(ln, theme) : null;
    const styleLine = find(kid(el, NS.p, "style"), NS.a, "lnRef");
    if (!stroke && !kid(ln, NS.a, "noFill") && styleLine && num(styleLine.getAttribute("idx")) > 0) stroke = colorIn(styleLine, theme);
    const strokeWidth = ln?.hasAttribute("w") ? num(ln.getAttribute("w")) / EMU_PX : 1;
    const isLine = name === "cxnSp" || geom === "line" || geom.startsWith("straightConnector") || geom.startsWith("bentConnector");
    const css = [pos];
    if (isLine) {
      if (stroke && stroke !== "none") {
        const flipH = kid(spPr, NS.a, "xfrm")?.getAttribute("flipH") === "1";
        const flipV = kid(spPr, NS.a, "xfrm")?.getAttribute("flipV") === "1";
        const [x1, x2] = flipH ? [100, 0] : [0, 100];
        const [y1, y2] = flipV ? [100, 0] : [0, 100];
        out.push(`<div class="shape" style="${pos}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" class="line"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${ctx.cq(strokeWidth)}" vector-effect="non-scaling-stroke"/></svg></div>`);
      }
      continue;
    }
    if (fill && fill !== "none") css.push(`background:${fill}`);
    if (stroke && stroke !== "none") css.push(`box-shadow:inset 0 0 0 ${ctx.cq(Math.max(0.5, strokeWidth))} ${stroke}`);
    if (geom === "ellipse") css.push("border-radius:50%");
    else if (geom === "roundRect") css.push(`border-radius:${ctx.cq(Math.min(t.w, t.h) / EMU_PX * 0.16)}`);
    const text = renderText(ctx, el, ph);
    out.push(`<div class="shape" style="${css.join(";")}">${text}</div>`);
  }
  return out.join("");
}

function background(ctx: Ctx): string {
  for (const p of [ctx.slide, ctx.layout, ctx.master]) {
    const bg = find(p?.doc, NS.p, "bg");
    if (!bg) continue;
    const fill = fillOf(kid(bg, NS.p, "bgPr"), ctx.deck.theme);
    if (fill && fill !== "none") return fill;
    const ref = kid(bg, NS.p, "bgRef");
    const color = ref ? colorIn(ref, ctx.deck.theme) : null;
    if (color) return color;
  }
  return "#ffffff";
}

/** Read a deck's structure (slide list, size, theme). Throws when the file is not a deck. */
export function readDeck(bytes: Uint8Array, opts: { media?: boolean } = {}): Deck {
  const files = unzipSync(bytes, {
    filter: (f) => f.originalSize < 64 * 1024 * 1024 && (opts.media !== false || !f.name.startsWith("ppt/media/")),
  }) as Files;
  const pres = part(files, "ppt/presentation.xml");
  if (!pres) throw new Error("This file is not a PowerPoint presentation.");
  const size = find(pres.doc, NS.p, "sldSz");
  const width = num(size?.getAttribute("cx"), 12192000) / EMU_PX;
  const height = num(size?.getAttribute("cy"), 6858000) / EMU_PX;
  const slides: SlideRef[] = [];
  let theme: Theme | null = null;
  for (const id of Array.from(pres.doc.getElementsByTagNameNS(NS.p, "sldId"))) {
    const rid = id.getAttributeNS(NS.r, "id");
    const target = rid ? pres.rels.get(rid)?.target : null;
    if (!target || !files[target]) continue;
    const slide = part(files, target);
    if (!slide) continue;
    if (!theme) {
      const layoutPath = relOfType(slide, "/slideLayout");
      const layout = layoutPath ? part(files, layoutPath) : null;
      const masterPath = layout ? relOfType(layout, "/slideMaster") : null;
      theme = readTheme(files, masterPath ? part(files, masterPath) : null);
    }
    const shapes = Array.from(slide.doc.getElementsByTagNameNS(NS.p, "sp"));
    const title = shapes.find((s) => ["title", "ctrTitle"].includes(phOf(s)?.type ?? ""));
    const text = textOf(kid(title ?? null, NS.p, "txBody")) || shapes.map((s) => textOf(kid(s, NS.p, "txBody"))).find(Boolean) || "";
    slides.push({ path: target, title: text.slice(0, 160) });
  }
  return { width, height, slides, files, theme: theme ?? { colors: {}, fonts: { major: "", minor: "" } } };
}

/** One slide as a static, script-free page that fits its viewport */
export function slidePage(deck: Deck, index: number, canvas: string): string {
  const ref = deck.slides[index];
  const slide = ref ? part(deck.files, ref.path) : null;
  if (!slide) throw new Error("This slide could not be read.");
  const layoutPath = relOfType(slide, "/slideLayout");
  const layout = layoutPath ? part(deck.files, layoutPath) : null;
  const masterPath = layout ? relOfType(layout, "/slideMaster") : null;
  const master = masterPath ? part(deck.files, masterPath) : null;
  const W = deck.width * EMU_PX, H = deck.height * EMU_PX;
  const ctx: Ctx = {
    deck,
    slide,
    layout,
    master,
    pctX: (emu) => `${((emu / W) * 100).toFixed(4)}%`,
    pctY: (emu) => `${((emu / H) * 100).toFixed(4)}%`,
    cq: (px) => `${((px / deck.width) * 100).toFixed(4)}cqw`,
  };
  const layers: string[] = [];
  const showMaster = (p: Part | null) => p && find(p.doc, NS.p, "cSld") && (p.doc.documentElement.getAttribute("showMasterSp") ?? "1") !== "0";
  if (master && showMaster(slide) && showMaster(layout)) {
    const tree = find(master.doc, NS.p, "spTree");
    if (tree) layers.push(renderShapes(ctx, master, tree, identity, true));
  }
  if (layout && showMaster(slide)) {
    const tree = find(layout.doc, NS.p, "spTree");
    if (tree) layers.push(renderShapes(ctx, layout, tree, identity, true));
  }
  const tree = find(slide.doc, NS.p, "spTree");
  if (tree) layers.push(renderShapes(ctx, slide, tree, identity, false));
  const ratio = `${deck.width.toFixed(2)} / ${deck.height.toFixed(2)}`;
  return `<!doctype html><html><head><meta charset="utf-8">${OFFICE_PAGE_CSP}<style>
html,body{margin:0;height:100%;background:${canvas};}
body{display:grid;place-items:center;overflow:hidden;}
.slide{position:relative;container-type:inline-size;width:min(calc(100vw - 32px),calc((100vh - 32px) * ${deck.width.toFixed(2)} / ${deck.height.toFixed(2)}));aspect-ratio:${ratio};background:${background(ctx)};overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.06);color:#000;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;}
.shape,.pic,.tbl{position:absolute;box-sizing:border-box;}
.pic{object-fit:fill;}
.pic.missing{background:repeating-linear-gradient(45deg,rgba(0,0,0,.04) 0 6px,rgba(0,0,0,.08) 6px 12px);}
.tx{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;overflow-wrap:break-word;}
.tx p{margin:0;}
.bu{display:inline-block;min-width:1.1em;text-indent:0;}
.line{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
.tbl table{width:100%;height:100%;border-collapse:collapse;font-size:1.4cqw;}
.tbl td{border:1px solid rgba(0,0,0,.25);padding:.4cqw .6cqw;vertical-align:top;}
.chart{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5cqw;padding:1cqw;text-align:center;overflow:hidden;background:rgba(128,128,128,.07);border:1px dashed rgba(128,128,128,.45);border-radius:.6cqw;color:rgb(112,112,112);font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;}
.chart svg{width:clamp(14px,3.2cqw,40px);height:clamp(14px,3.2cqw,40px);fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;}
.chart-title{font-size:clamp(11px,2cqw,26px);font-weight:600;line-height:1.3;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.chart-meta{font-size:clamp(10px,1.6cqw,20px);line-height:1.3;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
</style></head><body><div class="slide">${layers.join("")}</div></body></html>`;
}
