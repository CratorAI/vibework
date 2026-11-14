/**
 * Shared pieces of the read-only Word and PowerPoint views.
 *
 * Office files are model or user content: whatever they hold is rendered as
 * a static page inside the sandboxed `artifact:` iframe, with scripts off in
 * three independent ways (the HTML is rebuilt from an allowlist of elements
 * and attributes, the page's own CSP forbids every script, and the iframe's
 * sandbox has no `allow-scripts`).
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ExternalLink } from "@/lib/icons";
import { openFile } from "@/tauri/files";
import { errorMessage } from "@/lib/utils";

/** Elements a rendered office page may contain; anything else is unwrapped (its text kept) or dropped */
const ALLOWED = new Set([
  "a", "b", "blockquote", "br", "caption", "code", "col", "colgroup", "div", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "section", "small",
  "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);
/** Elements dropped with everything inside them */
const DROPPED = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "link", "meta", "base", "form", "input", "button", "textarea", "select"]);
/** Attributes kept, per element ("*" for all) */
const ATTRS: Record<string, Set<string>> = {
  "*": new Set(["class"]),
  a: new Set(["href", "id"]),
  img: new Set(["src", "alt", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  ol: new Set(["start"]),
};

function safeHref(value: string): string | null {
  const v = value.trim();
  if (v.startsWith("#")) return v;
  try {
    const url = new URL(v);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Only inline raster images (what mammoth and the deck parser produce) */
function safeImageSrc(value: string): string | null {
  return /^data:image\/(png|jpe?g|gif|webp|bmp|x-emf|x-wmf|tiff);base64,[A-Za-z0-9+/=\s]+$/i.test(value) ? value : null;
}

/**
 * Rebuild `html` from the allowlist above. Parsing happens in an inert
 * document (DOMParser never runs scripts or loads images).
 */
export function sanitizeOfficeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const clean = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (DROPPED.has(tag)) {
        child.remove();
        continue;
      }
      clean(child);
      if (!ALLOWED.has(tag)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const keep = ATTRS["*"].has(name) || ATTRS[tag]?.has(name);
        let value: string | null = keep ? attr.value : null;
        if (value !== null && name === "href") value = safeHref(value);
        if (value !== null && name === "src") value = safeImageSrc(value);
        if (value === null) child.removeAttribute(attr.name);
        else if (value !== attr.value) child.setAttribute(attr.name, value);
      }
      if (tag === "img" && !child.hasAttribute("src")) {
        child.remove();
        continue;
      }
      if (tag === "a" && child.hasAttribute("href") && !child.getAttribute("href")!.startsWith("#")) {
        child.setAttribute("rel", "noopener noreferrer");
        child.setAttribute("target", "_blank");
      }
    }
    // Comments and processing instructions go too
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE && child.nodeType !== Node.TEXT_NODE) child.remove();
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

/** Text safe to put in HTML */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The app's theme tokens, resolved, for the static office pages (they cannot read the app's CSS) */
export interface OfficeTheme {
  dark: boolean;
  paper: string;
  ink: string;
  muted: string;
  rule: string;
  canvas: string;
}
export function officeTheme(): OfficeTheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    dark: root.classList.contains("dark"),
    paper: read("--background", "white"),
    ink: read("--foreground", "black"),
    muted: read("--muted-foreground", "gray"),
    rule: read("--border", "silver"),
    canvas: read("--muted", "whitesmoke"),
  };
}

/** The head every office page gets: no scripts at all, whatever else the artifact scheme allows */
export const OFFICE_PAGE_CSP = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'">`;

const appNames = new Map<string, Promise<string | null>>();
/** "Microsoft Word", "Keynote": the app that opens files like this by default (null when unknown) */
export function useDefaultAppName(path: string): string | null {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let pending = appNames.get(ext);
    if (!pending) {
      pending = invoke<string | null>("app_default_app_name", { path }).catch(() => null);
      appNames.set(ext, pending);
    }
    pending.then((n) => !cancelled && setName(n));
    return () => {
      cancelled = true;
    };
  }, [ext, path]);
  return name;
}

/** The action inside the read-only line: "Open in Microsoft Word" */
export function OpenInAppLink({ path, app }: { path: string; app: string | null }) {
  const open = async () => {
    try {
      await openFile(path);
    } catch (err) {
      toast.error("Couldn’t open the file", { description: errorMessage(err) });
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      title={path}
      className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline decoration-faint underline-offset-[3px] outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      Open in {app ?? "its app"}
      <ExternalLink className="size-3.5 text-muted-foreground" />
    </button>
  );
}

/** "Read-only view. Open in Microsoft Word to edit.", the app name being the action */
export function ReadOnlyLine({ path, className }: { path: string; className?: string }) {
  const app = useDefaultAppName(path);
  return (
    <span className={className}>
      Read-only view. <OpenInAppLink path={path} app={app} /> to edit.
    </span>
  );
}

/** The line as its own 36px row, for views without a toolbar */
export function ReadOnlyBar({ path }: { path: string }) {
  return (
    <div className="flex h-9 shrink-0 items-center border-b px-3 text-meta text-muted-foreground" data-testid="office-readonly">
      <ReadOnlyLine path={path} className="min-w-0 truncate" />
    </div>
  );
}
