/**
 * Deck → PowerPoint with pptxgenjs. Text stays editable (native text boxes),
 * charts are native PowerPoint charts built from the slide's table (editable
 * data), tables are native tables, notes go to the notes page. Positions
 * mirror the HTML layouts: 1 slide pixel = 1/144 inch on a 13.333×7.5in slide.
 */

import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { runsText, type Run } from "./inline";
import { parseNumber, type Block, type Deck, type Slide, type TextRef } from "./parse";
import { chartSpec, type ChartSpec } from "./charts";
import { deckContext, surfaceFor, type DeckContext } from "./render";
import { resolveSurfaces, type Surface } from "./themes";

export interface LoadedImage {
  /** data: URL */
  data: string;
  width: number;
  height: number;
}

export interface PptxOptions {
  /** Resolve an image path from the deck (relative to the deck's folder) */
  loadImage: (src: string) => Promise<LoadedImage | null>;
}

const px = (n: number) => n / 144;
const pt = (n: number) => Math.round((n / 2) * 10) / 10;
const hex = (c: string) => c.replace("#", "").toUpperCase();

type TextProps = PptxGenJS.TextProps;

function runs(rs: Run[], s: Surface, base: Partial<PptxGenJS.TextPropsOptions> = {}, mono = "Consolas"): TextProps[] {
  return rs.map((r) => {
    const o: PptxGenJS.TextPropsOptions = { ...base };
    if (r.b) o.bold = true;
    if (r.i) o.italic = true;
    if (r.code) o.fontFace = mono;
    if (r.mark) o.color = hex(s.accent);
    if (r.href && /^https?:\/\//i.test(r.href)) o.hyperlink = { url: r.href };
    return { text: r.text, options: o };
  });
}

function plain(ref: TextRef | undefined): string {
  return ref ? runsText(ref.runs) : "";
}

function lines(text: string, sizePx: number, widthPx: number): number {
  return Math.max(1, Math.ceil((text.length * sizePx * 0.5) / widthPx));
}

interface Ctx {
  pptx: PptxGenJS;
  deck: Deck;
  dc: DeckContext;
  surfaces: Record<"light" | "dark", Surface>;
  head: string;
  body: string;
  opts: PptxOptions;
  /** Accent colour per slide, for bullet markers (pptxgenjs has no bullet colour option) */
  bulletColors: string[];
}

function parts(slide: Slide) {
  const p = {
    headings: [] as Extract<Block, { type: "heading" }>[],
    paras: [] as TextRef[],
    sources: [] as TextRef[],
    lists: [] as Extract<Block, { type: "list" }>[],
    quote: undefined as Extract<Block, { type: "quote" }> | undefined,
    table: undefined as Extract<Block, { type: "table" }> | undefined,
    images: [] as Extract<Block, { type: "image" }>[],
  };
  for (const b of slide.blocks) {
    if (b.type === "heading") p.headings.push(b);
    else if (b.type === "paragraph") (b.source ? p.sources : p.paras).push(b.text);
    else if (b.type === "list") p.lists.push(b);
    else if (b.type === "quote") p.quote ??= b;
    else if (b.type === "table") p.table ??= b;
    else if (b.type === "image") p.images.push(b);
  }
  return p;
}

const HL: Record<string, number> = { xl: 76, l: 66, m: 56, s: 48 };
function hlSize(text: string): number {
  const n = text.length;
  return n <= 34 ? HL.xl : n <= 64 ? HL.l : n <= 92 ? HL.m : HL.s;
}

async function addImage(c: Ctx, slide: PptxGenJS.Slide, src: string, box: { x: number; y: number; w: number; h: number }, contain: boolean, s: Surface) {
  const img = await c.opts.loadImage(src).catch(() => null);
  if (!img) {
    slide.addShape("rect", { x: px(box.x), y: px(box.y), w: px(box.w), h: px(box.h), fill: { color: hex(s.panel) }, line: { type: "none" } });
    slide.addText(`Image not found: ${src}`, { x: px(box.x), y: px(box.y), w: px(box.w), h: px(box.h), align: "center", valign: "middle", fontFace: c.body, fontSize: 10, color: hex(s.ink3) });
    return;
  }
  if (contain) slide.addShape("rect", { x: px(box.x), y: px(box.y), w: px(box.w), h: px(box.h), fill: { color: hex(s.panel) }, line: { type: "none" } });
  const pad = contain ? 72 : 0;
  const bx = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 };
  if (contain) {
    const r = Math.min(bx.w / img.width, bx.h / img.height);
    const w = img.width * r;
    const h = img.height * r;
    slide.addImage({ data: img.data, x: px(bx.x + (bx.w - w) / 2), y: px(bx.y + (bx.h - h) / 2), w: px(w), h: px(h) });
  } else {
    // pptxgenjs crops to the box from the image's own proportions
    slide.addImage({ data: img.data, x: px(bx.x), y: px(bx.y), w: px(img.width), h: px(img.height), sizing: { type: "cover", w: px(bx.w), h: px(bx.h) } });
  }
}

