#!/usr/bin/env bun
// Hidden optimized probe. No rendering/FPS claims. Leaves lifecycle to app.mjs.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {evaluate,invoke,tracked,save,sleep,OUT} from './lib.mjs';
const label=process.env.LABEL||'throughput';const ids=tracked();
if(!ids.app||!ids.web)throw Error('Start the isolated release probe first');
const sessions=[];for(let i=0;i<3;i++){const sessionId=crypto.randomUUID();sessions.push(sessionId);await invoke('agent_create_session',{sessionId,name:'Throughput fixture',workingFolder:fs.realpathSync(`${OUT}/work`),model:'openai/gpt-4o-mini',permissionMode:'auto'});}
const how=await evaluate('return {visibility:document.visibilityState,focus:document.hasFocus()}');
await evaluate(`const I=window.__TAURI_INTERNALS__;const ids=new Set(${JSON.stringify(sessions)});window.__tp={n:0,bytes:0,done:[],started:performance.now(),first:null,last:null,subscriptions:[]};for(const event of ['agent:text-delta','agent:done']){const callback=I.transformCallback(e=>{if(!ids.has(e.payload.sessionId))return;const p=window.__tp;const now=performance.now();if(event==='agent:done'){if(!p.done.includes(e.payload.sessionId))p.done.push(e.payload.sessionId);if(p.done.length===3)p.ended=now;}else{p.n++;p.bytes+=new TextEncoder().encode(JSON.stringify(e.payload)).length;p.first??=now;p.last=now;}});const eventId=await I.invoke('plugin:event|listen',{event,target:{kind:'Any'},handler:callback});window.__tp.subscriptions.push({event,eventId,callback})}return true;`);
const logBefore=fs.statSync(`${OUT}/model.jsonl`).size;const cpu=[];
try{
 for(const sessionId of sessions)await invoke('agent_send_message',{sessionId,message:'STREAM 1800 60'});
 const begin=Date.now();while(Date.now()-begin<30000){const raw=execFileSync('ps',['-o','pid=,%cpu=','-p',`${ids.app},${ids.web}`],{encoding:'utf8'});cpu.push({atMs:Date.now()-begin,processes:raw.trim().split('\n').map(l=>{const [pid,cpu]=l.trim().split(/\s+/).map(Number);return {pid,cpu}})});await sleep(1000)}
 const end=Date.now()+15000;let events;do{events=await evaluate('const {subscriptions,...data}=window.__tp;return data');if(events.done.length===3)break;await sleep(250)}while(Date.now()<end);
 if(events.n===0||events.done.length!==3||fs.statSync(`${OUT}/model.jsonl`).size<=logBefore)throw Error('Invalid sample: missing fake traffic, stream events or completed turns');
 const elapsed=(events.ended-events.started)/1000;const mean=pid=>cpu.flatMap(s=>s.processes.filter(p=>p.pid===pid).map(p=>p.cpu)).reduce((a,b)=>a+b,0)/cpu.length;
 const output={how,elapsedSeconds:elapsed,events:events.n,utf8Bytes:events.bytes,eventsPerSecond:events.n/elapsed,bytesPerEvent:events.bytes/events.n,meanRustCPU:mean(ids.app),meanWebCPU:mean(ids.web),samples:cpu,done:events.done.length};save(label,output);
}finally{await evaluate(`const I=window.__TAURI_INTERNALS__;for(const e of window.__tp.subscriptions){await I.invoke('plugin:event|unlisten',{event:e.event,eventId:e.eventId});I.unregisterCallback?.(e.callback)}return true;`);}
