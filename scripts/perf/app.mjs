#!/usr/bin/env bun
// Start/stop the harness app.
//   bun scripts/perf/app.mjs start dev|preview|release [<Vibework.app>]
//   bun scripts/perf/app.mjs stop      quit through the bridge, then stop our groups
//   bun scripts/perf/app.mjs status    our tracked pids and their process tree
// Env: PERF_DATA (data folder), PERF_BACKGROUND=1 (dev background mode),
// PERF_DIST (preview: built frontend), PERF_FRESH_FROM (copy this data folder first).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { startModel, startDev, startRelease, stopAll, waitReady, tracked, alive, descendants, DATA, OUT } from "./lib.mjs";

const [cmd, mode = "dev", app] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
if (cmd === "start") {
  if (process.env.PERF_FRESH_FROM) {
    fs.rmSync(DATA, { recursive: true, force: true });
    execFileSync("cp", ["-R", process.env.PERF_FRESH_FROM, DATA]);
    fs.rmSync(`${DATA}/dev-bridge.json`, { force: true });
  }
  fs.mkdirSync(DATA, { recursive: true });
  fs.rmSync(`${DATA}/dev-bridge.json`, { force: true });
  const t = tracked();
  if (!t.model || !alive(t.model)) startModel();
  const t0 = Date.now();
  if (mode === "release") startRelease(app);
  else startDev(mode);
  const ids = await waitReady();
  console.log(JSON.stringify({ ...ids, readyMs: Date.now() - t0, data: DATA }));
} else if (cmd === "stop") {
  await stopAll();
  console.log("stopped", JSON.stringify(tracked()));
} else if (cmd === "status") {
  const t = tracked();
  const out = {};
  for (const [k, p] of Object.entries(t)) out[k] = { pid: p, alive: !!p && alive(p) };
  if (t.app && alive(t.app)) out.tree = descendants(t.app);
  console.log(JSON.stringify(out, null, 1));
}
process.exit(0);
