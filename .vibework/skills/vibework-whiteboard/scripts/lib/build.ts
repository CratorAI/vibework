/**
 * Build or update a .excalidraw board from a description.
 *
 * Update model (three-way merge, per element, by stable id):
 * - Every element the generator writes carries `customData.vw`: the description values it
 *   was last written from (the "base"). Element ids are the description ids.
 * - For an id present in both the description and the board:
 *   - position and size are always kept (the generator never moves what exists), except
 *     that a box grows around its centre when a new label no longer fits, a node whose
 *     kind changed is redrawn around its centre, and a node moved to another group is
 *     re-placed next to that group;
 *   - for each attribute (label, kind, colour, group, link; edge label, style, arrowheads,
 *     endpoints; group name; title) the description wins only if it differs from the base,
 *     i.e. the agent changed it. Otherwise the board's current value is kept, so the
 *     person's recolouring, restyling or relabelling survives.
 *   - elements the person drew (no `customData.vw`) can be adopted by using their id; their
 *     current values act as the base.
 * - Ids in the description but not on the board are added and placed next to their
 *   neighbours (using the auto-layout of the whole description, translated to where the
 *   neighbours actually are), then nudged sideways until they overlap nothing.
 * - Elements the generator created whose ids are no longer described are deleted, with
 *   their labels and arrows. Elements the person drew are never deleted unless listed in
 *   `remove`. Everything else on the board (freehand, images, text) is left untouched.
 */

import type { BoardSpec, EdgeSpec, GroupSpec, NodeKind, NodeSpec } from "./spec.ts";
import {
  type Binding,
  type Box,
  type El,
  type Point,
  type SceneFile,
  BOUND_TEXT_PADDING,
  arrowElement,
  baseElement,
  boxesOverlap,
  center,
  elementBox,
  frameElement,
  hash,
  outlinePoint,
  round,
  sequentialIndices,
  textBlockWidth,
  textElement,
  textHeight,
  unionBox,
  wrapText,
} from "./excalidraw.ts";
import {
  EDGE_INK,
  INK,
  SIZES,
  fontFor,
  labelFits,
  measureNode,
  paintFor,
  roughnessFor,
  roundnessFor,
  shapeTypeFor,
  textArea,
} from "./style.ts";
import { FRAME_PAD, isAttachment, labelSize, layoutBoard } from "./layout.ts";
import { type Segment, balanceForLabel, fixedPointFor, routeOrthogonal, segmentsOf } from "./router.ts";
import { describeEdgeBase, describeNodeBase, readBoardMeta } from "./describe.ts";

export const TITLE_ID = "board-title";
const GAP = 5;
const CLEAR = 40;

export interface BuildOptions {
  /** Timestamp for `updated` fields (tests pass a fixed value) */
  now?: number;
  /** Ignore the existing board and lay everything out again */
  fresh?: boolean;
}

export interface BuildReport {
  created: boolean;
  added: string[];
  changed: string[];
  removed: string[];
  kept: number;
  warnings: string[];
}

export interface NodeBase {
  role: "node";
  id: string;
  label: string;
  kind: NodeKind;
  color: string;
  group: string | null;
  link: string | null;
}
export interface EdgeBase {
  role: "edge";
  id: string;
  from: string;
  to: string;
  label: string;
  style: string;
  arrows: string;
}
export interface GroupBase {
  role: "group";
  id: string;
  label: string;
}
export interface TitleBase {
  role: "title";
  id: string;
  label: string;
}
export type Base = NodeBase | EdgeBase | GroupBase | TitleBase;

export function managedBase(el: El): Base | null {
  const vw = el.customData?.vw as Base | undefined;
  if (!vw || typeof vw !== "object" || vw.id !== el.id) return null;
  return vw;
}

const NODE_TYPES = new Set(["rectangle", "ellipse", "diamond", "text"]);

export function isNodeElement(el: El): boolean {
  return NODE_TYPES.has(el.type) && !(el.type === "text" && el.containerId);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function buildBoard(spec: BoardSpec, existing: SceneFile | null, opts: BuildOptions = {}): { file: SceneFile; report: BuildReport } {
  const now = opts.now ?? Date.now();
  const updating = !!existing && !opts.fresh;
  const b = new Builder(spec, updating ? clone(existing!.elements.filter((e) => !e.isDeleted)) : [], now);
  b.run(updating);
  const files = updating || existing ? filterFiles(existing?.files ?? {}, b.els) : {};
  const appState = {
    gridSize: 20,
    gridStep: 5,
    gridModeEnabled: false,
    viewBackgroundColor: "#ffffff",
    ...(existing?.appState ?? {}),
  };
  const file: SceneFile = {
    type: "excalidraw",
    version: 2,
    source: existing?.source ?? "vibework",
    elements: b.els,
    appState,
    files,
  };
  (file as unknown as Record<string, unknown>).vibework = { direction: spec.direction, style: spec.style };
  return { file, report: { ...b.report, created: !updating } };
}

function filterFiles(files: Record<string, unknown>, els: El[]): Record<string, unknown> {
  const used = new Set(els.filter((e) => e.type === "image").map((e) => e.fileId as string));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(files)) if (used.has(k)) out[k] = v;
  return out;
}

