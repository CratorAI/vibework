/**
 * Orthogonal connector routing: a right-angled path between two boxes that goes around
 * every other box, preferring few bends and the board's flow direction.
 *
 * A* over a sparse grid built from the obstacles' edges (inflated by a margin), the
 * gaps between them and the ports. Ports are the middles of the four sides, which are
 * on the outline for rectangles, diamonds and ellipses alike.
 */

import type { Box, Point } from "./excalidraw.ts";
import type { Direction } from "./spec.ts";

export type Side = "top" | "right" | "bottom" | "left";

export interface Route {
  points: Point[];
  startSide: Side;
  endSide: Side;
}

const MARGIN = 18;
/** Straight run out of the source before the first bend (at least MARGIN) */
const STUB_OUT = MARGIN;
/** Straight run into the target after the last bend, so arrowheads keep full size */
const STUB_IN = 40;
const BEND = 40;
const SIDES: Side[] = ["top", "right", "bottom", "left"];
const OUT: Record<Side, Point> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const FLOW_OUT: Record<Direction, Side> = { TB: "bottom", BT: "top", LR: "right", RL: "left" };
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

export function port(b: Box, side: Side, gap = 0): Point {
  const [dx, dy] = OUT[side];
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const px = side === "left" ? b.x : side === "right" ? b.x + b.width : cx;
  const py = side === "top" ? b.y : side === "bottom" ? b.y + b.height : cy;
  return [px + dx * gap, py + dy * gap];
}

function sidePenalty(side: Side, preferred: Side | null): number {
  if (!preferred || side === preferred) return 0;
  if (side === OPPOSITE[preferred]) return 260;
  return 120;
}

/** A segment of an already routed connector, to avoid running along it */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RouteOptions {
  /** Segments of other connectors: running along them costs extra, crossing them a little */
  avoid?: Segment[];
  /** No preferred sides (notes and labels attached beside a node) */
  anySide?: boolean;
}

function stepPenalty(ax: number, ay: number, bx: number, by: number, avoid: Segment[]): number {
  let p = 0;
  const horizontal = Math.abs(ay - by) < 0.5;
  const lo = horizontal ? Math.min(ax, bx) : Math.min(ay, by);
  const hi = horizontal ? Math.max(ax, bx) : Math.max(ay, by);
  for (const s of avoid) {
    const sh = Math.abs(s.y1 - s.y2) < 0.5;
    if (sh === horizontal) {
      // Running along another connector
      const same = horizontal ? Math.abs(s.y1 - ay) < 6 : Math.abs(s.x1 - ax) < 6;
      if (!same) continue;
      const slo = horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      const shi = horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      const overlap = Math.min(hi, shi) - Math.max(lo, slo);
      if (overlap > 1) p += 60 + overlap * 2;
    } else {
      // Crossing another connector
      const cx = horizontal ? s.x1 : ax;
      const cy = horizontal ? ay : s.y1;
      const along = horizontal ? cx : cy;
      const across = horizontal ? cy : cx;
      const slo = horizontal ? Math.min(s.y1, s.y2) : Math.min(s.x1, s.x2);
      const shi = horizontal ? Math.max(s.y1, s.y2) : Math.max(s.x1, s.x2);
      if (along > lo + 0.5 && along < hi - 0.5 && across > slo + 0.5 && across < shi - 0.5) p += 24;
    }
  }
  return p;
}

