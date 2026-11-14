/**
 * The board description the agent writes, and its normalisation.
 *
 * The format is deliberately forgiving: nodes may be plain strings, edges may be
 * "a -> b: label" strings, ids default to a slug of the label, nodes referenced only by
 * edges are created, and unknown values fall back to defaults with a warning.
 */

export type Direction = "TB" | "LR" | "BT" | "RL";
export type NodeKind = "box" | "rounded" | "ellipse" | "decision" | "note" | "text";
export type ColorName =
  | "default"
  | "gray"
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "pink"
  | "teal";
export type LineStyle = "solid" | "dashed" | "dotted";
export type ArrowEnds = "end" | "both" | "none";

export interface NodeSpec {
  id: string;
  label: string;
  kind: NodeKind;
  /** Palette name or a #rrggbb fill */
  color: string;
  group: string | null;
  link: string | null;
}

export interface EdgeSpec {
  id: string;
  from: string;
  to: string;
  label: string;
  style: LineStyle;
  arrows: ArrowEnds;
}

export interface GroupSpec {
  id: string;
  label: string;
}

export interface BoardSpec {
  direction: Direction;
  style: "clean" | "sketch";
  title: string;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  groups: GroupSpec[];
  /** Ids to delete from an existing board, including elements the person drew */
  remove: string[];
}

export class SpecError extends Error {}

const DIRECTIONS: Record<string, Direction> = {
  tb: "TB", td: "TB", down: "TB", "top-down": "TB", vertical: "TB",
  lr: "LR", right: "LR", "left-right": "LR", horizontal: "LR",
  bt: "BT", up: "BT",
  rl: "RL", left: "RL",
};

const KINDS: Record<string, NodeKind> = {
  box: "box", rect: "box", rectangle: "box", process: "box", step: "box", square: "box", node: "box",
  rounded: "rounded", round: "rounded", pill: "rounded", start: "rounded", end: "rounded", terminal: "rounded",
  stop: "rounded", service: "rounded", card: "rounded", person: "rounded",
  ellipse: "ellipse", circle: "ellipse", oval: "ellipse", event: "ellipse",
  decision: "decision", diamond: "decision", choice: "decision", condition: "decision", if: "decision",
  note: "note", sticky: "note", "sticky-note": "note", comment: "note", idea: "note",
  text: "text", label: "text", heading: "text", caption: "text",
};

const COLORS: Record<string, ColorName> = {
  default: "default", none: "default", black: "default", white: "default", plain: "default",
  gray: "gray", grey: "gray", neutral: "gray",
  blue: "blue", cyan: "blue",
  green: "green",
  yellow: "yellow", amber: "yellow",
  orange: "orange",
  red: "red",
  purple: "purple", violet: "purple", grape: "purple",
  pink: "pink", magenta: "pink",
  teal: "teal",
};

const STYLES: Record<string, LineStyle> = { solid: "solid", dashed: "dashed", dash: "dashed", dotted: "dotted", dot: "dotted" };

