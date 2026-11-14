/**
 * Slide → HTML. Output is built only from parsed, escaped values: deck text
 * never passes through as markup. Editable text carries `data-f="<field>"`
 * so the frame runtime can map an edit back to a source range.
 */

import { runsText, type Run } from "./inline";
import { parseNumber, type Block, type Deck, type Slide, type TextRef } from "./parse";
import { chartSpec, renderChart } from "./charts";
import { accentCss, getTheme, type SurfaceName, type Theme } from "./themes";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function runsHtml(runs: Run[]): string {
  return runs
    .map((r) => {
      let h = escapeHtml(r.text);
      if (r.code) h = `<code>${h}</code>`;
      if (r.i) h = `<em>${h}</em>`;
      if (r.b) h = `<strong>${h}</strong>`;
      if (r.mark) h = `<mark>${h}</mark>`;
      if (r.href) h = `<span class="link" data-href="${escapeHtml(r.href)}">${h}</span>`;
      return h;
    })
    .join("");
}

/** An element with editable text. */
function t(tag: string, cls: string, ref: TextRef | undefined, extra = ""): string {
  if (!ref) return "";
  return `<${tag}${cls ? ` class="${cls}"` : ""} data-f="${ref.field}"${extra}>${runsHtml(ref.runs)}</${tag}>`;
}

function plain(ref: TextRef | undefined): string {
  return ref ? runsText(ref.runs) : "";
}

function headlineClass(ref: TextRef | undefined): string {
  const n = plain(ref).length;
  return n <= 34 ? "hl-xl" : n <= 64 ? "hl-l" : n <= 92 ? "hl-m" : "hl-s";
}

const HL_SIZE: Record<string, number> = { "hl-xl": 76, "hl-l": 66, "hl-m": 56, "hl-s": 48 };

function estimateLines(text: string, size: number, width: number): number {
  return Math.max(1, Math.ceil((text.length * size * 0.5) / width));
}

export interface DeckContext {
  theme: Theme;
  mode: SurfaceName;
  footer: string;
  total: number;
  /** Section number and title in force for each slide */
  sections: ({ n: number; title: string } | null)[];
  /** Section number of section slides */
  sectionNo: (number | null)[];
}

export function deckContext(deck: Deck): DeckContext {
  const theme = getTheme(deck.meta.theme);
  const modeRaw = (deck.meta.mode || "").toLowerCase();
  const mode: SurfaceName = modeRaw === "dark" || modeRaw === "light" ? modeRaw : theme.mode;
  const sections: DeckContext["sections"] = [];
  const sectionNo: (number | null)[] = [];
  let cur: { n: number; title: string } | null = null;
  let count = 0;
  for (const s of deck.slides) {
    if (s.layout === "section") {
      count++;
      const h = s.blocks.find((b) => b.type === "heading") as Extract<Block, { type: "heading" }> | undefined;
      const n = s.directive.number && /^\d+$/.test(s.directive.number) ? parseInt(s.directive.number, 10) : count;
      cur = { n, title: plain(h?.text) };
      sectionNo.push(n);
    } else sectionNo.push(null);
    sections.push(cur);
  }
  return { theme, mode, footer: deck.meta.footer ?? "", total: deck.slides.length, sections, sectionNo };
}

export function surfaceFor(slide: Slide, ctx: DeckContext): SurfaceName {
  const d = (slide.directive.surface || slide.directive.background || "").toLowerCase();
  if (d === "dark" || d === "light") return d;
  if (d === "inverse") return ctx.mode === "dark" ? "light" : "dark";
  const byLayout = ctx.theme.surfaces[slide.layout];
  if (byLayout) return ctx.mode === "dark" && ctx.theme.mode === "light" ? (byLayout === "dark" ? "light" : "dark") : byLayout;
  return ctx.mode;
}

interface Parts {
  headings: Extract<Block, { type: "heading" }>[];
  paras: TextRef[];
  sources: TextRef[];
  lists: Extract<Block, { type: "list" }>[];
  quote?: Extract<Block, { type: "quote" }>;
  table?: Extract<Block, { type: "table" }>;
  images: Extract<Block, { type: "image" }>[];
}

