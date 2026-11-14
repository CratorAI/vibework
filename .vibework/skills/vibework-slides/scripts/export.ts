#!/usr/bin/env bun
/**
 * Export a .slides.md deck.
 *
 *   bun export.ts deck.slides.md                 → deck.pptx next to the deck
 *   bun export.ts deck.slides.md --pptx out.pptx
 *   bun export.ts deck.slides.md --pdf [out.pdf]  (needs Chromium or Chrome)
 *   bun export.ts deck.slides.md --png [dir]      one PNG per slide, for checking the look:
 *                                                 <dir>/slide-01.png, slide-02.png, ... (each path is printed;
 *                                                 no dir: $VIBEWORK_SCRATCH/<deck name>-png)
 *   bun export.ts deck.slides.md --check          parse warnings + overflow check in a browser
 *   --theme <ledger|slate|graphite>               override the deck's theme for this export
 *   --slides 2,5-7                                PNG/check only these slides (1-based)
 *
 * PPTX: native, editable text boxes, native charts (data editable in
 * PowerPoint), native tables and speaker notes. PDF/PNG: rendered by a
 * headless Chromium from the same HTML the app shows, so they match the panel.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir, homedir, platform } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPptx, buildPrintPage, imageSize, parseDeck, setMeta, THEMES } from "./deckCore.js";

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}`);
  console.error("usage: bun export.ts <deck.slides.md> [--pptx [out]] [--pdf [out]] [--png [dir]] [--check] [--theme id] [--slides 1,3-5]");
  process.exit(2);
}

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--") && /\.md$/i.test(a));
if (!input) usage("give the path of a .slides.md file");
const deckPath = path.resolve(input);
if (!existsSync(deckPath)) usage(`not found: ${deckPath}`);
const deckDir = path.dirname(deckPath);
const stem = path.basename(deckPath).replace(/\.slides\.md$/i, "").replace(/\.md$/i, "");

function optValue(flag: string): string | null | undefined {
  const k = args.indexOf(flag);
  if (k === -1) return undefined;
  const v = args[k + 1];
  return v && !v.startsWith("--") ? v : null;
}

const want = {
  pptx: optValue("--pptx"),
  pdf: optValue("--pdf"),
  png: optValue("--png"),
  check: args.includes("--check"),
};
if (want.pptx === undefined && want.pdf === undefined && want.png === undefined && !want.check) want.pptx = null;

let source = readFileSync(deckPath, "utf8");
const themeArg = optValue("--theme");
if (themeArg) {
  if (!THEMES.some((t: { id: string }) => t.id === themeArg)) usage(`unknown theme "${themeArg}" (${THEMES.map((t: { id: string }) => t.id).join(", ")})`);
  source = setMeta(parseDeck(source), "theme", themeArg);
}
const deck = parseDeck(source);

function slideFilter(): Set<number> | null {
  const v = optValue("--slides");
  if (!v) return null;
  const set = new Set<number>();
  for (const part of v.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) usage(`bad --slides value: ${v}`);
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    for (let i = a; i <= b; i++) set.add(i - 1);
  }
  return set;
}
const only = slideFilter();

// ---- parse warnings (always shown)
let warned = 0;
for (const w of deck.warnings) {
  console.log(`deck: ${w}`);
  warned++;
}
for (const s of deck.slides) {
  for (const w of s.warnings) {
    console.log(`slide ${s.index + 1} (${s.layout}): ${w}`);
    warned++;
  }
}

// ---- PPTX
if (want.pptx !== undefined) {
  const out = path.resolve(want.pptx || path.join(deckDir, `${stem}.pptx`));
  const bytes = (await buildPptx(deck, {
    loadImage: async (src: string) => {
      if (/^[a-z]+:/i.test(src) && !src.startsWith("file:")) return null;
      const p = path.resolve(deckDir, decodeURI(src.replace(/^file:\/\//, "")));
      if (!existsSync(p)) return null;
      const buf = new Uint8Array(readFileSync(p));
      const size = imageSize(buf);
      if (!size) return null;
      return { data: `data:${size.mime};base64,${Buffer.from(buf).toString("base64")}`, width: size.width, height: size.height };
    },
  })) as Uint8Array;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`pptx: ${out} (${deck.slides.length} slides)`);
}

// ---- browser-based outputs
if (want.pdf !== undefined || want.png !== undefined || want.check) {
  const chrome = findChrome();
  if (!chrome) {
    console.error(
      "No Chromium or Chrome found for PDF/PNG/--check. Install Chromium for the browser tool (Settings), " +
        "or set VIBEWORK_CHROME to a Chrome/Chromium executable. The .pptx export does not need a browser.",
    );
    process.exit(3);
  }
  const work = mkdtempSync(path.join(tmpdir(), "slides-"));
  const htmlPath = path.join(work, `${stem}.html`);
  writeFileSync(htmlPath, buildPrintPage(deck, pathToFileURL(deckDir + path.sep).href));
  const b = await launch(chrome, work);
  try {
    await b.send("Page.enable");
    await b.send("Runtime.enable");
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    const loaded = b.waitLoad();
    await b.send("Page.navigate", { url: pathToFileURL(htmlPath).href });
    await loaded;
    await b.eval(`Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 6000))]).then(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 6000); }))))`);

    if (want.check) {
      const report = (await b.eval(checkJs())) as { i: number; msg: string }[];
      for (const r of report) {
        if (only && !only.has(r.i)) continue;
        const s = deck.slides[r.i];
        console.log(`slide ${r.i + 1} (${s?.layout}): ${r.msg}`);
        warned++;
      }
      console.log(warned ? `check: ${warned} issue(s)` : "check: no issues found");
    }
    if (want.png !== undefined) {
      // Check images go in the task's scratch folder when there is one.
      const dir = path.resolve(want.png || path.join(process.env.VIBEWORK_SCRATCH || deckDir, `${stem}-png`));
      mkdirSync(dir, { recursive: true });
      const written: string[] = [];
      for (let i = 0; i < deck.slides.length; i++) {
        if (only && !only.has(i)) continue;
        const shot = await b.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: i * 1080, width: 1920, height: 1080, scale: 1 } });
        const file = path.join(dir, `slide-${String(i + 1).padStart(2, "0")}.png`);
        writeFileSync(file, Buffer.from(shot.data, "base64"));
        written.push(file);
      }
      // The exact files, so they can be read without guessing their names.
      console.log(`png: ${written.length} file(s) in ${dir}`);
      for (const file of written) console.log(`png: ${file}`);
    }
    if (want.pdf !== undefined) {
      const out = path.resolve(want.pdf || path.join(deckDir, `${stem}.pdf`));
      mkdirSync(path.dirname(out), { recursive: true });
      const pdf = await b.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      writeFileSync(out, Buffer.from(pdf.data, "base64"));
      console.log(`pdf: ${out} (${deck.slides.length} pages)`);
    }
  } finally {
    b.close();
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------

/** Runs in the page: find text that overflows its slide or runs into the footer. */
function checkJs(): string {
  return `(() => {
  const out = [];
  document.querySelectorAll(".slide").forEach((slide, i) => {
    const sr = slide.getBoundingClientRect();
    const foot = slide.querySelector(".foot");
    const footTop = foot ? foot.getBoundingClientRect().top : sr.bottom;
    const pad = slide.querySelector(".pad");
    if (pad) {
      const last = [...pad.children].filter(c => c.getBoundingClientRect().height > 0).pop();
      let bottom = 0;
      pad.querySelectorAll("*").forEach(el => { if (!el.closest("svg") || el.tagName === "svg") bottom = Math.max(bottom, el.getBoundingClientRect().bottom); });
      if (bottom > footTop - 8) out.push({ i, msg: "content runs into the footer or off the slide (" + Math.round(bottom - footTop + 8) + "px too tall); cut text or split the slide" });
      if (pad.scrollWidth > pad.clientWidth + 2) out.push({ i, msg: "content is wider than the slide" });
    }
    slide.querySelectorAll(".hl, .t-title").forEach(h => {
      const lh = parseFloat(getComputedStyle(h).lineHeight) || 1;
      const lines = Math.round(h.getBoundingClientRect().height / lh);
      if (lines > 2) out.push({ i, msg: "headline wraps to " + lines + " lines; shorten it" });
    });
    slide.querySelectorAll(".stat .v").forEach(v => { if (v.scrollWidth > v.parentElement.clientWidth + 2) out.push({ i, msg: "a stat value is too wide: " + v.textContent }); });
    slide.querySelectorAll(".missing").forEach(m => out.push({ i, msg: m.textContent }));
    slide.querySelectorAll("img").forEach(img => { if (img.complete && !img.naturalWidth) out.push({ i, msg: "image not found: " + img.getAttribute("src") }); });
  });
  return out;
})()`;
}

