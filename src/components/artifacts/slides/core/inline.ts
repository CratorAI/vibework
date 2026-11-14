/**
 * Inline Markdown for slide text: **bold**, *italic* / _italic_, `code`,
 * ==accent== and [link](url). Parsed into flat runs (text + style flags) so
 * the HTML renderer, the PowerPoint exporter and in-place editing share one
 * representation; serialized back to Markdown when a person edits text.
 */

export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  code?: boolean;
  mark?: boolean;
  href?: string;
}

type Flags = Omit<Run, "text">;

const PUNCT = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;

/** Index of the closing delimiter for an opener at `from`, or -1. */
function findCloser(src: string, from: number, delim: string): number {
  let k = from;
  while (k < src.length) {
    const ch = src[k];
    if (ch === "\\") {
      k += 2;
      continue;
    }
    if (ch === "`" && delim !== "`") {
      const close = src.indexOf("`", k + 1);
      if (close === -1) return -1;
      k = close + 1;
      continue;
    }
    if (src.startsWith(delim, k)) {
      if (delim === "*" || delim === "_") {
        // a single-char delimiter must not be half of a double one
        if (src[k + 1] === delim) {
          const inner = findCloser(src, k + 2, delim + delim);
          if (inner === -1) {
            k += 2;
            continue;
          }
          k = inner + 2;
          continue;
        }
        if (delim === "_" && k + 1 < src.length && WORD.test(src[k + 1])) {
          k++;
          continue;
        }
      }
      if (k > from && src[k - 1] !== " ") {
        // `***` closing `**` inside `*`: the strong closer is the last two
        if (delim.length === 2) {
          let run = 0;
          while (src[k + run] === delim[0]) run++;
          return k + run - 2;
        }
        return k;
      }
    }
    k++;
  }
  return -1;
}

function push(out: Run[], text: string, flags: Flags) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && sameFlags(last, flags)) {
    last.text += text;
    return;
  }
  out.push({ text, ...cleanFlags(flags) });
}

function cleanFlags(f: Flags): Flags {
  const o: Flags = {};
  if (f.b) o.b = true;
  if (f.i) o.i = true;
  if (f.code) o.code = true;
  if (f.mark) o.mark = true;
  if (f.href) o.href = f.href;
  return o;
}

export function sameFlags(a: Flags, b: Flags): boolean {
  return !!a.b === !!b.b && !!a.i === !!b.i && !!a.code === !!b.code && !!a.mark === !!b.mark && (a.href || "") === (b.href || "");
}

