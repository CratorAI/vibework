import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

it('pins fresh and continued helpers to the parent model and strips background without exposing credentials', () => {
  const url = pathToFileURL(path.resolve('src-tauri/src/engine/plugin/server.js')).href;
  const script = `
    import plugin from ${JSON.stringify(url)};
    const hooks = new Map();
    const hook = area => async (name, fn) => { const k=area+name; hooks.set(k,[...(hooks.get(k)||[]),fn]); };
    await plugin.setup({options:{},shell:{hook:hook('shell')},tool:{hook:hook('tool')},permission:{hook:hook('permission')},session:{hook:hook('session')}});
    const run = async (key,event) => { for(const fn of hooks.get(key)||[]) await fn(event); return event; };
    await run('sessionmodel.request',{kind:'primary',sessionID:'p',model:{providerID:'openrouter',id:'chosen',variant:'v'}});
    const first=await run('toolexecute.before',{tool:'subagent',sessionID:'p',input:{agent:'general',background:true,model:'other/expensive',sessionID:'existing'}});
    await run('sessionmodel.request',{kind:'primary',sessionID:'p',model:{providerID:'openrouter',id:'new-choice',variant:'default'}});
    const second=await run('toolexecute.before',{tool:'subagent',sessionID:'p',input:{agent:'general',sessionID:'existing'}});
    const shell=await run('shellcreate.before',{env:{OPENROUTER_API_KEY:'test',VIBEWORK_CAPABILITY:'test',OPENCODE_SERVER_PASSWORD:'test',VIBEWORK_SCRATCH:'/scratch'}});
    console.log(JSON.stringify({first:first.input,second:second.input,shell:shell.env}));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module','-e',script], {input:'{}',encoding:'utf8'});
  expect(result.status, result.stderr).toBe(0);
  const value=JSON.parse(result.stdout);
  expect(value.first).toEqual({agent:'general',model:'openrouter/chosen#v',sessionID:'existing'});
  expect(value.second.model).toBe('openrouter/new-choice');
  expect(value.shell).toEqual({VIBEWORK_SCRATCH:'/scratch'});
});