class Builder {
  els: El[];
  byId = new Map<string, El>();
  report: Omit<BuildReport, "created"> = { added: [], changed: [], removed: [], kept: 0, warnings: [] };
  font: number;
  rough: number;
  /** Nodes that need a position (new, or moved to another group) */
  toPlace = new Set<string>();
  /** Nodes whose box moved or changed size in this build (their arrows need new endpoints) */
  reshaped = new Set<string>();
  /** Edges that need a new route */
  toRoute = new Set<string>();
  /** Frames whose bounds must be recomputed from their members */
  dirtyFrames = new Set<string>();
  newIds = new Set<string>();

  constructor(
    public spec: BoardSpec,
    els: El[],
    public now: number,
  ) {
    this.els = els;
    for (const el of els) this.byId.set(el.id, el);
    this.font = fontFor(spec);
    this.rough = roughnessFor(spec);
  }

  run(updating: boolean) {
    this.removeExplicit();
    this.removeUndescribed();
    for (const g of this.spec.groups) this.prepareGroup(g);
    for (const n of this.spec.nodes) this.prepareNode(n);
    this.place(updating);
    this.fitFrames();
    for (const e of this.spec.edges) this.prepareEdge(e);
    this.routeEdges();
    this.syncLabelFrames();
    this.prepareTitle();
    this.orderAndIndex();
    this.report.kept = this.els.length - this.newIds.size;
  }

  // -------------------------------------------------------------------------
  // helpers

  get(id: string): El | undefined {
    return this.byId.get(id);
  }

  boundText(container: El): El | undefined {
    const ref = (container.boundElements ?? []).find((b) => b.type === "text");
    return ref ? this.byId.get(ref.id) : undefined;
  }

  add(el: El) {
    this.els.push(el);
    this.byId.set(el.id, el);
    this.newIds.add(el.id);
  }

  touch(el: El) {
    if (this.newIds.has(el.id)) return;
    el.version += 1;
    el.versionNonce = hash(`${el.id}:${el.version}`);
    el.updated = this.now;
  }

  freshId(base: string): string {
    let id = base;
    for (let i = 2; this.byId.has(id); i++) id = `${base}-${i}`;
    return id;
  }

  deleteElement(id: string, why: "removed" | "replaced" = "removed") {
    const el = this.byId.get(id);
    if (!el) return;
    // Bound text goes with its container.
    for (const ref of el.boundElements ?? []) {
      if (ref.type === "text") this.drop(ref.id);
      else {
        const arrow = this.byId.get(ref.id);
        if (!arrow) continue;
        if (managedBase(arrow)?.role === "edge" && why === "removed") continue; // handled by edge removal
        if (arrow.startBinding?.elementId === id) arrow.startBinding = null;
        if (arrow.endBinding?.elementId === id) arrow.endBinding = null;
        this.touch(arrow);
      }
    }
    // Arrows bound to this element lose the binding on the other side too.
    for (const b of [el.startBinding, el.endBinding]) {
      if (!b) continue;
      const t = this.byId.get(b.elementId);
      if (t?.boundElements) {
        t.boundElements = t.boundElements.filter((r) => r.id !== id);
        if (!t.boundElements.length) t.boundElements = null;
        this.touch(t);
      }
    }
    if (el.type === "frame") {
      for (const child of this.els) if (child.frameId === id) {
        child.frameId = null;
        this.touch(child);
      }
    }
    if (el.type === "text" && el.containerId) {
      const c = this.byId.get(el.containerId);
      if (c?.boundElements) {
        c.boundElements = c.boundElements.filter((r) => r.id !== id);
        if (!c.boundElements.length) c.boundElements = null;
      }
    }
    this.drop(id);
    if (why === "removed") this.report.removed.push(id);
  }

  drop(id: string) {
    this.byId.delete(id);
    const i = this.els.findIndex((e) => e.id === id);
    if (i >= 0) this.els.splice(i, 1);
  }

  // -------------------------------------------------------------------------
  // removal

  removeExplicit() {
    for (const id of this.spec.remove) {
      if (this.byId.has(id)) this.deleteElement(id);
      else this.report.warnings.push(`remove: no element "${id}" on the board`);
    }
  }

  removeUndescribed() {
    const described = new Set<string>([
      ...this.spec.nodes.map((n) => n.id),
      ...this.spec.edges.map((e) => e.id),
      ...this.spec.groups.map((g) => g.id),
    ]);
    // Edges first, so node removal does not touch arrows that are going anyway.
    const managed = this.els.map((el) => [el, managedBase(el)] as const).filter(([, b]) => b);
    for (const [el, base] of managed) if (base!.role === "edge" && !described.has(el.id)) this.deleteElement(el.id);
    for (const [el, base] of managed) {
      if (!this.byId.has(el.id)) continue;
      if ((base!.role === "node" || base!.role === "group") && !described.has(el.id)) this.deleteElement(el.id);
    }
  }

  // -------------------------------------------------------------------------
  // groups (frames)

  prepareGroup(g: GroupSpec) {
    const el = this.get(g.id);
    if (el && el.type !== "frame") {
      this.report.warnings.push(`group "${g.id}": that id belongs to a ${el.type} on the board; skipped`);
      return;
    }
    if (!el) {
      // Created in fitFrames once members are placed.
      this.dirtyFrames.add(g.id);
      return;
    }
    const base = (managedBase(el) as GroupBase | null) ?? { role: "group", id: el.id, label: el.name ?? "" };
    if (g.label !== base.label && el.name !== g.label) {
      el.name = g.label;
      this.touch(el);
      this.report.changed.push(g.id);
    }
    el.customData = { ...(el.customData ?? {}), vw: { role: "group", id: g.id, label: g.label } satisfies GroupBase };
  }

