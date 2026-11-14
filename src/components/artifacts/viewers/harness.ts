/**
 * Generated pages that run inside the artifact sandbox (served from the
 * `artifact:` scheme via createInlineArtifact, never srcdoc/blob):
 *
 * - React: sucrase (from esm.sh) compiles the component's JSX/TypeScript to
 *   CommonJS in the page; its imports are loaded from esm.sh (React itself
 *   through an import map so there is one copy); the default export is
 *   rendered. Compile, import and runtime errors are shown in the page.
 * - Mermaid: mermaid (from jsDelivr) renders the diagram to SVG.
 *
 * Inside the sandbox only cdnjs, jsDelivr, unpkg, esm.sh and Google Fonts are
 * reachable, so every library comes from there, at exact versions.
 * Source text is embedded as JSON in a non-executing script tag.
 */

export const CDN = {
  /** JSX/TypeScript → CommonJS compiler (about 200 KB; @babel/standalone is 3 MB) */
  sucrase: "https://esm.sh/sucrase@3.35.0?bundle",
  tailwind: "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.17",
  react: "https://esm.sh/react@18.3.1",
  reactDom: "https://esm.sh/react-dom@18.3.1",
  esm: "https://esm.sh/",
  mermaid: "https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.esm.min.mjs",
} as const;

/** JSON that is safe inside a <script> element */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Escape text for an HTML attribute or text node */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Colours handed to a harness page, read from the app's tokens at build time */
export interface HarnessTheme {
  dark: boolean;
  background: string;
  foreground: string;
  muted: string;
  destructive: string;
  destructiveMuted: string;
  border: string;
}

/** Resolve the current theme tokens (computed values, so oklch()/hex as the stylesheet defines them) */
export function currentHarnessTheme(): HarnessTheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const read = (name: string) => css.getPropertyValue(name).trim();
  return {
    dark: root.classList.contains("dark"),
    background: read("--background"),
    foreground: read("--foreground"),
    muted: read("--muted-foreground"),
    destructive: read("--destructive"),
    destructiveMuted: read("--destructive-muted"),
    border: read("--border"),
  };
}

function themeStyle(theme: HarnessTheme): string {
  return `:root{--vw-bg:${theme.background};--vw-fg:${theme.foreground};--vw-muted:${theme.muted};--vw-danger:${theme.destructive};--vw-danger-bg:${theme.destructiveMuted};--vw-border:${theme.border};}`;
}

/** In-page error panel shared by the harnesses */
const ERROR_STYLE = `
#vw-error{position:fixed;inset:0;overflow:auto;padding:20px 22px;background:var(--vw-bg);color:var(--vw-fg);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;z-index:2147483647}
#vw-error h1{margin:0 0 6px;font-size:15px;font-weight:600;color:var(--vw-danger)}
#vw-error p{margin:0 0 12px;color:var(--vw-muted);font-size:13px}
#vw-error pre{margin:0;padding:12px 14px;border:1px solid var(--vw-border);border-radius:8px;background:var(--vw-danger-bg);white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--vw-fg)}
`;

const ERROR_SCRIPT = `
window.__vwShowError = function (title, detail, hint) {
  var box = document.getElementById("vw-error");
  if (!box) { box = document.createElement("div"); box.id = "vw-error"; document.body.appendChild(box); }
  box.textContent = "";
  var h = document.createElement("h1"); h.textContent = title; box.appendChild(h);
  if (hint) { var p = document.createElement("p"); p.textContent = hint; box.appendChild(p); }
  var pre = document.createElement("pre"); pre.textContent = String(detail || ""); box.appendChild(pre);
};
window.addEventListener("error", function (e) {
  var err = e.error;
  window.__vwShowError("Runtime error", (err && (err.stack || err.message)) || e.message || "Unknown error");
});
window.addEventListener("unhandledrejection", function (e) {
  var r = e.reason;
  window.__vwShowError("Runtime error", (r && (r.stack || r.message)) || String(r));
});
`;

/**
 * Page that compiles and renders a React component file (.jsx/.tsx).
 * `baseHref` is the folder URL of the file so relative image/CSS imports resolve.
 */
