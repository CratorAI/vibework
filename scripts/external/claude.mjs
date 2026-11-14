// Claude Agent SDK 0.3.321; uses the installed CLI, never bundled CLI discovery.
import { ClaudeEvents, permissionResult, nativeOptions, missingSessionError } from './claude-events.mjs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
const event=(method,params)=>send({method,params});
let settings={}, session, turn, runtime, release, serial=1000, incoming=[], stopped=false, steered=false;
const steerRequests=new Map();
function offer(message){incoming.push(message);release?.();release=undefined;}
if(['--catalog','--usage'].includes(process.argv[3])){
 let unblock;async function* input(){await new Promise(r=>unblock=r);}
 const q=query({prompt:input(),options:{cwd:process.cwd(),pathToClaudeCodeExecutable:process.argv[2],settingSources:['user','project','local'],systemPrompt:{type:'preset',preset:'claude_code'},canUseTool:async()=>({behavior:'deny',message:'Catalog request only.'})}});
 try{if(process.argv[3]==='--usage'){const r=await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({skipBehaviors:true});send({subscription_type:r.subscription_type,rate_limits_available:r.rate_limits_available,rate_limits:r.rate_limits});}else send(await q.supportedModels());}catch{send({error:'Could not read agent metadata'});}finally{unblock?.();q.close();process.exit(0);}
}
const pending=new Map();

const ask=async(name,input,options)=>{
 const id=++serial;
 if(name==='AskUserQuestion') {
  event('item/started',{item:{id:options.toolUseID,type:'mcpToolCall',server:'claude',tool:name,arguments:input}});
  send({id,method:'item/tool/requestUserInput',params:{questions:(input.questions||[]).map((q,i)=>({...q,id:String(i)}))}});
  const result=await new Promise(resolve=>pending.set(id,resolve));
  const answers=Object.fromEntries((input.questions||[]).map((q,i)=>[q.question,(result.answers?.[String(i)]?.answers||[]).join(', ')]));
  return {behavior:'allow',updatedInput:{...input,answers}};
 }
 const file=['Write','Edit','MultiEdit'].includes(name);
 send({id,method:file?'item/fileChange/requestApproval':'item/commandExecution/requestApproval',params:{itemId:options.toolUseID,command:input.command??`${name}: ${input.file_path??''}`,reason:`Claude Code requests approval for ${name}.`,grantRoot:input.file_path}});
 const response=await new Promise(resolve=>pending.set(id,resolve));
 return permissionResult(response,input);
};
async function run(prompt){
 const normalizer=new ClaudeEvents(turn,settings.cwd);let finished=false, missing=false;
 const finish=(status,error)=>{if(finished)return;finished=true;event('turn/completed',{turn:{id:turn,status,error:error?{message:error}:null}});};
 incoming=[{type:'user',uuid:turn,session_id:session??'',parent_tool_use_id:null,message:{role:'user',content:prompt}}];stopped=false;steered=false;
 async function* input(){while(!stopped){if(!incoming.length)await new Promise(r=>release=r);while(incoming.length)yield incoming.shift();}}
 try {
 runtime=query({prompt:input(),options:nativeOptions(settings,process.argv[2],session,ask)});
 normalizer.usageBaseline=session ? settings.usageBaseline ?? null : {};
 for await(const m of runtime){
  if(session&&m.type==='result'&&m.is_error&&(m.errors??[]).some(e=>missingSessionError(e))){missing=true;finished=true;break;}
  const accepted=m.type==='command_lifecycle'?(m.state==='started'?[m.command_uuid]:[]):m.user_message_uuids??(m.user_message_uuid?[m.user_message_uuid]:[]);
  for(const uuid of accepted){const id=steerRequests.get(uuid);if(id!==undefined){send({id,result:{turnId:turn}});steerRequests.delete(uuid);}}
  if(m.type==='result'&&!stopped&&steered&&['aborted_streaming','aborted_tools'].includes(m.terminal_reason)){for(const e of normalizer.apply(m).filter(e=>e.method!=='turn/completed'))send(e);continue;}

  if(m.session_id&&m.session_id!==session){session=m.session_id;event('thread/native',{id:session});}
  if(m.type==='system'&&m.subtype==='init')event('turn/started',{turn:{id:turn}});
  for(const e of normalizer.apply(m))send(e);
  if(m.type==='result'){finished=true;break;}
 }
 if(!finished)finish('failed','Claude Code closed before completing the turn.');
 }catch(e){if(session&&missingSessionError(e)){missing=true;finished=true;}else finish('failed',String(e));}finally{stopped=true;release?.();runtime?.close();runtime=undefined;for(const id of steerRequests.values())send({id,error:{message:'Claude did not confirm reading the message.'}});steerRequests.clear();if(missing)event('native/sessionMissing',{});}
}
createInterface({input:process.stdin}).on('line',async line=>{
 try{const m=JSON.parse(line);if(!m.method){pending.get(m.id)?.(m.result??{decision:'decline'});pending.delete(m.id);return;}
 switch(m.method){
 case 'initialize':send({id:m.id,result:{}});break;
 case 'initialized':break;
 case 'thread/start':case 'thread/resume':settings=m.params;session=m.params.threadId;send({id:m.id,result:{thread:{id:session??'pending'}}});break;
 case 'turn/start':settings={...settings,model:m.params.model,effort:m.params.effort};turn=randomUUID();send({id:m.id,result:{turn:{id:turn}}});void run(m.params.input.map(x=>x.text??'').join('\n'));break;
 case 'turn/steer':{if(!runtime||stopped||m.params.expectedTurnId!==turn){send({id:m.id,error:{message:'Turn is no longer active'}});break;}const uuid=randomUUID();steered=true;steerRequests.set(uuid,m.id);offer({type:'user',uuid,priority:'now',session_id:session??'',parent_tool_use_id:null,message:{role:'user',content:m.params.input.map(x=>x.text??'').join('\n')}});break;}
 case 'turn/interrupt':stopped=true;await runtime?.interrupt();send({id:m.id,result:{}});break;
 default:send({id:m.id,error:{code:-32601,message:'Unsupported request'}});
 }}catch(e){send({method:'error',params:{message:String(e)}});}
});
process.stdin.on('end',()=>{release?.();runtime?.close();process.exit(0);});