  // -------------------------------------------------------------------------
  // nodes

  prepareNode(n: NodeSpec) {
    const el = this.get(n.id);
    if (el && !isNodeElement(el)) {
      this.report.warnings.push(`node "${n.id}": that id belongs to a ${el.type} on the board; skipped`);
      return;
    }
    const groupFrame = n.group && (this.get(n.group)?.type === "frame" || this.dirtyFrames.has(n.group)) ? n.group : null;
    if (!el) {
      const geom = measureNode(n, this.font);
      this.createNode(n, geom.width, geom.height, [0, 0], groupFrame);
      this.toPlace.add(n.id);
      if (groupFrame) this.dirtyFrames.add(groupFrame);
      this.report.added.push(n.id);
      return;
    }

    const base = (managedBase(el) as NodeBase | null) ?? describeNodeBase(el, this.byId);
    const text = el.type === "text" ? el : this.boundText(el);
    const currentLabel = (text?.originalText ?? text?.text ?? "") as string;
    const label = n.label !== base.label ? n.label : currentLabel;
    const kind = n.kind !== base.kind ? n.kind : base.kind;
    const colorChanged = n.color !== base.color;
    const groupChanged = (n.group ?? null) !== (base.group ?? null);
    const linkChanged = (n.link ?? null) !== (base.link ?? null);
    let changed = false;

    const wantType = shapeTypeFor(kind);
    if (wantType !== el.type) {
      // Kind changed into another shape: redraw around the same centre, same id.
      const [cx, cy] = center(el);
      const geom = measureNode({ kind, label }, this.font);
      const paint = colorChanged ? paintFor(kind, n.color) : { strokeColor: el.strokeColor, backgroundColor: el.backgroundColor };
      const frameId = groupChanged ? groupFrame : el.frameId;
      const arrows = (el.boundElements ?? []).filter((r) => r.type === "arrow");
      const index = this.els.indexOf(el);
      if (text && text !== el) this.drop(text.id);
      this.drop(el.id);
      const made = this.makeNodeElements({ ...n, kind, label }, geom.width, geom.height, [cx, cy], frameId, paint);
      made[0].boundElements = [...(made[0].boundElements ?? []), ...arrows];
      if (!made[0].boundElements.length) made[0].boundElements = null;
      made[0].version = el.version + 1;
      made[0].versionNonce = hash(`${el.id}:${made[0].version}`);
      this.els.splice(index, 0, ...made);
      for (const m of made) this.byId.set(m.id, m);
      this.reshaped.add(n.id);
      if (groupChanged) this.toPlace.add(n.id);
      this.report.changed.push(n.id);
      return;
    }

    if (colorChanged) {
      const p = paintFor(kind, n.color);
      if (el.strokeColor !== p.strokeColor || el.backgroundColor !== p.backgroundColor) {
        el.strokeColor = p.strokeColor;
        el.backgroundColor = p.backgroundColor;
        if (el.type === "text") el.strokeColor = p.strokeColor;
        changed = true;
      }
    }
    if (linkChanged && el.link !== n.link) {
      el.link = n.link;
      changed = true;
    }
    if (groupChanged) {
      const target = groupFrame;
      if (el.frameId !== target) {
        el.frameId = target;
        changed = true;
      }
      if (target) {
        this.toPlace.add(n.id);
        this.dirtyFrames.add(target);
      }
    }
    if (label !== currentLabel) {
      this.setLabel(el, label);
      changed = true;
    }
    el.customData = {
      ...(el.customData ?? {}),
      vw: { role: "node", id: n.id, label: n.label, kind: n.kind, color: n.color, group: n.group, link: n.link } satisfies NodeBase,
    };
    if (changed) {
      this.touch(el);
      this.report.changed.push(n.id);
    }
  }

  /** Replace a node's label; grow the container around its centre if the text no longer fits. */
  setLabel(el: El, label: string) {
    const fs = SIZES.fontSize;
    if (el.type === "text") {
      const lines = wrapText(label, 420, el.fontSize ?? fs, el.fontFamily ?? this.font);
      const w = textBlockWidth(lines, el.fontSize ?? fs, el.fontFamily ?? this.font);
      const h = textHeight(lines.length, el.fontSize ?? fs);
      if (el.textAlign === "left") {
        Object.assign(el, { text: lines.join("\n"), originalText: label, width: w, height: h });
      } else {
        const [cx, cy] = center(el);
        Object.assign(el, { text: lines.join("\n"), originalText: label, width: w, height: h, x: cx - w / 2, y: cy - h / 2 });
      }
      this.reshaped.add(el.id);
      return;
    }
    let text = this.boundText(el);
    const family = (text?.fontFamily as number | undefined) ?? this.font;
    const size = (text?.fontSize as number | undefined) ?? fs;
    if (!labelFits(el.type as "rectangle", label, el.width, el.height, size, family)) {
      const kind = (managedBase(el) as NodeBase | null)?.kind ?? (el.type === "diamond" ? "decision" : el.type === "ellipse" ? "ellipse" : "box");
      const need = measureNode({ kind, label }, family);
      const [cx, cy] = center(el);
      el.width = Math.max(el.width, need.width);
      el.height = Math.max(el.height, need.height);
      el.x = round(cx - el.width / 2);
      el.y = round(cy - el.height / 2);
      this.reshaped.add(el.id);
    }
    if (!label) {
      if (text) this.deleteElement(text.id, "replaced");
      return;
    }
    if (!text) {
      text = textElement({
        id: this.freshId(`${el.id}:label`),
        text: label,
        originalText: label,
        x: el.x,
        y: el.y,
        width: 0,
        height: 0,
        fontSize: size,
        fontFamily: family,
        containerId: el.id,
        frameId: el.frameId,
        now: this.now,
      });
      el.boundElements = [...(el.boundElements ?? []), { type: "text", id: text.id }];
      this.add(text);
    } else {
      text.originalText = label;
      this.touch(text);
    }
    this.layoutBoundText(el, text);
  }