export function reactHarness(opts: {
  source: string;
  fileName: string;
  baseHref: string;
  theme: HarnessTheme;
}): string {
  const importMap = {
    imports: {
      react: CDN.react,
      "react/": `${CDN.react}/`,
      "react-dom": CDN.reactDom,
      "react-dom/": `${CDN.reactDom}/`,
    },
  };
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.fileName)}</title>
<base href="${escapeHtml(opts.baseHref)}">
<script type="importmap">${jsonForScript(importMap)}</script>
<script async src="${CDN.tailwind}"></script>
<style type="text/tailwindcss">
/* Tailwind v3 defaults most generated components assume */
@layer base { *, ::after, ::before, ::backdrop, ::file-selector-button { border-color: var(--color-gray-200, currentcolor); } button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; } }
</style>
<style>${themeStyle(opts.theme)}${ERROR_STYLE}
html,body{margin:0;min-height:100%}
#vw-status{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:var(--vw-muted);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none}
</style>
</head>
<body>
<div id="root"></div>
<div id="vw-status">Loading preview…</div>
<script type="application/json" id="vw-source">${jsonForScript({ source: opts.source, fileName: opts.fileName })}</script>
<script>${ERROR_SCRIPT}</script>
<script type="module">
var input = JSON.parse(document.getElementById("vw-source").textContent);
var fileName = input.fileName;
var statusEl = document.getElementById("vw-status");
var done = function () { if (statusEl) { statusEl.remove(); statusEl = null; } };
var fail = function (title, detail, hint) { done(); window.__vwShowError(title, detail, hint); };
var message = function (err) { return err && err.message ? err.message : String(err); };

/** "Unexpected token (5:3)" -> the offending lines with a caret */
var codeFrame = function (msg) {
  var m = /\\((\\d+):(\\d+)\\)/.exec(msg);
  if (!m) return msg;
  var line = +m[1], col = +m[2];
  var lines = input.source.split("\\n");
  var out = [msg, ""];
  for (var i = Math.max(1, line - 2); i <= Math.min(lines.length, line + 2); i++) {
    var no = String(i).padStart(4, " ");
    out.push((i === line ? ">" : " ") + no + " | " + lines[i - 1]);
    if (i === line) out.push("      | " + " ".repeat(Math.max(0, col)) + "^");
  }
  return out.join("\\n");
};