function text(slide: PptxGenJS.Slide, content: TextProps[] | string, o: PptxGenJS.TextPropsOptions) {
  slide.addText(content as TextProps[], { margin: 0, valign: "top", fit: "none", ...o });
}

function kickerText(c: Ctx, slide: Slide): string {
  const k = slide.directive.kicker;
  if (k !== undefined) return /^(none|false|off)$/i.test(k.trim()) ? "" : k;
  const sec = c.dc.sections[slide.index];
  return sec && sec.title ? `${String(sec.n).padStart(2, "0")}   ${sec.title}` : "";
}

function footerAndNumber(c: Ctx, ps: PptxGenJS.Slide, slide: Slide, s: Surface, light = false) {
  if (slide.layout === "title" || /^(none|false|off)$/i.test(slide.directive.footer || "")) return;
  const color = light ? "D0D0D0" : hex(s.ink3);
  const right = slide.layout === "split" && !/left/i.test(slide.directive.image || "") ? 960 - 72 : 1920 - 128;
  if (c.dc.footer) text(ps, c.dc.footer, { x: px(128), y: px(1010), w: px(right - 128 - 120), h: px(26), fontFace: c.body, fontSize: 8.5, color });
  text(ps, String(slide.index + 1), { x: px(right - 120), y: px(1010), w: px(120), h: px(26), fontFace: c.body, fontSize: 8.5, color, align: "right" });
}

/** Bullets hang left of their text box by about this much (slide px), so list boxes start further right */
const BULLET_HANG = 40;

function bulletParas(c: Ctx, items: Extract<Block, { type: "list" }>, s: Surface, size: number, gapPx: number): TextProps[] {
  const out: TextProps[] = [];
  let n = 0;
  items.items.forEach((it, k) => {
    const sub = it.level > 0;
    if (!sub) n++;
    const base: PptxGenJS.TextPropsOptions = { fontFace: c.body, fontSize: pt(sub ? size * 0.82 : size), color: hex(s.ink2) };
    const rs = runs(it.text.runs, s, base);
    rs.forEach((r, ri) => {
      if (ri === 0) {
        r.options = {
          ...r.options,
          bullet: items.ordered && !sub ? { type: "number", indent: 22 } : { code: sub ? "2013" : "25A0", indent: sub ? 16 : 20 },
          indentLevel: sub ? 1 : 0,
          paraSpaceBefore: k === 0 ? 0 : pt(gapPx),
        };
      }
      if (r.options?.bold) r.options.color = hex(s.ink);
    });
    if (rs.length) rs[rs.length - 1].options = { ...rs[rs.length - 1].options, breakLine: true };
    out.push(...rs);
  });
  return out;
}

function paraRuns(refs: TextRef[], s: Surface, base: PptxGenJS.TextPropsOptions, gapPx = 18): TextProps[] {
  const out: TextProps[] = [];
  refs.forEach((r, k) => {
    const rs = runs(r.runs, s, base);
    if (rs.length) {
      rs[0].options = { ...rs[0].options, paraSpaceBefore: k ? pt(gapPx) : 0 };
      rs[rs.length - 1].options = { ...rs[rs.length - 1].options, breakLine: true };
    }
    out.push(...rs);
  });
  return out;
}

/** Headline at y; returns the y below it. */
function headline(c: Ctx, ps: PptxGenJS.Slide, ref: TextRef | undefined, s: Surface, x: number, y: number, w: number, size?: number): number {
  if (!ref) return y;
  const sz = size ?? hlSize(plain(ref));
  const h = lines(plain(ref), sz, w) * sz * 1.12;
  text(ps, runs(ref.runs, s, { fontFace: c.head, fontSize: pt(sz), color: hex(s.ink), bold: c.dc.theme.head.weight >= 600 }), { x: px(x), y: px(y), w: px(w), h: px(h), lineSpacingMultiple: 0.95 });
  return y + h;
}