  /** Wrap and centre bound text inside its container the way Excalidraw does. */
  layoutBoundText(container: El, text: El) {
    const size = (text.fontSize as number) ?? SIZES.fontSize;
    const family = (text.fontFamily as number) ?? this.font;
    const area = textArea(container.type as "rectangle", container.width, container.height);
    const lines = wrapText((text.originalText as string) ?? "", area.w, size, family);
    const w = textBlockWidth(lines, size, family);
    const h = textHeight(lines.length, size);
    let ox = BOUND_TEXT_PADDING;
    let oy = BOUND_TEXT_PADDING;
    if (container.type === "ellipse") {
      ox += (container.width / 2) * (1 - Math.SQRT2 / 2);
      oy += (container.height / 2) * (1 - Math.SQRT2 / 2);
    } else if (container.type === "diamond") {
      ox += container.width / 4;
      oy += container.height / 4;
    }
    text.text = lines.join("\n");
    text.width = w;
    text.height = h;
    text.x = container.x + ox + (area.w / 2 - w / 2);
    text.y = text.verticalAlign === "top" ? container.y + oy : container.y + oy + (area.h / 2 - h / 2);
  }

  makeNodeElements(n: NodeSpec, width: number, height: number, c: Point, frameId: string | null, paint = paintFor(n.kind, n.color)): El[] {
    const vw: NodeBase = { role: "node", id: n.id, label: n.label, kind: n.kind, color: n.color, group: n.group, link: n.link };
    const type = shapeTypeFor(n.kind);
    if (type === "text") {
      const lines = wrapText(n.label, 420, SIZES.fontSize, this.font);
      const w = textBlockWidth(lines, SIZES.fontSize, this.font);
      const h = textHeight(lines.length, SIZES.fontSize);
      const t = textElement({
        id: n.id,
        text: lines.join("\n"),
        originalText: n.label,
        x: c[0] - w / 2,
        y: c[1] - h / 2,
        width: w,
        height: h,
        fontSize: SIZES.fontSize,
        fontFamily: this.font,
        textAlign: "center",
        verticalAlign: "top",
        containerId: null,
        strokeColor: paint.strokeColor,
        frameId,
        customData: { vw },
        now: this.now,
      });
      t.link = n.link;
      return [t];
    }
    const shape = baseElement(type, {
      id: n.id,
      x: c[0] - width / 2,
      y: c[1] - height / 2,
      width,
      height,
      strokeColor: paint.strokeColor,
      backgroundColor: paint.backgroundColor,
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: this.rough,
      roundness: roundnessFor(n.kind),
      frameId,
      link: n.link,
      customData: { vw },
      now: this.now,
    });
    if (!n.label) return [shape];
    const label = textElement({
      id: this.freshId(`${n.id}:label`),
      text: n.label,
      originalText: n.label,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fontSize: SIZES.fontSize,
      fontFamily: this.font,
      containerId: n.id,
      strokeColor: INK,
      frameId,
      now: this.now,
    });
    shape.boundElements = [{ type: "text", id: label.id }];
    this.layoutBoundText(shape, label);
    return [shape, label];
  }

  createNode(n: NodeSpec, width: number, height: number, c: Point, frameId: string | null) {
    for (const el of this.makeNodeElements(n, width, height, c, frameId)) this.add(el);
  }

  /** Move a node (and its bound text) so its centre is at `c`. */
  moveNode(id: string, c: Point) {
    const el = this.get(id)!;
    const dx = c[0] - (el.x + el.width / 2);
    const dy = c[1] - (el.y + el.height / 2);
    el.x = round(el.x + dx);
    el.y = round(el.y + dy);
    const t = this.boundText(el);
    if (t) {
      t.x += dx;
      t.y += dy;
    }
  }

  // -------------------------------------------------------------------------
  // placement

