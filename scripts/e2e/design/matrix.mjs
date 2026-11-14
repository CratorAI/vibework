import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { evaluate, waitFor, type, collectErrors, errors } from "../client.mjs";
const folder = "/tmp/vibework-design/fixtures",
  shots = "/tmp/vibework-design/shots-2";
const windowId = process.env.DESIGN_WINDOW_ID;
if (!windowId)
  throw Error(
    "Set DESIGN_WINDOW_ID to the isolated dev window, never the owner window.",
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
async function shot(name) {
  await pause(180);
  execFileSync("screencapture", ["-x", "-l", windowId, `${shots}/${name}.png`]);
  log.push({ capture: `${name}.png` });
}
async function click(selector) {
  await evaluate(
    `const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,pointerType:'mouse'}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1,pointerType:'mouse'}));el.click();`,
  );
  await pause(80);
}
async function menu(text) {
  await evaluate(
    `const e=[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing menu '+${JSON.stringify(text)});e.click();`,
  );
  await pause(100);
}
async function open(path) {
  await evaluate(
    `const {openArtifactInPanel}=await import('/src/components/workspace/actions.ts');openArtifactInPanel('design-check',${JSON.stringify(path)});`,
  );
  await waitFor(".design-frame-root iframe");
  await pause(250);
}
async function key(key, extra = {}) {
  await evaluate(
    `const e=document.querySelector('.design-editor');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,...${JSON.stringify(extra)}}));`,
  );
  await pause(120);
}
async function drag(selector, dx, dy) {
  return await evaluate(
    `const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:x,clientY:y}));await new Promise(requestAnimationFrame);for(let i=1;i<=8;i++){window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,pointerId:1,clientX:x+${dx}*i/8,clientY:y+${dy}*i/8}));await new Promise(requestAnimationFrame);}const live=[...document.querySelectorAll('.design-frame-root iframe')].map(f=>f.contentDocument.body.innerHTML);window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:x+${dx},clientY:y+${dy}}));return live;`,
  );
}
async function field(label, value) {
  await waitFor(`.design-inspector input[aria-label="${label}"]`);
  await type(`.design-inspector input[aria-label="${label}"]`, String(value));
  await evaluate(`document.activeElement.blur();`);
  await pause(120);
}
async function exportViaMenu(format) {
  await click('button[aria-label="Export"]');
  await menu(format);
  await pause(450);
}
async function comparison(name) {
  await evaluate(
    `const {snapshotSvg}=await import('/src/components/artifacts/design/snapshot.ts?check='+Date.now()),{svgCanvas}=await import('/src/components/artifacts/design/export.ts');const frame=document.querySelector('.design-frame-root iframe'),d=frame.contentDocument,el=d.querySelector('[data-design-frame]'),s=snapshotSvg([el]),c=await svgCanvas(s.svg,s.width,s.height);const overlay=document.createElement('div');overlay.id='design-comparison';overlay.style='position:fixed;inset:0;z-index:99999;background:var(--background);padding:24px;display:flex;gap:24px;align-items:flex-start;color:var(--foreground)';const k=Math.min((innerWidth-72)/2/s.width,(innerHeight-72)/s.height);for(const [label,content]of [['Live WebKit canvas',frame.cloneNode()],['PNG export',new Image()]]){const col=document.createElement('div');col.style='flex:1;min-width:0';const title=document.createElement('div');title.textContent=label;title.style='font:13px Arial;margin-bottom:12px';col.append(title);const holder=document.createElement('div');holder.style='position:relative;width:'+s.width*k+'px;height:'+s.height*k+'px';content.style='max-width:none;max-height:none;border:0;position:absolute;left:0;top:0;width:'+s.width+'px;height:'+s.height+'px;transform-origin:0 0;transform:scale('+k+')';if(content.tagName==='IMG')content.src=c.toDataURL();holder.append(content);col.append(holder);overlay.append(col);}document.body.append(overlay);await Promise.all([...overlay.querySelectorAll('img')].map(im=>im.decode()));await new Promise(r=>setTimeout(r,800));`,
  );
  await shot(name + "-canvas-vs-png");
  await evaluate(`document.querySelector('#design-comparison').remove();`);
}
await evaluate(
  `const b=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('The design is ready.'));if(!document.querySelector('.design-editor'))b?.click();`,
);
await pause(300);
await collectErrors();
await evaluate(`window.__e2eErrors=[];`);
const themes = process.env.DESIGN_THEME
  ? [process.env.DESIGN_THEME]
  : ["light", "dark"];
const names = process.env.DESIGN_FIXTURE
  ? [process.env.DESIGN_FIXTURE]
  : ["poster", "social", "app", "brief"];
try {
  for (const theme of themes) {
    await evaluate(
      `(await import('/src/lib/theme.ts')).setThemePreference('${theme}');(await import('/src/components/workspace/store.ts')).workspaceStore.setWidthFrac(.8,false);`,
    );
    for (const name of names) {
      console.log("Checking", name, theme);
      const label = `${name}-${theme}`,
        path = `${folder}/${label}.design.html`;
      fs.copyFileSync(`${folder}/${name}.design.html`, path);
      await open(path);
      await shot(label + "-open");
      await comparison(label);
      const first = await evaluate(
        `const d=document.querySelector('.design-frame-root iframe').contentDocument;return [...d.querySelectorAll('[data-design-id]')].find(e=>e.dataset.designKind==='text').dataset.designId;`,
      );
      const sel = `[data-overlay="${first}"]`;
      const before = await evaluate(
        `return document.querySelector('.design-frame-root iframe').contentDocument.querySelector('[data-design-id="${first}"]').style.left;`,
      );
      const live = await drag(sel, 8, 6);
      assert(live[0].includes('data-design-id="' + first + '"'));
      await pause(150);
      const after = await evaluate(
        `return document.querySelector('.design-frame-root iframe').contentDocument.querySelector('[data-design-id="${first}"]').style.left;`,
      );
      assert.notEqual(after, before);
      await drag('[data-handle="se"]', 10, 5);
      await pause(150);
      await drag('[aria-label="Rotate selection"]', 12, 4);
      await pause(300);
      await field("Angle", 0);
      await pause(450);
      await evaluate(
        `const e=document.querySelector(${JSON.stringify(sel)});e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`,
      );
      await waitFor('textarea[aria-label="Edit text"]');
      await type(
        'textarea[aria-label="Edit text"]',
        await evaluate(
          `return document.querySelector('textarea[aria-label="Edit text"]').value+' ·';`,
        ),
      );
      await evaluate(`document.activeElement.blur();`);
      await pause(150);
      await pause(300);
      await field("Text colour hex", name === "social" ? "#efe9cf" : "#314b40");
      await click('button[aria-label="Layers"]');
      await shot(label + "-inspector");
      await click('button[aria-label="Close layers"]');
      await click('button[aria-label="Bring forward"]');
      await key("r");
      await key("Delete");
      await key("f");
      await key("Delete");
      await pause(950);
      assert(
        fs
          .readFileSync(path, "utf8")
          .includes(name === "social" ? "#efe9cf" : "#314b40"),
      );
      await shot(label + "-edited");
      // Close through the workspace action, reopen from disk and prove the edits survived.
      await evaluate(
        `const {closeActivePanelTab}=await import('/src/components/workspace/actions.ts');closeActivePanelTab('design-check');`,
      );
      await open(path);
      assert(
        await evaluate(
          `return document.querySelector('.design-frame-root iframe').contentDocument.body.innerText.includes('·');`,
        ),
      );
      // Simulate the agent's external edit, without touching the app's working copy.
      fs.writeFileSync(
        path,
        fs
          .readFileSync(path, "utf8")
          .replace(
            'data-name="' +
              {
                poster: "Fieldnotes · exhibition",
                social: "Gather · 1 / 3",
                app: "Gather · studio overview",
                brief: "Riverside · project brief",
              }[name] +
              '"',
            'data-name="Agent reviewed"',
          ),
      );
      await pause(1200);
      assert(
        await evaluate(
          `return document.querySelector('.design-frame-label').textContent.includes('Agent reviewed');`,
        ),
      );
      await shot(label + "-agent-reload");
      for (const format of ["PNG", "PNG 2×", "SVG", "PDF · all frames"]) {
        await exportViaMenu(format);
        if (format.startsWith("PDF")) {
          await waitFor("canvas");
          await pause(1800);
        }
        await shot(
          label +
            "-" +
            format.split(" ")[0].toLowerCase() +
            (format === "PNG 2×" ? "2x" : ""),
        );
        await open(path);
      }
      await click(sel);
      await click('button[aria-label="Export"]');
      await menu("Selection");
      await menu("SVG");
      await pause(350);
      await shot(label + "-selection-svg");
      await open(path);
      log.push({
        fixture: name,
        theme,
        checks: [
          "open",
          "live move",
          "resize",
          "rotate",
          "text edit",
          "colour",
          "layer reorder",
          "add/delete shape",
          "add/delete frame",
          "save",
          "reopen",
          "agent edit reload",
          "PNG opened",
          "PNG2x opened",
          "SVG opened",
          "PDF opened",
          "selection SVG opened",
        ],
        saved: true,
      });
      fs.writeFileSync(
        "/tmp/vibework-design/matrix-2.json",
        JSON.stringify(log, null, 2),
      );
    }
  }
  console.log(JSON.stringify({ log, errors: await errors() }, null, 2));
} catch (e) {
  fs.writeFileSync(
    "/tmp/vibework-design/matrix-partial.json",
    JSON.stringify(log, null, 2),
  );
  throw e;
}