function sourcesAt(c: Ctx, ps: PptxGenJS.Slide, p: ReturnType<typeof parts>, s: Surface, x: number, w: number, bottom = 960, color?: string) {
  if (!p.sources.length) return;
  const h = 28 * p.sources.length;
  text(ps, paraRuns(p.sources, s, { fontFace: c.body, fontSize: 9, color: color ?? hex(s.ink3) }, 4), { x: px(x), y: px(bottom - h), w: px(w), h: px(h) });
}

function chartOpts(c: Ctx, spec: ChartSpec, s: Surface): { type: PptxGenJS.CHART_NAME; data: PptxGenJS.OptsChartData[]; opts: PptxGenJS.IChartOpts } {
  const pptx = c.pptx;
  const fmt = `${spec.prefix ? `"${spec.prefix}"` : ""}#,##0${spec.decimals ? "." + "0".repeat(spec.decimals) : ""}${spec.suffix ? `"${spec.suffix}"` : ""}`;
  const data = spec.series.map((se) => ({ name: se.name, labels: spec.categories, values: se.values.map((v) => v ?? 0) }));
  const highlightIdx = spec.highlight ? spec.categories.findIndex((x) => x.toLowerCase() === spec.highlight!.toLowerCase()) : -1;
  const series = s.series.map(hex);
  const single = spec.series.length === 1;
  const common: PptxGenJS.IChartOpts = {
    showLegend: spec.series.length > 1 && spec.type !== "pie" && spec.type !== "donut",
    legendPos: "t",
    legendFontFace: c.body,
    legendFontSize: 10,
    legendColor: hex(s.ink2),
    catAxisLabelColor: hex(s.ink2),
    catAxisLabelFontFace: c.body,
    catAxisLabelFontSize: 10.5,
    catAxisLineShow: true,
    catAxisLineColor: hex(s.ink3),
    valAxisLabelColor: hex(s.ink3),
    valAxisLabelFontFace: c.body,
    valAxisLabelFontSize: 10,
    valAxisLineShow: false,
    valAxisLabelFormatCode: fmt,
    valGridLine: { color: hex(s.rule), size: 0.75 },
    catGridLine: { style: "none" },
    dataLabelColor: hex(s.ink),
    dataLabelFontFace: c.body,
    dataLabelFontSize: 11,
    dataLabelFormatCode: fmt,
    chartColors: series,
    valAxisTitle: spec.unit || undefined,
    showValAxisTitle: !!spec.unit,
    valAxisTitleColor: hex(s.ink3),
    valAxisTitleFontSize: 10,
    valAxisTitleFontFace: c.body,
  };
  switch (spec.type) {
    case "hbar":
    case "bar":
    case "stacked": {
      const colors = single && highlightIdx >= 0 ? spec.categories.map((_, k) => (k === highlightIdx ? hex(s.accent) : hex(s.muted))) : single ? [hex(s.accent)] : series;
      return {
        type: pptx.ChartType.bar,
        data: spec.type === "hbar" ? data.map((d) => ({ ...d, labels: [...d.labels].reverse(), values: [...d.values].reverse() })) : data,
        opts: {
          ...common,
          chartColors: spec.type === "hbar" && colors.length > 1 ? [...colors].reverse() : colors,
          barDir: spec.type === "hbar" ? "bar" : "col",
          barGrouping: spec.type === "stacked" ? "stacked" : "clustered",
          barGapWidthPct: single ? 70 : 50,
          showValue: spec.type !== "stacked" && spec.categories.length * spec.series.length <= 16,
          dataLabelPosition: spec.type === "stacked" ? undefined : "outEnd",
          valAxisHidden: spec.type === "hbar",
          valGridLine: spec.type === "hbar" ? { style: "none" } : common.valGridLine,
        },
      };
    }
    case "line":
    case "area":
      return {
        type: spec.type === "area" ? pptx.ChartType.area : pptx.ChartType.line,
        data,
        opts: { ...common, lineSize: 2.5, lineDataSymbol: "none", chartColorsOpacity: spec.type === "area" ? 35 : undefined },
      };
    case "pie":
    case "donut": {
      const colors = highlightIdx >= 0 ? spec.categories.map((_, k) => (k === highlightIdx ? hex(s.accent) : hex(s.muted))) : spec.categories.map((_, k) => (k < series.length ? series[k] : hex(s.muted)));
      return {
        type: spec.type === "donut" ? pptx.ChartType.doughnut : pptx.ChartType.pie,
        data: data.slice(0, 1),
        opts: {
          ...common,
          chartColors: colors,
          showLegend: true,
          legendPos: "r",
          legendFontSize: 12,
          showPercent: true,
          showValue: false,
          holeSize: 60,
          dataLabelColor: "FFFFFF",
          dataLabelFontSize: 11,
          dataBorder: { pt: 2, color: hex(s.bg) },
        },
      };
    }
  }
}

