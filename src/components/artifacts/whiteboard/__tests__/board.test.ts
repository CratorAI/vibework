// Board generator (the vibework-whiteboard skill's script): layout, validity and the update model.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSpec, type BoardSpec } from "../../../../../.vibework/skills/vibework-whiteboard/scripts/lib/spec.ts";
import { buildBoard } from "../../../../../.vibework/skills/vibework-whiteboard/scripts/lib/build.ts";
import { describeBoard } from "../../../../../.vibework/skills/vibework-whiteboard/scripts/lib/describe.ts";
import {
  type El,
  type SceneFile,
  validateScene,
} from "../../../../../.vibework/skills/vibework-whiteboard/scripts/lib/excalidraw.ts";
import { textArea } from "../../../../../.vibework/skills/vibework-whiteboard/scripts/lib/style.ts";

const EXAMPLES = fileURLToPath(new URL("../../../../../.vibework/skills/vibework-whiteboard/examples/", import.meta.url));
const NOW = 1_700_000_000_000;

function example(name: string): unknown {
  return JSON.parse(readFileSync(`${EXAMPLES}${name}.json`, "utf8"));
}

function spec(input: unknown): BoardSpec {
  return parseSpec(input).spec;
}

function build(input: unknown, existing: SceneFile | null = null): SceneFile {
  return buildBoard(spec(input), existing, { now: NOW }).file;
}

const byId = (file: SceneFile) => new Map(file.elements.map((e) => [e.id, e]));
const box = (e: El) => ({ x: e.x, y: e.y, w: e.width, h: e.height });
const overlap = (a: El, b: El, m = 0) =>
  a.x < b.x + b.width + m && b.x < a.x + a.width + m && a.y < b.y + b.height + m && b.y < a.y + a.height + m;
const centerOf = (e: El) => [e.x + e.width / 2, e.y + e.height / 2];

/** Everything a well-formed generated board must satisfy. */
function assertCleanBoard(file: SceneFile, s: BoardSpec) {
  expect(validateScene(file)).toEqual([]);
  const els = byId(file);
  const nodes = s.nodes.map((n) => els.get(n.id)!);
  for (const n of nodes) expect(n, "node element exists").toBeTruthy();

  // No two node boxes overlap (with breathing room).
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      expect(overlap(nodes[i], nodes[j], 8), `${nodes[i].id} overlaps ${nodes[j].id}`).toBe(false);

  // Frames contain their members, keep clear of other nodes and of each other.
  const frames = s.groups.map((g) => els.get(g.id)!).filter(Boolean);
  for (const f of frames) {
    for (const n of nodes) {
      const member = n.frameId === f.id;
      if (member) {
        expect(n.x >= f.x && n.y >= f.y && n.x + n.width <= f.x + f.width && n.y + n.height <= f.y + f.height, `${n.id} inside ${f.id}`).toBe(true);
      } else {
        expect(overlap(n, f), `${n.id} overlaps frame ${f.id}`).toBe(false);
      }
    }
  }
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) expect(overlap(frames[i], frames[j], 16)).toBe(false);

  // Labels fit their containers.
  for (const n of nodes) {
    if (n.type === "text") continue;
    const t = els.get((n.boundElements ?? []).find((b) => b.type === "text")!.id)!;
    const area = textArea(n.type as "rectangle", n.width, n.height);
    expect(t.width, `${n.id} label width`).toBeLessThanOrEqual(area.w + 0.5);
    expect(t.height, `${n.id} label height`).toBeLessThanOrEqual(area.h + 0.5);
    expect(t.originalText).toBe(s.nodes.find((x) => x.id === n.id)!.label);
  }

  // Arrows: bound to the right nodes, ends on those nodes, orthogonal, and never through another node.
  for (const e of s.edges) {
    const a = els.get(e.id)!;
    expect(a.type).toBe("arrow");
    expect(a.startBinding?.elementId).toBe(e.from);
    expect(a.endBinding?.elementId).toBe(e.to);
    const from = els.get(e.from)!;
    const to = els.get(e.to)!;
    const pts = a.points!.map(([x, y]) => [x + a.x, y + a.y]);
    const near = (p: number[], n: El) => p[0] >= n.x - 8 && p[0] <= n.x + n.width + 8 && p[1] >= n.y - 8 && p[1] <= n.y + n.height + 8;
    expect(near(pts[0], from), `${e.id} starts at ${e.from}`).toBe(true);
    expect(near(pts[pts.length - 1], to), `${e.id} ends at ${e.to}`).toBe(true);
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      for (const n of nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        const b = box(n);
        const hits = Math.max(x1, x2) > b.x + 1 && Math.min(x1, x2) < b.x + b.w - 1 && Math.max(y1, y2) > b.y + 1 && Math.min(y1, y2) < b.y + b.h - 1;
        expect(hits, `${e.id} passes through ${n.id}`).toBe(false);
      }
    }
    if (e.label) {
      const t = els.get((a.boundElements ?? []).find((b) => b.type === "text")!.id)!;
      expect(t.originalText).toBe(e.label);
      expect(t.containerId).toBe(a.id);
    }
  }
}

