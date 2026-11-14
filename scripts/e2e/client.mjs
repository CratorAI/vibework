import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const bridgePath=process.env.VIBEWORK_BRIDGE_FILE || `${process.env.VIBEWORK_DEV_DATA_DIR || `${os.homedir()}/Library/Application Support/com.vibeworkapp.vibework`}/dev-bridge.json`;
export function request(op, code, extra={}) {
 const {port,token}=JSON.parse(fs.readFileSync(bridgePath,'utf8'));
 return new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1',()=>socket.write(JSON.stringify({token,op,code,...extra})+'\n'));let data='';socket.setTimeout(35000,()=>socket.destroy(new Error('timeout')));socket.on('data',chunk=>{data+=chunk;if(data.includes('\n')){socket.end();const r=JSON.parse(data);r.ok===false?reject(new Error(r.error)):resolve(r);}});socket.on('error',reject);});
}
export const evaluate=async code=>(await request('eval',code)).value;
/** Drop files on the main window as if from Finder (they become attachments). */
export const dropFiles=paths=>request('drop',undefined,{paths});
export const text=()=>evaluate('return document.body.innerText');
export async function waitFor(selector,timeout=10000){const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(`return !!document.querySelector(${JSON.stringify(selector)})`))return;await new Promise(r=>setTimeout(r,150));}throw Error(`Missing ${selector}`);}
export async function waitText(value,timeout=10000){const until=Date.now()+timeout;while(Date.now()<until){if((await text()).includes(value))return;await new Promise(r=>setTimeout(r,150));}throw Error(`Missing text: ${value}`);}
export const click=selector=>evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Element missing');e.click();`);
export const clickText=text=>evaluate(`const e=[...document.querySelectorAll('button,[role="tab"],[role="menuitem"]')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Button missing');e.click();`);
export const type=(selector,value)=>evaluate(`const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Input missing');e.focus();if(e.isContentEditable){document.execCommand('insertText',false,${JSON.stringify(value)});}else{e.select();document.execCommand('insertText',false,${JSON.stringify(value)});}`);
export const errors=()=>evaluate(`return {console:window.__e2eErrors||[],toasts:[...document.querySelectorAll('[role="alert"],[data-sonner-toast]')].map(e=>e.textContent)}`);
export const collectErrors=()=>evaluate(`if(!window.__e2eErrors){window.__e2eErrors=[];const record=(...args)=>window.__e2eErrors.push(args.map(String).join(' '));for(const level of ['error','warn']){const original=console[level];console[level]=(...args)=>{record(level,...args);original.apply(console,args)}}addEventListener('error',e=>record(e.message));addEventListener('unhandledrejection',e=>record(e.reason));}`);
export function capture(name){
 if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw Error('Invalid capture name');
 return execFileSync('/usr/sbin/screencapture',['-x',`/tmp/vibework-e2e/${name}.png`],{stdio:'pipe'});
}
if(process.argv[1]===new URL(import.meta.url).pathname){console.log(JSON.stringify(await (['state','quit'].includes(process.argv[2])?request(process.argv[2]):evaluate(process.argv.slice(2).join(' '))),null,2));}
