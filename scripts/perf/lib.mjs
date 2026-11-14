// Performance harness helpers. Everything runs on its own data folder, ports and
// processes; only pids this harness started (and the WebContent pid the app's own
// debug bridge reports for its window) are ever sampled or signalled.
// See scripts/perf/README.md.
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

export const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
export const OUT = process.env.PERF_OUT || "/tmp/vibework-perf";
export const DATA = process.env.PERF_DATA || `${OUT}/data`;
export const PORT = Number(process.env.PERF_VITE_PORT || 1481);
export const MODEL_PORT = Number(process.env.PERF_MODEL_PORT || 18991);
const PIDS = `${OUT}/pids.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

// ---------- processes ----------
function track(name, pid) {
  const all = fs.existsSync(PIDS) ? JSON.parse(fs.readFileSync(PIDS, "utf8")) : {};
  all[name] = pid;
  fs.writeFileSync(PIDS, JSON.stringify(all, null, 1));
}
export function tracked() {
  return fs.existsSync(PIDS) ? JSON.parse(fs.readFileSync(PIDS, "utf8")) : {};
}
export const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

export function startModel() {
  const log = fs.openSync(`${OUT}/model.out`, "a");
  const p = spawn("python3", [`${ROOT}/scripts/perf/fake_model.py`, String(MODEL_PORT), `${OUT}/model.jsonl`], { stdio: ["ignore", log, log], detached: true });
  p.unref();
  track("model", p.pid);
  return p.pid;
}

const appEnv = (extra = {}) => ({
  VIBEWORK_DEV_BRIDGE: "1",
  VIBEWORK_DEV_DATA_DIR: DATA,
  VIBEWORK_DEV_OPENROUTER_KEY: "dummy-not-a-key",
  VIBEWORK_DEV_OPENROUTER_ORIGIN: `http://127.0.0.1:${MODEL_PORT}`,
  ...(process.env.PERF_BACKGROUND === "1" ? { VIBEWORK_DEV_BACKGROUND: "1" } : {}),
  ...extra,
});

/**
 * Debug Rust + a frontend on our own port. mode "dev": Vite dev server (React
 * development build, component names for render counts). mode "preview": the
 * production bundle in PERF_DIST served by `vite preview` (what release ships).
 */
export function startDev(mode = "dev") {
  const dist = process.env.PERF_DIST || `${OUT}/dist`;
  const cfg = `${ROOT}/scripts/perf/vite.perf.config.mjs`;
  const before = mode === "dev"
    ? `bunx vite --config ${cfg} --port ${PORT} --strictPort`
    : `bunx vite preview --config ${cfg} --port ${PORT} --strictPort --outDir ${dist}`;
  const config = { build: { devUrl: `http://localhost:${PORT}`, beforeDevCommand: before } };
  const log = fs.openSync(`${OUT}/dev.log`, "a");
  const p = spawn("bun", ["run", "tauri", "dev", "--config", JSON.stringify(config)], {
    cwd: ROOT, detached: true, stdio: ["ignore", log, log],
    env: { ...process.env, DEVELOPER_DIR: "/Library/Developer/CommandLineTools", CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || `${OUT}/target`, RUST_LOG: "info", ...appEnv() },
  });
  p.unref();
  track("dev", p.pid);
  return p.pid;
}

/** A packaged dev-release-probe bundle, by its /private/tmp path, launchd-like env. */
export function startRelease(appPath) {
  if (!appPath?.startsWith("/private/tmp/")) throw new Error("Probe bundle must be under /private/tmp; never launch an installed app");
  const exe = `${appPath}/Contents/MacOS/Vibework`;
  const env = {
    HOME: process.env.HOME, USER: process.env.USER, LOGNAME: process.env.USER, SHELL: "/bin/zsh",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin", TMPDIR: process.env.TMPDIR || "/tmp/", LANG: "en_US.UTF-8",
    __CFBundleIdentifier: "com.vibeworkapp.vibework", ...appEnv(),
  };
  const log = fs.openSync(`${OUT}/release.log`, "a");
  const p = spawn(exe, [], { env, detached: true, stdio: ["ignore", log, log] });
  p.unref();
  track("release", p.pid);
  return p.pid;
}

