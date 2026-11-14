/**
 * Automatic layout with dagre (layered graph drawing).
 *
 * Groups are laid out on their own first, then placed as single blocks in the board's
 * layout, so frames never overlap each other or other nodes and keep room for their names.
 */

import dagre from "../vendor/dagre.js";
import type { BoardSpec, EdgeSpec, NodeSpec } from "./spec.ts";
import type { Box, Point } from "./excalidraw.ts";
import { measureLine, textBlockWidth, textHeight, wrapText } from "./excalidraw.ts";
import { SIZES } from "./style.ts";

export const FRAME_PAD = 28;
/** Room above a frame for its name, which Excalidraw draws outside the frame at a fixed screen size */
export const FRAME_LABEL_SPACE = 40;

export interface LayoutResult {
  /** Node centres */
  centers: Map<string, Point>;
  /** Frame boxes for groups that have members */
  frames: Map<string, Box>;
}

type Size = { width: number; height: number };

/** Edges that attach a note or free text to something sit beside it rather than in the flow. */
export function isAttachment(e: Pick<EdgeSpec, "from" | "to">, kindOf: (id: string) => string | undefined): boolean {
  const a = kindOf(e.from);
  const b = kindOf(e.to);
  return a === "note" || b === "note" || a === "text" || b === "text";
}

const SATELLITE_GAP = 48;

