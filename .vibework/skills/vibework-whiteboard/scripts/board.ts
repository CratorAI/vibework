#!/usr/bin/env bun
/**
 * Whiteboard generator for Vibework.
 *
 *   bun run board.ts build    <description.json> <board.excalidraw> [--fresh]
 *   bun run board.ts describe <board.excalidraw> [description.json]
 *   bun run board.ts check    <board.excalidraw>
 *
 * build:    lay out the description and write the board. If the board exists, update it
 *           in place: keep what the person arranged, apply what the description changed.
 *           --fresh lays everything out again from scratch (discards manual arrangement).
 * describe: print (or write) the board's current content in the description format,
 *           including shapes and arrows the person drew.
 * check:    validate a .excalidraw file (bindings, labels, frames, ids).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SpecError, parseSpec } from "./lib/spec.ts";
import { buildBoard } from "./lib/build.ts";
import { describeBoard } from "./lib/describe.ts";
import { type SceneFile, validateScene } from "./lib/excalidraw.ts";

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function readJson(path: string, what: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail(`cannot read ${what} ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail(`${what} ${path} is not valid JSON: ${(e as Error).message}`);
  }
}

function readBoard(path: string): SceneFile {
  const data = readJson(path, "board") as SceneFile;
  if (!data || data.type !== "excalidraw" || !Array.isArray(data.elements)) fail(`${path} is not an Excalidraw file`);
  return data;
}

/** Same layout as Excalidraw's own serializer: two-space JSON. Written atomically. */
function writeBoard(path: string, file: SceneFile) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(file, null, 2));
  renameSync(tmp, path);
}

function list(ids: string[]): string {
  const uniq = [...new Set(ids)];
  return uniq.length > 8 ? `${uniq.slice(0, 8).join(", ")} and ${uniq.length - 8} more` : uniq.join(", ");
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

switch (cmd) {
  case "build": {
    if (args.length < 2) fail("usage: board.ts build <description.json> <board.excalidraw> [--fresh]");
    const [specPath, boardPath] = args.map((a) => resolve(a));
    if (!boardPath.endsWith(".excalidraw")) fail("the board file must end in .excalidraw");
    let parsed;
    try {
      parsed = parseSpec(readJson(specPath, "description"));
    } catch (e) {
      if (e instanceof SpecError) fail(e.message);
      throw e;
    }
    const existing = existsSync(boardPath) ? readBoard(boardPath) : null;
    const { file, report } = buildBoard(parsed.spec, existing, { fresh: flags.has("--fresh") });
    const problems = validateScene(file);
    if (problems.length) fail(`generated board failed validation (please report):\n  ${problems.join("\n  ")}`);
    writeBoard(boardPath, file);
    const warnings = [...parsed.warnings, ...report.warnings];
    const s = parsed.spec;
    if (report.created) {
      console.log(`Created ${boardPath}: ${s.nodes.length} nodes, ${s.edges.length} edges, ${s.groups.length} groups.`);
    } else {
      console.log(`Updated ${boardPath}.`);
      console.log(`  added:   ${report.added.length ? list(report.added) : "nothing"}`);
      console.log(`  changed: ${report.changed.length ? list(report.changed) : "nothing"}`);
      console.log(`  removed: ${report.removed.length ? list(report.removed) : "nothing"}`);
      console.log("  Positions, sizes and styling the person set were kept.");
    }
    for (const w of warnings) console.log(`warning: ${w}`);
    break;
  }
  case "describe": {
    if (args.length < 1) fail("usage: board.ts describe <board.excalidraw> [description.json]");
    const board = readBoard(resolve(args[0]));
    const text = JSON.stringify(describeBoard(board), null, 2);
    if (args[1]) {
      const out = resolve(args[1]);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, text + "\n");
      console.log(`Wrote ${out}`);
    } else {
      console.log(text);
    }
    break;
  }
  case "check": {
    if (args.length < 1) fail("usage: board.ts check <board.excalidraw>");
    const problems = validateScene(readBoard(resolve(args[0])));
    if (problems.length) fail(`${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    console.log("OK");
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(2, 16).map((l) => l.replace(/^ \* ?/, "")).join("\n"));
    process.exit(cmd ? 1 : 0);
}
