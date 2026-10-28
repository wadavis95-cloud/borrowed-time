// Local capture utility only; not included in the game/Docker/static allowlist.
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const outputs=new Set(['cover.png','showcase.webm','showcase.mp4']);
const server=http.createServer(async(req,res)=>{
  if(req.url==='/__review'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(new URL('review.html',import.meta.url)));return;}
  if(req.url==='/__capture'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(new URL('capture.html',import.meta.url)));return;
  }
  if(req.method==='GET'&&req.url.startsWith('/__output/')){
    const name=req.url.slice('/__output/'.length);if(!outputs.has(name)){res.writeHead(404);res.end();return;}
    const data=await readFile(path.join(root,'artifacts/submission',name));res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':name.endsWith('.mp4')?'video/mp4':'video/webm'});res.end(data);return;
  }
  if(req.method==='POST'&&req.url.startsWith('/__save/')){
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);res.end();return;}
    const name=req.url.slice('/__save/'.length);
    if(!outputs.has(name)){res.writeHead(400);res.end();return;}
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>100*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    await mkdir(path.join(root,'artifacts/submission'),{recursive:true});
    await writeFile(path.join(root,'artifacts/submission',name),Buffer.concat(chunks));res.end('Saved '+name);return;
  }
  const target=http.request({hostname:'127.0.0.1',port:4173,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  target.on('error',()=>{res.writeHead(502);res.end('Start the local game with npm start first.');});req.pipe(target);
});
server.on('upgrade',(req,socket,head)=>{
  const target=http.request({hostname:'127.0.0.1',port:4173,path:req.url,headers:req.headers});
  target.on('upgrade',(response,upstream,upstreamHead)=>{
    socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`+Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');
    if(head.length)upstream.write(head);if(upstreamHead.length)socket.write(upstreamHead);
    upstream.pipe(socket);socket.pipe(upstream);socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());
  });target.on('error',()=>socket.destroy());target.end();
});
server.listen(9879,'127.0.0.1',()=>console.log('Capture preview: http://localhost:9879/__capture'));