describe("generating boards", () => {
  for (const name of ["checkout-flow", "architecture", "org-chart", "timeline"]) {
    it(`${name}: valid Excalidraw, no overlaps, arrows on the right nodes`, () => {
      const s = spec(example(name));
      const file = buildBoard(s, null, { now: NOW }).file;
      assertCleanBoard(file, s);
    });
  }

  it("flow with branches: both decision branches leave the decision", () => {
    const file = build(example("checkout-flow"));
    const els = byId(file);
    expect(els.get("paid->confirm")!.startBinding!.elementId).toBe("paid");
    expect(els.get("paid->retry")!.startBinding!.elementId).toBe("paid");
    expect(els.get("retry->pay")!.strokeStyle).toBe("dashed");
  });

  it("org chart: children sit below their manager", () => {
    const els = byId(build(example("org-chart")));
    for (const [boss, report] of [["ceo", "cto"], ["cto", "eng"], ["coo", "support"]]) {
      expect(els.get(report)!.y).toBeGreaterThan(els.get(boss)!.y + els.get(boss)!.height);
    }
    expect(els.get("ceo->cto")!.endArrowhead).toBeNull();
  });

  it("timeline: milestones on one row left to right, notes below their milestone", () => {
    const els = byId(build(example("timeline")));
    const qs = ["q1", "q2", "q3", "q4"].map((id) => els.get(id)!);
    for (let i = 1; i < qs.length; i++) {
      expect(qs[i].x).toBeGreaterThan(qs[i - 1].x + qs[i - 1].width);
      expect(Math.abs(centerOf(qs[i])[1] - centerOf(qs[0])[1])).toBeLessThan(1);
    }
    for (const [q, n] of [["q1", "n1"], ["q2", "n2"], ["q4", "n3"]]) {
      expect(els.get(n)!.y).toBeGreaterThan(els.get(q)!.y + els.get(q)!.height);
      expect(Math.abs(centerOf(els.get(n)!)[0] - centerOf(els.get(q)!)[0])).toBeLessThan(1);
    }
  });

  it("grouped architecture: members carry their frame id, frames are named", () => {
    const els = byId(build(example("architecture")));
    expect(els.get("backend")!.type).toBe("frame");
    expect(els.get("backend")!.name).toBe("Backend");
    expect(els.get("orders")!.frameId).toBe("backend");
    expect(els.get("stripe")!.frameId).toBeNull();
  });

  it("brainstorm: loose notes in groups form grids, not one long row", () => {
    const input = {
      groups: ["Ideas", "Risks"],
      nodes: [
        ...Array.from({ length: 7 }, (_, i) => ({ label: `Idea ${i + 1}`, kind: "note", group: "Ideas" })),
        ...Array.from({ length: 4 }, (_, i) => ({ label: `Risk ${i + 1}`, kind: "note", color: "red", group: "Risks" })),
      ],
    };
    const s = spec(input);
    const file = buildBoard(s, null, { now: NOW }).file;
    assertCleanBoard(file, s);
    const ideas = byId(file).get("ideas")!;
    expect(ideas.width / ideas.height).toBeLessThan(3);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(build(example("architecture")))).toBe(JSON.stringify(build(example("architecture"))));
  });
});

