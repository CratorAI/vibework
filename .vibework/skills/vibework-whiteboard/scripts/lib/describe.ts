/**
 * Read a board back into the description format, including what the person drew,
 * so the agent can edit the current state rather than its own stale copy.
 */

import type { Direction, NodeKind } from "./spec.ts";
import type { El, SceneFile } from "./excalidraw.ts";
import type { EdgeBase, NodeBase } from "./build.ts";
import { managedBase, isNodeElement } from "./build.ts";
import { colorNameFor } from "./style.ts";

export function readBoardMeta(file: SceneFile): { direction: Direction; style: "clean" | "sketch" } {
  const meta = (file as unknown as { vibework?: { direction?: string; style?: string } }).vibework;
  const dirs: Direction[] = ["TB", "LR", "BT", "RL"];
  let direction = dirs.find((d) => d === meta?.direction);
  if (!direction) {
    // Infer from the arrows: mostly horizontal means left-to-right.
    let h = 0;
    let v = 0;
    for (const el of file.elements) {
      if (el.type !== "arrow" || el.isDeleted || !el.points?.length) continue;
      const last = el.points[el.points.length - 1];
      if (Math.abs(last[0]) > Math.abs(last[1])) h++;
      else v++;
    }
    direction = h > v ? "LR" : "TB";
  }
  let style: "clean" | "sketch" | undefined = meta?.style === "sketch" ? "sketch" : meta?.style === "clean" ? "clean" : undefined;
  if (!style) {
    const shapes = file.elements.filter((e) => !e.isDeleted && isNodeElement(e) && e.type !== "text");
    style = shapes.length && shapes.filter((e) => e.roughness > 0).length > shapes.length / 2 ? "sketch" : "clean";
  }
  return { direction, style };
}

function kindOf(el: El): NodeKind {
  if (el.type === "diamond") return "decision";
  if (el.type === "ellipse") return "ellipse";
  if (el.type === "text") return "text";
  if (!el.roundness) return "box";
  if (el.roundness.type === 3 && el.roundness.value !== undefined && el.roundness.value <= 8) return "box";
  return "rounded";
}

function boundText(el: El, byId: Map<string, El>): El | undefined {
  const ref = (el.boundElements ?? []).find((b) => b.type === "text");
  return ref ? byId.get(ref.id) : undefined;
}

/** The description values of a node element as it is now. */
export function describeNodeBase(el: El, byId: Map<string, El>): NodeBase {
  const managed = managedBase(el) as NodeBase | null;
  const kind = managed?.kind && sameShape(managed.kind, el) ? managed.kind : kindOf(el);
  const text = el.type === "text" ? el : boundText(el, byId);
  const label = ((text?.originalText ?? text?.text ?? "") as string).trim();
  let color = colorNameFor(kind, { strokeColor: el.strokeColor, backgroundColor: el.backgroundColor });
  if (managed && managed.color !== color) {
    // Keep the agent's name when the colours still match it.
    const fromManaged = colorNameFor(managed.kind, { strokeColor: el.strokeColor, backgroundColor: el.backgroundColor });
    if (fromManaged === managed.color) color = managed.color;
  }
  const frame = el.frameId ? byId.get(el.frameId) : undefined;
  return {
    role: "node",
    id: el.id,
    label,
    kind,
    color,
    group: frame && !frame.isDeleted ? frame.id : null,
    link: el.link ?? null,
  };
}

function sameShape(kind: NodeKind, el: El): boolean {
  if (kind === "decision") return el.type === "diamond";
  if (kind === "ellipse") return el.type === "ellipse";
  if (kind === "text") return el.type === "text";
  return el.type === "rectangle";
}

export function describeEdgeBase(el: El, byId: Map<string, El>): EdgeBase {
  const text = boundText(el, byId);
  const arrows = el.startArrowhead && el.endArrowhead ? "both" : !el.startArrowhead && !el.endArrowhead ? "none" : "end";
  return {
    role: "edge",
    id: el.id,
    from: el.startBinding?.elementId ?? "",
    to: el.endBinding?.elementId ?? "",
    label: ((text?.originalText ?? text?.text ?? "") as string).trim(),
    style: el.strokeStyle,
    arrows,
  };
}

export interface Description {
  direction: string;
  style?: string;
  title?: string;
  groups?: { id: string; label: string }[];
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  /** Elements not described (freehand, images, lines, loose arrows): kept untouched */
  other?: Record<string, number>;
}

const DIR_WORDS: Record<Direction, string> = { TB: "down", LR: "right", BT: "up", RL: "left" };

export function describeBoard(file: SceneFile): Description {
  const els = file.elements.filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));
  const meta = readBoardMeta(file);
  const out: Description = { direction: DIR_WORDS[meta.direction], nodes: [], edges: [] };
  if (meta.style === "sketch") out.style = "sketch";
  const titleEl = els.find((e) => managedBase(e)?.role === "title");
  if (titleEl) out.title = ((titleEl.originalText ?? titleEl.text ?? "") as string).trim();

  const groups = els.filter((e) => e.type === "frame");
  if (groups.length) out.groups = groups.map((g) => ({ id: g.id, label: (g.name ?? "") as string }));

  const nodeIds = new Set<string>();
  const other: Record<string, number> = {};
  for (const el of els) {
    if (el === titleEl || el.type === "frame") continue;
    if (el.type === "text" && el.containerId) continue;
    if (isNodeElement(el)) {
      const d = describeNodeBase(el, byId);
      if (el.type === "text" && !d.label) continue;
      nodeIds.add(el.id);
      const n: Record<string, unknown> = { id: d.id, label: d.label };
      if (d.kind !== "box") n.kind = d.kind;
      if (d.color !== "default") n.color = d.color;
      if (d.group) n.group = d.group;
      if (d.link) n.link = d.link;
      if (!managedBase(el)) n.drawnByPerson = true;
      out.nodes.push(n);
      continue;
    }
    if (el.type !== "arrow") other[el.type] = (other[el.type] ?? 0) + 1;
  }
  for (const el of els) {
    if (el.type !== "arrow") continue;
    const d = describeEdgeBase(el, byId);
    if (!nodeIds.has(d.from) || !nodeIds.has(d.to)) {
      other["unconnected arrow"] = (other["unconnected arrow"] ?? 0) + 1;
      continue;
    }
    const e: Record<string, unknown> = { id: d.id, from: d.from, to: d.to };
    if (d.label) e.label = d.label;
    if (d.style !== "solid") e.style = d.style;
    if (d.arrows !== "end") e.arrows = d.arrows;
    if (!managedBase(el)) e.drawnByPerson = true;
    out.edges.push(e);
  }
  if (Object.keys(other).length) out.other = other;
  return out;
}
