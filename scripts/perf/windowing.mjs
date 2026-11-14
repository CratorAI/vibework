#!/usr/bin/env bun
// Run against an isolated background dev/probe started with app.mjs.
import fs from 'node:fs';
import {evaluate,invoke,sleep,save,tracked,memMB,OUT} from './lib.mjs';
const label=process.env.LABEL||'windowing';
const until=async(code)=>{for(let i=0;i<400;i++){const value=await evaluate(code);if(value)return value;await sleep(50)}throw Error('DOM timeout: '+code)};
const result={how:'background, unfocused; DOM/forced synchronous layout, not frame smoothness',state:await evaluate('return {visibility:document.visibilityState,focus:document.hasFocus()}')};
if(process.argv.includes('gallery')){
 if(process.env.PERF_PRIME_INDEX==='1'){const start=performance.now();const rows=await invoke('artifacts_index');result.primeIndex={ms:performance.now()-start,items:rows.length};}
 await evaluate(`window.__firstCards=null;const start=performance.now();const o=new MutationObserver(()=>{if(document.querySelector('[data-gallery-card]')){window.__firstCards={domMs:performance.now()-start};document.querySelector('[data-gallery-card]').getBoundingClientRect();window.__firstCards.layoutReadyMs=performance.now()-start;o.disconnect()}});o.observe(document.body,{childList:true,subtree:true});location.hash='#/artifacts';return true`);
 await until('return window.__firstCards');await sleep(1500);
 result.gallery=await evaluate(`const root=document.querySelector('section[aria-label="Artifacts gallery"]');const card=root.querySelector('[data-gallery-card]').closest('article');return {firstCardsMs:window.__firstCards,nodes:root.querySelectorAll('*').length,cards:root.querySelectorAll('[data-gallery-card]').length,card:{width:card.getBoundingClientRect().width,height:card.getBoundingClientRect().height},scrollHeight:root.scrollHeight,viewport:root.clientHeight}`);
 result.gallery.memoryMB=memMB(tracked().web);
 result.gallery.steps=[];
 for(const top of [1000,5000,12000,0]){await evaluate(`const root=document.querySelector('section[aria-label="Artifacts gallery"]');root.scrollTop=${top};root.dispatchEvent(new Event('scroll',{bubbles:true}));return true`);await sleep(100);result.gallery.steps.push(await evaluate(`const root=document.querySelector('section[aria-label="Artifacts gallery"]');performance.mark('gallery-layout-start');const grid=root.querySelector('[data-gallery-card]').closest('article').parentElement;grid.style.width='99.9%';const height=root.scrollHeight;const width=root.querySelector('article').getBoundingClientRect().width;performance.mark('gallery-layout-end');const layoutMs=performance.measure('gallery-layout','gallery-layout-start','gallery-layout-end').duration;grid.style.width='';return {top:root.scrollTop,layoutMs,height,width,nodes:root.querySelectorAll('*').length,cards:root.querySelectorAll('[data-gallery-card]').length}`));}
 await evaluate("location.hash='#/';return true");await sleep(300);
}
if(process.argv.includes('xls')){
 const id=fs.readFileSync(`${OUT}/big-session-id.txt`,'utf8').trim(),task=(await invoke('agent_list_sessions')).find(s=>s.sessionId===id),title=task.conversationName||task.name;
 await until("return !!document.querySelector('[data-testid=task-row]')");
 await evaluate(`const b=[...document.querySelectorAll('[data-testid=task-row] button[aria-label]')].find(e=>e.getAttribute('aria-label').startsWith(${JSON.stringify(title)}));b.click();return true`);
 await until(`return [...document.querySelectorAll('[data-testid=file-card]')].some(e=>e.textContent.includes('legacy-large.xls'))`);
 await evaluate(`const b=[...document.querySelectorAll('[data-testid=file-card]')].find(e=>e.textContent.includes('legacy-large.xls')).querySelector('button');b.click();return true`);
 await until(`return !!document.querySelector('[aria-label=Worksheets]')`);
 await evaluate(`window.__xlsReady=null;const start=performance.now();const o=new MutationObserver(()=>{const t=document.querySelector('table[aria-label="Large"]');if(t?.querySelector('tbody tr')&&!t.hasAttribute('data-measuring')){window.__xlsReady={domMs:performance.now()-start};t.getBoundingClientRect();window.__xlsReady.layoutReadyMs=performance.now()-start;o.disconnect()}});o.observe(document.body,{childList:true,subtree:true,attributes:true});[...document.querySelectorAll('[aria-label=Worksheets] button')].find(e=>e.textContent.includes('Large')).click();return true`);
 await until('return window.__xlsReady');
 result.xls=await evaluate(`const t=document.querySelector('table[aria-label="Large"]');window.__xlsScroll=t.parentElement;return {readyMs:window.__xlsReady,nodes:t.querySelectorAll('*').length,rows:t.tBodies[0].rows.length,height:t.getBoundingClientRect().height,width:t.getBoundingClientRect().width,columns:[...t.tHead.rows[0].cells].map(c=>c.getBoundingClientRect().width),rowHeight:t.tBodies[0].rows[0].getBoundingClientRect().height}`);
 result.xls.memoryMB=memMB(tracked().web);result.xls.steps=[];
 for(const top of [1000,10000,24000,0]){await evaluate(`const root=window.__xlsScroll;root.scrollTop=${top};root.dispatchEvent(new Event('scroll',{bubbles:true}));return true`);await sleep(100);result.xls.steps.push(await evaluate(`const root=window.__xlsScroll;const table=root.querySelector('table');performance.mark('xls-layout-start');table.style.borderSpacing='0.01px';const height=table.offsetHeight;performance.mark('xls-layout-end');const layoutMs=performance.measure('xls-layout','xls-layout-start','xls-layout-end').duration;table.style.borderSpacing='0';return {top:root.scrollTop,layoutMs,height,nodes:table.querySelectorAll('*').length,rows:table.tBodies[0].rows.length}`));}
}
save(label,result);
