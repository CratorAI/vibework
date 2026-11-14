/**
 * Syntax highlighting for the code view (shiki, loaded lazily).
 *
 * - JavaScript regex engine: no WebAssembly, no eval.
 * - Grammars are bundled and code-split per language; each loads on first use.
 * - The theme emits CSS variables (`--shiki-token-*`), mapped to the app's
 *   tokens in workspace.css, so light and dark both come from index.css.
 */

import {
  createCssVariablesTheme,
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
  type ThemedToken,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

type LangModule = { default: LanguageRegistration | LanguageRegistration[] };

const LOADERS: Record<string, () => Promise<LangModule>> = {
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  less: () => import("shiki/langs/less.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  powershell: () => import("shiki/langs/powershell.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  svelte: () => import("shiki/langs/svelte.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  lua: () => import("shiki/langs/lua.mjs"),
  r: () => import("shiki/langs/r.mjs"),
  dart: () => import("shiki/langs/dart.mjs"),
  mermaid: () => import("shiki/langs/mermaid.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  latex: () => import("shiki/langs/latex.mjs"),
  docker: () => import("shiki/langs/docker.mjs"),
  makefile: () => import("shiki/langs/makefile.mjs"),
};

const THEME_NAME = "vibework-tokens";
const theme = createCssVariablesTheme({ name: THEME_NAME, variablePrefix: "--shiki-", fontStyle: true });

let highlighter: Promise<HighlighterCore> | null = null;
const loading = new Map<string, Promise<void>>();

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [theme],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

async function ensureLanguage(hl: HighlighterCore, lang: string): Promise<boolean> {
  const loader = LOADERS[lang];
  if (!loader) return false;
  if (hl.getLoadedLanguages().includes(lang)) return true;
  let pending = loading.get(lang);
  if (!pending) {
    pending = loader().then((mod) => hl.loadLanguage(mod.default));
    loading.set(lang, pending);
  }
  await pending;
  return true;
}

export type { ThemedToken };

/** Tokens per line, or null when the language has no grammar here (show plain text) */
export async function tokenize(code: string, lang: string): Promise<ThemedToken[][] | null> {
  const hl = await getHighlighter();
  if (!(await ensureLanguage(hl, lang))) return null;
  return hl.codeToTokensBase(code, { lang, theme: THEME_NAME });
}