function parts(slide: Slide): Parts {
  const p: Parts = { headings: [], paras: [], sources: [], lists: [], images: [] };
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

function kicker(slide: Slide, ctx: DeckContext): string {
  const k = slide.directive.kicker;
  if (k !== undefined) {
    if (/^(none|false|off)$/i.test(k.trim()) || !k.trim()) return "";
    return `<div class="kicker">${escapeHtml(k)}</div>`;
  }
  const sec = ctx.sections[slide.index];
  if (!sec || !sec.title) return "";
  return `<div class="kicker"><span class="kn">${String(sec.n).padStart(2, "0")}</span><span>${escapeHtml(sec.title)}</span></div>`;
}

function footer(slide: Slide, ctx: DeckContext): string {
  if (slide.layout === "title" || /^(none|false|off)$/i.test(slide.directive.footer || "")) return "";
  return `<div class="foot"><span>${escapeHtml(ctx.footer)}</span><span class="pg">${slide.index + 1}</span></div>`;
}

function sources(p: Parts): string {
  return p.sources.map((s) => t("p", "src", s)).join("");
}

function list(l: Extract<Block, { type: "list" }> | undefined, opts: { dense?: boolean; cls?: string } = {}): string {
  if (!l) return "";
  let n = 0;
  const items = l.items
    .map((it) => {
      if (it.level > 0) return `<li class="sub"><span class="mk dot"></span>${t("span", "", it.text)}</li>`;
      n++;
      const mk = l.ordered ? `<span class="mk">${String(n).padStart(2, "0")}</span>` : `<span class="mk dot"></span>`;
      return `<li>${mk}${t("span", "", it.text)}</li>`;
    })
    .join("");
  const dense = opts.dense ?? l.items.length > 4;
  const few = !opts.dense && l.items.filter((it) => it.level === 0).length <= 3 && !l.items.some((it) => it.level > 0);
  return `<ul class="list${dense ? " dense" : ""}${few ? " few" : ""}${opts.cls ? " " + opts.cls : ""}">${items}</ul>`;
}

function media(img: Extract<Block, { type: "image" }> | undefined, contain: boolean): string {
  if (!img) return `<div class="media"><div class="missing">No image</div></div>`;
  return `<div class="media${contain ? " contain" : ""}"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}" draggable="false"></div>`;
}

function isContain(slide: Slide): boolean {
  return /^(contain|fit)$/i.test(slide.directive.fit || "");
}

function layoutHtml(slide: Slide, ctx: DeckContext): { cls: string; inner: string } {
  const p = parts(slide);
  const h = p.headings[0]?.text;
  const hl = (cls = "") => t("h1", `hl ${headlineClass(h)}${cls ? " " + cls : ""}`, h);
  const theme = ctx.theme.id;
  switch (slide.layout) {
    case "title": {
      const sub = p.paras[0];
      const meta = p.paras.slice(1);
      const long = plain(h).length > 38;
      const dot = theme === "graphite" && h && !/[.!?…:]$/.test(plain(h).trim()) ? `<span class="dot">.</span>` : "";
      const img = p.images[0];
      const title = h ? `<h1 class="t-title${long ? " long" : ""}">${t("span", "", h)}${dot}</h1>` : "";
      const inner = `<div class="pad"><div class="t-meta">${meta.map((m) => t("span", "", m)).join("")}</div><div class="t-main">${title}${t("p", "t-sub", sub)}</div></div>${img ? media(img, isContain(slide)) : ""}`;
      return { cls: img ? "has-media" : "", inner };
    }
    case "section": {
      const no = ctx.sectionNo[slide.index] ?? 1;
      const inner = `<div class="pad"><div class="sec-no">${String(no).padStart(2, "0")}</div>${t("h1", "hl", h)}${p.paras.map((x) => t("p", "lede", x)).join("")}</div>`;
      return { cls: "", inner };
    }
    case "statement": {
      if (p.quote) {
        const long = plain(p.quote.text).length > 120;
        const q = `<blockquote class="quote${long ? " long" : ""}"><span class="qm">“</span>${t("span", "", p.quote.text)}<span class="qm">”</span></blockquote>`;
        const attr = p.quote.attribution ? t("div", "attr", p.quote.attribution) : "";
        return { cls: "", inner: `<div class="pad">${q}${attr}${p.paras.map((x) => t("p", "lede", x)).join("")}${sources(p)}</div>` };
      }
      const main = h ?? p.paras[0];
      const rest = h ? p.paras : p.paras.slice(1);
      const long = plain(main).length > 110;
      return { cls: "", inner: `<div class="pad">${t("h1", `hl${long ? " long" : ""}`, main)}${rest.map((x) => t("p", "lede", x)).join("")}${sources(p)}</div>` };
    }
    case "split": {
      const img = p.images[0];
      const imgPos = slide.blocks.findIndex((b) => b.type === "image");
      const firstText = slide.blocks.findIndex((b) => b.type !== "image");
      const side = (slide.directive.image || "").toLowerCase();
      const left = side === "left" || (side !== "right" && imgPos >= 0 && imgPos < firstText);
      const hc = plain(h).length > 48 ? "hl-m" : "hl-l";
      const inner = `<div class="pad">${kicker(slide, ctx)}${t("h1", `hl ${hc}`, h)}${p.paras.map((x) => t("p", "lede", x)).join("")}${list(p.lists[0], { dense: true })}${sources(p)}</div>${media(img, isContain(slide))}`;
      return { cls: left ? "media-left" : "", inner };
    }
    case "image": {
      const img = p.images[0];
      const contain = isContain(slide);
      const cap = `<div class="cap">${h ? t("h1", "hl", h) : ""}${p.paras.map((x) => t("p", "lede", x)).join("")}${sources(p)}</div>`;
      return { cls: contain ? "contain" : "", inner: `${media(img, contain)}<div class="scrim"></div>${cap}` };
    }
    case "stats": {
      const items = (p.lists[0]?.items ?? []).filter((it) => it.level === 0).slice(0, 4);
      const stats = items
        .map((it) => `<div class="stat">${t("div", "v", it.value)}${t("div", "lb", it.label)}</div>`)
        .join("");
      const inner = `<div class="pad">${kicker(slide, ctx)}${hl()}${t("p", "lede", p.paras[0])}<div class="stats" style="--n:${Math.max(1, items.length)}">${stats}</div>${sources(p)}</div>`;
      return { cls: `n${items.length}`, inner };
    }
    case "chart": {
      const lede = p.paras[0];
      const asideParas = p.paras.slice(1);
      const asideList = p.lists[0];
      const hasAside = asideParas.length > 0 || !!asideList;
      const hc = headlineClass(h);
      const lines = estimateLines(plain(h), HL_SIZE[hc], 1540);
      const kick = kicker(slide, ctx);
      let avail = 1080 - 100 - 132 + 48 - (kick ? 49 : 0) - lines * HL_SIZE[hc] * 1.08 - 44;
      if (lede) avail -= 28 + estimateLines(plain(lede), 30, 1220) * 43;
      if (p.sources.length) avail -= 24 + 26 * p.sources.length;
      const w = 1664 - (hasAside ? 440 + 72 : 0);
      const hgt = Math.max(260, Math.round(avail));
      const svg = p.table ? renderChart(chartSpec(p.table, slide.directive), w, hgt) : `<div class="missing">Add a data table to this slide</div>`;
      const aside = hasAside ? `<div class="aside">${asideParas.map((x) => t("p", "", x)).join("")}${list(asideList, { dense: true })}</div>` : "";
      const inner = `<div class="pad">${kick}${t("h1", `hl ${hc}`, h)}${t("p", "lede", lede)}<div class="chartbox"><div class="chart">${svg}</div>${aside}</div>${sources(p)}</div>`;
      return { cls: "", inner };
    }
    case "table": {
      const tb = p.table;
      let table = "";
      if (tb) {
        const cols = tb.header.length;
        const numeric = tb.header.map((_, c) => {
          if (c === 0) return false;
          const cells = tb.rows.map((r) => r[c]).filter(Boolean);
          const nums = cells.filter((cell) => parseNumber(runsText(cell!.runs)) !== null).length;
          return cells.length > 0 && nums / cells.length >= 0.6;
        });
        const cls = (c: number) => {
          const a = tb.align[c];
          if (a === "right" || (a === null && numeric[c])) return ' class="num"';
          if (a === "center") return ' class="ctr"';
          return "";
        };
        const headFixed = tb.header.map((hc, c) => `<th${cls(c)} data-f="${hc.field}">${runsHtml(hc.runs)}</th>`).join("");
        const body = tb.rows
          .map((r) => `<tr>${Array.from({ length: cols }, (_, c) => (r[c] ? `<td${cls(c)} data-f="${r[c].field}">${runsHtml(r[c].runs)}</td>` : `<td${cls(c)}></td>`)).join("")}</tr>`)
          .join("");
        const dense = tb.rows.length > 6 || cols > 5;
        table = `<table class="tbl${dense ? " dense" : ""}"><thead><tr>${headFixed}</tr></thead><tbody>${body}</tbody></table>`;
      }
      return { cls: "", inner: `<div class="pad">${kicker(slide, ctx)}${hl()}${t("p", "lede", p.paras[0])}${table}${sources(p)}</div>` };
    }
    case "closing": {
      const dot = theme === "graphite" && h && !/[.!?…:]$/.test(plain(h).trim()) ? `<span class="dot">.</span>` : "";
      const head = h ? `<h1 class="hl">${t("span", "", h)}${dot}</h1>` : "";
      // keep source order: paragraphs before the list are the lede, after it the contact/meta line
      let seenList = false;
      const body = slide.blocks
        .map((b) => {
          if (b.type === "list") {
            seenList = true;
            return list(b, { dense: true });
          }
          if (b.type !== "paragraph" || b.source) return "";
          return t("p", seenList ? "meta" : "lede", b.text);
        })
        .join("");
      return { cls: "", inner: `<div class="pad">${head}${body}</div>` };
    }
    case "bullets":
    default: {
      const lede = p.paras[0];
      const after = p.paras.slice(1);
      return {
        cls: "",
        inner: `<div class="pad">${kicker(slide, ctx)}${hl()}${t("p", "lede", lede)}${p.lists.map((l) => list(l)).join("")}${after.map((x) => t("p", "lede", x)).join("")}${sources(p)}</div>`,
      };
    }
  }
}

export interface RenderedSlide {
  html: string;
  layout: string;
  surface: SurfaceName;
  title: string;
}

export function renderSlide(deck: Deck, i: number, ctx = deckContext(deck)): RenderedSlide {
  const slide = deck.slides[i];
  const surface = surfaceFor(slide, ctx);
  const { cls, inner } = layoutHtml(slide, ctx);
  const html = `<section class="slide l-${slide.layout} s-${surface}${cls ? " " + cls : ""}" data-i="${i}">${inner}${footer(slide, ctx)}</section>`;
  const h = slide.blocks.find((b) => b.type === "heading") as Extract<Block, { type: "heading" }> | undefined;
  const firstText = slide.blocks.find((b) => b.type === "paragraph" || b.type === "quote") as { text: TextRef } | undefined;
  return { html, layout: slide.layout, surface, title: plain(h?.text ?? firstText?.text) };
}

export interface RenderedDeck {
  themeId: string;
  /** Extra CSS for a brand accent (already validated) */
  extraCss: string;
  slides: RenderedSlide[];
}

export function renderDeck(deck: Deck): RenderedDeck {
  const ctx = deckContext(deck);
  return {
    themeId: ctx.theme.id,
    extraCss: accentCss(deck.meta.accent ?? null),
    slides: deck.slides.map((_, i) => renderSlide(deck, i, ctx)),
  };
}