  place(updating: boolean) {
    const nodes = this.spec.nodes.filter((n) => this.get(n.id));
    const sizes = new Map(nodes.map((n) => [n.id, { width: this.get(n.id)!.width, height: this.get(n.id)!.height }]));
    const spec = { ...this.spec, nodes };
    const ideal = layoutBoard(spec, sizes, this.font);

    if (!updating) {
      // Fresh board: the layout is the arrangement.
      for (const n of nodes) {
        this.moveNode(n.id, ideal.centers.get(n.id)!);
      }
      this.toPlace.clear();
      return;
    }

    const placed = new Set(nodes.filter((n) => !this.toPlace.has(n.id)).map((n) => n.id));
    const pending = nodes.filter((n) => this.toPlace.has(n.id));
    const neighbours = new Map<string, string[]>();
    for (const e of this.spec.edges) {
      if (!neighbours.has(e.from)) neighbours.set(e.from, []);
      if (!neighbours.has(e.to)) neighbours.set(e.to, []);
      neighbours.get(e.from)!.push(e.to);
      neighbours.get(e.to)!.push(e.from);
    }
    const groupOf = new Map(nodes.map((n) => [n.id, n.group]));
    const offsetFrom = (anchors: string[]): Point => {
      let sx = 0;
      let sy = 0;
      for (const a of anchors) {
        const [ax, ay] = center(this.get(a)!);
        const [ix, iy] = ideal.centers.get(a)!;
        sx += ax - ix;
        sy += ay - iy;
      }
      return [sx / anchors.length, sy / anchors.length];
    };

    while (pending.length) {
      let progressed = false;
      for (let i = 0; i < pending.length; i++) {
        const n = pending[i];
        let anchors = (neighbours.get(n.id) ?? []).filter((a) => placed.has(a));
        // Prefer neighbours in the same group, when it has any.
        const sameGroup = anchors.filter((a) => groupOf.get(a) === n.group);
        if (n.group && sameGroup.length) anchors = sameGroup;
        if (!anchors.length && n.group) anchors = nodes.filter((m) => m.group === n.group && placed.has(m.id)).map((m) => m.id);
        if (!anchors.length) continue;
        const off = offsetFrom(anchors);
        const [ix, iy] = ideal.centers.get(n.id)!;
        this.moveNode(n.id, [ix + off[0], iy + off[1]]);
        this.resolveCollision([n.id], placed);
        placed.add(n.id);
        pending.splice(i, 1);
        i--;
        progressed = true;
      }
      if (progressed) continue;
      // Nothing anchored: place the first pending component as a block beside the board.
      const first = pending[0];
      const block = new Set<string>([first.id]);
      const queue = [first.id];
      // Nothing of the description is on the board yet: keep the whole layout together.
      if (!placed.size) for (const p of pending) block.add(p.id);
      while (queue.length && placed.size) {
        const id = queue.shift()!;
        for (const m of neighbours.get(id) ?? []) {
          if (!block.has(m) && pending.some((p) => p.id === m) && groupOf.get(m) === first.group) {
            block.add(m);
            queue.push(m);
          }
        }
      }
      const ids = [...block];
      const idealBox = unionBox(ids.map((id) => {
        const el = this.get(id)!;
        const [ix, iy] = ideal.centers.get(id)!;
        return { x: ix - el.width / 2, y: iy - el.height / 2, width: el.width, height: el.height };
      }))!;
      const content = unionBox(this.els.filter((e) => !this.toPlace.has(e.id) && !(e.type === "text" && e.containerId) && this.isObstacle(e)).map(elementBox));
      const vertical = this.spec.direction === "TB" || this.spec.direction === "BT";
      let off: Point = [0, 0];
      if (content) {
        off = vertical
          ? [content.x + content.width + CLEAR * 2 - idealBox.x, content.y - idealBox.y]
          : [content.x - idealBox.x, content.y + content.height + CLEAR * 2 - idealBox.y];
      }
      for (const id of ids) {
        const [ix, iy] = ideal.centers.get(id)!;
        this.moveNode(id, [ix + off[0], iy + off[1]]);
      }
      this.resolveCollision(ids, placed);
      for (const id of ids) {
        placed.add(id);
      }
      for (const id of ids) pending.splice(pending.findIndex((p) => p.id === id), 1);
    }
    for (const id of this.toPlace) this.reshaped.add(id);
  }

  isObstacle(e: El): boolean {
    return e.type !== "arrow" && e.type !== "line" && e.type !== "freedraw" && !(e.type === "text" && !!e.containerId);
  }

  /** Shift the given nodes together, sideways to the flow, until they overlap nothing placed. Returns the shift. */
  resolveCollision(ids: string[], placed: Set<string>): Point {
    const vertical = this.spec.direction === "TB" || this.spec.direction === "BT";
    const moving = new Set(ids);
    const frameOf = new Map(ids.map((id) => [id, this.get(id)!.frameId]));
    const obstacles = this.els.filter((e) => {
      if (moving.has(e.id) || !this.isObstacle(e)) return false;
      if (e.type === "frame") return ![...frameOf.values()].includes(e.id);
      // Nodes still waiting for a position are not obstacles yet.
      if (this.toPlace.has(e.id) && !placed.has(e.id)) return false;
      return true;
    });
    const total: Point = [0, 0];
    for (let iter = 0; iter < 200; iter++) {
      let hit: Box | null = null;
      let moverBox: Box | null = null;
      for (const id of ids) {
        const box = elementBox(this.get(id)!);
        const ob = obstacles.find((o) => boxesOverlap(box, elementBox(o), CLEAR - 1));
        if (ob) {
          hit = elementBox(ob);
          moverBox = box;
          break;
        }
      }
      if (!hit || !moverBox) break;
      const shift: Point = vertical ? [hit.x + hit.width + CLEAR - moverBox.x, 0] : [0, hit.y + hit.height + CLEAR - moverBox.y];
      for (const id of ids) {
        const [cx, cy] = center(this.get(id)!);
        this.moveNode(id, [cx + shift[0], cy + shift[1]]);
      }
      total[0] += shift[0];
      total[1] += shift[1];
    }
    return total;
  }

  // -------------------------------------------------------------------------
  // edges

