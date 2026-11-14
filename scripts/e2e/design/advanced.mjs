import fs from "node:fs";
import assert from "node:assert/strict";
import { evaluate, waitFor, type, dropFiles } from "../client.mjs";
const dir = "/tmp/vibework-design/fixtures",
  pause = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
async function open(name) {
  await evaluate(
    `(await import('/src/components/workspace/actions.ts')).openArtifactInPanel('design-check','${dir}/${name}.design.html');`,
  );
  await waitFor(".design-frame-root iframe");
  await pause(400);
}
async function key(key, extra = {}) {
  await evaluate(
    `const e=document.querySelector('.design-editor');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:${JSON.stringify(key)},...${JSON.stringify(extra)}}));`,
  );
  await pause(250);
}
await evaluate(
  `if(!document.querySelector('.design-editor'))[...document.querySelectorAll('button')].find(e=>e.textContent.includes('The design is ready.'))?.click();`,
);
await pause(250);
// A nested, rotated group with a rotated child. Undo/redo are tested on source.
fs.writeFileSync(
  `${dir}/nested.design.html`,
  `<!doctype html><html><body><section data-design-frame="nested" data-name="Nested geometry" style="position:relative;width:800px;height:600px;background:#f5f0e3"><div data-design-id="outer" data-design-kind="group" data-name="Outer group" style="position:absolute;left:180px;top:120px;width:400px;height:300px;transform:rotate(25deg)"><div data-design-id="inner" data-design-kind="group" data-name="Inner group" style="position:absolute;left:40px;top:50px;width:280px;height:160px;transform:rotate(-15deg)"><div data-design-id="child" data-design-kind="rect" data-name="Child" style="position:absolute;left:20px;top:30px;width:100px;height:70px;background:#597d6d;transform:rotate(17deg)"></div><div data-design-id="text" data-design-kind="text" data-name="Caption" style="position:absolute;left:140px;top:50px;width:130px;height:80px;font:22px Arial;color:#20382f">Nested group</div></div></div><custom-block style="position:absolute;left:40px;top:500px;width:250px;height:40px;color:#20382f">Preserved unknown block</custom-block></section></body></html>`,
);
await open("nested");
const select = async (id) => {
  await evaluate(
    `const e=document.querySelector('[data-overlay="${id}"]'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.x+10,clientY:r.y+10}));window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));`,
  );
  await pause(200);
};
const bounds = () =>
  evaluate(
    `const e=document.querySelector('.design-frame-root iframe').contentDocument.querySelector('[data-design-id="child"]');return e.getBoundingClientRect().toJSON();`,
  );
await select("inner");
const before = await bounds();
await key("g", { metaKey: true, shiftKey: true });
const after = await bounds();
for (const k of ["x", "y", "width", "height"])
  assert(Math.abs(before[k] - after[k]) < 1.1, `Rotated ungroup changed ${k}`);
results.rotatedNestedUngroup = { before, after };
await key("z", { metaKey: true });
assert(
  await evaluate(
    `return !!document.querySelector('.design-frame-root iframe').contentDocument.querySelector('[data-design-id="inner"]');`,
  ),
);
await key("z", { metaKey: true, shiftKey: true });
assert(
  !(await evaluate(
    `return !!document.querySelector('.design-frame-root iframe').contentDocument.querySelector('[data-design-id="inner"]');`,
  )),
);
results.undoRedo = true;
assert(
  await evaluate(
    `return !!document.querySelector('.design-overlay.read-only[title*="no editable"]');`,
  ),
);
results.unknownBlockPreserved = true;
// The same browser ClipboardEvent/DataTransfer paths used by system paste.
await select("child");
results.clipboard = await evaluate(
  `const e=document.querySelector('.design-editor'),data=new DataTransfer();e.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));const copied=data.getData('text/html');if(!copied.includes('vibework-design'))throw Error('No design clipboard payload');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));await new Promise(r=>setTimeout(r,200));const plain=new DataTransfer();plain.setData('text/plain','Pasted from another app');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:plain}));return {html:copied.length,plain:true};`,
);
await pause(300);
assert(
  await evaluate(
    `return document.querySelector('.design-frame-root iframe').contentDocument.body.innerText.includes('Pasted from another app');`,
  ),
);
results.images = await evaluate(
  `const c=document.createElement('canvas');c.width=30;c.height=20;c.getContext('2d').fillRect(0,0,30,20);const blob=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([blob],'first.png',{type:'image/png'}));dt.items.add(new File([blob],'second.png',{type:'image/png'}));const e=document.querySelector('.design-editor');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));await new Promise(r=>setTimeout(r,500));const images=[...document.querySelector('.design-frame-root iframe').contentDocument.images];return {count:images.length,width:images[0]?.naturalWidth};`,
);
assert.equal(results.images.count, 2);
assert.equal(results.images.width, 30);
// Dirty external write must prompt; resolving it clears both banners.
await select("child");
await key("ArrowRight");
fs.writeFileSync(
  `${dir}/nested.design.html`,
  fs
    .readFileSync(`${dir}/nested.design.html`, "utf8")
    .replace("Nested geometry", "External edit"),
);
await pause(1200);
assert(
  await evaluate(`return document.body.innerText.includes('Keep my changes');`),
);
await evaluate(
  `const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Keep my changes');b.click();`,
);
await pause(1000);
assert(
  !(await evaluate(
    `return document.body.innerText.includes('Keep my changes')||document.body.innerText.includes('changed on disk');`,
  )),
);
results.conflictResolved = true;
// Real rAF timestamps, not handler timings. One pointer move per displayed frame.
await open("performance");
await pause(800);
const diskBefore = fs.readFileSync(`${dir}/performance.design.html`, "utf8");
results.performance = await evaluate(
  `const e=document.querySelector('[data-overlay="cell-0"]'),r=e.getBoundingClientRect(),x=r.x+5,y=r.y+5,frame=document.querySelector('.design-frame-root iframe'),art=frame.contentDocument.querySelector('[data-design-id="cell-0"]'),before=art.getBoundingClientRect().x,times=[];e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:x,clientY:y}));for(let i=0;i<180;i++){const t=await new Promise(requestAnimationFrame);times.push(t);window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,clientX:x+20+i*.25,clientY:y+15+Math.sin(i/12)*5}));}await new Promise(requestAnimationFrame);const live=art.getBoundingClientRect().x;if(live===before)throw Error('Artwork did not move live');window.__finishDesignDrag=()=>window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));const deltas=times.slice(1).map((t,i)=>t-times[i]),sorted=[...deltas].sort((a,b)=>a-b);return {elements:frame.contentDocument.querySelectorAll('[data-design-id]').length,frames:deltas.length,medianMs:sorted[Math.floor(sorted.length/2)],worstMs:Math.max(...deltas),p95Ms:sorted[Math.floor(sorted.length*.95)],before,live};`,
);
assert.equal(
  fs.readFileSync(`${dir}/performance.design.html`, "utf8"),
  diskBefore,
);
await evaluate(`window.__finishDesignDrag();delete window.__finishDesignDrag;`);
await pause(1000);
assert.notEqual(
  fs.readFileSync(`${dir}/performance.design.html`, "utf8"),
  diskBefore,
);
fs.writeFileSync(
  "/tmp/vibework-design/advanced-results.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