class Heap {
  private a: { k: number; v: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(v: number, k: number) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Route from `from` to `to` around `obstacles` (which should not include the two ends).
 * `gap` is how far outside the outline the arrow starts and ends.
 */
export function routeOrthogonal(from: Box, to: Box, obstacles: Box[], direction: Direction, gap: number, opts: RouteOptions = {}): Route {
  const avoid = opts.avoid ?? [];
  const all = [from, to, ...obstacles];
  const inflated = all.map((b) => ({ x1: b.x - MARGIN, y1: b.y - MARGIN, x2: b.x + b.width + MARGIN, y2: b.y + b.height + MARGIN }));
  const inside = (x: number, y: number) => inflated.some((r) => x > r.x1 + 0.5 && x < r.x2 - 0.5 && y > r.y1 + 0.5 && y < r.y2 - 0.5);

  const outSide = FLOW_OUT[direction];
  const inSide = OPPOSITE[outSide];
  const stubIn = opts.anySide ? STUB_OUT : STUB_IN;
  const starts = SIDES.map((s) => {
    const p = port(from, s);
    const [dx, dy] = OUT[s];
    return { side: s, port: p, exit: [p[0] + dx * STUB_OUT, p[1] + dy * STUB_OUT] as Point, cost: sidePenalty(s, opts.anySide ? null : outSide) };
  });
  const ends = SIDES.map((s) => {
    const p = port(to, s);
    const [dx, dy] = OUT[s];
    return { side: s, port: p, exit: [p[0] + dx * stubIn, p[1] + dy * stubIn] as Point, cost: sidePenalty(s, opts.anySide ? null : inSide) };
  });

  const xsSet = new Set<number>();
  const ysSet = new Set<number>();
  for (const r of inflated) {
    xsSet.add(r.x1);
    xsSet.add(r.x2);
    ysSet.add(r.y1);
    ysSet.add(r.y2);
  }
  for (const p of [...starts, ...ends]) {
    xsSet.add(p.exit[0]);
    ysSet.add(p.exit[1]);
  }
  const withMidlines = (vals: Set<number>) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const out = new Set(sorted);
    for (let i = 0; i + 1 < sorted.length; i++) if (sorted[i + 1] - sorted[i] > MARGIN) out.add((sorted[i] + sorted[i + 1]) / 2);
    return [...out].sort((a, b) => a - b);
  };
  const xs = withMidlines(xsSet);
  const ys = withMidlines(ysSet);
  const W = xs.length;
  const H = ys.length;
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));
  const free = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) free[j * W + i] = inside(xs[i], ys[j]) ? 0 : 1;

  // Direction index: 0 up, 1 right, 2 down, 3 left
  const DIRS: Point[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const sideDir: Record<Side, number> = { top: 0, right: 1, bottom: 2, left: 3 };
  const N = W * H * 4;
  const g = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const endAt = new Map<number, (typeof ends)[number]>();
  for (const e of ends) {
    const i = xi.get(e.exit[0]);
    const j = yi.get(e.exit[1]);
    if (i !== undefined && j !== undefined) endAt.set(j * W + i, e);
  }
  const h = (i: number, j: number) => {
    let best = Infinity;
    for (const e of ends) best = Math.min(best, Math.abs(xs[i] - e.exit[0]) + Math.abs(ys[j] - e.exit[1]));
    return best;
  };
  for (const s of starts) {
    const i = xi.get(s.exit[0]);
    const j = yi.get(s.exit[1]);
    if (i === undefined || j === undefined || !free[j * W + i]) continue;
    const state = (j * W + i) * 4 + sideDir[s.side];
    const cost = s.cost + STUB_OUT;
    if (cost < g[state]) {
      g[state] = cost;
      prev[state] = -2 - SIDES.indexOf(s.side); // marks a start
      heap.push(state, cost + h(i, j));
    }
  }

  let bestState = -1;
  let bestCost = Infinity;
  let bestEnd: (typeof ends)[number] | null = null;
  while (heap.size) {
    const state = heap.pop();
    const cost = g[state];
    if (cost >= bestCost) break;
    const cell = state >> 2;
    const dir = state & 3;
    const i = cell % W;
    const j = (cell - i) / W;
    const e = endAt.get(cell);
    if (e) {
      // Must arrive heading into the side.
      const want = (sideDir[e.side] + 2) % 4;
      const total = cost + e.cost + stubIn + (dir === want ? 0 : dir === (want + 2) % 4 ? 2 * BEND : BEND);
      if (total < bestCost) {
        bestCost = total;
        bestState = state;
        bestEnd = e;
      }
    }
    for (let d = 0; d < 4; d++) {
      if (d === (dir + 2) % 4) continue; // no reversing
      const ni = i + DIRS[d][0];
      const nj = j + DIRS[d][1];
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      if (!free[nj * W + ni]) continue;
      const mx = (xs[i] + xs[ni]) / 2;
      const my = (ys[j] + ys[nj]) / 2;
      if (inside(mx, my)) continue;
      const step = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
      const extra = avoid.length ? stepPenalty(xs[i], ys[j], xs[ni], ys[nj], avoid) : 0;
      const nc = cost + step + extra + (d === dir ? 0 : BEND);
      const ns = (nj * W + ni) * 4 + d;
      if (nc < g[ns]) {
        g[ns] = nc;
        prev[ns] = state;
        heap.push(ns, nc + h(ni, nj));
      }
    }
  }

  if (bestState < 0 || !bestEnd) {
    // No clear path (boxes overlap): fall back to a simple dog-leg between facing sides.
    const s = port(from, outSide, gap);
    const t = port(to, inSide, gap);
    const vertical = outSide === "top" || outSide === "bottom";
    const pts: Point[] = vertical
      ? [s, [s[0], (s[1] + t[1]) / 2], [t[0], (s[1] + t[1]) / 2], t]
      : [s, [(s[0] + t[0]) / 2, s[1]], [(s[0] + t[0]) / 2, t[1]], t];
    return { points: simplifyOrthogonal(pts), startSide: outSide, endSide: inSide };
  }

  const cells: Point[] = [];
  let st = bestState;
  let startSide: Side = "bottom";
  for (;;) {
    const cell = st >> 2;
    const i = cell % W;
    const j = (cell - i) / W;
    cells.push([xs[i], ys[j]]);
    const p = prev[st];
    if (p <= -2) {
      startSide = SIDES[-2 - p];
      break;
    }
    st = p;
  }
  cells.reverse();
  const pts: Point[] = [port(from, startSide, gap), ...cells, port(to, bestEnd.side, gap)];
  return { points: simplifyOrthogonal(pts), startSide, endSide: bestEnd.side };
}