(async function () {
  var compiler;
  try {
    compiler = await import("${CDN.sucrase}");
  } catch (err) {
    fail("Could not load the compiler", message(err), "The preview needs an internet connection to load React and the compiler.");
    return;
  }

  var code;
  try {
    code = compiler.transform(input.source, {
      transforms: ["typescript", "jsx", "imports"],
      jsxRuntime: "automatic",
      production: true,
      filePath: fileName
    }).code;
  } catch (err) {
    fail("Could not compile " + fileName, codeFrame(message(err)));
    return;
  }

  var specs = [];
  code.replace(/\\brequire\\((["'])([^"']+)\\1\\)/g, function (all, q, spec) {
    if (specs.indexOf(spec) === -1) specs.push(spec);
    return all;
  });

  var modules = {};
  var wrap = function (ns) { var out = { __esModule: true }; for (var k in ns) out[k] = ns[k]; if (!("default" in out)) out["default"] = ns; return out; };
  var bare = [];
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i];
    if (spec.charAt(0) === "." || spec.charAt(0) === "/") {
      if (/\\.css$/i.test(spec)) {
        var link = document.createElement("link");
        link.rel = "stylesheet"; link.href = new URL(spec, document.baseURI).href;
        document.head.appendChild(link);
        modules[spec] = { __esModule: true };
        continue;
      }
      if (/\\.(png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mp3|wav)$/i.test(spec)) {
        modules[spec] = { __esModule: true, "default": new URL(spec, document.baseURI).href };
        continue;
      }
      fail("Unsupported import", 'import "' + spec + '"', "The preview renders a single file. It can import packages from npm (via esm.sh), images and CSS, but not other local code files.");
      return;
    }
    if (spec.indexOf("@/") === 0 || spec.indexOf("~/") === 0) {
      fail("Unsupported import", 'import "' + spec + '"', "Project path aliases are not available in the preview. Import packages from npm, or inline the code in this file.");
      return;
    }
    bare.push(spec);
  }

  var urlFor = function (spec) {
    if (spec === "react" || spec.indexOf("react/") === 0 || spec === "react-dom" || spec.indexOf("react-dom/") === 0) return spec;
    return "${CDN.esm}" + spec + (spec.indexOf("?") === -1 ? "?" : "&") + "external=react,react-dom";
  };

  try {
    await Promise.all(bare.map(function (spec) {
      return import(urlFor(spec)).then(function (ns) { modules[spec] = wrap(ns); }, function (err) {
        throw new Error('Could not load "' + spec + '" from esm.sh: ' + message(err));
      });
    }));
  } catch (err) {
    fail("Could not load a dependency", err.message, "Packages are loaded from esm.sh; check the package name and your internet connection.");
    return;
  }

  var React, ReactDOMClient;
  try {
    React = await import("react");
    ReactDOMClient = await import("react-dom/client");
  } catch (err) {
    fail("Could not load React", message(err), "The preview needs an internet connection to load React.");
    return;
  }

  var module = { exports: {} };
  var require = function (spec) {
    if (Object.prototype.hasOwnProperty.call(modules, spec)) return modules[spec];
    throw new Error("Cannot find module '" + spec + "'");
  };
  try {
    new Function("require", "module", "exports", code)(require, module, module.exports);
  } catch (err) {
    fail("Error while loading " + fileName, err && err.stack ? err.stack : message(err));
    return;
  }

  var exp = module.exports || {};
  var Component = exp["default"];
  var renderable = function (c) { return typeof c === "function" || (c && typeof c === "object" && c.$$typeof); };
  if (!renderable(Component)) {
    Component = null;
    for (var key in exp) {
      if (/^[A-Z]/.test(key) && renderable(exp[key])) { Component = exp[key]; break; }
    }
  }
  if (!Component) {
    fail("Nothing to render", fileName + " has no component export.", "Export a React component as the default export, e.g. export default function App() { ... }");
    return;
  }

  var h = React.createElement;
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error: error }; }
    componentDidCatch(error, info) {
      fail("Runtime error", (error && (error.stack || error.message)) + (info && info.componentStack ? "\\n\\nComponent stack:" + info.componentStack : ""));
    }
    render() { return this.state.error ? null : this.props.children; }
  }
  ReactDOMClient.createRoot(document.getElementById("root")).render(h(Boundary, null, h(Component)));
  requestAnimationFrame(done);
})();
</script>
</body>
</html>`;
}

/** Page that renders a Mermaid diagram */
export function mermaidHarness(opts: { source: string; fileName: string; baseHref: string; theme: HarnessTheme }): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.fileName)}</title>
<base href="${escapeHtml(opts.baseHref)}">
<style>${themeStyle(opts.theme)}${ERROR_STYLE}
html,body{margin:0;min-height:100%;background:var(--vw-bg);color:var(--vw-fg)}
#out{display:flex;justify-content:center;padding:24px}
#out svg{max-width:100%;height:auto}
#status{padding:24px;color:var(--vw-muted);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
</style>
</head>
<body>
<div id="status">Rendering diagram…</div>
<div id="out"></div>
<script type="application/json" id="vw-source">${jsonForScript({ source: opts.source, dark: opts.theme.dark })}</script>
<script>${ERROR_SCRIPT}</script>
<script type="module">
var input = JSON.parse(document.getElementById("vw-source").textContent);
var status = document.getElementById("status");
try {
  var mod = await import("${CDN.mermaid}");
  var mermaid = mod.default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: input.dark ? "dark" : "default" });
  var result = await mermaid.render("vw-diagram", input.source);
  document.getElementById("out").innerHTML = result.svg;
  status.remove();
} catch (err) {
  status.remove();
  window.__vwShowError("Could not render the diagram", err && err.message ? err.message : String(err));
}
</script>
</body>
</html>`;
}