  prepareEdge(e: EdgeSpec) {
    const from = this.get(e.from);
    const to = this.get(e.to);
    if (!from || !to) {
      this.report.warnings.push(`edge "${e.id}": missing endpoint; skipped`);
      return;
    }
    const el = this.get(e.id);
    if (el && el.type !== "arrow") {
      this.report.warnings.push(`edge "${e.id}": that id belongs to a ${el.type} on the board; skipped`);
      return;
    }
    const head = this.spec.style === "sketch" ? "arrow" : "triangle";
    const startArrowhead = e.arrows === "both" ? head : null;
    const endArrowhead = e.arrows === "none" ? null : head;
    const vw: EdgeBase = { role: "edge", id: e.id, from: e.from, to: e.to, label: e.label, style: e.style, arrows: e.arrows };
    if (!el) {
      const arrow = arrowElement({
        id: e.id,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [[0, 0], [1, 1]],
        start: { elementId: e.from, focus: 0, gap: GAP },
        end: { elementId: e.to, focus: 0, gap: GAP },
        startArrowhead,
        endArrowhead,
        strokeColor: EDGE_INK,
        strokeWidth: 2,
        strokeStyle: e.style,
        roughness: this.rough,
        roundness: null,
        elbowed: true,
        customData: { vw },
        now: this.now,
      });
      this.add(arrow);
      this.bindArrow(arrow.id, e.from);
      this.bindArrow(arrow.id, e.to);
      if (e.label) this.setEdgeLabel(arrow, e.label);
      this.toRoute.add(e.id);
      this.report.added.push(e.id);
      return;
    }

    const base = (managedBase(el) as EdgeBase | null) ?? describeEdgeBase(el, this.byId);
    let changed = false;
    if (e.from !== base.from || e.to !== base.to) {
      // New endpoints: rebind and reroute.
      for (const [end, target] of [["startBinding", e.from], ["endBinding", e.to]] as const) {
        const old = el[end] as Binding | null;
        if (old?.elementId === target) continue;
        if (old) this.unbindArrow(el.id, old.elementId);
        el[end] = { elementId: target, focus: 0, gap: GAP };
        this.bindArrow(el.id, target);
      }
      this.toRoute.add(e.id);
      changed = true;
    }
    if (e.style !== base.style && el.strokeStyle !== e.style) {
      el.strokeStyle = e.style;
      changed = true;
    }
    if (e.arrows !== base.arrows) {
      el.startArrowhead = startArrowhead;
      el.endArrowhead = endArrowhead;
      changed = true;
    }
    if (e.label !== base.label) {
      const t = this.boundText(el);
      if (((t?.originalText as string) ?? "") !== e.label) {
        this.setEdgeLabel(el, e.label);
        changed = true;
      }
    }
    el.customData = { ...(el.customData ?? {}), vw };
    if (changed) {
      this.touch(el);
      this.report.changed.push(e.id);
    }
  }

  bindArrow(arrowId: string, targetId: string) {
    const t = this.get(targetId)!;
    const refs = t.boundElements ?? [];
    if (!refs.some((r) => r.id === arrowId)) t.boundElements = [...refs, { id: arrowId, type: "arrow" }];
  }

  unbindArrow(arrowId: string, targetId: string) {
    const t = this.get(targetId);
    if (!t?.boundElements) return;
    t.boundElements = t.boundElements.filter((r) => r.id !== arrowId);
    if (!t.boundElements.length) t.boundElements = null;
  }

  setEdgeLabel(arrow: El, label: string) {
    let t = this.boundText(arrow);
    if (!label) {
      if (t) this.deleteElement(t.id, "replaced");
      return;
    }
    const size = (t?.fontSize as number | undefined) ?? SIZES.edgeFontSize;
    const family = (t?.fontFamily as number | undefined) ?? this.font;
    const { lines, width, height } = labelSize(label, family);
    if (!t) {
      t = textElement({
        id: this.freshId(`${arrow.id}:label`),
        text: lines.join("\n"),
        originalText: label,
        x: 0,
        y: 0,
        width,
        height,
        fontSize: size,
        fontFamily: family,
        containerId: arrow.id,
        strokeColor: INK,
        now: this.now,
      });
      arrow.boundElements = [...(arrow.boundElements ?? []), { type: "text", id: t.id }];
      this.add(t);
    } else {
      Object.assign(t, { text: lines.join("\n"), originalText: label, width, height });
      this.touch(t);
    }
    this.placeEdgeLabel(arrow);
  }

  /** Centre an arrow's label on its midpoint, as Excalidraw does. */
  placeEdgeLabel(arrow: El) {
    const t = this.boundText(arrow);
    if (!t || !arrow.points) return;
    const pts = arrow.points;
    let mx: number;
    let my: number;
    if (pts.length % 2 === 1) {
      const m = pts[Math.floor(pts.length / 2)];
      mx = m[0];
      my = m[1];
    } else {
      const i = pts.length / 2 - 1;
      mx = (pts[i][0] + pts[i + 1][0]) / 2;
      my = (pts[i][1] + pts[i + 1][1]) / 2;
    }
    t.x = arrow.x + mx - t.width / 2;
    t.y = arrow.y + my - t.height / 2;
  }

