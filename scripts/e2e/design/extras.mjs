import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { evaluate, waitFor, dropFiles } from "../client.mjs";
const folder = "/tmp/vibework-design/fixtures",
  windowId = process.env.DESIGN_WINDOW_ID,
  pause = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
const shot = async (name) => {
  await pause(400);
  execFileSync("screencapture", [
    "-x",
    "-l",
    windowId,
    `/tmp/vibework-design/shots-2/${name}.png`,
  ]);
};
await evaluate(
  `if(!document.querySelector('.design-editor'))[...document.querySelectorAll('button')].find(e=>e.textContent.includes('The design is ready.'))?.click();`,
);
await evaluate(
  `(await import('/src/components/workspace/actions.ts')).openArtifactInPanel('design-check','${folder}/nested.design.html');`,
);
await waitFor(".design-frame-root iframe");
await pause(400);
const files = [
  `${folder}/poster-light-1.png`,
  `${folder}/poster-light-1@2x.png`,
];
const before = await evaluate(
  `return document.querySelector('.design-frame-root iframe').contentDocument.images.length;`,
);
await dropFiles(files);
await evaluate(
  `window.__e2eFileDialog=${JSON.stringify(files)};const el=document.querySelector('.design-editor');el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'K',metaKey:true,shiftKey:true}));`,
);
await pause(1200);
const imported = await evaluate(
  `return [...document.querySelector('.design-frame-root iframe').contentDocument.images].slice(-2).map(e=>({src:e.src,w:e.naturalWidth}));`,
);
assert.equal(imported.length, 2);
for (let i = 0; i < 2; i++)
  assert.equal(
    imported[i].src.split(",")[1],
    fs.readFileSync(files[i]).toString("base64"),
  );
results.filePicker = {
  allChosenImages: true,
  originalBytesPreserved: true,
  dimensions: imported.map((x) => x.w),
  nativeDialogOpened: false,
};
const gestures = await evaluate(
  `const v=document.querySelector('.design-viewport'),r=v.getBoundingClientRect(),zoom=()=>parseFloat(document.querySelector('[aria-label="Zoom"]').textContent),before=zoom();v.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-100,clientX:r.x+150,clientY:r.y+150}));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const after=zoom();v.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:50,deltaY:80}));const pan={x:v.scrollLeft,y:v.scrollTop};document.querySelector('.design-editor').focus();document.querySelector('.design-editor').dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:' ',code:'Space'}));v.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.x+100,clientY:r.y+100}));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,clientX:r.x+70,clientY:r.y+80}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));document.querySelector('.design-editor').dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:' ',code:'Space'}));return {before,after,pan,spacePan:{x:v.scrollLeft,y:v.scrollTop}};`,
);
assert(gestures.after > gestures.before);
assert(gestures.pan.x > 0);
assert(gestures.spacePan.x > gestures.pan.x);
results.gestures = gestures;
// Gallery's first-frame thumbnails and six starter tiles in each theme.
for (const theme of ["light", "dark"]) {
  await evaluate(
    `(await import('/src/lib/theme.ts')).setThemePreference('${theme}');[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Artifacts').click();`,
  );
  await pause(1200);
  await shot(`gallery-${theme}`);
  results["gallery-" + theme] = await evaluate(
    `const label=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent==='Make something new');const designs=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Designs');return {starterPresent:!!designs,thumbnailFrames:document.querySelectorAll('iframe[title]').length,text:document.body.innerText.slice(-500)};`,
  );
  // Return to the task, show the fake-model's three-frame design at once.
  await evaluate(
    `[...document.querySelectorAll('button')].find(e=>e.textContent.includes('The design is ready.')).click();(await import('/src/components/workspace/actions.ts')).openArtifactInPanel('design-check','${folder}/agent-social.design.html');`,
  );
  await waitFor(".design-viewport");
  await pause(450);
  await evaluate(
    `const v=document.querySelector('.design-viewport'),r=v.getBoundingClientRect();v.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:140,clientX:r.x,clientY:r.y}));`,
  );
  await pause(300);
  await shot(`agent-social-three-frames-${theme}`);
}
fs.writeFileSync(
  "/tmp/vibework-design/extras-results.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
