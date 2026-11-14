/**
 * "Download as HTML": write one self-contained .html file next to the
 * original, for previewable web content. Loaded lazily (it pulls in
 * react-dom/server for Markdown).
 *
 * - HTML: local stylesheets and scripts are inlined, local images (in <img>
 *   and in CSS url()) become data: URIs. Remote URLs are left as they are.
 * - React (.jsx/.tsx), Mermaid: the same page the preview runs; it loads React
 *   or Mermaid from a CDN when opened, so it needs a connection.
 * - Markdown: rendered to static HTML with images inlined.
 * - SVG: an HTML page showing the image as a data: URI.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readArtifact, statArtifact, writeArtifact, isArtifactError } from "@/tauri/artifacts";
import type { ArtifactRef } from "../types";
import { currentHarnessTheme, escapeHtml, mermaidHarness, reactHarness } from "./harness";
import { dirName, resolvePath, separatorOf, stemOf } from "./paths";

/** Stop inlining once this much has been embedded */
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

function isLocalRef(ref: string | null | undefined): ref is string {
  if (!ref) return false;
  const r = ref.trim();
  return r !== "" && !r.startsWith("#") && !r.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(r);
}

function cleanRef(ref: string): string {
  return decodeURIComponent(ref.trim().split(/[?#]/)[0]);
}

function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

class Inliner {
  private used = 0;
  constructor(private sessionId: string) {}

  async dataUri(path: string): Promise<string | null> {
    try {
      const file = await readArtifact(this.sessionId, path);
      const base64 = file.base64 ?? (file.text !== null ? textToBase64(file.text) : null);
      if (!base64) return null;
      this.used += base64.length;
      if (this.used > MAX_INLINE_BYTES) return null;
      return `data:${file.mime || "application/octet-stream"};base64,${base64}`;
    } catch {
      return null;
    }
  }

  async text(path: string): Promise<string | null> {
    try {
      const file = await readArtifact(this.sessionId, path);
      if (file.text === null) return null;
      this.used += file.text.length;
      return this.used > MAX_INLINE_BYTES ? null : file.text;
    } catch {
      return null;
    }
  }

  /** Inline url(...) references in CSS that resolve to local files */
  async css(css: string, cssDir: string): Promise<string> {
    const refs = new Set<string>();
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, ref: string) => {
      if (isLocalRef(ref) && !ref.startsWith("data:")) refs.add(ref);
      return m;
    });
    const map = new Map<string, string>();
    for (const ref of refs) {
      const uri = await this.dataUri(resolvePath(cssDir, cleanRef(ref)));
      if (uri) map.set(ref, uri);
    }
    return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, ref: string) =>
      map.has(ref) ? `url("${map.get(ref)}")` : m,
    );
  }
}

async function exportHtmlPage(artifact: ArtifactRef): Promise<string> {
  const file = await readArtifact(artifact.sessionId, artifact.path);
  if (file.text === null) throw new Error("This file is not text.");
  const dir = dirName(file.path);
  const inliner = new Inliner(artifact.sessionId);
  // DOMParser documents are inert: nothing in them runs or loads.
  const doc = new DOMParser().parseFromString(file.text, "text/html");

  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))) {
    const href = link.getAttribute("href");
    if (!isLocalRef(href)) continue;
    const cssPath = resolvePath(dir, cleanRef(href));
    const css = await inliner.text(cssPath);
    if (css === null) continue;
    const style = doc.createElement("style");
    style.textContent = await inliner.css(css, dirName(cssPath));
    link.replaceWith(style);
  }

  for (const script of Array.from(doc.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    const src = script.getAttribute("src");
    if (!isLocalRef(src)) continue;
    const js = await inliner.text(resolvePath(dir, cleanRef(src)));
    if (js === null) continue;
    script.removeAttribute("src");
    // A literal "</script" would end the element early
    script.textContent = js.replace(/<\/script/gi, "<\\/script");
  }

  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("img[src], source[src], video[poster], link[rel~='icon'][href]"))) {
    const attr = el.hasAttribute("poster") ? "poster" : el.tagName === "LINK" ? "href" : "src";
    const ref = el.getAttribute(attr);
    if (!isLocalRef(ref)) continue;
    const uri = await inliner.dataUri(resolvePath(dir, cleanRef(ref)));
    if (uri) el.setAttribute(attr, uri);
  }

  for (const style of Array.from(doc.querySelectorAll("style"))) {
    style.textContent = await inliner.css(style.textContent ?? "", dir);
  }

  const doctype = file.text.trimStart().toLowerCase().startsWith("<!doctype") ? "<!doctype html>\n" : "";
  return doctype + doc.documentElement.outerHTML;
}

