import {describe,it,expect} from 'vitest';
// @ts-expect-error JS sidecar module
import {permitted} from './guard.mjs';
describe('Motion loopback guard',()=>{
 it.each(['127.0.0.1:1234','localhost:1234'])('allows internal navigation to %s',host=>expect(permitted({host},1234)).toBe(true));
 it.each(['attacker.test:1234','127.0.0.1:9999','localhost','127.0.0.1:1234.attacker.test'])('refuses Host %s',host=>expect(permitted({host},1234)).toBe(false));
 it.each(['https://attacker.test','null','http://localhost:1234'])('refuses foreign origin %s',origin=>expect(permitted({host:'127.0.0.1:1234',origin},1234)).toBe(false));
 it.each(['cross-site','same-site','invalid'])('refuses fetch site %s for any method',site=>expect(permitted({host:'127.0.0.1:1234','sec-fetch-site':site},1234)).toBe(false));
 it.each(['same-origin','none'])('allows fetch site %s',site=>expect(permitted({host:'127.0.0.1:1234',origin:'http://127.0.0.1:1234','sec-fetch-site':site},1234)).toBe(true));
});

import {spawn} from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {beforeAll,afterAll} from 'vitest';
describe('single-listener HTTP boundary',()=>{
 let child:ReturnType<typeof spawn>,port:number;
 beforeAll(async()=>{child=spawn(process.execPath,[fileURLToPath(new URL('./guard-fixture.mjs',import.meta.url))],{stdio:['ignore','pipe','pipe']});port=await new Promise<number>((resolve,reject)=>{child.stdout!.once('data',b=>resolve(Number(String(b).trim())));child.once('error',reject)})});
 afterAll(()=>child.kill());
 const request=(headers:Record<string,string>,method='GET')=>new Promise<{status:number,headers:http.IncomingHttpHeaders}>((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port,method,headers},r=>{r.resume();resolve({status:r.statusCode!,headers:r.headers})});q.on('error',reject);q.end()});
 it('allows headless navigation and strips all CORS allow headers',async()=>{const r=await request({});expect(r.status).toBe(200);expect(r.headers['access-control-allow-origin']).toBeUndefined();expect(r.headers['access-control-allow-credentials']).toBeUndefined()});
 it.each(['GET','POST'])('refuses cross-site %s',async method=>expect((await request({'Sec-Fetch-Site':'cross-site'},method)).status).toBe(403));
 it('refuses foreign Origin',async()=>expect((await request({Origin:'https://evil.test'})).status).toBe(403));
 it('refuses rebinding Host',async()=>expect((await request({Host:'evil.test'})).status).toBe(403));
 it('refuses a foreign WebSocket upgrade',async()=>{const result=await new Promise<string>((resolve,reject)=>{const s=net.connect(port,'127.0.0.1',()=>s.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: https://evil.test\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`));s.once('data',b=>{resolve(String(b));s.destroy()});s.once('error',reject)});expect(result).toContain('403 Forbidden')});
});
