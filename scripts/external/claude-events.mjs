/** Pure SDK transcript normalization. No process, credentials or configuration access. */
export class ClaudeEvents {
 constructor(turn,cwd){this.turn=turn;this.cwd=cwd;this.items=new Map();this.index=0;this.text='';}
 apply(m){const out=[];const emit=(method,params)=>out.push({method,params});
 if(m.type==='stream_event'){
  const e=m.event;
  if(e.type==='content_block_start'){this.textId=`${this.turn}-text-${++this.index}`;this.text='';}
  if(e.type==='content_block_delta'&&e.delta.type==='text_delta'){this.text+=e.delta.text;emit('item/agentMessage/delta',{itemId:this.textId,delta:e.delta.text});}
  if(e.type==='content_block_delta'&&e.delta.type==='thinking_delta')emit('item/reasoning/textDelta',{itemId:this.textId,delta:e.delta.thinking});
  if(e.type==='content_block_stop'){if(this.text)emit('item/completed',{item:{type:'agentMessage',id:this.textId,text:this.text}});else emit('item/completed',{item:{type:'reasoning',id:this.textId}});this.text='';}
 }
 if(m.type==='assistant')for(const b of m.message.content??[]){
  if(b.type!=='tool_use')continue;
  const item=['Write','Edit','MultiEdit'].includes(b.name)?{id:b.id,type:'fileChange',changes:[{path:b.input.file_path,kind:{type:b.name==='Write'?'add':'update'},diff:b.input.content??b.input.new_string??''}],status:'inProgress'}:b.name==='Bash'?{id:b.id,type:'commandExecution',command:b.input.command,cwd:this.cwd,status:'inProgress'}:{id:b.id,type:'mcpToolCall',server:'claude',tool:b.name,arguments:b.input,status:'inProgress'};
  this.items.set(b.id,item);emit('item/started',{item});
  if(b.name==='TodoWrite')emit('turn/plan/updated',{plan:(b.input.todos??[]).map(t=>({step:t.content,status:t.status==='in_progress'?'inProgress':t.status}))});
 }
 if(m.type==='user')for(const b of m.message.content??[]){if(b.type!=='tool_result')continue;const item=this.items.get(b.tool_use_id);if(item){emit('item/completed',{item:{...item,status:b.is_error?'failed':'completed',aggregatedOutput:typeof b.content==='string'?b.content:JSON.stringify(b.content)}});this.items.delete(b.tool_use_id);}}
 if(m.type==='rate_limit_event')emit('native/limits',m.rate_limit_info);
 if(m.type==='assistant'&&m.error==='rate_limit')emit('native/limitReached',{code:'usage_limit_reached'});
 if(m.type==='result'&&m.modelUsage&&Object.keys(m.modelUsage).length)emit('native/modelUsage',Object.fromEntries(Object.entries(m.modelUsage).map(([k,v])=>[k,Object.fromEntries(['inputTokens','outputTokens','cacheReadInputTokens','cacheCreationInputTokens'].map(f=>[f,v[f]??0]))])));
 if(m.type==='result'&&m.modelUsage&&Object.keys(m.modelUsage).length&&this.usageBaseline)emit('native/usage',modelUsageDelta(m.modelUsage,this.usageBaseline));
 else if(m.type==='result'&&m.usage)emit('native/usage',{...m.usage,scope:'main'});
 if(m.type==='result')emit('turn/completed',{turn:{id:this.turn,status:m.terminal_reason==='aborted_streaming'?'interrupted':m.is_error?'failed':'completed',error:m.is_error&&m.terminal_reason!=='aborted_streaming'?{message:(m.errors??['Claude Code could not finish this turn.']).join('\n')}:null}});
 return out;
 }
}
export function permissionResult(response,input){return ['accept','acceptForSession'].includes(response.decision)?{behavior:'allow',updatedInput:input}:{behavior:'deny',message:'Declined by the user.'};}

/** Native resume overrides model/effort for the next turn, without a new session. */
export function nativeOptions(settings, executable, session, canUseTool) {
 return {cwd:settings.cwd,pathToClaudeCodeExecutable:executable,settingSources:['user','project','local'],systemPrompt:{type:'preset',preset:'claude_code'},includePartialMessages:true,permissionMode:settings.approvalPolicy==='untrusted'?'default':settings.approvalPolicy==='never'?'bypassPermissions':'acceptEdits',...(settings.model?{model:settings.model}:{}),...(settings.effort?{effort:settings.effort}:{}),...(session?{resume:session}:{}),canUseTool};
}

// SDK modelUsage includes helper/compaction calls and resumes cumulative counters.
export function modelUsageDelta(current, baseline) {
 const out={input_tokens:0,output_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0,scope:'all'};
 for(const [model,usage] of Object.entries(current)){const previous=baseline[model]??{};const reset=Object.keys(usage).some(k=>typeof usage[k]==='number'&&usage[k]<(previous[k]??0));for(const [native,wire] of [['inputTokens','input_tokens'],['outputTokens','output_tokens'],['cacheReadInputTokens','cache_read_input_tokens'],['cacheCreationInputTokens','cache_creation_input_tokens']])out[wire]+=Math.max(0,(usage[native]??0)-(reset?0:previous[native]??0));}
 return out;
}

export function missingSessionError(message){return String(message).toLowerCase().includes('no conversation found with session id:');}