/** Quit the app through the bridge, then stop the process groups we started. */
export async function stopAll({ keepModel = false } = {}) {
  try { await request("quit"); } catch {}
  const t = tracked();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && [t.release, t.app].some((p) => p && alive(p))) await sleep(200);
  for (const [name, pid] of Object.entries(t)) {
    if (keepModel && name === "model") continue;
    if (!pid || name === "app" || name === "web") continue;
    try { process.kill(-pid, "SIGTERM"); } catch {}
  }
  await sleep(1500);
  for (const [name, pid] of Object.entries(t)) {
    if (keepModel && name === "model") continue;
    if (!pid || name === "app" || name === "web") continue;
    try { process.kill(-pid, "SIGKILL"); } catch {}
  }
  const left = keepModel ? { model: t.model } : {};
  fs.writeFileSync(PIDS, JSON.stringify(left));
}

// ---------- bridge ----------
const bridgeFile = () => `${DATA}/dev-bridge.json`;
export function request(op, code, extra = {}, timeout = 40000) {
  const { port, token } = JSON.parse(fs.readFileSync(bridgeFile(), "utf8"));
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => socket.write(JSON.stringify({ token, op, code, ...extra }) + "\n"));
    let data = "";
    socket.setTimeout(timeout, () => socket.destroy(new Error("timeout")));
    socket.on("data", (c) => { data += c; if (data.includes("\n")) { socket.end(); const r = JSON.parse(data); r.ok === false ? reject(new Error(r.error)) : resolve(r); } });
    socket.on("error", reject);
    socket.on("close", () => { if (!data.includes("\n")) reject(new Error("Bridge closed without a result")); });
  });
}
export const evaluate = async (code) => (await request("eval", code)).value;
export const invoke = (cmd, args = {}) => evaluate(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)});`);

/** Wait until the bridge answers and the page has rendered #root content. */
export async function waitReady(timeout = 240000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      if (fs.existsSync(bridgeFile()) && (await evaluate("return document.readyState==='complete' && !!document.querySelector('#root > *')"))) {
        const ids = await request("webPid");
        track("app", ids.pid);
        track("web", ids.webPid);
        return ids;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error("App did not become ready");
}

export async function waitFor(fnBody, timeout = 30000, every = 100) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { const v = await evaluate(fnBody); if (v) return v; } catch {}
    await sleep(every);
  }
  throw new Error(`Timed out: ${fnBody.slice(0, 120)}`);
}

// ---------- in-page measurement ----------
/** rAF interval sampling for `ms` while `during` (page code, optional) runs. */
export async function frames(ms, during = "") {
  return evaluate(`
    const ts = [];
    let on = true;
    const loop = (t) => { ts.push(t); if (on) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    ${during}
    await new Promise((r) => setTimeout(r, ${ms}));
    on = false;
    return window.__perfFrameStats(ts);
  `);
}

/** Installs helpers in the page (idempotent). */
export async function installPageHelpers() {
  await evaluate(`
    window.__perfFrameStats = (ts) => {
      const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
      d.sort((a, b) => a - b);
      const q = (p) => d.length ? +d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(1) : null;
      const span = ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
      return { frames: d.length, fps: span ? +(d.length / span * 1000).toFixed(1) : 0, median: q(0.5), p95: q(0.95), p99: q(0.99), max: d.length ? +d[d.length - 1].toFixed(1) : null, over33: d.filter((x) => x > 33.4).length, over50: d.filter((x) => x > 50).length };
    };
    return true;`);
}

/** Render counts per component name (needs the perf Vite config's hook; dev mode). */
export const renders = {
  start: () => evaluate("window.__perfRenders = new Map(); window.__perfCommits = 0; return !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.__perf;"),
  stop: (top = 30) => evaluate(`const m = window.__perfRenders || new Map(); window.__perfRenders = null; return { commits: window.__perfCommits, top: [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0, ${top}) };`),
};

// ---------- process sampling (our pids only) ----------
export function cpu(pid, seconds = 10) {
  if (!pid || !alive(pid)) return null;
  const out = execFileSync("top", ["-l", String(seconds + 1), "-s", "1", "-pid", String(pid), "-stats", "pid,cpu,mem,idlew,power"], { encoding: "utf8" });
  const rows = out.split("\n").filter((l) => l.trim().startsWith(String(pid)));
  const vals = rows.slice(1).map((l) => l.trim().split(/\s+/));
  const avg = (i) => +(vals.reduce((a, v) => a + parseFloat(v[i]), 0) / Math.max(1, vals.length)).toFixed(2);
  const mem = vals.length ? vals[vals.length - 1][2] : null;
  return { cpu: avg(1), mem, idleWakeups: avg(3), power: avg(4), samples: vals.length };
}

/** Physical footprint in MB via top's MEM column (no task port needed). */
export function memMB(pid) {
  if (!pid || !alive(pid)) return null;
  const out = execFileSync("top", ["-l", "1", "-pid", String(pid), "-stats", "pid,mem"], { encoding: "utf8" });
  const row = out.split("\n").find((l) => l.trim().startsWith(String(pid)));
  if (!row) return null;
  const m = row.trim().split(/\s+/)[1].replace(/[+-]$/, "");
  const n = parseFloat(m);
  return m.endsWith("G") ? n * 1024 : m.endsWith("K") ? n / 1024 : m.endsWith("B") && !m.endsWith("MB") ? n / 1048576 : n;
}

/** Our process tree under `root` (pgrep -P walk, then ps -o on those pids only). */
export function descendants(root) {
  const pids = [];
  const walk = (pid) => {
    let kids = [];
    try { kids = execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).trim().split("\n").filter(Boolean).map(Number); } catch {}
    for (const k of kids) { pids.push(k); walk(k); }
  };
  walk(root);
  if (!pids.length) return [];
  const out = execFileSync("ps", ["-o", "pid=,ppid=,%cpu=,rss=,comm=", "-p", pids.join(",")], { encoding: "utf8" });
  return out.trim().split("\n").map((l) => l.trim().split(/\s+/)).map(([p, pp, c, rss, ...comm]) => ({ pid: +p, ppid: +pp, cpu: +c, rssMB: Math.round(+rss / 1024), comm: comm.join(" ").split("/").pop() }));
}

export function save(name, data) {
  fs.mkdirSync(`${OUT}/results`, { recursive: true });
  fs.writeFileSync(`${OUT}/results/${name}.json`, JSON.stringify(data, null, 1));
  console.log(name, JSON.stringify(data));
}

/** Count agent:done per task in the page (idempotent); turns wait on it. */
export async function trackDone() {
  await evaluate(`if (!window.__perfDone) { window.__perfDone = {}; const I = window.__TAURI_INTERNALS__;
    await I.invoke("plugin:event|listen", { event: "agent:done", target: { kind: "Any" }, handler: I.transformCallback((e) => { const id = e.payload.sessionId; window.__perfDone[id] = (window.__perfDone[id] || 0) + 1; }) }); }
    return true;`);
}
export const doneCount = async (id) => (await evaluate(`return (window.__perfDone || {})[${JSON.stringify(id)}] || 0`));

/** Send a message and wait for that turn's agent:done. */
export async function turn(sessionId, message, timeout = 90000) {
  const before = await doneCount(sessionId);
  await invoke("agent_send_message", { sessionId, message });
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if ((await doneCount(sessionId)) > before) return;
    await sleep(100);
  }
  throw new Error(`turn timed out: ${sessionId} ${message.slice(0, 40)}`);
}