describe("reading descriptions", () => {
  it("accepts strings, arrows written as text and unknown nodes", () => {
    const { spec: s, warnings } = parseSpec({
      direction: "LR",
      nodes: ["Start", { label: "Check stock", kind: "diamond", colour: "grey" }],
      edges: ["start -> check-stock: go", "check-stock --> Ship", "Ship -- start"],
    });
    expect(s.direction).toBe("LR");
    expect(s.nodes.map((n) => n.id)).toEqual(["start", "check-stock", "Ship"]);
    expect(s.nodes[1]).toMatchObject({ kind: "decision", color: "gray" });
    expect(s.edges[0]).toMatchObject({ from: "start", to: "check-stock", label: "go", style: "solid", arrows: "end" });
    expect(s.edges[1]).toMatchObject({ style: "dashed" });
    expect(s.edges[2]).toMatchObject({ arrows: "none" });
    expect(warnings.some((w) => w.includes("Ship"))).toBe(true);
  });

  it("rejects duplicate ids", () => {
    expect(() => parseSpec({ nodes: [{ id: "a" }, { id: "a" }] })).toThrow(/Duplicate/);
    expect(() => parseSpec({ nodes: [{ id: "a" }], groups: [{ id: "a" }] })).toThrow(/unique/);
  });
});