  routeEdges() {
    // Labelled connectors first (they get the clearest paths), then shortest first.
    const dist = (e: EdgeSpec) => {
      const a = this.get(e.from);
      const b = this.get(e.to);
      if (!a || !b) return 0;
      const [ax, ay] = center(a);
      const [bx, by] = center(b);
      return Math.abs(ax - bx) + Math.abs(ay - by);
    };
    const order = [...this.spec.edges].sort((x, y) => (x.label ? 0 : 1) - (y.label ? 0 : 1) || dist(x) - dist(y));
    for (const e of order) {
      const arrow = this.get(e.id);
      if (!arrow || arrow.type !== "arrow") continue;
      const from = this.get(e.from)!;
      const to = this.get(e.to)!;
      if (this.toRoute.has(e.id)) {
        this.route(arrow, from, to);
        continue;
      }
      // Existing arrow: new path only where one of its nodes moved or changed shape.
      if (this.reshaped.has(from.id) || this.reshaped.has(to.id)) {
        this.route(arrow, from, to);
        this.touch(arrow);
      }
    }
  }

  /** Segments of connectors routed so far, with their end nodes */
  routed: { from: string; to: string; labelled: boolean; segs: Segment[] }[] = [];

  route(arrow: El, from: El, to: El) {
    if (!arrow.elbowed) {
      // A person's free arrow: keep its shape, move its ends onto the outlines.
      this.reclip(arrow);
      return;
    }
    const obstacles: Box[] = [];
    for (const e of this.els) {
      if (e.id === from.id || e.id === to.id || !this.isObstacle(e)) continue;
      if (e.type !== "frame") {
        obstacles.push(elementBox(e));
        continue;
      }
      // A frame's name sits above it; keep connectors off it.
      const name = (e.name ?? "") as string;
      if (name) obstacles.push({ x: e.x, y: e.y - 30, width: Math.min(e.width, name.length * 9 + 12), height: 26 });
      // Connectors between nodes outside a frame go around it, not through it.
      if (from.frameId !== e.id && to.frameId !== e.id) obstacles.push(elementBox(e));
    }
    const labelled = (arrow.boundElements ?? []).some((b) => b.type === "text");
    // Running along connectors that share an end with this one is fine (a shared trunk),
    // unless either carries a label, which the other line would run through.
    const avoid = this.routed
      .filter((r) => (r.from !== from.id && r.to !== to.id) || r.labelled || labelled)
      .flatMap((r) => r.segs);
    // Frame borders: cross them, but do not run along them.
    for (const f of this.els) {
      if (f.type !== "frame") continue;
      const b = elementBox(f);
      avoid.push(
        { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y },
        { x1: b.x, y1: b.y + b.height, x2: b.x + b.width, y2: b.y + b.height },
        { x1: b.x, y1: b.y, x2: b.x, y2: b.y + b.height },
        { x1: b.x + b.width, y1: b.y, x2: b.x + b.width, y2: b.y + b.height },
      );
    }
    const kindOf = (id: string) => (managedBase(this.get(id) ?? ({} as El)) as NodeBase | null)?.kind;
    const anySide = isAttachment({ from: from.id, to: to.id }, kindOf);
    const r = routeOrthogonal(elementBox(from), elementBox(to), obstacles, this.spec.direction, GAP, { avoid, anySide });
    this.routed.push({ from: from.id, to: to.id, labelled, segs: segmentsOf(r.points) });
    this.setPoints(arrow, labelled ? balanceForLabel(r.points) : r.points);
    arrow.startBinding = { elementId: from.id, focus: 0, gap: 0, fixedPoint: fixedPointFor(from, r.points[0]) };
    arrow.endBinding = { elementId: to.id, focus: 0, gap: 0, fixedPoint: fixedPointFor(to, r.points[r.points.length - 1]) };
  }

  reclip(arrow: El) {
    const pts = arrow.points!.map(([x, y]) => [x + arrow.x, y + arrow.y] as Point);
    const a = arrow.startBinding ? this.get(arrow.startBinding.elementId) : undefined;
    const b = arrow.endBinding ? this.get(arrow.endBinding.elementId) : undefined;
    if (a) pts[0] = outlinePoint(a, a.type, pts.length > 2 ? pts[1] : b ? center(b) : pts[1], GAP);
    if (b) pts[pts.length - 1] = outlinePoint(b, b.type, pts.length > 2 ? pts[pts.length - 2] : a ? center(a) : pts[0], GAP);
    this.setPoints(arrow, pts);
  }

  setPoints(arrow: El, abs: Point[]) {
    const [x0, y0] = abs[0];
    arrow.x = round(x0);
    arrow.y = round(y0);
    arrow.points = abs.map(([x, y]) => [round(x - arrow.x), round(y - arrow.y)] as Point);
    arrow.points[0] = [0, 0];
    const xs = arrow.points.map((p) => p[0]);
    const ys = arrow.points.map((p) => p[1]);
    arrow.width = round(Math.max(...xs) - Math.min(...xs));
    arrow.height = round(Math.max(...ys) - Math.min(...ys));
    if (!arrow.elbowed) {
      if (arrow.startBinding) arrow.startBinding = { ...arrow.startBinding, focus: 0, gap: GAP };
      if (arrow.endBinding) arrow.endBinding = { ...arrow.endBinding, focus: 0, gap: GAP };
    }
    this.placeEdgeLabel(arrow);
  }

  // -------------------------------------------------------------------------
  // frames

