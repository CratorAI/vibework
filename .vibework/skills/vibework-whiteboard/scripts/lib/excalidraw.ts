/**
 * Excalidraw file model: element factories, text measurement, geometry and validation.
 * Produces the same shapes Excalidraw 0.18 writes, so the editor loads them unchanged.
 */

export type Point = [number, number];

/** An Excalidraw element as stored in a .excalidraw file (loosely typed on purpose). */
export interface El {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  index: string | null;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: { id: string; type: "arrow" | "text" }[] | null;
  updated: number;
  link: string | null;
  locked: boolean;
  customData?: Record<string, unknown>;
  // text
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  autoResize?: boolean;
  lineHeight?: number;
  // linear
  points?: Point[];
  lastCommittedPoint?: Point | null;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  elbowed?: boolean;
  // frame
  name?: string | null;
  [key: string]: unknown;
}

export interface Binding {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint?: Point | null;
}

export interface SceneFile {
  type: "excalidraw";
  version: number;
  source: string;
  elements: El[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export const FONT = { Excalifont: 5, Nunito: 6 } as const;
export const LINE_HEIGHT = 1.25;
export const BOUND_TEXT_PADDING = 5;

/** Advance widths at 1px for ASCII 32..126, measured in Chromium from Excalidraw's bundled fonts. */
const WIDTHS: Record<number, number[]> = {
  [FONT.Nunito]: [261,233,405,600,600,933,701,226,326,326,451,600,233,427,233,290,600,600,600,600,600,600,600,600,600,600,233,233,600,600,600,447,947,733,679,675,747,586,551,729,764,262,331,634,548,858,741,771,637,771,673,618,607,731,694,1104,655,601,593,324,290,324,600,500,361,533,587,465,587,534,340,590,572,237,241,508,301,861,572,560,587,587,365,483,358,565,518,844,530,517,466,361,270,361,600],
  [FONT.Excalifont]: [400,314,371,783,721,928,718,218,441,402,525,550,257,411,274,561,664,427,700,608,585,618,640,558,636,629,264,298,550,550,550,466,829,676,761,629,780,707,661,780,573,545,569,613,543,766,632,767,698,768,736,622,857,730,592,786,628,564,832,472,589,497,510,670,600,576,555,504,605,537,497,555,567,244,328,533,225,663,526,600,537,539,412,543,553,548,525,693,591,530,572,504,299,544,669],
};

function charWidth(ch: string, fontFamily: number): number {
  const code = ch.codePointAt(0)!;
  const table = WIDTHS[fontFamily] ?? WIDTHS[FONT.Nunito];
  if (code >= 32 && code <= 126) return table[code - 32] / 1000;
  // CJK and other full-width scripts
  if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xff00 && code <= 0xffef)) return 1;
  if (code >= 0x1f300) return 1.1; // emoji
  return 0.6;
}

export function measureLine(line: string, fontSize: number, fontFamily: number): number {
  let w = 0;
  for (const ch of line) w += charWidth(ch, fontFamily);
  return w * fontSize;
}

export function textHeight(lines: number, fontSize: number): number {
  return lines * fontSize * LINE_HEIGHT;
}