function findChrome(): string | null {
  const env = process.env.VIBEWORK_CHROME || process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const os = platform();
  const candidates: string[] = [];
  const pw =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (os === "darwin" ? path.join(homedir(), "Library/Caches/ms-playwright") : os === "win32" ? path.join(process.env.LOCALAPPDATA || "", "ms-playwright") : path.join(homedir(), ".cache/ms-playwright"));
  if (existsSync(pw)) {
    const dirs = readdirSync(pw).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)).sort((a, b) => +b.split("-").pop()! - +a.split("-").pop()!);
    for (const d of dirs) {
      const base = path.join(pw, d);
      for (const sub of readdirSync(base)) {
        const s = path.join(base, sub);
        candidates.push(
          path.join(s, "Chromium.app/Contents/MacOS/Chromium"),
          path.join(s, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
          path.join(s, "chrome-headless-shell"),
          path.join(s, "chrome-headless-shell.exe"),
          path.join(s, "chrome.exe"),
          path.join(s, "chrome"),
        );
      }
    }
  }
  if (os === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    );
  } else if (os === "win32") {
    for (const root of [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
      if (!root) continue;
      candidates.push(path.join(root, "Google/Chrome/Application/chrome.exe"), path.join(root, "Microsoft/Edge/Application/msedge.exe"));
    }
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge");
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

async function launch(bin: string, work: string) {
  const profile = path.join(work, "profile");
  const headless = /headless-shell/.test(bin) ? [] : ["--headless=new"];
  const proc = Bun.spawn([bin, ...headless, "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--allow-file-access-from-files", "about:blank"], { stdout: "ignore", stderr: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  let port = 0;
  for (let t = 0; t < 100 && !port; t++) {
    await Bun.sleep(100);
    if (existsSync(portFile)) port = parseInt(readFileSync(portFile, "utf8").split("\n")[0], 10) || 0;
  }
  if (!port) {
    proc.kill();
    throw new Error(`could not start ${bin}`);
  }
  let page: { webSocketDebuggerUrl: string } | undefined;
  for (let t = 0; t < 50 && !page; t++) {
    const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
    page = list.find((x) => x.type === "page");
    if (!page) await Bun.sleep(100);
  }
  if (!page) throw new Error("no browser page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  const loadWaiters: (() => void)[] = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    } else if (msg.method === "Page.loadEventFired") loadWaiters.splice(0).forEach((f) => f());
  };
  const send = (method: string, params: object = {}) =>
    new Promise<any>((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return {
    send,
    waitLoad: () =>
      new Promise<void>((r) => {
        const timer = setTimeout(r, 15000);
        loadWaiters.push(() => {
          clearTimeout(timer);
          r();
        });
      }),
    eval: async (expression: string) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    },
    close: () => {
      try {
        ws.close();
      } catch {}
      proc.kill();
    },
  };
}
