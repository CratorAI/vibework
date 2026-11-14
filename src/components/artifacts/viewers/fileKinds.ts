/**
 * File-name helpers shared by the generic viewers: extension sets each viewer
 * matches, and the highlighter language for source files.
 */

/** Lower-cased extension without the dot ("" when there is none) */
export function extOf(fileName: string): string {
  const base = fileName.toLowerCase().split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}

/** Lower-cased base name */
export function baseOf(fileName: string): string {
  return fileName.toLowerCase().split(/[\\/]/).pop() ?? "";
}

export const HTML_EXTS = new Set(["html", "htm"]);
export const REACT_EXTS = new Set(["jsx", "tsx"]);
export const MARKDOWN_EXTS = new Set(["md", "markdown", "mdown", "mkd"]);
export const MERMAID_EXTS = new Set(["mmd", "mermaid"]);
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico"]);
export const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
export const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"]);
export const CSV_EXTS = new Set(["csv", "tsv"]);

/** Extension → highlighter language id (see codeHighlighter.ts) */
const LANGUAGE_BY_EXT: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  json: "json",
  jsonc: "jsonc",
  json5: "jsonc",
  geojson: "json",
  ipynb: "json",
  html: "html",
  htm: "html",
  xml: "xml",
  plist: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  py: "python",
  pyw: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  fish: "shellscript",
  ps1: "powershell",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "ini",
  vue: "vue",
  svelte: "svelte",
  graphql: "graphql",
  gql: "graphql",
  lua: "lua",
  r: "r",
  dart: "dart",
  mmd: "mermaid",
  mermaid: "mermaid",
  diff: "diff",
  patch: "diff",
  tex: "latex",
};

const LANGUAGE_BY_NAME: Record<string, string> = {
  dockerfile: "docker",
  makefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  ".bashrc": "shellscript",
  ".zshrc": "shellscript",
  ".gitignore": "ini",
  ".env": "ini",
};

/** Plain-text extensions shown in the code view without highlighting */
const PLAIN_TEXT_EXTS = new Set(["txt", "text", "log", "csv", "tsv", "env", "lock", "rst", "adoc", "srt", "vtt"]);

/** Highlighter language for a file, or "text" when it has none */
export function languageFor(fileName: string): string {
  const base = baseOf(fileName);
  if (LANGUAGE_BY_NAME[base]) return LANGUAGE_BY_NAME[base];
  return LANGUAGE_BY_EXT[extOf(fileName)] ?? "text";
}

/** Text or source files the code viewer can show */
export function isTextLike(fileName: string): boolean {
  const base = baseOf(fileName);
  if (LANGUAGE_BY_NAME[base]) return true;
  const ext = extOf(fileName);
  return ext in LANGUAGE_BY_EXT || PLAIN_TEXT_EXTS.has(ext);
}