describe("updating a board the person has edited", () => {
  function personEdits(file: SceneFile) {
    const f: SceneFile = JSON.parse(JSON.stringify(file));
    const els = byId(f);
    // The person drags "address" 320px right (its label moves with it) …
    const a = els.get("address")!;
    const label = els.get(a.boundElements!.find((b) => b.type === "text")!.id)!;
    a.x += 320;
    label.x += 320;
    // … recolours "pay" red …
    const b = els.get("pay")!;
    b.strokeColor = "#e03131";
    b.backgroundColor = "#ffc9c9";
    // … and draws a sticky of their own.
    f.elements.push({
      ...JSON.parse(JSON.stringify(b)),
      id: "person-sticky",
      x: -600,
      y: 0,
      boundElements: null,
      customData: undefined,
      index: "zz",
    });
    return { file: f, moved: { x: a.x, y: a.y }, payPaint: { stroke: b.strokeColor, bg: b.backgroundColor } };
  }

  it("keeps the person's position and colour, applies the rename, places and connects the new node", () => {
    const original = example("checkout-flow") as { nodes: Record<string, unknown>[]; edges: unknown[] };
    const first = build(original);
    const { file: edited, moved, payPaint } = personEdits(first);

    const next = JSON.parse(JSON.stringify(original));
    next.nodes.find((n: { id: string }) => n.id === "pay").label = "Charge card";
    next.nodes.push({ id: "fraud", label: "Fraud check", color: "orange" });
    next.edges.push("pay -> fraud");
    const s = spec(next);
    const { file, report } = buildBoard(s, edited, { now: NOW + 1 });

    expect(validateScene(file)).toEqual([]);
    const els = byId(file);
    // Kept: the moved node's position, the recolour, the person's own sticky.
    expect({ x: els.get("address")!.x, y: els.get("address")!.y }).toEqual(moved);
    expect({ stroke: els.get("pay")!.strokeColor, bg: els.get("pay")!.backgroundColor }).toEqual(payPaint);
    expect(els.get("person-sticky")).toBeTruthy();
    // Applied: the rename.
    const payText = els.get(els.get("pay")!.boundElements!.find((b) => b.type === "text")!.id)!;
    expect(payText.originalText).toBe("Charge card");
    // Added: the node, near its neighbour, overlapping nothing; the edge, bound both ends.
    const fraud = els.get("fraud")!;
    expect(fraud.backgroundColor).toBe("#fff4e6");
    const [fx, fy] = centerOf(fraud);
    const [px, py] = centerOf(els.get("pay")!);
    expect(Math.hypot(fx - px, fy - py)).toBeLessThan(450);
    for (const other of file.elements) {
      if (other.id === "fraud" || other.type === "arrow" || other.containerId || other.type === "frame") continue;
      expect(overlap(fraud, other, 8), `fraud overlaps ${other.id}`).toBe(false);
    }
    const edge = els.get("pay->fraud")!;
    expect(edge.startBinding!.elementId).toBe("pay");
    expect(edge.endBinding!.elementId).toBe("fraud");
    expect(els.get("pay")!.boundElements!.some((b) => b.id === "pay->fraud")).toBe(true);
    expect(fraud.boundElements!.some((b) => b.id === "pay->fraud")).toBe(true);
    expect(report.added).toEqual(expect.arrayContaining(["fraud", "pay->fraud"]));
    expect(report.changed).toContain("pay");
  });

  it("applies a colour the agent changes, and keeps a label the person changed", () => {
    const input = example("checkout-flow") as { nodes: Record<string, unknown>[] };
    const first = build(input);
    const f: SceneFile = JSON.parse(JSON.stringify(first));
    const els0 = byId(f);
    const t = els0.get(els0.get("login")!.boundElements!.find((b) => b.type === "text")!.id)!;
    t.originalText = "Log in";
    t.text = "Log in";
    const next = JSON.parse(JSON.stringify(input));
    next.nodes.find((n: { id: string }) => n.id === "confirm").color = "green";
    const out = byId(build(next, f));
    expect(out.get("confirm")!.backgroundColor).toBe("#ebfbee");
    const t2 = out.get(out.get("login")!.boundElements!.find((b) => b.type === "text")!.id)!;
    expect(t2.originalText).toBe("Log in");
  });

  it("removes what the agent dropped, leaves the person's drawings unless listed in remove", () => {
    const input = example("checkout-flow") as { nodes: { id: string }[]; edges: string[] };
    const { file: edited } = personEdits(build(input));
    const next = JSON.parse(JSON.stringify(input));
    next.nodes = next.nodes.filter((n: { id: string }) => n.id !== "retry");
    next.edges = next.edges.filter((e: string) => !e.includes("retry"));
    const out = build(next, edited);
    expect(validateScene(out)).toEqual([]);
    const els = byId(out);
    expect(els.has("retry")).toBe(false);
    expect(els.has("paid->retry")).toBe(false);
    expect(els.has("retry->pay")).toBe(false);
    expect(els.get("pay")!.boundElements!.some((b) => b.id === "retry->pay")).toBe(false);
    expect(els.has("person-sticky")).toBe(true);

    const gone = build({ ...next, remove: ["person-sticky"] }, out);
    expect(byId(gone).has("person-sticky")).toBe(false);
  });

  it("grows a box around its centre when a new label does not fit", () => {
    const input = { nodes: [{ id: "a", label: "Short" }, { id: "b", label: "B" }], edges: ["a -> b"] };
    const first = build(input);
    const a0 = byId(first).get("a")!;
    const long = { ...input, nodes: [{ id: "a", label: "A much longer label that needs several lines to fit inside" }, input.nodes[1]] };
    const out = build(long, first);
    const a1 = byId(out).get("a")!;
    expect(a1.height).toBeGreaterThan(a0.height);
    expect(centerOf(a1)[0]).toBeCloseTo(centerOf(a0)[0], 1);
    expect(validateScene(out)).toEqual([]);
  });

  it("describe → build round-trips without changes", () => {
    const first = build(example("architecture"));
    const described = describeBoard(first);
    const { file, report } = buildBoard(spec(described), first, { now: NOW + 5 });
    expect(report.added).toEqual([]);
    expect(report.changed).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(file.elements).toEqual(first.elements);
  });

  it("describe includes shapes the person drew and marks them", () => {
    const { file } = personEdits(build(example("checkout-flow")));
    const d = describeBoard(file);
    expect(d.nodes.find((n) => n.id === "person-sticky")).toMatchObject({ drawnByPerson: true });
    expect(d.nodes.find((n) => n.id === "pay")).toMatchObject({ color: "red" });
  });
});
