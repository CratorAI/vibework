/**
 * The inline HTML page loaded (twice: stage and filmstrip) into sandboxed
 * `artifact://` frames. Self-contained: theme CSS and the runtime are inlined;
 * only Google Fonts load from the network (with system-font fallbacks).
 */

import runtime from "./runtime.js?raw";
import { deckCss, GOOGLE_FONTS_HREF } from "../core/themes";

const FRAME_CSS = `
html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.m-stage #stage{position:fixed;inset:0}
.m-stage .scaler{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0}
.m-stage .mode-stage:not(.presenting) .scaler>.slide{box-shadow:0 0 0 2px var(--c-border,rgba(0,0,0,.1)),0 12px 48px rgba(0,0,0,.10)}
.m-stage .presenting{cursor:none}
html.m-stage:has(.presenting){background:#000}
.m-strip #strip{position:fixed;inset:0;overflow:auto;padding:12px 12px 28px 8px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin;scrollbar-color:var(--c-border-strong,#ccc) transparent}
.m-strip .horizontal #strip{flex-direction:row;padding:10px 12px 6px 12px;gap:10px;align-items:flex-start}
.th{position:relative;display:flex;gap:6px;align-items:flex-start;user-select:none;-webkit-user-select:none;flex:none;cursor:pointer}
.th .no{width:22px;flex:none;text-align:right;font-size:11px;line-height:1;font-weight:500;color:var(--c-muted,#888);padding-top:4px;font-variant-numeric:tabular-nums}
.th.sel .no{color:var(--c-fg,#111)}
.horizontal .th{flex-direction:column;gap:4px}
.horizontal .th .no{width:auto;text-align:left;padding:0 0 0 2px;order:2}
.th .fr{position:relative;overflow:hidden;border-radius:4px;flex:none;box-shadow:0 0 0 1px var(--c-border,rgba(0,0,0,.12))}
.th:hover .fr{box-shadow:0 0 0 1px var(--c-border-strong,rgba(0,0,0,.3))}
.th.sel .fr{box-shadow:0 0 0 2px var(--c-accent,#f9693c)}
.th .fr .scaler{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;pointer-events:none}
.dragging .th{cursor:grabbing}
#drop{position:absolute;display:none;background:var(--c-accent,#f9693c);border-radius:2px;pointer-events:none}
`;

function attr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Page for the stage and filmstrip frames. `baseHref` lets relative image paths resolve against the deck's folder. */
export function buildFramePage(baseHref: string | null): string {
  return `<!doctype html><html><head><meta charset="utf-8">
${baseHref ? `<base href="${attr(baseHref)}">` : ""}
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${attr(GOOGLE_FONTS_HREF)}">
<style>${deckCss()}${FRAME_CSS}</style><style id="extra"></style></head>
<body><div id="root" class="deck"></div><script>${runtime}</script></body></html>`;
}
