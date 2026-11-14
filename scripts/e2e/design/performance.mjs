import fs from "node:fs";
import { evaluate, waitFor } from "../client.mjs";
await evaluate(
  `if(!document.querySelector('.design-editor'))[...document.querySelectorAll('button')].find(e=>e.textContent.includes('The design is ready.'))?.click();`,
);
await evaluate(
  `(await import('/src/components/workspace/actions.ts')).openArtifactInPanel('design-check','/tmp/vibework-design/fixtures/performance.design.html');`,
);
await waitFor('[data-overlay="cell-0"]');
const result = await evaluate(
  `const stats=t=>{const d=t.slice(1).map((x,i)=>x-t[i]).sort((a,b)=>a-b);return {frames:d.length,medianMs:d[Math.floor(d.length/2)],p95Ms:d[Math.floor(d.length*.95)],worstMs:d[d.length-1]}};const times=[];for(let i=0;i<120;i++)times.push(await new Promise(requestAnimationFrame));const idle=stats(times),e=document.querySelector('[data-overlay="cell-0"]'),r=e.getBoundingClientRect(),x=r.x+5,y=r.y+5;e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:x,clientY:y}));const moving=[];for(let i=0;i<120;i++){moving.push(await new Promise(requestAnimationFrame));window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,buttons:1,clientX:x+20+Math.sin(i/20)*25,clientY:y+15+Math.cos(i/20)*25}));}window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return {elements:300,visibility:document.visibilityState,idle,drag:stats(moving)};`,
  { timeout: 120000 },
);
fs.writeFileSync(
  "/tmp/vibework-design/performance-paired.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