async function addSlide(c: Ctx, slide: Slide) {
  const ps = c.pptx.addSlide();
  const surfaceName = surfaceFor(slide, c.dc);
  const s = c.surfaces[surfaceName];
  c.bulletColors.push(hex(s.accent));
  ps.background = { color: hex(s.bg) };
  if (slide.notes) ps.addNotes(slide.notes);
  const p = parts(slide);
  const h = p.headings[0]?.text;
  const X = 128;
  const W = 1664;
  const body = (o: PptxGenJS.TextPropsOptions = {}) => ({ fontFace: c.body, fontSize: 15, color: hex(s.ink2), ...o });
  const kick = kickerText(c, slide);
  const kicker = (x: number, y: number, w: number) => {
    if (!kick) return y;
    text(ps, kick.toUpperCase(), { x: px(x), y: px(y), w: px(w), h: px(24), fontFace: c.body, fontSize: 9.5, bold: true, color: hex(s.accent), charSpacing: 2 });
    return y + 49;
  };

  switch (slide.layout) {
    case "title": {
      const img = p.images[0];
      const right = img ? 1920 * 0.58 - 96 : 1920 - 128;
      const w = right - X;
      const meta = p.paras.slice(1);
      if (meta.length) {
        if (c.dc.theme.id !== "slate") ps.addShape("line", { x: px(X), y: px(100), w: px(w), h: 0, line: { color: hex(c.dc.theme.id === "graphite" ? s.rule : s.ink), width: 1 } });
        text(ps, plain(meta[0]).toUpperCase(), { x: px(X), y: px(126), w: px(w / 2), h: px(30), fontFace: c.body, fontSize: 10, color: hex(s.ink2), charSpacing: 2 });
        if (meta[1]) text(ps, plain(meta[1]).toUpperCase(), { x: px(X + w / 2), y: px(126), w: px(w / 2), h: px(30), fontFace: c.body, fontSize: 10, color: hex(s.ink2), charSpacing: 2, align: "right" });
      }
      const tsize = img ? 96 : plain(h).length > 38 ? 100 : 124;
      const tl = lines(plain(h), tsize, w);
      const sub = p.paras[0];
      const subH = sub ? lines(plain(sub), 36, Math.min(w, 1180)) * 36 * 1.35 : 0;
      const bottom = 1080 - 132;
      const subY = bottom - subH;
      const titleY = subY - (sub ? 40 : 0) - tl * tsize * 1.02;
      if (c.dc.theme.id === "slate") ps.addShape("rect", { x: px(X), y: px(titleY - 66), w: px(96), h: px(10), fill: { color: hex(s.accent) }, line: { type: "none" } });
      if (h) text(ps, runs(h.runs, s, { fontFace: c.head, fontSize: pt(tsize), color: hex(s.ink), bold: c.dc.theme.head.weight >= 600 }), { x: px(X), y: px(titleY), w: px(w), h: px(tl * tsize * 1.05), lineSpacingMultiple: 0.9 });
      if (sub) text(ps, runs(sub.runs, s, body({ fontSize: 18 })), { x: px(X), y: px(subY), w: px(Math.min(w, 1180)), h: px(subH) });
      if (img) await addImage(c, ps, img.src, { x: 1920 * 0.58, y: 0, w: 1920 * 0.42, h: 1080 }, false, s);
      break;
    }
    case "section": {
      const no = c.dc.sectionNo[slide.index] ?? 1;
      const hs = 100;
      const hl = lines(plain(h), hs, 1420);
      const lede = p.paras[0];
      const ledeH = lede ? lines(plain(lede), 32, 1220) * 32 * 1.45 + 36 : 0;
      const bottom = 1080 - 132;
      const hy = bottom - ledeH - hl * hs * 1.04;
      const isGraphite = c.dc.theme.id === "graphite";
      const noSize = isGraphite ? 40 : 180;
      text(ps, String(no).padStart(2, "0"), { x: px(X), y: px(hy - 56 - noSize), w: px(600), h: px(noSize), fontFace: isGraphite ? "Consolas" : c.head, fontSize: pt(noSize), color: hex(s.accent), italic: c.dc.theme.id === "ledger" });
      if (h) text(ps, runs(h.runs, s, { fontFace: c.head, fontSize: pt(hs), color: hex(s.ink), bold: c.dc.theme.head.weight >= 600 }), { x: px(X), y: px(hy), w: px(1420), h: px(hl * hs * 1.06), lineSpacingMultiple: 0.92 });
      if (lede) text(ps, runs(lede.runs, s, body({ fontSize: 16 })), { x: px(X), y: px(bottom - ledeH + 36), w: px(1220), h: px(ledeH) });
      break;
    }
    case "statement": {
      const main = p.quote?.text ?? h ?? p.paras[0];
      const size = plain(main).length > 110 ? 64 : 84;
      const ml = lines(plain(main), size, 1480);
      const attr = p.quote?.attribution;
      const totalH = ml * size * 1.12 + (attr ? 56 + 30 : 0);
      let y = (1080 - totalH) / 2 - 20;
      const content = p.quote ? [{ text: "“", options: { color: hex(s.accent) } }, ...runs(main!.runs, s), { text: "”", options: { color: hex(s.accent) } }] : runs(main?.runs ?? [], s);
      text(ps, content.map((r) => ({ ...r, options: { fontFace: c.head, fontSize: pt(size), color: hex(s.ink), bold: c.dc.theme.head.weight >= 600, ...r.options } })), { x: px(X), y: px(y), w: px(1480), h: px(ml * size * 1.14), lineSpacingMultiple: 1.0 });
      y += ml * size * 1.12 + 56;
      if (attr) {
        ps.addShape("line", { x: px(X), y: px(y + 13), w: px(48), h: 0, line: { color: hex(s.accent), width: 1.5 } });
        text(ps, plain(attr).toUpperCase(), { x: px(X + 68), y: px(y), w: px(1300), h: px(30), fontFace: c.body, fontSize: 10.5, color: hex(s.ink3), charSpacing: 2 });
      }
      break;
    }
    case "split": {
      const img = p.images[0];
      const imgPos = slide.blocks.findIndex((b) => b.type === "image");
      const firstText = slide.blocks.findIndex((b) => b.type !== "image");
      const side = (slide.directive.image || "").toLowerCase();
      const left = side === "left" || (side !== "right" && imgPos >= 0 && imgPos < firstText);
      const tx = left ? 960 + 72 : X;
      const tw = 960 - 72 - 128;
      let y = kicker(tx, 100, tw);
      y = headline(c, ps, h, s, tx, y, tw, plain(h).length > 48 ? 56 : 66) + 28;
      if (p.paras.length) {
        const hgt = p.paras.reduce((a, r) => a + lines(plain(r), 29, tw) * 29 * 1.45 + 18, 0);
        text(ps, paraRuns(p.paras, s, body({ fontSize: 14.5 })), { x: px(tx), y: px(y), w: px(tw), h: px(hgt) });
        y += hgt + 26;
      }
      if (p.lists[0]) text(ps, bulletParas(c, p.lists[0], s, 29, 20), { x: px(tx + BULLET_HANG), y: px(y), w: px(tw - BULLET_HANG), h: px(Math.max(80, 940 - y)) });
      sourcesAt(c, ps, p, s, tx, tw);
      if (img) await addImage(c, ps, img.src, { x: left ? 0 : 960, y: 0, w: 960, h: 1080 }, /^(contain|fit)$/i.test(slide.directive.fit || ""), s);
      break;
    }
    case "image": {
      const img = p.images[0];
      const contain = /^(contain|fit)$/i.test(slide.directive.fit || "");
      if (img) await addImage(c, ps, img.src, contain ? { x: 0, y: 0, w: 1920, h: 880 } : { x: 0, y: 0, w: 1920, h: 1080 }, contain, s);
      if (!contain) ps.addShape("rect", { x: 0, y: px(1080 * 0.5), w: px(1920), h: px(1080 * 0.5), fill: { color: "000000", transparency: 45 }, line: { type: "none" } });
      const ink = contain ? hex(s.ink) : "FFFFFF";
      const ink2 = contain ? hex(s.ink2) : "E6E6E6";
      let y = contain ? 900 : 1080 - 104;
      const capH = p.paras.reduce((a, r) => a + lines(plain(r), 28, 1380) * 28 * 1.4, 0);
      const hs = contain ? 44 : 68;
      const hH = h ? lines(plain(h), hs, 1380) * hs * 1.1 : 0;
      y -= capH + hH + (capH ? 22 : 0) + (p.sources.length ? 40 : 0);
      if (contain) y = 900;
      if (h) text(ps, runs(h.runs, s, { fontFace: c.head, fontSize: pt(hs), color: ink, bold: c.dc.theme.head.weight >= 600 }), { x: px(X), y: px(y), w: px(1380), h: px(hH) });
      y += hH + 22;
      if (p.paras.length) text(ps, paraRuns(p.paras, s, { fontFace: c.body, fontSize: 14, color: ink2 }), { x: px(X), y: px(y), w: px(1380), h: px(capH) });
      y += capH + 12;
      if (p.sources.length) text(ps, paraRuns(p.sources, s, { fontFace: c.body, fontSize: 9, color: contain ? hex(s.ink3) : "BFBFBF" }), { x: px(X), y: px(y), w: px(1380), h: px(28) });
      footerAndNumber(c, ps, slide, s, !contain);
      return;
    }
    case "stats": {
      let y = kicker(X, 100, W);
      y = headline(c, ps, h, s, X, y, 1540);
      if (p.paras[0]) {
        const lh = lines(plain(p.paras[0]), 30, 1220) * 30 * 1.45;
        text(ps, runs(p.paras[0].runs, s, body()), { x: px(X), y: px(y + 28), w: px(1220), h: px(lh) });
      }
      const items = (p.lists[0]?.items ?? []).filter((it) => it.level === 0).slice(0, 4);
      const n = Math.max(1, items.length);
      const gap = 56;
      const cw = (W - gap * (n - 1)) / n;
      const vSize = n === 1 ? 240 : n === 4 ? 104 : 132;
      const labelLines = Math.max(1, ...items.map((it) => lines(plain(it.label), n === 1 ? 34 : 27, cw)));
      const blockH = 34 + vSize + 26 + labelLines * 27 * 1.4;
      const top = (p.sources.length ? 920 : 948) - blockH;
      items.forEach((it, k) => {
        const x = X + k * (cw + gap);
        const ruleColor = c.dc.theme.id === "slate" && k === 0 ? s.accent : c.dc.theme.id === "graphite" ? s.rule : s.ink;
        ps.addShape("line", { x: px(x), y: px(top), w: px(cw), h: 0, line: { color: hex(ruleColor), width: c.dc.theme.id === "slate" ? 1.5 : 1 } });
        const vColor = c.dc.theme.id === "graphite" && k === 0 ? s.accent : s.ink;
        text(ps, runs(it.value?.runs ?? [], s, { fontFace: c.head, fontSize: pt(vSize), color: hex(vColor), bold: c.dc.theme.num.weight >= 600 }), { x: px(x), y: px(top + 30), w: px(cw), h: px(vSize * 1.05), valign: "middle" });
        if (it.label) text(ps, runs(it.label.runs, s, body({ fontSize: n === 1 ? 17 : 13.5 })), { x: px(x), y: px(top + 34 + vSize + 22), w: px(Math.min(cw, n === 1 ? 900 : 440)), h: px(labelLines * 27 * 1.45) });
      });
      sourcesAt(c, ps, p, s, X, W);
      break;
    }
    case "chart": {
      let y = kicker(X, 100, W);
      y = headline(c, ps, h, s, X, y, 1540);
      if (p.paras[0]) {
        const lh = lines(plain(p.paras[0]), 30, 1220) * 30 * 1.45;
        text(ps, runs(p.paras[0].runs, s, body()), { x: px(X), y: px(y + 28), w: px(1220), h: px(lh) });
        y += 28 + lh;
      }
      y += 44;
      const aside = p.paras.slice(1);
      const hasAside = aside.length > 0 || !!p.lists[0];
      const cw = W - (hasAside ? 440 + 72 : 0);
      const bottom = p.sources.length ? 920 : 948;
      if (p.table) {
        const spec = chartSpec(p.table, slide.directive);
        const co = chartOpts(c, spec, s);
        ps.addChart(co.type, co.data, { x: px(X), y: px(y), w: px(cw), h: px(bottom - y), ...co.opts });
      }
      if (hasAside) {
        const ax = X + cw + 72;
        ps.addShape("line", { x: px(ax), y: px(y), w: px(440), h: 0, line: { color: hex(s.accent), width: 1 } });
        const content: TextProps[] = [...paraRuns(aside, s, body({ fontSize: 13 }))];
        if (p.lists[0]) content.push(...bulletParas(c, p.lists[0], s, 26, 16));
        text(ps, content, { x: px(ax), y: px(y + 26), w: px(440), h: px(bottom - y - 26) });
      }
      sourcesAt(c, ps, p, s, X, W);
      break;
    }
    case "table": {
      let y = kicker(X, 100, W);
      y = headline(c, ps, h, s, X, y, 1540);
      if (p.paras[0]) {
        const lh = lines(plain(p.paras[0]), 30, 1220) * 30 * 1.45;
        text(ps, runs(p.paras[0].runs, s, body()), { x: px(X), y: px(y + 28), w: px(1220), h: px(lh) });
        y += 28 + lh;
      }
      y += 52;
      const tb = p.table;
      if (tb) {
        const dense = tb.rows.length > 6 || tb.header.length > 5;
        const fs = dense ? 11 : 13;
        const numeric = tb.header.map((_, ci) => {
          if (ci === 0) return false;
          const cells = tb.rows.map((r) => r[ci]).filter(Boolean);
          return cells.length > 0 && cells.filter((x) => parseNumber(runsText(x!.runs)) !== null).length / cells.length >= 0.6;
        });
        const align = (ci: number): PptxGenJS.HAlign => (tb.align[ci] === "right" || (tb.align[ci] === null && numeric[ci]) ? "right" : tb.align[ci] === "center" ? "center" : "left");
        const rows: PptxGenJS.TableRow[] = [];
        rows.push(
          tb.header.map((hc, ci) => ({
            text: plain(hc).toUpperCase(),
            options: { bold: true, fontSize: 8.5, color: hex(s.ink3), align: align(ci), charSpacing: 1.5, border: [{ type: "none" }, { type: "none" }, { pt: 1.5, color: hex(c.dc.theme.id === "graphite" ? s.rule : s.ink) }, { type: "none" }] },
          })) as PptxGenJS.TableRow,
        );
        for (const r of tb.rows) {
          rows.push(
            tb.header.map((_, ci) => ({
              text: r[ci] ? runs(r[ci].runs, s, { fontSize: fs, color: hex(ci === 0 ? s.ink : s.ink2), bold: ci === 0 ? undefined : undefined }) : "",
              options: { align: align(ci), border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: hex(s.rule) }, { type: "none" }] },
            })) as PptxGenJS.TableRow,
          );
        }
        ps.addTable(rows, { x: px(X), y: px(y), w: px(W), fontFace: c.body, fontSize: fs, color: hex(s.ink2), margin: [5, 8, 5, 0], valign: "top" });
      }
      sourcesAt(c, ps, p, s, X, W);
      break;
    }
    case "closing": {
      const hs = 110;
      const hl = lines(plain(h), hs, 1400);
      const list = p.lists[0];
      const listPos = list ? slide.blocks.indexOf(list) : Infinity;
      const before = slide.blocks.filter((b, k) => b.type === "paragraph" && !b.source && k < listPos) as Extract<Block, { type: "paragraph" }>[];
      const after = slide.blocks.filter((b, k) => b.type === "paragraph" && !b.source && k > listPos) as Extract<Block, { type: "paragraph" }>[];
      const lede = before[0]?.text;
      const meta = [...before.slice(1), ...after].map((b) => b.text);
      const ledeH = lede ? lines(plain(lede), 34, 1220) * 34 * 1.45 + 40 : 0;
      const listH = list ? list.items.length * 30 * 1.5 + 56 : 0;
      const metaH = meta.length ? 56 + meta.length * 30 : 0;
      const bottom = 1080 - 132;
      let y = bottom - metaH - listH - ledeH - hl * hs * 1.02;
      if (h) {
        const dot = c.dc.theme.id === "graphite" && !/[.!?…:]$/.test(plain(h).trim()) ? [{ text: ".", options: { color: hex(s.accent) } }] : [];
        text(ps, [...runs(h.runs, s), ...dot].map((r) => ({ ...r, options: { fontFace: c.head, fontSize: pt(hs), color: hex(s.ink), bold: c.dc.theme.head.weight >= 600, ...r.options } })), { x: px(X), y: px(y), w: px(1400), h: px(hl * hs * 1.06), lineSpacingMultiple: 0.92 });
        y += hl * hs * 1.02;
      }
      if (lede) {
        text(ps, runs(lede.runs, s, body({ fontSize: 17 })), { x: px(X), y: px(y + 40), w: px(1220), h: px(ledeH) });
        y += ledeH;
      }
      if (list) {
        text(ps, bulletParas(c, list, s, 30, 16), { x: px(X + BULLET_HANG), y: px(y + 56), w: px(1240), h: px(listH) });
        y += listH;
      }
      if (meta.length) text(ps, meta.map((m) => plain(m)).join("\n"), { x: px(X), y: px(y + 48), w: px(1400), h: px(metaH), fontFace: c.body, fontSize: 12, color: hex(s.ink3) });
      break;
    }
    default: {
      let y = kicker(X, 100, W);
      y = headline(c, ps, h, s, X, y, 1540);
      if (p.paras[0]) {
        const lh = lines(plain(p.paras[0]), 30, 1220) * 30 * 1.45;
        text(ps, runs(p.paras[0].runs, s, body()), { x: px(X), y: px(y + 28), w: px(1220), h: px(lh) });
        y += 28 + lh;
      }
      y += 56;
      for (const l of p.lists) {
        const dense = l.items.length > 4;
        const size = dense ? 30 : 34;
        const est = l.items.reduce((a, it) => a + lines(plain(it.text), size, 1340) * size * 1.36 + (dense ? 40 : 52), 0);
        text(ps, bulletParas(c, l, s, size, dense ? 40 : 52), { x: px(X + BULLET_HANG), y: px(y), w: px(1420 - BULLET_HANG), h: px(Math.min(est, 940 - y)) });
        y += est;
      }
      sourcesAt(c, ps, p, s, X, W);
    }
  }
  footerAndNumber(c, ps, slide, s);
}