  fitFrames() {
    for (const g of this.spec.groups) {
      if (!this.dirtyFrames.has(g.id)) continue;
      const members = this.els.filter((e) => e.frameId === g.id && isNodeElement(e));
      const box = unionBox(members.map(elementBox));
      let frame = this.get(g.id);
      if (!box) {
        if (!frame) this.report.warnings.push(`group "${g.id}" has no nodes; not drawn`);
        continue;
      }
      const want: Box = { x: box.x - FRAME_PAD, y: box.y - FRAME_PAD, width: box.width + FRAME_PAD * 2, height: box.height + FRAME_PAD * 2 };
      if (!frame) {
        frame = frameElement({
          id: g.id,
          x: want.x,
          y: want.y,
          width: want.width,
          height: want.height,
          name: g.label,
          customData: { vw: { role: "group", id: g.id, label: g.label } satisfies GroupBase },
          now: this.now,
        });
        this.add(frame);
        this.report.added.push(g.id);
        continue;
      }
      const grown = unionBox([elementBox(frame), want])!;
      if (grown.x !== frame.x || grown.y !== frame.y || grown.width !== frame.width || grown.height !== frame.height) {
        Object.assign(frame, { x: round(grown.x), y: round(grown.y), width: round(grown.width), height: round(grown.height) });
        this.touch(frame);
      }
    }
  }

  /** Bound text follows its container's frame, as in Excalidraw. */
  syncLabelFrames() {
    for (const el of this.els) {
      if (el.type !== "text" || !el.containerId) continue;
      const c = this.get(el.containerId);
      if (c && c.type !== "arrow" && el.frameId !== c.frameId) el.frameId = c.frameId;
    }
  }

  // -------------------------------------------------------------------------
  // title

  prepareTitle() {
    const existing = this.els.find((e) => managedBase(e)?.role === "title");
    const title = this.spec.title;
    if (existing) {
      const base = managedBase(existing) as TitleBase;
      if (title !== base.label) {
        if (!title) {
          this.deleteElement(existing.id);
          return;
        }
        this.setLabel(existing, title);
        this.touch(existing);
        this.report.changed.push(existing.id);
      }
      existing.customData = { ...(existing.customData ?? {}), vw: { role: "title", id: existing.id, label: title } satisfies TitleBase };
      return;
    }
    if (!title) return;
    const content = unionBox(this.els.filter((e) => this.isObstacle(e)).map(elementBox)) ?? { x: 0, y: 0, width: 0, height: 0 };
    const fs = SIZES.titleFontSize;
    const lines = wrapText(title, Math.max(480, content.width), fs, this.font);
    const w = textBlockWidth(lines, fs, this.font);
    const h = textHeight(lines.length, fs);
    const frameAbove = this.els.some((e) => e.type === "frame" && Math.abs(e.y - content.y) < 1);
    const id = this.freshId(TITLE_ID);
    const t = textElement({
      id,
      text: lines.join("\n"),
      originalText: title,
      x: content.x,
      y: content.y - h - (frameAbove ? 64 : 32),
      width: w,
      height: h,
      fontSize: fs,
      fontFamily: this.font,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      strokeColor: INK,
      customData: { vw: { role: "title", id, label: title } satisfies TitleBase },
      now: this.now,
    });
    this.add(t);
    this.report.added.push(id);
  }

  // -------------------------------------------------------------------------
  // z-order and fractional indices

  orderAndIndex() {
    // New elements keep creation order but go after existing ones; within new ones,
    // shapes before arrows so arrowheads stay visible, frames last.
    const old = this.els.filter((e) => !this.newIds.has(e.id));
    const fresh = this.els.filter((e) => this.newIds.has(e.id));
    const rank = (e: El) => {
      if (e.type === "arrow") return 1;
      if (e.type === "text" && e.containerId && this.get(e.containerId)?.type === "arrow") return 1;
      if (e.type === "frame") return 2;
      if (managedBase(e)?.role === "title") return 3;
      return 0;
    };
    // Keep each bound text right after its container.
    const ordered: El[] = [];
    const placed = new Set<string>();
    const pushWithText = (e: El) => {
      if (placed.has(e.id)) return;
      if (e.type === "text" && e.containerId && fresh.some((f) => f.id === e.containerId)) return; // follows container
      ordered.push(e);
      placed.add(e.id);
      for (const r of e.boundElements ?? []) {
        if (r.type !== "text") continue;
        const t = this.get(r.id);
        if (t && this.newIds.has(t.id) && !placed.has(t.id)) {
          ordered.push(t);
          placed.add(t.id);
        }
      }
    };
    for (const r of [0, 1, 2, 3]) for (const e of fresh) if (rank(e) === r) pushWithText(e);
    for (const e of fresh) if (!placed.has(e.id)) {
      ordered.push(e);
      placed.add(e.id);
    }

    const all = [...old, ...ordered];
    const valid = old.every((e, i) => typeof e.index === "string" && /^[a-z]/.test(e.index) && (i === 0 || e.index > old[i - 1].index!));
    if (!valid || !old.length) {
      const keys = sequentialIndices(all.length);
      all.forEach((e, i) => (e.index = keys[i]));
    } else {
      let key = old[old.length - 1].index!;
      for (const e of ordered) {
        key = nextIntegerKey(key);
        e.index = key;
      }
    }
    this.els = all;
  }
}

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** The next integer key strictly after `key` (which may have a fractional part). */
export function nextIntegerKey(key: string): string {
  const head = key.charCodeAt(0);
  const len = head - 97 + 1; // digits in the integer part for heads a..z
  const digits = key.slice(1, 1 + len).split("");
  for (let i = digits.length - 1; i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]);
    if (d < DIGITS.length - 1) {
      digits[i] = DIGITS[d + 1];
      return String.fromCharCode(head) + digits.join("");
    }
    digits[i] = "0";
  }
  return String.fromCharCode(head + 1) + "0".repeat(len + 1);
}

export { readBoardMeta };