function parseInto(src: string, flags: Flags, out: Run[]) {
  let buf = "";
  let k = 0;
  const flush = () => {
    push(out, buf, flags);
    buf = "";
  };
  while (k < src.length) {
    const ch = src[k];
    if (ch === "\\" && k + 1 < src.length && PUNCT.test(src[k + 1])) {
      buf += src[k + 1];
      k += 2;
      continue;
    }
    if (ch === "`") {
      const close = src.indexOf("`", k + 1);
      if (close > k + 1) {
        flush();
        push(out, src.slice(k + 1, close), { ...flags, code: true });
        k = close + 1;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && src[k + 1] === ch && src[k + 2] && src[k + 2] !== " ") {
      const d = ch + ch;
      const okOpen = ch === "*" || k === 0 || !WORD.test(src[k - 1]);
      const close = okOpen ? findCloser(src, k + 2, d) : -1;
      if (close !== -1 && (ch === "*" || close + 2 >= src.length || !WORD.test(src[close + 2]))) {
        flush();
        parseInto(src.slice(k + 2, close), { ...flags, b: true }, out);
        k = close + 2;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && src[k + 1] !== ch && src[k + 1] && src[k + 1] !== " ") {
      const okOpen = ch === "*" || k === 0 || !WORD.test(src[k - 1]);
      const close = okOpen ? findCloser(src, k + 1, ch) : -1;
      if (close !== -1 && (ch === "*" || close + 1 >= src.length || !WORD.test(src[close + 1]))) {
        flush();
        parseInto(src.slice(k + 1, close), { ...flags, i: true }, out);
        k = close + 1;
        continue;
      }
    }
    if (ch === "=" && src[k + 1] === "=" && src[k + 2] && src[k + 2] !== " " && src[k + 2] !== "=") {
      const close = findCloser(src, k + 2, "==");
      if (close !== -1) {
        flush();
        parseInto(src.slice(k + 2, close), { ...flags, mark: true }, out);
        k = close + 2;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[((?:\\.|[^\]\\])+)\]\(([^)\s]+)\)/.exec(src.slice(k));
      if (m) {
        flush();
        parseInto(m[1], { ...flags, href: m[2] }, out);
        k += m[0].length;
        continue;
      }
    }
    buf += ch;
    k++;
  }
  flush();
}

/** Parse one line (or a soft-wrapped paragraph joined with spaces) of inline Markdown. */
export function parseInline(src: string): Run[] {
  const out: Run[] = [];
  parseInto(src.replace(/\s*\n\s*/g, " "), {}, out);
  return out;
}

export function runsText(runs: Run[]): string {
  return runs.map((r) => r.text).join("");
}

export type EscapeContext = "block" | "item" | "cell" | "heading";

/** Escape literal text so it parses back to the same characters. */
export function escapeText(text: string, ctx: EscapeContext): string {
  let s = text.replace(/\\/g, "\\\\").replace(/([*`[\]])/g, "\\$1").replace(/==/g, "\\==");
  // underscores only act as emphasis at word boundaries
  s = s.replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (m) => (m.length === 2 ? m[0] + "\\_" : "\\_"));
  if (ctx === "cell") s = s.replace(/\|/g, "\\|");
  return s;
}

/** Escape what would change the block type when text starts a line. */
function escapeLineStart(s: string, ctx: EscapeContext): string {
  if (ctx === "cell" || ctx === "heading") return s;
  const num = /^(\d+)([.)])(\s)/.exec(s);
  if (num) return num[1] + "\\" + num[2] + s.slice(num[1].length + 1);
  if (/^notes:/i.test(s)) return s.slice(0, 5) + "\\" + s.slice(5);
  if (/^(#{1,6}\s|>|[-+]\s|<!--|---\s*$|\|)/.test(s)) return "\\" + s;
  if (ctx === "block" && /^!\[/.test(s)) return "\\" + s;
  return s;
}

/** Serialize runs back to inline Markdown. Whitespace is kept outside style markers. */
export function serializeRuns(runs: Run[], ctx: EscapeContext = "block"): string {
  const merged: Run[] = [];
  for (const r0 of runs) {
    const r = { ...r0, text: r0.text.replace(/[\r\n\t\u00a0]+/g, " ") };
    if (!r.text) continue;
    const last = merged[merged.length - 1];
    if (last && sameFlags(last, r)) last.text += r.text;
    else merged.push(r);
  }
  // group by link target; style markers nest inside each group
  let out = "";
  let k = 0;
  while (k < merged.length) {
    const href = merged[k].href || "";
    const group: Run[] = [];
    while (k < merged.length && (merged[k].href || "") === href) group.push(merged[k++]);
    const inner = serializeStyled(group, ctx);
    if (!href) out += inner;
    else {
      const lead = /^\s*/.exec(inner)![0];
      const trail = /\s*$/.exec(inner)![0];
      const core = inner.slice(lead.length, inner.length - trail.length);
      out += core ? lead + "[" + core + "](" + href.replace(/[()\s]/g, encodeURIComponent) + ")" + trail : inner;
    }
  }
  out = out.replace(/\s+/g, " ").trim();
  return escapeLineStart(out, ctx);
}

type Marker = "mark" | "b" | "i";
const MARKER: Record<Marker, string> = { mark: "==", b: "**", i: "*" };

function serializeStyled(runs: Run[], ctx: EscapeContext): string {
  let out = "";
  const stack: Marker[] = [];
  const close = () => {
    const m = stack.pop()!;
    const trail = /\s*$/.exec(out)![0];
    out = out.slice(0, out.length - trail.length) + MARKER[m] + trail;
  };
  for (const r of runs) {
    const want = new Set<Marker>((["mark", "b", "i"] as Marker[]).filter((m) => r[m]));
    while (stack.some((m) => !want.has(m))) close();
    const lead = /^\s*/.exec(r.text)![0];
    const trail = /\s*$/.exec(r.text)![0];
    const core = r.text.slice(lead.length, r.text.length - trail.length);
    out += lead;
    if (!core) {
      out += trail;
      continue;
    }
    for (const m of ["mark", "b", "i"] as Marker[]) {
      if (want.has(m) && !stack.includes(m)) {
        stack.push(m);
        out += MARKER[m];
      }
    }
    out += r.code ? "`" + core.replace(/`/g, "'") + "`" : escapeText(core, ctx);
    out += trail;
  }
  while (stack.length) close();
  return out;
}

/** True when two run lists show the same text with the same styling. */
export function runsEqual(a: Run[], b: Run[]): boolean {
  const norm = (rs: Run[]) => {
    const out: Run[] = [];
    for (const r of rs) {
      const text = r.text.replace(/\s+/g, " ");
      if (!text) continue;
      const last = out[out.length - 1];
      if (last && sameFlags(last, r)) last.text += text;
      else out.push({ ...r, text });
    }
    if (out.length) {
      out[0].text = out[0].text.replace(/^\s+/, "");
      out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, "");
    }
    return out.filter((r) => r.text);
  };
  const x = norm(a);
  const y = norm(b);
  return x.length === y.length && x.every((r, k) => r.text === y[k].text && sameFlags(r, y[k]));
}

/** Validate untrusted runs (from the sandboxed frame). Returns null when malformed. */
export function sanitizeRuns(v: unknown): Run[] | null {
  if (!Array.isArray(v) || v.length > 2000) return null;
  const out: Run[] = [];
  let total = 0;
  for (const item of v) {
    if (typeof item !== "object" || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.text !== "string") return null;
    total += o.text.length;
    if (total > 20000) return null;
    const r: Run = { text: o.text };
    if (o.b === true) r.b = true;
    if (o.i === true) r.i = true;
    if (o.code === true) r.code = true;
    if (o.mark === true) r.mark = true;
    if (typeof o.href === "string" && o.href.length < 2000) r.href = o.href;
    out.push(r);
  }
  return out;
}