/** Build the .pptx. Returns base64 (browser) or bytes (Bun), depending on `output`. */
export async function buildPptx(deck: Deck, opts: PptxOptions, output: "base64" | "uint8array" = "uint8array"): Promise<string | Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.meta.title || "Slides";
  if (deck.meta.author) pptx.author = deck.meta.author;
  const dc = deckContext(deck);
  const c: Ctx = {
    pptx,
    deck,
    dc,
    surfaces: resolveSurfaces(dc.theme, deck.meta.accent),
    head: dc.theme.pptxFonts.head,
    body: dc.theme.pptxFonts.body,
    opts,
    bulletColors: [],
  };
  pptx.theme = { headFontFace: c.head, bodyFontFace: c.body };
  for (const slide of deck.slides) await addSlide(c, slide);
  const buf = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  // colour bullet markers with the slide's accent (OOXML: buClr comes before buSzPct)
  const zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < c.bulletColors.length; i++) {
    const name = `ppt/slides/slide${i + 1}.xml`;
    const f = zip.file(name);
    if (!f) continue;
    const xml = await f.async("string");
    if (!xml.includes("<a:buSzPct")) continue;
    zip.file(name, xml.replace(/<a:buSzPct val="100000"\/>/g, `<a:buClr><a:srgbClr val="${c.bulletColors[i]}"/></a:buClr><a:buSzPct val="100000"/>`));
  }
  return zip.generateAsync({ type: output, compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

/** Image dimensions from PNG/JPEG/GIF/WebP headers (no decoding). */
export function imageSize(bytes: Uint8Array): { width: number; height: number; mime: string } | null {
  const b = bytes;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
    return { width: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], height: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23], mime: "image/png" };
  }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49) return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8), mime: "image/gif" };
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), mime: "image/webp" };
    if (chunk === "VP8 ") return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff, mime: "image/webp" };
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mime: "image/webp" };
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], mime: "image/jpeg" };
      }
      i += 2 + len;
    }
  }
  return null;
}
