import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createGameServer,createAssetServer} from '../src/server/app.js';
const networkTest=process.env.RUN_NETWORK_TESTS==='1'?test:test.skip;
const listen=async app=>{app.server.listen(0,'127.0.0.1');await once(app.server,'listening');return `http://127.0.0.1:${app.server.address().port}`;};
networkTest('split roles serve game assets separately with narrowly allowed race/telemetry origins',async t=>{
 const allowed='http://game.example',race=createGameServer({raceOnly:true,allowedOrigins:[allowed],monitorToken:'x'.repeat(43)});t.after(()=>race.close());const origin=await listen(race);
 const assets=createAssetServer({raceOrigin:origin});t.after(()=>assets.close());const front=await listen(assets);
 assert.equal((await fetch(front+'/assets/maps/tunnel.svg')).status,200);
 assert.match(await(await fetch(front+'/runtime-config.js')).text(),new RegExp(origin));
 assert.equal((await fetch(front+'/ops/metrics')).status,404);
 assert.equal((await fetch(origin+'/assets/maps/tunnel.svg')).status,404);
 assert.equal((await fetch(origin+'/')).status,404);
 assert.equal((await fetch(origin+'/monitor')).status,200);
 const config=await fetch(origin+'/ops/config',{headers:{Origin:allowed}});assert.equal(config.headers.get('access-control-allow-origin'),allowed);
 const denied=await fetch(origin+'/ops/config',{headers:{Origin:'http://evil.example'}});assert.equal(denied.status,403);
 const accepted=await fetch(origin+'/ops/client',{method:'POST',headers:{Origin:allowed,'Content-Type':'application/json'},body:JSON.stringify({scheduleLag:[1,0,0,0,0,0,0,0]})});assert.equal(accepted.status,204);
 const preflight=await fetch(origin+'/ops/client',{method:'OPTIONS',headers:{Origin:allowed,'Access-Control-Request-Method':'POST'}});assert.equal(preflight.status,204);
 const ws=new WebSocket(origin.replace('http:','ws:')+'/race',{origin:allowed});t.after(()=>ws.terminate());await once(ws,'open');
 const bad=new WebSocket(origin.replace('http:','ws:')+'/race',{origin:'http://evil.example'});await assert.rejects(once(bad,'open'),/403/);
 assert.equal((await fetch(front+'/.local/render-monitor-key.txt')).status,404);
});

networkTest('standalone export contains only public files and configured runtime origin',async t=>{
 const {mkdtemp,readFile,readdir,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'bt-static-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {exportStatic}=await import('../scripts/export-static.mjs');const result=await exportStatic({raceOrigin:'http://race.example',outdir:dir});
 assert.ok(result.publicFiles>70);assert.match(await readFile(join(dir,'index.html'),'utf8'),/runtime-config.js/);
 assert.match(await readFile(join(dir,'runtime-config.js'),'utf8'),/http:\/\/race.example/);
 for(const name of ['.local','server.js','src/server/app.js','package.json','.git','monitor/index.html'])await assert.rejects(readFile(join(dir,name)),/ENOENT|EISDIR/);
});
networkTest('malformed absolute request targets return 400 without crashing either process',async()=>{
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 for(const factory of ['createGameServer()','createAssetServer({raceOrigin:"http://race.example"})']){
  const code=`import{createGameServer,createAssetServer}from './src/server/app.js';import{connect}from'node:net';import{once}from'node:events';const app=${factory};app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const s=connect(app.server.address().port,'127.0.0.1');await once(s,'connect');let data='';s.on('data',d=>data+=d);s.end('GET http://[ HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n');await once(s,'close');await app.close();console.log(data.split('\\r\\n')[0]);`;
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{timeout:5000});assert.match(stdout,/400/);
 }
});

networkTest('race-only front door redirects to configured static origin without serving assets',async t=>{
 const app=createGameServer({raceOnly:true,frontendOrigin:'https://play.example'});t.after(()=>app.close());const origin=await listen(app);
 const response=await fetch(origin+'/',{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://play.example/');assert.equal(response.headers.get('cache-control'),'no-store');
});
