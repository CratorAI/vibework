/**
 * Make Excalidraw load its canvas fonts from our own bundle.
 *
 * Excalidraw 0.18 builds font URLs as `<EXCALIDRAW_ASSET_PATH>/fonts/<Family>/<file>.woff2`
 * and always appends a CDN fallback (esm.sh). The app runs offline under a strict CSP
 * (fonts from self/data only, fetch to self only), so neither the default CDN nor a
 * folder copied into `public/` is acceptable. Instead:
 *
 * - every font file we ship is imported through Vite (`?url&no-inline`, so each one is
 *   emitted as a hashed same-origin asset, never a data: URL that `connect-src` blocks);
 * - `EXCALIDRAW_ASSET_PATH` points at a sentinel base that can never reach the network;
 * - `FontFace` and `fetch` (used by Excalidraw for rendering and for SVG font embedding)
 *   rewrite sentinel URLs to the bundled ones and drop the CDN fallback.
 *
 * Both wrappers only touch URLs that start with the sentinel; every other call passes
 * through unchanged. This module must be imported before `@excalidraw/excalidraw`
 * (it reads the globals when its module is evaluated).
 *
 * Xiaolai (the 12 MB CJK font) is not bundled: CJK text falls back to a system font.
 */

const SENTINEL = "vibework-excalidraw-assets://bundle/";
const CDN_FALLBACK = "https://esm.sh/@excalidraw/";

/** Font files keyed by their path below `dist/prod/`, e.g. `fonts/Nunito/Nunito-Regular-….woff2` */
const fontModules = import.meta.glob<string>(
  "../../../../node_modules/@excalidraw/excalidraw/dist/prod/fonts/{Excalifont,Nunito,ComicShanns,Liberation,Virgil,Cascadia,Lilita,Assistant}/*.woff2",
  { query: "?url&no-inline", import: "default", eager: true },
);

const bundled = new Map<string, string>();
for (const [key, url] of Object.entries(fontModules)) {
  const at = key.indexOf("/dist/prod/");
  if (at >= 0) bundled.set(key.slice(at + "/dist/prod/".length), url);
}

/** Bundled URL for a sentinel URL, or null when the font is not shipped */
function resolveSentinel(url: string): string | null {
  if (!url.startsWith(SENTINEL)) return null;
  const rel = decodeURIComponent(url.slice(SENTINEL.length)).replace(/^\/+/, "");
  return bundled.get(rel) ?? null;
}

/** Rewrite a FontFace `src` descriptor: keep bundled sources, drop sentinel misses and the CDN fallback */
function rewriteFontSource(source: string): string {
  const parts = source.split(/,\s*(?=url\(|local\()/);
  const out: string[] = [];
  for (const part of parts) {
    const m = /^url\(\s*["']?([^"')]+)["']?\s*\)\s*(.*)$/.exec(part.trim());
    if (!m) {
      out.push(part);
      continue;
    }
    const [, url, format] = m;
    if (url.startsWith(SENTINEL)) {
      const resolved = resolveSentinel(url);
      if (resolved) out.push(`url("${resolved}") ${format}`.trim());
    }
    // Anything else here is Excalidraw's CDN fallback: never load it.
  }
  // A FontFace needs at least one source; a missing local font simply fails to load,
  // and the browser falls back to a system font for that range.
  return out.length ? out.join(", ") : 'local("Vibework Missing Font")';
}

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
    EXCALIDRAW_EXPORT_SOURCE?: string;
    __vibeworkExcalidrawAssets?: boolean;
  }
}

function install() {
  if (typeof window === "undefined" || window.__vibeworkExcalidrawAssets) return;
  window.__vibeworkExcalidrawAssets = true;
  window.EXCALIDRAW_ASSET_PATH = SENTINEL;
  // Written into saved files as `source`; the default is the page origin.
  window.EXCALIDRAW_EXPORT_SOURCE = "vibework";

  const NativeFontFace = window.FontFace;
  if (NativeFontFace) {
    class BundledFontFace extends NativeFontFace {
      constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
        super(
          family,
          typeof source === "string" && source.includes(SENTINEL) ? rewriteFontSource(source) : source,
          descriptors,
        );
      }
    }
    window.FontFace = BundledFontFace as typeof FontFace;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (url && url.startsWith(SENTINEL)) {
      const resolved = resolveSentinel(url);
      if (!resolved) return Promise.resolve(new Response(null, { status: 404, statusText: "Not bundled" }));
      return nativeFetch(resolved, init);
    }
    // Excalidraw's own CDN fallback for fonts it could not find: never go to the network.
    if (url && url.startsWith(CDN_FALLBACK)) {
      return Promise.resolve(new Response(null, { status: 404, statusText: "Offline" }));
    }
    return nativeFetch(input, init);
  }) as typeof fetch;
}

install();

export const bundledFontCount = bundled.size;
