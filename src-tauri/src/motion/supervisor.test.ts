import {describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const alive=(pid:number)=>{try{process.kill(pid,0);return true}catch{return false}};
describe('Motion process ownership',()=>{
 it.each(['SIGTERM','SIGKILL'] as const)('reaps its CLI when the owner receives %s',async signal=>{
  const supervisor=fileURLToPath(new URL('./supervisor.mjs',import.meta.url));
  const owner=spawn(process.execPath,['-e',`const{spawn}=require('node:child_process');const s=spawn(process.execPath,[${JSON.stringify(supervisor)},String(process.pid),'-e','console.log(process.pid);setInterval(()=>{},1000)'],{stdio:['ignore','pipe','inherit'],detached:true});console.log(s.pid);s.stdout.pipe(process.stdout);setInterval(()=>{},1000)`],{stdio:['ignore','pipe','pipe']});
  let output='';owner.stdout!.on('data',b=>output+=b);
  let ids:number[]=[];
  try {for(let n=0;n<40;n++){ids=output.trim().split('\n').filter(Boolean).map(Number);if(ids.length===2)break;await sleep(50)}expect(ids).toHaveLength(2);expect(alive(ids[1])).toBe(true);owner.kill(signal);for(let n=0;n<80&&ids.some(alive);n++)await sleep(50);expect(ids.map(alive)).toEqual([false,false]);}
  finally{owner.kill('SIGKILL');for(const pid of ids)if(alive(pid))process.kill(pid,'SIGKILL')}
 },10000);
});
