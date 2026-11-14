// Stages the bundled skills for the app bundle: copies .vibework/skills to
// src-tauri/bundle-resources/.vibework/skills (bundle.resources in
// tauri.conf.json), leaving out what a local run of a skill script leaves
// behind (virtual environments, caches, node_modules, tests, .DS_Store).
//
// Then it checks what will ship and fails with a plain message when the
// staged skills hold a Python environment or node_modules under another name,
// or exceed the size budget. The budget is there so a stray 20 MB
// environment can never ship again unnoticed.
//
// It writes .vibework-dir-version into the staged folder: a digest of the
// staged files, so the app recopies the skills into app data exactly when
// their contents change.
//
// Runs before `tauri dev` / `tauri build` (tauri.conf.json) and via
// `bun run prepare:skills`; `--check` only checks, without staging.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, ".vibework", "skills");
const stageRoot = join(root, "src-tauri", "bundle-resources", ".vibework");
const staged = join(stageRoot, "skills");
const BUDGET_BYTES = 8 * 1024 * 1024;

// Never bundled, wherever they appear under the skills folder.
const EXCLUDED_DIRS = new Set([
  ".venv", "venv", "__pycache__", "node_modules", ".pytest_cache", ".mypy_cache", ".ruff_cache",
  ".cache", ".tox", ".git", "tests", "__tests__", "fixtures", "__fixtures__",
]);
const EXCLUDED_FILE = (name) =>
  name === ".DS_Store" || name === "Thumbs.db" || name === ".vibework-dir-version" ||
  /\.py[co]$/.test(name) || /^test_.*\.py$/.test(name) || /_test\.py$/.test(name) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) || name.endsWith(".log");
// Signs of an environment or package folder under a name not listed above.
const SUSPECT_FILE = new Set(["pyvenv.cfg", "package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"]);
const SUSPECT_DIR = new Set(["site-packages", ".bin"]);

const checkOnly = process.argv.includes("--check");
const left = [];
const problems = [];
let total = 0;
const hash = createHash("sha256");

async function walk(dir, out) {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const from = join(dir, entry.name);
    const rel = relative(source, from);
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) { left.push(`${rel}/`); continue; }
    if (!entry.isDirectory() && EXCLUDED_FILE(entry.name)) { left.push(rel); continue; }
    if (entry.isDirectory() && SUSPECT_DIR.has(entry.name)) problems.push(`${rel}/ looks like an installed package folder`);
    if (!entry.isDirectory() && SUSPECT_FILE.has(entry.name)) problems.push(`${rel} looks like part of a Python environment or a JavaScript install`);
    const to = out && join(out, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await readlink(from);
      hash.update(`L ${rel}\0${target}\0`);
      if (to) await symlink(target, to);
    } else if (entry.isDirectory()) {
      if (to) await mkdir(to);
      await walk(from, to);
    } else if (entry.isFile()) {
      const bytes = await readFile(from);
      total += bytes.length;
      hash.update(`F ${rel}\0${bytes.length}\0`).update(bytes);
      if (to) await copyFile(from, to);
    }
  }
}

const work = checkOnly ? undefined : `${staged}.tmp`;
if (work) {
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
}
await walk(source, work);

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
if (total > BUDGET_BYTES) {
  problems.push(`the bundled skills come to ${mb(total)}, over the ${mb(BUDGET_BYTES)} budget (if that growth is intended, raise BUDGET_BYTES in scripts/prepare-skills.mjs)`);
}
if (left.length) console.log(`Bundled skills: left out ${left.length} build leftovers (${left.slice(0, 6).join(", ")}${left.length > 6 ? ", …" : ""})`);
if (problems.length) {
  if (work) await rm(work, { recursive: true, force: true });
  console.error(`\nThe bundled skills are not ready to ship:\n${problems.map((p) => `  - ${p}`).join("\n")}\n\nEnvironments, installs and caches come from running a skill locally and must not ship: remove them from .vibework/skills, then build again.\n`);
  process.exit(1);
}

const marker = `skills ${hash.digest("hex").slice(0, 16)}\n`;
if (work) {
  await writeFile(join(work, ".vibework-dir-version"), marker);
  await mkdir(stageRoot, { recursive: true });
  await rm(staged, { recursive: true, force: true });
  await rename(work, staged);
  // Anything else under the staging root (an older layout, the runtimes
  // earlier versions bundled) would ship too.
  for (const name of await readdir(stageRoot)) {
    if (name !== "skills") await rm(join(stageRoot, name), { recursive: true, force: true });
  }
}
console.log(`Bundled skills: ${mb(total)} of ${mb(BUDGET_BYTES)}, ${marker.trim()}${checkOnly ? " (checked only)" : ""}`);

