import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { evaluate, waitFor } from "../client.mjs";
const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  win = process.env.DESIGN_WINDOW_ID;
if (!win) throw Error("Set DESIGN_WINDOW_ID to isolated dev window");
const results = {};
await evaluate(
  `if(!document.querySelector('.design-editor'))[...document.querySelectorAll('button')].find(e=>e.textContent.includes('The design is ready.'))?.click();`,
);
await pause(200);
fs.copyFileSync(
  "/tmp/vibework-design/fixtures/poster.design.html",
  "/tmp/vibework-design/fixtures/modifiers.design.html",
);
await evaluate(
  `(await import('/src/components/workspace/actions.ts')).openArtifactInPanel('design-check','/tmp/vibework-design/fixtures/modifiers.design.html');`,
);
await waitFor('[data-overlay="sun"]');
await pause(500);
async function key(k, extra = {}) {
  await evaluate(
    `const e=document.querySelector('.design-editor');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:${JSON.stringify(k)},...${JSON.stringify(extra)}}));`,
  );
  await pause(300);
}
results.duplicate = await evaluate(
  `const frame=document.querySelector('.design-frame-root iframe'),d=frame.contentDocument,before=d.querySelectorAll('[data-design-id]').length,e=document.querySelector('[data-overlay="sun"]'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,altKey:true,clientX:r.x+10,clientY:r.y+10}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,altKey:true,clientX:r.x+40,clientY:r.y+10}));await new Promise(requestAnimationFrame);window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));await new Promise(r=>setTimeout(r,250));return {before,after:document.querySelector('.design-frame-root iframe').contentDocument.querySelectorAll('[data-design-id]').length};`,
);
assert.equal(results.duplicate.after, results.duplicate.before + 1);
await key("z", { metaKey: true });
await evaluate(
  `const e=document.querySelector('[data-overlay="sun"]'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.x+10,clientY:r.y+10}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));`,
);
await pause(250);
results.resize = await evaluate(
  `const d=document.querySelector('.design-frame-root iframe').contentDocument,el=d.querySelector('[data-design-id="sun"]'),before=el.getBoundingClientRect().toJSON(),h=document.querySelector('[data-handle="se"]'),r=h.getBoundingClientRect();h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,shiftKey:true,altKey:true,clientX:r.x,clientY:r.y}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,shiftKey:true,altKey:true,clientX:r.x+10,clientY:r.y+5}));await new Promise(requestAnimationFrame);const after=el.getBoundingClientRect().toJSON();window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return {before,after};`,
);
const { before, after } = results.resize;
assert(
  Math.abs(after.width / after.height - before.width / before.height) < 0.02,
);
assert(Math.abs(after.x + after.width / 2 - before.x - before.width / 2) < 1);
await key("z", { metaKey: true });
// Arrow nudge follows world axes and source is committed.
await evaluate(
  `const e=document.querySelector('[data-overlay="sun"]'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.x+10,clientY:r.y+10}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));`,
);
await pause(200);
const x = await evaluate(
  `return document.querySelector('.design-frame-root iframe').contentDocument.querySelector('[data-design-id="sun"]').offsetLeft;`,
);
await key("ArrowRight", { shiftKey: true });
assert.equal(
  await evaluate(
    `return document.querySelector('.design-frame-root iframe').contentDocument.querySelector('[data-design-id="sun"]').offsetLeft;`,
  ),
  x + 10,
);
results.nudge = true;
await evaluate(
  `const e=document.querySelector('[data-overlay="sun"]'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.x+10,clientY:r.y+10}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,shiftKey:true,clientX:r.x+40,clientY:r.y+14}));await new Promise(requestAnimationFrame);`,
);
await pause(200);
execFileSync("screencapture", [
  "-x",
  "-l",
  win,
  "/tmp/vibework-design/shots-2/drag-guides.png",
]);
await evaluate(
  `window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));`,
);
await pause(300);
await evaluate(
  `const e=document.querySelector('.design-hit-area'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.x+20,clientY:r.y+20}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,clientX:r.x+500,clientY:r.y+300}));`,
);
await pause(200);
execFileSync("screencapture", [
  "-x",
  "-l",
  win,
  "/tmp/vibework-design/shots-2/marquee.png",
]);
await evaluate(
  `window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));`,
);
await pause(300);
results.multiSelect = await evaluate(
  `return document.querySelectorAll('.design-overlay.selected').length;`,
);
assert(results.multiSelect > 1);
execFileSync("screencapture", [
  "-x",
  "-l",
  win,
  "/tmp/vibework-design/shots-2/multi-selection.png",
]);
fs.writeFileSync(
  "/tmp/vibework-design/modifiers-results.json",
  JSON.stringify(results, null, 2),
);
console.log(results);
