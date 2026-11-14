#!/usr/bin/env bun
import {evaluate,sleep,save} from './lib.mjs';
const until=async(code)=>{for(let i=0;i<200;i++){const v=await evaluate(code);if(v)return v;await sleep(50)}throw Error(code)};
const checks={};
await evaluate("location.hash='#/artifacts';return true");await until("return !!document.querySelector('[data-gallery-card]')");
checks.start=await evaluate(`const root=document.querySelector('section[aria-label="Artifacts gallery"]');root.scrollTop=0;return {height:root.scrollHeight,total:root.querySelector('[role=list]')?.getAttribute('aria-label')}`);await sleep(150);
await evaluate(`document.querySelector('[data-gallery-index="0"]').focus();return true`);
checks.keyboard={visited:[]};
for(let i=1;i<=30;i++){
 await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));return true`);
 await until(`return document.activeElement?.dataset.galleryIndex===${JSON.stringify(String(i*4))}`);
 checks.keyboard.visited.push(i*4);
}
Object.assign(checks.keyboard,await evaluate(`const root=document.querySelector('section[aria-label="Artifacts gallery"]');return {last:Number(document.activeElement.dataset.galleryIndex),top:root.scrollTop,cards:root.querySelectorAll('[data-gallery-card]').length,firstGone:!root.querySelector('[data-gallery-index="0"]')}`));
checks.positionBefore=await evaluate(`return document.querySelector('section[aria-label="Artifacts gallery"]').scrollTop`);
await evaluate("location.hash='#/';return true");await sleep(300);await evaluate("location.hash='#/artifacts';return true");await until("return !!document.querySelector('[data-gallery-card]')");await sleep(150);
checks.positionAfter=await evaluate(`return document.querySelector('section[aria-label="Artifacts gallery"]').scrollTop`);
if(checks.positionBefore!==checks.positionAfter)throw Error('Return scroll changed');
await evaluate(`const root=document.querySelector('section[aria-label="Artifacts gallery"]');root.scrollTop=root.scrollHeight;root.dispatchEvent(new Event('scroll',{bubbles:true}));return true`);
await until(`return !!document.querySelector('[data-gallery-index="344"]')`);
checks.last=await evaluate(`const root=document.querySelector('section[aria-label="Artifacts gallery"]'),button=root.querySelector('[data-gallery-index="344"]');button.focus();button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));return {index:document.activeElement.dataset.galleryIndex,lastBottom:button.closest('article').getBoundingClientRect().bottom,rootBottom:root.getBoundingClientRect().bottom,cards:root.querySelectorAll('[data-gallery-card]').length}`);
await evaluate(`const el=document.querySelector('[aria-label="Search artifacts"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'no-matching-perf-file-9383');el.dispatchEvent(new Event('input',{bubbles:true}));return true`);
await until(`return document.body.textContent.includes('No matching artifacts')`);
await evaluate(`const el=document.querySelector('[aria-label="Search artifacts"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}));return true`);
await until(`return !!document.querySelector('[data-gallery-index="0"]')`);
checks.search={empty:true,restored:true};
save(process.env.LABEL||'windowing-checks',checks);
