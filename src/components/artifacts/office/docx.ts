/**
 * Word (.docx) to a static, readable page: mammoth (BSD-2-Clause) maps the
 * document's structure (headings, paragraphs, lists, tables, images, bold,
 * italic, underline, strike, super/subscript, links) to semantic HTML; the
 * result is rebuilt from an allowlist and styled as a page. mammoth is
 * loaded only when a .docx is opened.
 */

import { escapeHtml, OFFICE_PAGE_CSP, sanitizeOfficeHtml, type OfficeTheme } from "./shared";

/** Word styles mammoth does not map by default */
const STYLE_MAP = [
  "p[style-name='Title'] => h1.title:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Intense Quote'] => blockquote:fresh",
  "u => u",
  "strike => s",
];

export async function docxBody(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, { styleMap: STYLE_MAP, includeDefaultStyleMap: true });
  return sanitizeOfficeHtml(result.value);
}

export function docxPage(body: string, title: string, theme: OfficeTheme): string {
  const { ink, muted, rule, paper, dark } = theme;
  return `<!doctype html><html><head><meta charset="utf-8">${OFFICE_PAGE_CSP}<title>${escapeHtml(title)}</title><style>
html{background:${paper};color-scheme:${dark ? "dark" : "light"};}
body{margin:0;padding:40px 48px 64px;color:${ink};font:15px/1.6 -apple-system,"Helvetica Neue",Arial,sans-serif;}
article{max-width:720px;margin:0 auto;overflow-wrap:break-word;}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 .5em;font-weight:600;}
h1{font-size:22px;} h2{font-size:18px;} h3{font-size:16px;} h4,h5,h6{font-size:15px;}
h1.title{font-size:26px;margin-top:0;}
article>:first-child{margin-top:0;}
p{margin:0 0 .8em;}
p.subtitle{color:${muted};font-size:17px;margin-top:-.3em;}
ul,ol{margin:0 0 .8em;padding-left:1.6em;} li{margin:.2em 0;} li>p{margin:0;}
blockquote{margin:0 0 .8em;padding-left:1em;border-left:3px solid ${rule};color:${muted};}
table{border-collapse:collapse;margin:0 0 1em;max-width:100%;font-size:14px;}
td,th{border:1px solid ${rule};padding:6px 10px;vertical-align:top;text-align:left;}
td>p:last-child,th>p:last-child{margin:0;}
img{max-width:100%;height:auto;}
a{color:inherit;text-decoration:underline;text-underline-offset:2px;}
hr{border:0;border-top:1px solid ${rule};margin:1.5em 0;}
sup,sub{line-height:0;}
</style></head><body><article>${body || `<p style="color:${muted}">This document has no text.</p>`}</article></body></html>`;
}