export function slug(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "node";
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

export function normalizeColor(v: unknown, warn: (m: string) => void): string {
  const s = str(v)?.trim();
  if (!s) return "default";
  if (/^#[0-9a-f]{6}$/i.test(s) || /^#[0-9a-f]{3}$/i.test(s)) return s.toLowerCase();
  const c = COLORS[s.toLowerCase()];
  if (c) return c;
  warn(`unknown colour "${s}", using default (use one of: ${Object.keys(COLORS).filter((k) => COLORS[k] === k).join(", ")})`);
  return "default";
}

export function normalizeKind(v: unknown, warn: (m: string) => void): NodeKind {
  const s = str(v)?.trim().toLowerCase();
  if (!s) return "box";
  const k = KINDS[s];
  if (k) return k;
  warn(`unknown kind "${s}", using box`);
  return "box";
}

/** "a -> b: label", "a --> b" (dashed), "a <-> b", "a -- b" (no arrowhead) */
const EDGE_RE = /^\s*(.+?)\s*(<->|<-->|-->|->|--|==>|=>|\.\.>|\.->)\s*(.+?)\s*(?::\s*(.*))?$/;

export function parseSpec(input: unknown): { spec: BoardSpec; warnings: string[] } {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SpecError("The description must be a JSON object with \"nodes\" and \"edges\".");
  }
  const raw = input as Record<string, unknown>;

  const dirRaw = str(pick(raw, "direction", "dir", "rankdir", "layout"))?.trim().toLowerCase();
  let direction: Direction = "TB";
  if (dirRaw) {
    const d = DIRECTIONS[dirRaw];
    if (d) direction = d;
    else warn(`unknown direction "${dirRaw}", using down`);
  }
  const styleRaw = str(raw.style)?.toLowerCase();
  const style = styleRaw === "sketch" || styleRaw === "hand-drawn" || styleRaw === "handdrawn" ? "sketch" : "clean";
  const title = str(pick(raw, "title", "name", "heading"))?.trim() ?? "";

  const nodes: NodeSpec[] = [];
  const nodeIds = new Set<string>();
  const groups: GroupSpec[] = [];
  const groupIds = new Set<string>();

  const uniqueId = (base: string, taken: Set<string>) => {
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    return id;
  };

  const addGroup = (id: string, label: string) => {
    if (groupIds.has(id)) return;
    groupIds.add(id);
    groups.push({ id, label });
  };

  // Groups first, so nodes can reference them; group.nodes lists membership too.
  const membership = new Map<string, string>();
  const rawGroups = pick(raw, "groups", "frames", "sections", "clusters");
  if (rawGroups !== undefined) {
    if (!Array.isArray(rawGroups)) throw new SpecError("\"groups\" must be an array.");
    for (const g of rawGroups) {
      if (typeof g === "string") {
        addGroup(slug(g), g);
        continue;
      }
      if (!g || typeof g !== "object") continue;
      const go = g as Record<string, unknown>;
      const label = str(pick(go, "label", "name", "title", "text")) ?? str(go.id) ?? "Group";
      const id = str(go.id)?.trim() || slug(label);
      if (groupIds.has(id)) throw new SpecError(`Duplicate group id "${id}".`);
      addGroup(id, label);
      const members = pick(go, "nodes", "children", "members");
      if (Array.isArray(members)) for (const m of members) if (str(m)) membership.set(str(m)!, id);
    }
  }

  const rawNodes = pick(raw, "nodes", "items", "shapes") ?? [];
  if (!Array.isArray(rawNodes)) throw new SpecError("\"nodes\" must be an array.");
  for (const n of rawNodes) {
    if (typeof n === "string" || typeof n === "number") {
      const label = String(n);
      const id = uniqueId(slug(label), nodeIds);
      nodeIds.add(id);
      nodes.push({ id, label, kind: "box", color: "default", group: null, link: null });
      continue;
    }
    if (!n || typeof n !== "object") continue;
    const no = n as Record<string, unknown>;
    const explicitId = str(no.id)?.trim();
    const label = str(pick(no, "label", "text", "title", "name")) ?? explicitId ?? "";
    if (!explicitId && !label) {
      warn("skipped a node with neither id nor label");
      continue;
    }
    if (explicitId && nodeIds.has(explicitId)) throw new SpecError(`Duplicate node id "${explicitId}".`);
    const id = explicitId || uniqueId(slug(label), nodeIds);
    nodeIds.add(id);
    const groupRaw = str(pick(no, "group", "frame", "section", "parent"))?.trim() || null;
    nodes.push({
      id,
      label,
      kind: normalizeKind(pick(no, "kind", "shape", "type"), (m) => warn(`node "${id}": ${m}`)),
      color: normalizeColor(pick(no, "color", "colour", "fill"), (m) => warn(`node "${id}": ${m}`)),
      group: groupRaw,
      link: str(no.link)?.trim() || null,
    });
  }

  // Apply group membership listed on groups; create groups referenced only by nodes.
  for (const node of nodes) {
    if (!node.group && membership.has(node.id)) node.group = membership.get(node.id)!;
    if (node.group && !groupIds.has(node.group)) {
      const bySlug = groups.find((g) => slug(g.label) === slug(node.group!));
      if (bySlug) node.group = bySlug.id;
      else addGroup(node.group, node.group);
    }
  }
  for (const [member] of membership) {
    if (!nodeIds.has(member)) warn(`group lists "${member}", which is not a node`);
  }

  const edges: EdgeSpec[] = [];
  const edgeIds = new Set<string>();
  const ensureNode = (id: string) => {
    if (nodeIds.has(id)) return id;
    // Allow referring to a node by its label.
    const byLabel = nodes.find((n) => n.label === id || slug(n.label) === slug(id));
    if (byLabel) return byLabel.id;
    nodeIds.add(id);
    nodes.push({ id, label: id, kind: "box", color: "default", group: null, link: null });
    warn(`edge refers to unknown node "${id}"; created it with that label`);
    return id;
  };

  const rawEdges = pick(raw, "edges", "links", "connections", "arrows") ?? [];
  if (!Array.isArray(rawEdges)) throw new SpecError("\"edges\" must be an array.");
  for (const e of rawEdges) {
    let from: string | undefined;
    let to: string | undefined;
    let label = "";
    let lineStyle: LineStyle = "solid";
    let arrows: ArrowEnds = "end";
    let explicitId: string | undefined;
    if (typeof e === "string") {
      const m = EDGE_RE.exec(e);
      if (!m) {
        warn(`could not read edge "${e}" (write "from -> to" or "from -> to: label")`);
        continue;
      }
      from = m[1];
      to = m[3];
      label = m[4]?.trim() ?? "";
      const op = m[2];
      if (op === "-->" || op === "<-->" || op === "..>" || op === ".->") lineStyle = "dashed";
      if (op === "<->" || op === "<-->") arrows = "both";
      if (op === "--") arrows = "none";
    } else if (e && typeof e === "object") {
      const eo = e as Record<string, unknown>;
      from = str(pick(eo, "from", "source", "start", "a"));
      to = str(pick(eo, "to", "target", "end", "b"));
      label = str(pick(eo, "label", "text", "name")) ?? "";
      explicitId = str(eo.id)?.trim() || undefined;
      const st = str(pick(eo, "style", "line"))?.toLowerCase();
      if (st) {
        if (STYLES[st]) lineStyle = STYLES[st];
        else warn(`edge ${from} -> ${to}: unknown style "${st}"`);
      }
      const ar = str(pick(eo, "arrows", "arrow", "heads"))?.toLowerCase();
      if (ar === "both" || ar === "two-way" || ar === "bidirectional") arrows = "both";
      else if (ar === "none" || ar === "line" || ar === "false") arrows = "none";
    }
    if (!from || !to) {
      warn("skipped an edge without from/to");
      continue;
    }
    from = ensureNode(from.trim());
    to = ensureNode(to.trim());
    if (from === to) {
      warn(`skipped self-loop on "${from}"`);
      continue;
    }
    if (explicitId && edgeIds.has(explicitId)) throw new SpecError(`Duplicate edge id "${explicitId}".`);
    const id = explicitId ?? uniqueId(`${from}->${to}`, edgeIds);
    edgeIds.add(id);
    edges.push({ id, from, to, label, style: lineStyle, arrows });
  }

  // A note (or free text) attached to a node in a group sits beside it, so it joins that group.
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const isSat = (n?: NodeSpec) => n?.kind === "note" || n?.kind === "text";
  for (const e of edges) {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    const [sat, anchor] = isSat(a) && !isSat(b) ? [a, b] : isSat(b) && !isSat(a) ? [b, a] : [undefined, undefined];
    if (sat && anchor?.group && !sat.group) sat.group = anchor.group;
  }

  // One id space: every element on the board is addressed by these ids.
  const seen = new Map<string, string>();
  for (const [kind, ids] of [["node", nodes.map((n) => n.id)], ["edge", edges.map((e) => e.id)], ["group", groups.map((g) => g.id)]] as const) {
    for (const id of ids) {
      const prev = seen.get(id);
      if (prev) throw new SpecError(`Id "${id}" is used by a ${prev} and a ${kind}; ids must be unique across nodes, edges and groups.`);
      seen.set(id, kind);
    }
  }

  const removeRaw = pick(raw, "remove", "delete", "removed");
  const remove = Array.isArray(removeRaw) ? removeRaw.map(str).filter((s): s is string => !!s) : [];
  const removeSet = new Set(remove);
  for (const id of remove) if (seen.has(id)) warn(`"${id}" is both described and listed in remove; it will be removed`);
  const keptNodes = nodes.filter((n) => !removeSet.has(n.id));
  const keptGroups = groups.filter((g) => !removeSet.has(g.id));
  for (const n of keptNodes) if (n.group && removeSet.has(n.group)) n.group = null;
  const keptEdges = edges.filter((e) => !removeSet.has(e.id) && !removeSet.has(e.from) && !removeSet.has(e.to));

  return {
    spec: { direction, style, title, nodes: keptNodes, edges: keptEdges, groups: keptGroups, remove },
    warnings,
  };
}
