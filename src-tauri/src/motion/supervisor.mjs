// Kept alive independently of the app so a hard app crash still reaps Chrome.
import {spawn, spawnSync} from 'node:child_process';
const [owner, ...args] = process.argv.slice(2);
const child = spawn(process.execPath, args, {stdio:'inherit',detached:true,env:process.env});
const descendants = new Set();
let stopping = false;
function scan() {
  const result=spawnSync('/bin/ps',['-axo','pid=,ppid='],{encoding:'utf8'});
  const rows=(result.stdout||'').trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number));
  const live=new Set(rows.map(([pid])=>pid));
  for(const pid of descendants) if(!live.has(pid)) descendants.delete(pid);
  const parents=new Set([process.pid, child.pid, ...descendants]);
  let changed=true;
  while(changed){changed=false;for(const [pid,ppid] of rows)if(parents.has(ppid)&&!parents.has(pid)){parents.add(pid);descendants.add(pid);changed=true}}
}
function signal(pid, sig){try{process.kill(pid,sig)}catch{}}
function stop(code=0){
  if(stopping)return; stopping=true;clearInterval(timer);scan();
  signal(-child.pid,'SIGTERM');for(const pid of descendants)signal(pid,'SIGTERM');
  setTimeout(()=>{signal(-child.pid,'SIGKILL');for(const pid of descendants)signal(pid,'SIGKILL');process.exit(code)},1000);
}
const timer=setInterval(()=>{scan();try{process.kill(Number(owner),0)}catch{stop()}},200);
child.on('exit',code=>stop(code??1));child.on('error',e=>{console.error(e.message);stop(1)});
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
