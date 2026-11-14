#!/usr/bin/env bun
// First open the large worksheet with: bun scripts/perf/windowing.mjs xls
import {evaluate,sleep,save} from './lib.mjs';
const until=async(code)=>{for(let i=0;i<200;i++){const v=await evaluate(code);if(v)return v;await sleep(50)}throw Error(code)};
const state=()=>evaluate(`const t=document.querySelector('table[aria-label="Large"]'),r=t.parentElement;return {columns:[...t.tHead.rows[0].cells].map(c=>c.getBoundingClientRect().width),height:t.getBoundingClientRect().height,nodes:t.querySelectorAll('*').length,rows:[...t.tBodies[0].rows].filter(x=>x.hasAttribute('aria-rowindex')).map(x=>Number(x.getAttribute('aria-rowindex'))),headerTop:t.tHead.rows[0].cells[1].getBoundingClientRect().top,rootTop:r.getBoundingClientRect().top,left:t.tBodies[0].querySelector('th').getBoundingClientRect().left,rootLeft:r.getBoundingClientRect().left,scrollLeft:r.scrollLeft,scrollTop:r.scrollTop}`);
const result={how:'background DOM geometry and native text selection; no painted frames'};
result.start=await state();
await evaluate(`const t=document.querySelector('table[aria-label="Large"]'),r=t.parentElement;r.scrollTop=r.scrollHeight;r.scrollLeft=1000;r.dispatchEvent(new Event('scroll',{bubbles:true}));return true`);
await until(`return !!document.querySelector('table[aria-label="Large"] [aria-rowindex="1001"]')`);
result.end=await state();
if(JSON.stringify(result.start.columns)!==JSON.stringify(result.end.columns)||result.start.height!==result.end.height)throw Error('Dimensions changed');
if(Math.abs(result.end.headerTop-result.end.rootTop)>1||Math.abs(result.end.left-result.end.rootLeft)>1)throw Error('Sticky header/row heading moved');
result.selection=await evaluate(`const row=document.querySelector('table[aria-label="Large"] [aria-rowindex="1001"]');const cells=[...row.querySelectorAll('td')].slice(18,22);const range=document.createRange();range.setStartBefore(cells[0]);range.setEndAfter(cells.at(-1));const sel=getSelection();sel.removeAllRanges();sel.addRange(range);const text=sel.toString();const expected=cells.map(c=>c.textContent);const enabled=document.queryCommandEnabled('copy');sel.removeAllRanges();return {text,expected,copyEnabled:enabled}`);
if(!result.selection.expected.every(x=>result.selection.text.includes(x)))throw Error('Selection text missing');
await evaluate(`document.querySelector('[aria-label=Worksheets] button').click();return true`);
await until(`return !!document.querySelector('table[aria-label="Overview"]:not([data-measuring])')`);
result.tabs=await evaluate(`return {overviewRows:document.querySelector('table[aria-label="Overview"]').tBodies[0].rows.length,footer:document.querySelector('[aria-label=Worksheets]').parentElement.querySelector('[role=status]').textContent}`);
await evaluate(`[...document.querySelectorAll('[aria-label=Worksheets] button')].find(x=>x.textContent==='Large').click();return true`);
await until(`return !!document.querySelector('table[aria-label="Large"]:not([data-measuring])')`);
result.return=await state();
save('xls-checks',result);
