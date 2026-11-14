#!/usr/bin/env bun
// Measurement scenarios for a running harness app (see app.mjs / README.md).
//   LABEL=before bun scripts/perf/measure.mjs <scenario> [...]
// Scenarios: idle conversation switch stream multi sidebar search artifacts
//            viewers design picker leak
// Results: $PERF_OUT/results/<LABEL>-<scenario>.json (and printed).
import fs from "node:fs";
import {
  evaluate, invoke, frames, installPageHelpers, renders, cpu, memMB, descendants,
  tracked, save, sleep, waitFor, trackDone, OUT,
} from "./lib.mjs";

const LABEL = process.env.LABEL || "run";
const out = (name, data) => save(`${LABEL}-${name}`, data);
const ids = () => tracked();
const LONG = fs.readFileSync(`${OUT}/long-session-id.txt`, "utf8").trim();
const BIG = fs.readFileSync(`${OUT}/big-session-id.txt`, "utf8").trim();
const enginePid = () => descendants(ids().app).find((p) => p.comm.startsWith("opencode"))?.pid;

// Page helpers shared by scenarios (installed once per page load).
async function page() {
  await installPageHelpers();
  await evaluate(`
    window.__perf = window.__perf || {};
    const P = window.__perf;
    P.raf = () => new Promise((resolve, reject) => { const timer = setTimeout(() => { cancelAnimationFrame(id); reject(new Error('No frame within 2s: window may be occluded')); }, 2000); const id = requestAnimationFrame(() => { clearTimeout(timer); resolve(performance.now()); }); });
    P.paint = async () => { await P.raf(); return P.raf(); };
    P.until = async (fn, timeout = 30000) => { const end = performance.now() + timeout; while (performance.now() < end) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 4)); } throw new Error("until timed out: " + fn); };
    P.rowFor = (title) => [...document.querySelectorAll('[data-testid=task-row] button[aria-label]')].find((b) => b.getAttribute('aria-label').startsWith(title));
    P.scroller = (el) => { while (el && el !== document.body) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) return el; el = el.parentElement; } return null; };
    P.scrollRun = async (el, dir, step, maxFrames) => {
      const ts = []; let i = 0;
      while (i++ < maxFrames) {
        ts.push(await P.raf());
        const before = el.scrollTop;
        el.scrollTop = before + dir * step;
        if (el.scrollTop === before) break;
      }
      return window.__perfFrameStats(ts);
    };
    P.type = (el, text) => { el.focus(); document.execCommand('insertText', false, text); };
    return true;`);
}

async function titleOf(id) {
  const s = (await invoke("agent_list_sessions")).find((x) => x.sessionId === id);
  return s.conversationName || s.name;
}

/** Open a task from the sidebar; ms until its last reply is in the DOM and painted. */
async function openTask(id, settleSelector = "[data-reply-group]") {
  const title = await titleOf(id);
  return evaluate(`
    const P = window.__perf;
    location.hash = '#/';
    [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim() === 'New task')?.click();
    await P.paint();
    let row = P.rowFor(${JSON.stringify(title)});
    if (!row) { const list = document.querySelector('[data-testid=task-list]'); list.scrollTop = list.scrollHeight; await P.paint(); row = P.rowFor(${JSON.stringify(title)}); }
    if (!row) throw new Error('row missing');
    const before = document.querySelectorAll(${JSON.stringify(settleSelector)}).length;
    const t0 = performance.now();
    row.click();
    let last = -1, stableSince = 0;
    await P.until(() => {
      const n = document.querySelectorAll(${JSON.stringify(settleSelector)}).length;
      if (n !== last) { last = n; stableSince = performance.now(); return false; }
      return n > 0 && performance.now() - stableSince > 250;
    }, 60000);
    const settled = stableSince - t0;
    const t1 = await P.paint();
    return { openMs: +settled.toFixed(0), paintedMs: +(t1 - t0 - (t1 - stableSince > 0 ? 0 : 0)).toFixed(0), groups: last, domNodes: document.getElementsByTagName('*').length };`);
}

