import { evaluate, waitFor } from "../client.mjs";
import { execFileSync } from "node:child_process";
const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  windowId = process.env.DESIGN_WINDOW_ID;
if (!windowId) throw Error("Set DESIGN_WINDOW_ID to isolated dev window");
async function shot(name) {
  execFileSync("screencapture", [
    "-x",
    "-l",
    windowId,
    `/tmp/vibework-design/shots-2/${name}.png`,
  ]);
}
async function comparison(name) {
  await evaluate(
    `const {snapshotSvg}=await import('/src/components/artifacts/design/snapshot.ts?check='+Date.now()),{svgCanvas}=await import('/src/components/artifacts/design/export.ts');const frame=document.querySelector('.design-frame-root iframe'),d=frame.contentDocument,el=d.querySelector('[data-design-frame]'),s=snapshotSvg([el]),c=await svgCanvas(s.svg,s.width,s.height);const overlay=document.createElement('div');overlay.id='design-comparison';overlay.style='position:fixed;inset:0;z-index:99999;background:var(--background);padding:24px;display:flex;gap:24px;align-items:flex-start;color:var(--foreground)';const k=Math.min((innerWidth-72)/2/s.width,(innerHeight-72)/s.height);for(const [label,content]of [['Live WebKit canvas',frame.cloneNode()],['PNG export',new Image()]]){const col=document.createElement('div');col.style='flex:1;min-width:0';const title=document.createElement('div');title.textContent=label;title.style='font:13px Arial;margin-bottom:12px';col.append(title);const holder=document.createElement('div');holder.style='position:relative;width:'+s.width*k+'px;height:'+s.height*k+'px';content.style='max-width:none;max-height:none;border:0;position:absolute;left:0;top:0;width:'+s.width+'px;height:'+s.height+'px;transform-origin:0 0;transform:scale('+k+')';if(content.tagName==='IMG')content.src=c.toDataURL();holder.append(content);col.append(holder);overlay.append(col);}document.body.append(overlay);await Promise.all([...overlay.querySelectorAll('img')].map(im=>im.decode()));await new Promise(r=>setTimeout(r,800));`,
  );
  await shot(name + "-canvas-vs-png");
  await evaluate(`document.querySelector('#design-comparison').remove();`);
}
for (const theme of ["light", "dark"])
  for (const name of ["poster", "social", "app", "brief"]) {
    await evaluate(
      `(await import('/src/lib/theme.ts')).setThemePreference('${theme}');(await import('/src/components/workspace/actions.ts')).openArtifactInPanel('design-check','/tmp/vibework-design/fixtures/${name}.design.html');`,
    );
    await waitFor(".design-frame-root iframe");
    await pause(1500);
    await comparison(`${name}-${theme}`);
  }