function layered(
  spec: Pick<BoardSpec, "direction">,
  nodes: { id: string; size: Size; kind?: string }[],
  edges: { from: string; to: string; label?: string; attach?: boolean; id: string }[],
  fontFamily: number,
  spacing: { nodesep: number; ranksep: number },
): Map<string, Point> {
  const vertical = spec.direction === "TB" || spec.direction === "BT";
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isSat = (id: string) => {
    const k = byId.get(id)?.kind;
    return k === "note" || k === "text";
  };

  // Notes and free text attached to a node ride beside it (below it in a left-to-right
  // board, to its right in a top-down one) instead of taking a step in the flow. The
  // anchor reserves the same room on its other side so the flow stays straight.
  const satellites = new Map<string, string[]>(); // anchor -> satellites
  const anchorOf = new Map<string, string>();
  for (const e of edges) {
    if (!e.attach) continue;
    const [sat, anchor] = isSat(e.to) && !isSat(e.from) ? [e.to, e.from] : isSat(e.from) && !isSat(e.to) ? [e.from, e.to] : [null, null];
    if (!sat || !anchor || anchorOf.has(sat) || !byId.has(anchor) || !byId.has(sat)) continue;
    anchorOf.set(sat, anchor);
    if (!satellites.has(anchor)) satellites.set(anchor, []);
    satellites.get(anchor)!.push(sat);
  }
  const sizeOf = (id: string): Size => {
    const base = byId.get(id)!.size;
    const sats = satellites.get(id);
    if (!sats) return base;
    if (vertical) {
      const extra = sats.reduce((w, s) => w + SATELLITE_GAP + byId.get(s)!.size.width, 0);
      const h = Math.max(base.height, ...sats.map((s) => byId.get(s)!.size.height));
      return { width: base.width + 2 * extra, height: h };
    }
    const extra = sats.reduce((h, s) => h + SATELLITE_GAP + byId.get(s)!.size.height, 0);
    const w = Math.max(base.width, ...sats.map((s) => byId.get(s)!.size.width));
    return { width: w, height: base.height + 2 * extra };
  };
  const rep = (id: string) => anchorOf.get(id) ?? id;

  const g = new dagre.graphlib.Graph({ multigraph: true, compound: false });
  g.setGraph({ rankdir: spec.direction, nodesep: spacing.nodesep, ranksep: spacing.ranksep, edgesep: 24, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) if (!anchorOf.has(n.id)) g.setNode(n.id, { ...sizeOf(n.id) });
  const degree = new Map<string, number>();
  for (const e of edges) {
    const from = rep(e.from);
    const to = rep(e.to);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    if (from === to) continue;
    const label: Record<string, unknown> = { minlen: 1, weight: 1 };
    if (e.label) {
      const lines = wrapText(e.label, SIZES.edgeLabelMaxW, SIZES.edgeFontSize, fontFamily);
      label.width = textBlockWidth(lines, SIZES.edgeFontSize, fontFamily) + 16;
      label.height = textHeight(lines.length, SIZES.edgeFontSize) + 8;
      label.labelpos = "c";
    }
    g.setEdge(from, to, label, e.id);
  }
  // Nodes without any edge would all land on the first rank in one long row: chain
  // them (invisibly) into a near-square grid instead.
  const loose = nodes.filter((n) => !degree.get(n.id)).map((n) => n.id);
  if (loose.length >= 3) {
    const perRank = Math.max(1, Math.ceil(Math.sqrt(loose.length * (vertical ? 1.6 : 0.6))));
    for (let i = 0; i + perRank < loose.length; i++) {
      g.setEdge(loose[i], loose[i + perRank], { minlen: 1, weight: 0 }, `\u0000grid${i}`);
    }
  }
  dagre.layout(g);
  const out = new Map<string, Point>();
  for (const n of nodes) {
    if (anchorOf.has(n.id)) continue;
    const v = g.node(n.id);
    out.set(n.id, [v.x ?? 0, v.y ?? 0]);
  }
  straighten(out, (id) => sizeOf(id), edges.map((e) => ({ from: rep(e.from), to: rep(e.to) })), vertical);
  for (const [anchor, sats] of satellites) {
    const [ax, ay] = out.get(anchor)!;
    const a = byId.get(anchor)!.size;
    let offset = vertical ? a.width / 2 : a.height / 2;
    for (const sid of sats) {
      const s = byId.get(sid)!.size;
      if (vertical) {
        out.set(sid, [ax + offset + SATELLITE_GAP + s.width / 2, ay]);
        offset += SATELLITE_GAP + s.width;
      } else {
        out.set(sid, [ax, ay + offset + SATELLITE_GAP + s.height / 2]);
        offset += SATELLITE_GAP + s.height;
      }
    }
  }
  return out;
}

/**
 * dagre often leaves a node a few pixels off its only parent, which makes a connector
 * take a tiny jog. Line such nodes up with their parent when nothing is in the way.
 */
function straighten(centers: Map<string, Point>, sizeOf: (id: string) => Size, edges: { from: string; to: string }[], vertical: boolean) {
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === e.to || !centers.has(e.from) || !centers.has(e.to)) continue;
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e.from);
  }
  const axis = vertical ? 0 : 1;
  const flow = vertical ? 1 : 0;
  // Parents first: order by position along the flow.
  const order = [...centers.keys()].sort((a, b) => centers.get(a)![flow] - centers.get(b)![flow]);
  for (const id of order) {
    const parents = incoming.get(id);
    if (!parents || parents.length !== 1) continue;
    const p = centers.get(parents[0])!;
    const c = centers.get(id)!;
    if (p[flow] >= c[flow]) continue; // only forward edges
    const delta = p[axis] - c[axis];
    if (Math.abs(delta) < 0.5 || Math.abs(delta) > 64) continue;
    const s = sizeOf(id);
    const moved: Point = axis === 0 ? [c[0] + delta, c[1]] : [c[0], c[1] + delta];
    const clear = [...centers.entries()].every(([other, oc]) => {
      if (other === id) return true;
      const os = sizeOf(other);
      return (
        Math.abs(moved[0] - oc[0]) >= (s.width + os.width) / 2 + 24 ||
        Math.abs(moved[1] - oc[1]) >= (s.height + os.height) / 2 + 24
      );
    });
    if (clear) centers.set(id, moved);
  }
}