/** Drop repeated and collinear points. */
export function simplifyOrthogonal(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 0.01 || Math.abs(last[1] - p[1]) > 0.01) dedup.push(p);
  }
  const out: Point[] = [];
  for (const p of dedup) {
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const collinear = (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - p[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - p[1]) < 0.01);
      if (collinear) out.pop();
    }
    out.push(p);
  }
  return out;
}

/** Excalidraw's fixed-point ratio for a point relative to a box (0.5 nudged as Excalidraw does). */
export function fixedPointFor(b: Box, p: Point): Point {
  const norm = (v: number) => (Math.abs(v - 0.5) < 0.0001 ? 0.5001 : Math.round(v * 10000) / 10000);
  return [norm((p[0] - b.x) / b.width), norm((p[1] - b.y) / b.height)];
}

export function segmentsOf(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    out.push({ x1: points[i - 1][0], y1: points[i - 1][1], x2: points[i][0], y2: points[i][1] });
  }
  return out;
}

/**
 * Excalidraw puts an arrow's label on its middle point (odd count) or the middle of its
 * middle segment (even count). Add points along the path, without changing its shape,
 * so that spot is the middle of the longest segment.
 */
export function balanceForLabel(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const len = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  let k = 0;
  for (let i = 1; i + 1 < points.length; i++) if (len(points[i], points[i + 1]) > len(points[k], points[k + 1])) k = i;
  const mid: Point = [(points[k][0] + points[k + 1][0]) / 2, (points[k][1] + points[k + 1][1]) / 2];
  const before = points.slice(0, k + 1);
  const after = points.slice(k + 1);
  const split = (arr: Point[], end: Point, atStart: boolean) => {
    // Split the longest segment of arr (+ the piece joining it to the middle point).
    const chain = atStart ? [...arr, end] : [end, ...arr];
    let best = 0;
    for (let i = 1; i + 1 < chain.length; i++) if (len(chain[i], chain[i + 1]) > len(chain[best], chain[best + 1])) best = i;
    const m: Point = [(chain[best][0] + chain[best + 1][0]) / 2, (chain[best][1] + chain[best + 1][1]) / 2];
    chain.splice(best + 1, 0, m);
    return atStart ? chain.slice(0, -1) : chain.slice(1);
  };
  let b = before;
  let a = after;
  for (let guard = 0; b.length !== a.length && guard < 20; guard++) {
    if (b.length < a.length) b = split(b, mid, true);
    else a = split(a, mid, false);
  }
  return [...b, mid, ...a];
}