const STATIC_PAGE_STYLE = `
:root{color-scheme:light dark}
body{margin:0;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:Canvas;color:CanvasText}
main{max-width:720px;margin:0 auto;padding:40px 24px 80px}
img{max-width:100%}
pre{overflow:auto;padding:12px 14px;border:1px solid GrayText;border-radius:8px;font-size:13px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
table{border-collapse:collapse}th,td{border:1px solid GrayText;padding:4px 10px}
blockquote{margin-left:0;padding-left:16px;border-left:3px solid GrayText}
`;

function staticPage(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STATIC_PAGE_STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

async function exportMarkdown(artifact: ArtifactRef): Promise<string> {
  const file = await readArtifact(artifact.sessionId, artifact.path);
  if (file.text === null) throw new Error("This file is not text.");
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, file.text));
  const dir = dirName(file.path);
  const inliner = new Inliner(artifact.sessionId);
  const doc = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src");
    if (!isLocalRef(src)) continue;
    const uri = await inliner.dataUri(resolvePath(dir, cleanRef(src)));
    if (uri) img.setAttribute("src", uri);
  }
  return staticPage(stemOf(file.name), doc.querySelector("main")?.innerHTML ?? html);
}

async function exportSvg(artifact: ArtifactRef): Promise<string> {
  const file = await readArtifact(artifact.sessionId, artifact.path);
  const uri = await new Inliner(artifact.sessionId).dataUri(file.path);
  if (!uri) throw new Error("Could not read the image.");
  return staticPage(file.name, `<img src="${uri.replace("data:application/octet-stream", "data:image/svg+xml")}" alt="${escapeHtml(file.name)}">`);
}

async function exportHarness(artifact: ArtifactRef, kind: "react" | "mermaid"): Promise<string> {
  const file = await readArtifact(artifact.sessionId, artifact.path);
  if (file.text === null) throw new Error("This file is not text.");
  const build = kind === "react" ? reactHarness : mermaidHarness;
  // Relative references resolve next to the exported file, which sits beside the original
  return build({ source: file.text, fileName: file.name, baseHref: "./", theme: currentHarnessTheme() });
}

async function freePath(sessionId: string, dir: string, stem: string): Promise<string> {
  const sep = separatorOf(dir);
  for (let n = 1; n < 100; n++) {
    const candidate = `${dir}${sep}${stem}.standalone${n > 1 ? `-${n}` : ""}.html`;
    try {
      await statArtifact(sessionId, candidate);
    } catch (err) {
      if (isArtifactError(err) && err.code === "not_found") return candidate;
      throw err;
    }
  }
  throw new Error("Could not find a free file name.");
}

/** Build and write the standalone page; returns the new file's path */
export async function exportArtifactAsHtml(artifact: ArtifactRef, typeId: string): Promise<string> {
  let html: string;
  switch (typeId) {
    case "html":
      html = await exportHtmlPage(artifact);
      break;
    case "markdown":
      html = await exportMarkdown(artifact);
      break;
    case "svg":
      html = await exportSvg(artifact);
      break;
    case "react":
    case "mermaid":
      html = await exportHarness(artifact, typeId);
      break;
    default:
      throw new Error("This file cannot be saved as HTML.");
  }
  const target = await freePath(artifact.sessionId, dirName(artifact.path), stemOf(artifact.name));
  const stat = await writeArtifact(artifact.sessionId, target, { text: html });
  return stat.path;
}