export function layoutBoard(spec: BoardSpec, sizes: Map<string, Size>, fontFamily: number): LayoutResult {
  const vertical = spec.direction === "TB" || spec.direction === "BT";
  const kind = new Map(spec.nodes.map((n) => [n.id, n.kind]));
  const kindOf = (id: string) => kind.get(id);
  const groupOf = new Map(spec.nodes.map((n) => [n.id, n.group]));
  const members = new Map<string, NodeSpec[]>();
  for (const n of spec.nodes) {
    if (!n.group) continue;
    if (!members.has(n.group)) members.set(n.group, []);
    members.get(n.group)!.push(n);
  }

  // 1. Each group on its own.
  const inner = new Map<string, { rel: Map<string, Point>; box: Box }>();
  for (const [gid, ms] of members) {
    const ids = new Set(ms.map((m) => m.id));
    const rel = layered(
      spec,
      ms.map((m) => ({ id: m.id, size: sizes.get(m.id)!, kind: m.kind })),
      spec.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ ...e, attach: isAttachment(e, kindOf) })),
      fontFamily,
      { nodesep: vertical ? 48 : 36, ranksep: vertical ? 72 : 72 },
    );
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const m of ms) {
      const [cx, cy] = rel.get(m.id)!;
      const s = sizes.get(m.id)!;
      x1 = Math.min(x1, cx - s.width / 2);
      y1 = Math.min(y1, cy - s.height / 2);
      x2 = Math.max(x2, cx + s.width / 2);
      y2 = Math.max(y2, cy + s.height / 2);
    }
    inner.set(gid, { rel, box: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } });
  }

  // 2. The board: loose nodes plus one block per group (frame plus room for its name).
  const blockId = (gid: string) => `\u0000group:${gid}`;
  const topNodes: { id: string; size: Size; kind?: string }[] = [];
  for (const n of spec.nodes) if (!n.group || !inner.has(n.group)) topNodes.push({ id: n.id, size: sizes.get(n.id)!, kind: n.kind });
  for (const [gid, { box }] of inner) {
    topNodes.push({
      id: blockId(gid),
      size: { width: box.width + FRAME_PAD * 2, height: box.height + FRAME_PAD * 2 + FRAME_LABEL_SPACE },
    });
  }
  const top = (id: string) => {
    const gid = groupOf.get(id);
    return gid && inner.has(gid) ? blockId(gid) : id;
  };
  const topEdges = spec.edges
    .map((e) => ({ id: e.id, from: top(e.from), to: top(e.to), label: e.label, attach: isAttachment(e, kindOf) }))
    .filter((e) => e.from !== e.to);
  const hasGroups = inner.size > 0;
  const centersTop = layered(spec, topNodes, topEdges, fontFamily, {
    nodesep: hasGroups ? 64 : vertical ? 56 : 44,
    ranksep: hasGroups ? 96 : vertical ? 72 : 88,
  });

  // 3. Members inside their blocks.
  const centers = new Map<string, Point>();
  const frames = new Map<string, Box>();
  for (const n of spec.nodes) if (!n.group || !inner.has(n.group)) centers.set(n.id, centersTop.get(n.id)!);
  for (const [gid, { rel, box }] of inner) {
    const [bx, by] = centersTop.get(blockId(gid))!;
    const frame: Box = {
      x: bx - (box.width + FRAME_PAD * 2) / 2,
      y: by - (box.height + FRAME_PAD * 2 + FRAME_LABEL_SPACE) / 2 + FRAME_LABEL_SPACE,
      width: box.width + FRAME_PAD * 2,
      height: box.height + FRAME_PAD * 2,
    };
    frames.set(gid, frame);
    for (const m of members.get(gid)!) {
      const [rx, ry] = rel.get(m.id)!;
      centers.set(m.id, [frame.x + FRAME_PAD + (rx - box.x), frame.y + FRAME_PAD + (ry - box.y)]);
    }
  }
  return { centers, frames };
}

export function labelSize(label: string, fontFamily: number): { width: number; height: number; lines: string[] } {
  const lines = wrapText(label, SIZES.edgeLabelMaxW, SIZES.edgeFontSize, fontFamily);
  return {
    lines,
    width: Math.max(...lines.map((l) => measureLine(l, SIZES.edgeFontSize, fontFamily))),
    height: textHeight(lines.length, SIZES.edgeFontSize),
  };
}
