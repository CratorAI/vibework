/** Source spans are authoritative: untouched markup is never DOM-serialized. */
export interface Node {
  tag: string;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  attrs: Record<string, string>;
  parent?: Node;
  children: Node[];
}
export interface Design {
  source: string;
  nodes: Node[];
  frames: Node[];
}
const voids = new Set(
  "area base br col embed hr img input link meta param source track wbr".split(
    " ",
  ),
);
export const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
export const decode = (s: string) =>
  s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (x) => {
    const named: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    };
    if (named[x.toLowerCase()]) return named[x.toLowerCase()];
    if (x[1] !== "#") return x;
    const hex = x[2].toLowerCase() === "x",
      n = parseInt(x.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "�";
  });
export function parseDesign(source: string): Design {
  const nodes: Node[] = [],
    stack: Node[] = [];
  const token =
    /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(source))) {
    const raw = m[0];
    if (raw.startsWith("<!")) continue;
    const tag = /^<\/?([\w:-]+)/.exec(raw)![1].toLowerCase();
    if (raw[1] === "/") {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i < 0) continue;
      const n = stack[i];
      n.closeStart = m.index;
      n.end = token.lastIndex;
      stack.length = i;
      continue;
    }
    const attrs: Record<string, string> = {};
    const a = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    a.lastIndex = /^<[\w:-]+/.exec(raw)![0].length;
    let v: RegExpExecArray | null;
    while ((v = a.exec(raw)))
      attrs[v[1].toLowerCase()] = decode(v[2] ?? v[3] ?? v[4] ?? "");
    const n: Node = {
      tag,
      start: m.index,
      openEnd: token.lastIndex,
      closeStart: token.lastIndex,
      end: token.lastIndex,
      attrs,
      parent: stack[stack.length - 1],
      children: [],
    };
    nodes.push(n);
    n.parent?.children.push(n);
    if (["script", "style", "textarea", "title"].includes(tag)) {
      const end = new RegExp(`</${tag}\\s*>`, "ig");
      end.lastIndex = token.lastIndex;
      const e = end.exec(source);
      if (e) {
        n.closeStart = e.index;
        n.end = end.lastIndex;
        token.lastIndex = end.lastIndex;
      }
      continue;
    }
    if (!voids.has(tag) && !raw.endsWith("/>")) stack.push(n);
  }
  return {
    source,
    nodes,
    frames: nodes.filter((n) => "data-design-frame" in n.attrs),
  };
}
export function style(n: Node): Record<string, string> {
  return Object.fromEntries(
    (n.attrs.style ?? "").split(";").flatMap((s) => {
      const i = s.indexOf(":");
      return i < 0 ? [] : [[s.slice(0, i).trim(), s.slice(i + 1).trim()]];
    }),
  );
}
export function box(n: Node) {
  const s = style(n);
  return {
    x: parseFloat(s.left) || 0,
    y: parseFloat(s.top) || 0,
    w: parseFloat(s.width) || 100,
    h: parseFloat(s.height) || 100,
    rotation:
      parseFloat(/rotate\(([-\d.]+)/.exec(s.transform ?? "")?.[1] ?? "0") || 0,
  };
}
export function editable(n: Node) {
  const s = style(n);
  return (
    !(n.attrs["data-design-kind"] === "text" && n.children.length > 0) &&
    !!n.attrs["data-design-id"] &&
    ["text", "rect", "ellipse", "line", "image", "svg", "group"].includes(
      n.attrs["data-design-kind"],
    ) &&
    /^\d+(\.\d+)?px$/.test(s.width ?? "") &&
    /^\d+(\.\d+)?px$/.test(s.height ?? "") &&
    n.attrs["data-locked"] !== "true"
  );
}
export function replace(
  source: string,
  start: number,
  end: number,
  text: string,
) {
  return source.slice(0, start) + text + source.slice(end);
}
export function attribute(source: string, n: Node, key: string, value: string) {
  const raw = source.slice(n.start, n.openEnd),
    re = new RegExp(
      `(\\s${key})(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`,
      "i",
    );
  const attr = ` ${key}="${escape(value)}"`;
  const next = re.test(raw)
    ? raw.replace(re, () => attr)
    : raw.replace(/\s*\/?>$/, (end) => attr + end);
  return replace(source, n.start, n.openEnd, next);
}
export function patchStyle(
  source: string,
  id: string,
  patch: Record<string, string>,
) {
  const n = parseDesign(source).nodes.find(
    (n) =>
      n.attrs["data-design-id"] === id || n.attrs["data-design-frame"] === id,
  );
  if (!n) return source;
  return attribute(
    source,
    n,
    "style",
    Object.entries({ ...style(n), ...patch })
      .map(([k, v]) => `${k}:${v}`)
      .join(";"),
  );
}
export function textContent(d: Design, n: Node) {
  return decode(
    d.source.slice(n.openEnd, n.closeStart).replace(/<[^>]*>/g, ""),
  );
}
export const presets: Record<string, [number, number]> = {
  Square: [1080, 1080],
  Story: [1080, 1920],
  Landscape: [1920, 1080],
  A4: [794, 1123],
  Desktop: [1440, 900],
};
export function frameMarkup(id: string, w = 1080, h = 1080) {
  return `<section data-design-frame="${id}" data-name="Frame" style="position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#ffffff"></section>`;
}
export function blankDesign() {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>Design</title></head><body style="margin:0;display:flex;gap:32px">${frameMarkup("frame-1")}</body></html>`;
}