const scenarios = {
  async idle() {
    const { web, app } = ids();
    await evaluate("location.hash = '#/'; return true");
    await sleep(3000);
    const eng = enginePid();
    const res = { onHome: await evaluate("return !!document.querySelector('[data-testid=home-field]')") };
    res.focused = { web: cpu(web, 15), app: cpu(app, 15), hasFocus: await evaluate("return document.hasFocus()") };
    // Unfocused: what the page does when the window loses focus (the window
    // itself stays where it is; macOS focus is never taken from the owner).
    await evaluate("window.__perfHasFocus = document.hasFocus; document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); return true");
    await sleep(1000);
    res.unfocusedSimulated = { web: cpu(web, 15), app: cpu(app, 15) };
    await evaluate("document.hasFocus = window.__perfHasFocus; window.dispatchEvent(new Event('focus')); return true");
    res.engineIdle = eng ? cpu(eng, 10) : null;
    res.tree = descendants(app);
    res.mem = { webMB: memMB(web), appMB: memMB(app) };
    // Hidden last (the window is not shown again; quit follows).
    await evaluate("await window.__TAURI_INTERNALS__.invoke('plugin:window|hide', { label: 'main' }); return true");
    await sleep(2000);
    res.hidden = { web: cpu(web, 15), app: cpu(app, 15) };
    out("idle", res);
  },

  async conversation() {
    await page();
    const res = {};
    res.memBeforeMB = memMB(ids().web);
    res.open = await openTask(LONG);
    res.memAfterMB = memMB(ids().web);
    // Scroll the whole conversation up, then down, stepping scrollTop each frame.
    res.scroll = await evaluate(`
      const P = window.__perf;
      const el = P.scroller(document.querySelector('[data-reply-group]'));
      el.scrollTop = el.scrollHeight; await P.paint();
      const up = await P.scrollRun(el, -1, 800, 120);
      const down = await P.scrollRun(el, 1, 800, 120);
      return { height: el.scrollHeight, up, down };`);
    // Idle in a long conversation.
    res.cpuIdleInConversation = cpu(ids().web, 10);
    out("conversation", res);
  },

  async switch() {
    await page();
    const other = (await invoke("agent_list_sessions")).find((s) => s.sessionId !== LONG && s.sessionId !== BIG).sessionId;
    const runs = [];
    for (let i = 0; i < 4; i++) {
      runs.push({ toLong: await openTask(LONG), toShort: await openTask(other) });
    }
    out("switch", { runs });
  },

  async stream() {
    await page();
    await trackDone();
    const counting = await renders.start();
    // A new task from home through the composer, as a person starts one.
    const res = await evaluate(`
      const P = window.__perf;
      location.hash = '#/';
      [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().startsWith('New task'))?.click();
      await P.paint();
      const ed = await P.until(() => document.querySelector('[data-lexical-editor=true]'));
      P.type(ed, 'Write the long report. STREAM 2400 60');
      await P.paint();
      const send = await P.until(() => document.querySelector('[aria-label="Send message"]:not([disabled])'));
      // Count events and payload bytes from Rust while the reply streams.
      const I = window.__TAURI_INTERNALS__;
      window.__perfEv = { n: 0, bytes: 0 };
      await I.invoke("plugin:event|listen", { event: "agent:text-delta", target: { kind: "Any" }, handler: I.transformCallback((e) => { window.__perfEv.n++; window.__perfEv.bytes += JSON.stringify(e.payload).length; }) });
      send.click();
      await P.until(() => document.querySelector('[data-reply-group]'), 20000);
      return true;`);
    await sleep(2000);
    // Frame times while streaming, then typing latency in the message box while streaming.
    const during = await frames(8000);
    const typing = await evaluate(`
      const P = window.__perf;
      const ed = document.querySelector('[data-lexical-editor=true]');
      const lat = [];
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 120));
        const t0 = performance.now();
        P.type(ed, 'x');
        const t1 = await P.raf();
        lat.push(t1 - t0);
      }
      lat.sort((a, b) => a - b);
      return { median: +lat[12].toFixed(1), p90: +lat[22].toFixed(1), max: +lat[24].toFixed(1) };`);
    const cpuStream = cpu(ids().web, 8);
    const cpuApp = cpu(ids().app, 5);
    const ev = await evaluate("return window.__perfEv");
    if (!ev.n) throw new Error("No stream events observed; reject this streaming sample");
    const r = counting ? await renders.stop(25) : null;
    out("stream", { during, typing, cpuWeb: cpuStream, cpuApp, events: ev, renders: r });
    // Let the turn finish, clear the draft.
    await evaluate(`const P = window.__perf; await P.until(() => !document.querySelector('[aria-label="Stop"]') , 120000).catch(() => {}); return true;`).catch(() => {});
  },

  async multi() {
    await page();
    await trackDone();
    const sessions = await invoke("agent_list_sessions");
    const picks = sessions.filter((s) => s.sessionId !== LONG && s.sessionId !== BIG).slice(5, 8).map((s) => s.sessionId);
    for (const id of picks) await openTask(id);
    const t0 = Date.now();
    for (const id of picks) await invoke("agent_send_message", { sessionId: id, message: "Go on. STREAM 1600 60" });
    await sleep(2500);
    await evaluate(`const I = window.__TAURI_INTERNALS__; window.__perfEv = { n: 0, bytes: 0 };
      for (const e of ["agent:text-delta","agent:tool-progress","agent:tool-start","agent:tool-end","agent:state-change"]) await I.invoke("plugin:event|listen", { event: e, target: { kind: "Any" }, handler: I.transformCallback((x) => { window.__perfEv.n++; window.__perfEv.bytes += JSON.stringify(x.payload).length; }) });
      return true;`);
    const counting = await renders.start();
    const during = await frames(8000);
    const c = { web: cpu(ids().web, 6), app: cpu(ids().app, 6) };
    const ev = await evaluate("return window.__perfEv");
    if (!ev.n) throw new Error("No stream events observed; reject this streaming sample");
    const r = counting ? await renders.stop(25) : null;
    const typing = await evaluate(`
      const P = window.__perf;
      const ed = document.querySelector('[data-lexical-editor=true]');
      const lat = [];
      for (let i = 0; i < 15; i++) { await new Promise((r) => setTimeout(r, 120)); const t0 = performance.now(); P.type(ed, 'y'); lat.push((await P.raf()) - t0); }
      lat.sort((a, b) => a - b); return { median: +lat[7].toFixed(1), max: +lat[14].toFixed(1) };`);
    out("multi", { during, cpu: c, events: ev, eventsPerSec: +(ev.n / ((Date.now() - t0 - 2500) / 1000)).toFixed(0), renders: r, typing, wallMs: Date.now() - t0 });
    await sleep(25000);
  },

  async sidebar() {
    await page();
    await evaluate("location.hash = '#/'; return true");
    const res = await evaluate(`
      const P = window.__perf;
      const list = document.querySelector('[data-testid=task-list]');
      const rows = list.querySelectorAll('[data-testid=task-row]').length;
      list.scrollTop = 0; await P.paint();
      const scroll = await P.scrollRun(list, 1, 60, 900);
      list.scrollTop = 0; await P.paint();
      // Hover across 60 rows, one per frame (React's enter/leave come from mouseover/out).
      const els = [...list.querySelectorAll('[data-testid=task-row]')].slice(0, 60);
      const ts = []; const commit = [];
      for (let i = 0; i < els.length; i++) {
        ts.push(await P.raf());
        const t = performance.now();
        if (i > 0) els[i - 1].dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: els[i] }));
        els[i].dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: i > 0 ? els[i - 1] : null }));
        commit.push(performance.now() - t);
      }
      els[els.length - 1].dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      commit.sort((a, b) => a - b);
      return { rows, scroll, hoverFrames: window.__perfFrameStats(ts), hoverHandlerMs: { median: +commit[30].toFixed(2), max: +commit[59].toFixed(2) } };`);
    // Settle then undo-like move back: time until the row leaves Recents.
    res.settle = await evaluate(`
      const P = window.__perf;
      const list = document.querySelector('[data-testid=task-list]');
      const row = list.querySelectorAll('[data-testid=task-row]')[3];
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await P.paint();
      const btn = row.querySelector('[data-testid=settle-task]');
      const n0 = list.querySelectorAll('[data-testid=task-row]').length;
      const t0 = performance.now();
      btn.click();
      await P.until(() => list.querySelectorAll('[data-testid=task-row]').length < n0, 10000);
      const ms = performance.now() - t0;
      return { ms: +ms.toFixed(0) };`);
    out("sidebar", res);
  },

  async search() {
    await page();
    const res = await evaluate(`
      const P = window.__perf;
      location.hash = '#/';
      await P.paint();
      const t0 = performance.now();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }));
      const win = await P.until(() => document.querySelector('[data-testid=search-window]'));
      const shown = (await P.paint()) - t0;
      const input = win.querySelector('input');
      const frames = []; let on = true; const loop = (t) => { frames.push(t); if (on) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
      const lat = [];
      for (const q of ['q', 'qu', 'qua', 'quar', 'quart', 'quarte', 'quarter', 'quarterly', 'quarterly r', 'quarterly re', 'quarterly rev']) {
        const before = win.innerText;
        const t = performance.now();
        input.focus(); input.select(); document.execCommand('insertText', false, q);
        await P.raf();
        lat.push(+(performance.now() - t).toFixed(1));
        await new Promise((r) => setTimeout(r, 90));
      }
      // Results for the final query (after the 120ms pause the message index needs)
      const tq = performance.now();
      const before = win.innerText;
      await P.until(() => win.innerText !== before, 5000).catch(() => {});
      const settle = performance.now() - tq;
      on = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { openPaintedMs: +shown.toFixed(0), keystrokeToFrameMs: lat, finalResultsMs: +settle.toFixed(0), frames: window.__perfFrameStats(frames) };`);
    // The artifacts index the window loads on each opening, timed on its own.
    res.artifactsIndexMs = await evaluate("const t = performance.now(); const v = await window.__TAURI_INTERNALS__.invoke('artifacts_index'); return { ms: +(performance.now() - t).toFixed(0), items: v.length };");
    res.messageSearchMs = await evaluate("const t = performance.now(); const v = await window.__TAURI_INTERNALS__.invoke('agent_search_messages', { query: 'quarterly revenue' }); return { ms: +(performance.now() - t).toFixed(0), hits: v.length };");
    out("search", res);
  },

  async artifacts() {
    await page();
    const res = { memBeforeMB: memMB(ids().web) };
    Object.assign(res, await evaluate(`
      const P = window.__perf;
      location.hash = '#/'; await P.paint();
      const t0 = performance.now();
      location.hash = '#/artifacts';
      await P.until(() => document.querySelector('[data-gallery-card]'), 30000);
      const firstCard = (await P.paint()) - t0;
      const cards = document.querySelectorAll('[data-gallery-card]').length;
      const thumbs = () => document.querySelectorAll('[data-gallery-card] img, [data-preview]').length;
      await new Promise((r) => setTimeout(r, 1500));
      const firstScreenThumbs = thumbs();
      const el = document.querySelector('section[aria-label="Artifacts gallery"]');
      const scroll = await P.scrollRun(el, 1, 600, 120);
      const tEnd = performance.now();
      let n = thumbs(), stable = performance.now();
      await P.until(() => { const m = thumbs(); if (m !== n) { n = m; stable = performance.now(); } return performance.now() - stable > 2000; }, 120000);
      return { firstCardMs: +firstCard.toFixed(0), cards, firstScreenThumbs, scroll, thumbsAfterScroll: n, thumbsSettledMs: +(stable - tEnd).toFixed(0), domNodes: document.getElementsByTagName('*').length };`));
    res.memAfterMB = memMB(ids().web);
    res.cpuIdleOnPage = cpu(ids().web, 8);
    await evaluate("location.hash = '#/'; return true");
    out("artifacts", res);
  },

  async viewers() {
    await page();
    await openTask(BIG, "[data-testid=file-card]");
    const names = await evaluate("return [...document.querySelectorAll('[data-testid=file-card]')].map((c) => c.innerText.split('\\n')[0])");
    const res = { files: {} };
    for (let i = 0; i < names.length; i++) {
      const r = await evaluate(`
        const P = window.__perf;
        const card = document.querySelectorAll('[data-testid=file-card]')[${i}];
        const btn = card.querySelector('button') || card;
        const t0 = performance.now();
        btn.click();
        // Ready: the viewer's busy states are gone and it drew something.
        await new Promise((r) => setTimeout(r, 50));
        const panel = await P.until(() => document.querySelector('[role=tabpanel]'));
        let quiet = performance.now(), sig = '';
        await P.until(() => {
          const busy = panel.querySelector('[aria-busy=true], [data-loading], .animate-spin');
          const s = panel.getElementsByTagName('*').length + ':' + panel.innerText.length;
          if (s !== sig || busy) { sig = s; quiet = performance.now(); return false; }
          return performance.now() - quiet > 600;
        }, 60000).catch(() => {});
        const readyMs = quiet - t0;
        // Scroll whatever scrolls inside the panel.
        let target = null;
        for (const el of panel.querySelectorAll('*')) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 200) { target = el; break; } }
        const scroll = target ? await P.scrollRun(target, 1, 80, 120) : null;
        return { readyMs: +readyMs.toFixed(0), panelNodes: panel.getElementsByTagName('*').length, scroll };`).catch((e) => ({ error: String(e).slice(0, 200) }));
      r.webMB = memMB(ids().web);
      res.files[names[i]] = r;
      console.log(names[i], JSON.stringify(r));
    }
    res.tabsOpenWebMB = memMB(ids().web);
    res.cpuIdleWithTabs = cpu(ids().web, 8);
    out("viewers", res);
  },

  async design() {
    await page();
    await openTask(BIG, "[data-testid=file-card]");
    const res = await evaluate(`
      const P = window.__perf;
      const card = [...document.querySelectorAll('[data-testid=file-card]')].find((c) => c.innerText.includes('elements-300'));
      (card.querySelector('button') || card).click();
      const cell = await P.until(() => document.querySelector('[data-overlay="cell-0"]'), 30000);
      await new Promise((r) => setTimeout(r, 1000));
      const idleTs = []; for (let i = 0; i < 120; i++) idleTs.push(await P.raf());
      const r = cell.getBoundingClientRect(), x = r.x + 5, y = r.y + 5;
      cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }));
      const ts = [];
      for (let i = 0; i < 180; i++) { ts.push(await P.raf()); window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: x + 20 + Math.sin(i / 20) * 60, clientY: y + 15 + Math.cos(i / 20) * 60, pointerId: 1 })); }
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      // Undo the move so the fixture is unchanged on disk next time.
      return { visibility: document.visibilityState, idle: window.__perfFrameStats(idleTs), drag: window.__perfFrameStats(ts) };`);
    await evaluate("document.activeElement?.blur?.(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })); return true").catch(() => {});
    out("design", res);
  },

  async picker() {
    await page();
    await openTask(LONG);
    const res = await evaluate(`
      const P = window.__perf;
      const trigger = await P.until(() => document.querySelector('[aria-label="Choose model"]'));
      const t0 = performance.now();
      trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
      trigger.click();
      const list = await P.until(() => document.querySelector('[aria-label="Models"]'), 10000);
      const openMs = (await P.paint()) - t0;
      const rows = list.querySelectorAll('[role=option], button, [data-model-id]').length;
      const input = document.querySelector('[aria-label="Search models"]');
      const lat = [];
      for (const q of ['c', 'cl', 'cla', 'clau', 'claude', 'claude s']) { const t = performance.now(); input.focus(); input.select(); document.execCommand('insertText', false, q); await P.raf(); lat.push(+(performance.now() - t).toFixed(1)); await new Promise((r) => setTimeout(r, 60)); }
      input.select(); document.execCommand('delete');
      await P.paint();
      const keys = [];
      for (let i = 0; i < 30; i++) { const t = performance.now(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await P.raf(); keys.push(performance.now() - t); }
      keys.sort((a, b) => a - b);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { openMs: +openMs.toFixed(0), rows, typeToFrameMs: lat, arrowToFrameMs: { median: +keys[15].toFixed(1), max: +keys[29].toFixed(1) } };`);
    out("picker", res);
  },

  /** Open/close cycles: does the page keep growing? */
  async leak() {
    await page();
    const other = (await invoke("agent_list_sessions")).find((s) => s.sessionId !== LONG && s.sessionId !== BIG).sessionId;
    const sample = async () => ({ webMB: memMB(ids().web), nodes: await evaluate("return document.getElementsByTagName('*').length") });
    const res = { start: await sample(), cycles: [] };
    for (let c = 0; c < 6; c++) {
      await page();
      await openTask(LONG);
      await openTask(other);
      await evaluate("location.hash = '#/artifacts'; await new Promise((r) => setTimeout(r, 1500)); location.hash = '#/'; return true");
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); await new Promise((r) => setTimeout(r, 800)); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true");
      await sleep(1500);
      res.cycles.push(await sample());
      console.log("cycle", c, JSON.stringify(res.cycles.at(-1)));
    }
    out("leak", res);
  },
};

let failed = false;
for (const name of process.argv.slice(2)) {
  if (!scenarios[name]) throw new Error(`unknown scenario ${name}`);
  const t = Date.now();
  try { await scenarios[name](); } catch (e) { failed = true; console.error(name, "failed:", e.message); out(`${name}-error`, { error: String(e.message) }); }
  console.log(`${name} took ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
process.exit(failed ? 1 : 0);
