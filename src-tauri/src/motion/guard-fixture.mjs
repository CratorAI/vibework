import http from 'node:http';
import {installGuard} from './guard.mjs';
installGuard(port=>console.log(port));
const s=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.writeHead(200,['Access-Control-Allow-Credentials','true','Content-Type','text/plain']);res.end('composition')});
s.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 101 Switching Protocols\r\n\r\n'));
s.listen(1234,'0.0.0.0');
