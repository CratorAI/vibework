import {expect,it} from 'vitest';
import {applyStreamChunk} from '../agentEventHandler';
it('inserts steering between assistant segments and deduplicates delivery',()=>{
 let messages=applyStreamChunk([],{TextDelta:'Before'});
 messages=applyStreamChunk(messages,{UserMessage:{id:'steer',text:'Change direction'}});
 expect(messages.map(m=>m.role)).toEqual(['assistant','user']);
 expect(applyStreamChunk(messages,{UserMessage:{id:'steer',text:'Change direction'}})).toBe(messages);
 messages=applyStreamChunk(messages,{TextDelta:'After'});
 expect(messages.map(m=>m.role)).toEqual(['assistant','user','assistant']);
 expect(messages[0].blocks[0]).toMatchObject({content:'Before',isComplete:true});
 expect(messages[2].blocks[0]).toMatchObject({content:'After'});
});
it('completes a tool that started before steering without moving it',()=>{
 let messages=applyStreamChunk([],{ToolStart:{id:'tool',name:'Bash',input:{command:'pwd'}}});
 messages=applyStreamChunk(messages,{UserMessage:{id:'steer',text:'Then list files'}});
 messages=applyStreamChunk(messages,{ToolEnd:{id:'tool',result:{content:{Text:'done'},is_error:false}}});
 expect(messages).toHaveLength(2);
 expect(messages[0].blocks[0]).toMatchObject({type:'tool',call:{isExecuting:false}});
});