/** Greedy word wrap like Excalidraw's: words never split unless longer than the line. */
export function wrapText(text: string, maxWidth: number, fontSize: number, fontFamily: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = "";
    for (const word of words) {
      const candidate = line + word;
      if (!line || measureLine(candidate.trimEnd(), fontSize, fontFamily) <= maxWidth) {
        line = candidate;
        continue;
      }
      out.push(line.trimEnd());
      line = /^\s+$/.test(word) ? "" : word;
      // A single word longer than the line: break it by characters.
      while (measureLine(line, fontSize, fontFamily) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measureLine(line.slice(0, cut), fontSize, fontFamily) > maxWidth) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function textBlockWidth(lines: string[], fontSize: number, fontFamily: number): number {
  return Math.max(0, ...lines.map((l) => measureLine(l, fontSize, fontFamily)));
}

// ---------------------------------------------------------------------------
// Deterministic randomness, so the same description produces the same file.

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647 || 1;
}

// ---------------------------------------------------------------------------
// Fractional indices (the `index` field), in the format of the fractional-indexing package.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** n increasing keys: a0..az, then b00..bzz, c000.. */
export function sequentialIndices(n: number): string[] {
  const out: string[] = [];
  let width = 1;
  let head = "a".charCodeAt(0);
  let i = 0;
  while (out.length < n) {
    const cap = DIGITS.length ** width;
    if (i >= cap) {
      width++;
      head++;
      i = 0;
      continue;
    }
    let digits = "";
    let v = i;
    for (let k = 0; k < width; k++) {
      digits = DIGITS[v % DIGITS.length] + digits;
      v = Math.floor(v / DIGITS.length);
    }
    out.push(String.fromCharCode(head) + digits);
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Element factories

export interface BaseOpts {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  roundness?: { type: number; value?: number } | null;
  frameId?: string | null;
  link?: string | null;
  customData?: Record<string, unknown>;
  now: number;
}

export function baseElement(type: string, o: BaseOpts): El {
  const el: El = {
    id: o.id,
    type,
    x: round(o.x),
    y: round(o.y),
    width: round(o.width),
    height: round(o.height),
    angle: 0,
    strokeColor: o.strokeColor ?? "#1e1e1e",
    backgroundColor: o.backgroundColor ?? "transparent",
    fillStyle: o.fillStyle ?? "solid",
    strokeWidth: o.strokeWidth ?? 2,
    strokeStyle: o.strokeStyle ?? "solid",
    roughness: o.roughness ?? 0,
    opacity: 100,
    groupIds: [],
    frameId: o.frameId ?? null,
    index: null,
    roundness: o.roundness ?? null,
    seed: hash(o.id),
    version: 1,
    versionNonce: hash(o.id + ":1"),
    isDeleted: false,
    boundElements: null,
    updated: o.now,
    link: o.link ?? null,
    locked: false,
  };
  if (o.customData) el.customData = o.customData;
  return el;
}

export interface TextOpts {
  id: string;
  text: string;
  originalText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle";
  containerId: string | null;
  strokeColor?: string;
  frameId?: string | null;
  customData?: Record<string, unknown>;
  now: number;
}

export function textElement(o: TextOpts): El {
  const el = baseElement("text", { ...o, strokeWidth: 2, roughness: 0 });
  el.x = o.x; // text keeps sub-pixel placement like Excalidraw does
  el.y = o.y;
  el.width = o.width;
  el.height = o.height;
  return Object.assign(el, {
    text: o.text,
    fontSize: o.fontSize,
    fontFamily: o.fontFamily,
    textAlign: o.textAlign ?? "center",
    verticalAlign: o.verticalAlign ?? "middle",
    containerId: o.containerId,
    originalText: o.originalText,
    autoResize: true,
    lineHeight: LINE_HEIGHT,
  });
}

export function arrowElement(
  o: BaseOpts & {
    points: Point[];
    start: Binding | null;
    end: Binding | null;
    startArrowhead: string | null;
    endArrowhead: string | null;
    elbowed?: boolean;
  },
): El {
  const el = baseElement("arrow", o);
  const [x0, y0] = o.points[0];
  const rel = o.points.map(([px, py]) => [round(px - x0), round(py - y0)] as Point);
  const xs = rel.map((p) => p[0]);
  const ys = rel.map((p) => p[1]);
  el.x = round(x0);
  el.y = round(y0);
  el.width = round(Math.max(...xs) - Math.min(...xs));
  el.height = round(Math.max(...ys) - Math.min(...ys));
  return Object.assign(el, {
    points: rel,
    lastCommittedPoint: null,
    startBinding: o.start,
    endBinding: o.end,
    startArrowhead: o.startArrowhead,
    endArrowhead: o.endArrowhead,
    elbowed: !!o.elbowed,
    ...(o.elbowed ? { fixedSegments: null, startIsSpecial: false, endIsSpecial: false } : {}),
  });
}

export function frameElement(o: BaseOpts & { name: string }): El {
  const el = baseElement("frame", { ...o, strokeColor: "#bbb", roughness: 0, roundness: null });
  return Object.assign(el, { name: o.name });
}

export function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Geometry

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function center(b: Box): Point {
  return [b.x + b.width / 2, b.y + b.height / 2];
}

/**
 * Where the ray from the centre of `b` towards `toward` leaves the outline of a
 * rectangle, ellipse or diamond, pushed out by `gap`.
 */
export function outlinePoint(b: Box, type: string, toward: Point, gap: number): Point {
  const [cx, cy] = center(b);
  let dx = toward[0] - cx;
  let dy = toward[1] - cy;
  if (dx === 0 && dy === 0) dy = 1;
  const hw = b.width / 2;
  const hh = b.height / 2;
  let t: number;
  if (type === "ellipse") {
    t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
  } else if (type === "diamond") {
    t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else {
    t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
  }
  const len = Math.hypot(dx, dy);
  const ex = cx + dx * t + (dx / len) * gap;
  const ey = cy + dy * t + (dy / len) * gap;
  return [ex, ey];
}

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

export function elementBox(el: El): Box {
  if (el.points && el.points.length) {
    const xs = el.points.map((p) => p[0] + el.x);
    const ys = el.points.map((p) => p[1] + el.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// ---------------------------------------------------------------------------
// Validation: what the tests and `board.ts check` assert about a file.

export function validateScene(file: SceneFile): string[] {
  const problems: string[] = [];
  if (file.type !== "excalidraw") problems.push(`type is "${file.type}", expected "excalidraw"`);
  const els = file.elements.filter((e) => !e.isDeleted);
  const byId = new Map<string, El>();
  for (const el of file.elements) {
    if (byId.has(el.id)) problems.push(`duplicate element id ${el.id}`);
    byId.set(el.id, el);
  }
  let prevIndex = "";
  for (const el of file.elements) {
    if (typeof el.index !== "string") problems.push(`${el.id}: missing index`);
    else {
      if (prevIndex && !(el.index > prevIndex)) problems.push(`${el.id}: index ${el.index} not after ${prevIndex}`);
      prevIndex = el.index;
    }
    for (const k of ["x", "y", "width", "height"] as const) {
      if (!Number.isFinite(el[k])) problems.push(`${el.id}: ${k} is not a finite number`);
    }
  }
  for (const el of els) {
    if (el.frameId) {
      const f = byId.get(el.frameId);
      if (!f || f.isDeleted || f.type !== "frame") problems.push(`${el.id}: frameId ${el.frameId} is not a frame`);
    }
    for (const b of el.boundElements ?? []) {
      const t = byId.get(b.id);
      if (!t || t.isDeleted) {
        problems.push(`${el.id}: boundElements lists missing ${b.id}`);
        continue;
      }
      if (b.type !== t.type) problems.push(`${el.id}: boundElements says ${b.id} is ${b.type} but it is ${t.type}`);
      if (t.type === "text" && t.containerId !== el.id) problems.push(`${el.id}: bound text ${b.id} has containerId ${t.containerId}`);
      if (t.type === "arrow" && t.startBinding?.elementId !== el.id && t.endBinding?.elementId !== el.id) {
        problems.push(`${el.id}: lists arrow ${b.id}, which is not bound to it`);
      }
    }
    const texts = (el.boundElements ?? []).filter((b) => b.type === "text");
    if (texts.length > 1) problems.push(`${el.id}: more than one bound text`);
    if (el.type === "text" && el.containerId) {
      const c = byId.get(el.containerId);
      if (!c || c.isDeleted) problems.push(`${el.id}: container ${el.containerId} missing`);
      else if (!(c.boundElements ?? []).some((b) => b.id === el.id && b.type === "text")) {
        problems.push(`${el.id}: container ${c.id} does not list it in boundElements`);
      }
    }
    if (el.type === "arrow" || el.type === "line") {
      if (!el.points || el.points.length < 2) problems.push(`${el.id}: fewer than 2 points`);
      else if (el.points[0][0] !== 0 || el.points[0][1] !== 0) problems.push(`${el.id}: first point is not [0,0]`);
      if (el.elbowed && el.points) {
        for (let i = 1; i < el.points.length; i++) {
          const [ax, ay] = el.points[i - 1];
          const [bx, by] = el.points[i];
          if (Math.abs(ax - bx) > 0.5 && Math.abs(ay - by) > 0.5) problems.push(`${el.id}: elbow arrow segment ${i} is diagonal`);
        }
        for (const b of [el.startBinding, el.endBinding]) {
          if (b && !Array.isArray(b.fixedPoint)) problems.push(`${el.id}: elbow arrow binding without fixedPoint`);
        }
      }
      for (const [end, b] of [["start", el.startBinding], ["end", el.endBinding]] as const) {
        if (!b) continue;
        const t = byId.get(b.elementId);
        if (!t || t.isDeleted) problems.push(`${el.id}: ${end}Binding to missing ${b.elementId}`);
        else if (!(t.boundElements ?? []).some((x) => x.id === el.id && x.type === "arrow")) {
          problems.push(`${el.id}: ${end}Binding target ${t.id} does not list the arrow`);
        }
      }
    }
  }
  return problems;
}
