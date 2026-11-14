/** Static HTML of the whole deck, one slide per page: used for PDF and PNG export. */

import type { Deck } from "./parse";
import { renderDeck } from "./render";
import { deckCss, GOOGLE_FONTS_HREF } from "./themes";

function attr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function buildPrintPage(deck: Deck, baseHref: string | null): string {
  const r = renderDeck(deck);
  const title = deck.meta.title || "Slides";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${attr(title)}</title>
${baseHref ? `<base href="${attr(baseHref)}">` : ""}
<link rel="stylesheet" href="${attr(GOOGLE_FONTS_HREF)}">
<style>${deckCss()}${r.extraCss}
@page{size:1920px 1080px;margin:0}
html,body{margin:0;padding:0;background:#fff}
.slide{break-after:page;page-break-after:always}
.slide:last-child{break-after:auto;page-break-after:auto}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body><div class="deck" data-theme="${attr(r.themeId)}">${r.slides.map((s) => s.html).join("\n")}</div></body></html>`;
}
