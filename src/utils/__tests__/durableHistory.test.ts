import {expect,it} from 'vitest';
import {convertHistoryToMessages} from '../agentHistoryConverter';
import type {MessageInfo} from '../../types/agent';
it('reopens the app-owned transcript without any provider session',()=>{
 const stored:MessageInfo[]=[
  {role:'user',content:[{type:'text',text:'Create a file'}],notes:['Switched to Codex']},
  {role:'assistant',content:[{type:'thinking',thinking:'Check the folder'},{type:'text',text:'Done'},{type:'tool_use',id:'write',name:'Edit',input:{file_path:'/tmp/task/note.md'}},{type:'tool_use',id:'file',name:'PresentFile',input:{file_path:'/tmp/task/note.md',file_name:'note.md'}},{type:'tool_use',id:'plan',name:'TodoWrite',input:{todos:[{content:'Write note',status:'completed'}]}}],end:{kind:'stopped'}},
  {role:'user',content:[{type:'tool_result',tool_use_id:'write',content:'Wrote note',is_error:false},{type:'tool_result',tool_use_id:'file',content:'/tmp/task/note.md',is_error:false},{type:'tool_result',tool_use_id:'plan',content:'Plan updated',is_error:false}]}
 ];
 const history=convertHistoryToMessages(JSON.parse(JSON.stringify(stored)));
 expect(history[0].notes).toContain('Switched to Codex');
 expect(history[1].blocks.map(b=>b.type)).toEqual(['thinking','text','tool','tool','tool']);
 expect(history[1].blocks[0]).toMatchObject({content:'Check the folder'});
 expect(history[1].blocks[2]).toMatchObject({call:{result:{output:'Wrote note'}}});
 expect(history[1].end).toEqual({kind:'stopped'});
});
