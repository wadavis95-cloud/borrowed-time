import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createMonitoring,validReport} from '../src/server/monitoring.js';
import {createTelemetry,makeReport,addObservation} from '../src/telemetry.js';
import {createGameServer} from '../src/server/app.js';
const key='k'.repeat(40),net=process.env.RUN_NETWORK_TESTS==='1'?test:test.skip;
test('monitor aggregation is bounded, expires client observations, and validates fixed schema',()=>{
 let now=1000;const m=createMonitoring({token:key,now:()=>now,autoStart:false,state:()=>({sockets:4})});
 m.count('bytesOut',1000);now+=1000;const point=m.sample();assert.equal(point.bytesOutPerSec,1000);assert.equal(point.sockets,4);
 for(let i=0;i<200;i++){now+=1000;m.sample();}assert.equal(m.snapshot().history.length,180);m.dispose();
 for(const r of [null,[],{name:'Captain'},{map:'injected'},{frame:[1]},{frame:[-1,0,0,0,0,0,0,0]},{errors:Infinity},{errors:'2'}])assert.equal(validReport(r),false);
 assert.equal(validReport({...makeReport(),map:'tunnel',inputMode:'touch',mode:'solo'}),true);
});
test('browser diagnostics do not retry failures, retain identifiers, or measure hidden frames',async()=>{
 const calls=[];let visible=true;
 const telemetry=createTelemetry({visible:()=>visible,request:async(url,options)=>{calls.push([url,options]);if(url==='/ops/config')return {ok:true,json:async()=>({enabled:true})};throw new Error('offline');}});
 await telemetry.init();telemetry.context('pirate','touch','solo');await new Promise(r=>setImmediate(r));
 telemetry.frame(60);visible=false;telemetry.frame(90);visible=true;telemetry.observe('rtt',42);telemetry.count('errors');await telemetry.flush();
 const report=JSON.parse(calls.at(-1)[1].body);assert.equal(report.frames,1);assert.equal(report.slowFrames,1);assert.equal(report.rtt[2],1);assert.equal(report.errors,1);assert.equal(report.map,'pirate');
 assert.ok(!Object.keys(report).some(key=>['name','id','url','stack'].includes(key)));
 const r=makeReport();addObservation(r,'frame',NaN);assert.equal(r.frame.reduce((a,b)=>a+b),0);
});
async function start(t,token=key,now=Date.now){const app=createGameServer({monitorToken:token,now});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());return {app,origin:`http://127.0.0.1:${app.server.address().port}`};}
net('monitor metrics require a key, stay disabled without one, and exclude dashboard polling bytes',async t=>{
 const {app,origin}=await start(t);
 assert.equal((await fetch(origin+'/ops/metrics')).status,401);
 assert.equal((await fetch(origin+'/ops/metrics',{headers:{Authorization:'Bearer wrong'}})).status,401);
 const page=await fetch(origin+'/');await page.arrayBuffer();const bytes=Number(page.headers.get('content-length'));
 const asset=await fetch(origin+'/assets/maps/tunnel.svg');await asset.arrayBuffer();const assetBytes=Number(asset.headers.get('content-length'));
 await new Promise(r=>setImmediate(r));app.monitor.sample();
 const metrics=await (await fetch(origin+'/ops/metrics',{headers:{Authorization:'Bearer '+key}})).json();
 assert.ok(!JSON.stringify(metrics).includes(key));assert.equal(metrics.totals.pageBytes,bytes);assert.equal(metrics.totals.assetBytes,assetBytes);assert.equal(metrics.totals.httpRequests,2);
 assert.equal((await fetch(origin+'/monitor')).status,200);assert.equal(app.monitor.snapshot().totals.httpRequests,2);
 const disabled=await start(t,'');assert.equal((await fetch(disabled.origin+'/ops/metrics')).status,503);assert.deepEqual(await (await fetch(disabled.origin+'/ops/config')).json(),{enabled:false});
});
net('telemetry rejects cross-origin, oversized and identifying payloads and expires aggregate reports',async t=>{
 let now=1000;const {app,origin}=await start(t,key,()=>now);const send=(body,extra={})=>fetch(origin+'/ops/client',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 assert.equal((await send(makeReport(),{Origin:'https://other.example'})).status,403);
 assert.equal((await send({name:'Secret runner'})).status,400);
 assert.equal((await send({errors:1,padding:'x'.repeat(3000)})).status,413);
 const report=makeReport();report.frame[1]=30;report.rtt[7]=4;report.frames=30;report.map='frozen';report.inputMode='touch';report.mode='solo';assert.equal((await send(report)).status,204);
 const client=app.monitor.snapshot().client;assert.equal(client.reports,1);assert.equal(client.frame.p95UpperMs,16.8);assert.equal(client.rtt.p95UpperMs,null);assert.equal(client.rtt.p95OverMs,1000);assert.equal(client.byMap[0].name,'frozen');assert.equal(client.byInput[0].name,'touch');now+=121000;assert.equal(app.monitor.snapshot().client.reports,0);
});
net('echo probes are rate-bounded ordinary messages and input acknowledgment is private to the player',async t=>{
 const {app,origin}=await start(t);const ws=new WebSocket(origin.replace('http','ws')+'/race',{origin});const messages=[];ws.on('message',data=>messages.push(JSON.parse(data)));await once(ws,'open');
 const wait=async pred=>{for(let i=0;i<100;i++){const m=messages.find(pred);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw new Error('Missing message');};
 t.after(()=>ws.terminate());await wait(m=>m.type==='connected');ws.send(JSON.stringify({type:'probe',at:123.5}));assert.equal((await wait(m=>m.type==='probe')).at,123.5);
 ws.send(JSON.stringify({type:'create',mapId:'tunnel'}));const snapshot=await wait(m=>m.type==='snapshot');assert.equal(snapshot.you.inputSeq,0);assert.ok(snapshot.players.every(p=>!('inputSeq'in p)));
 assert.ok(app.monitor.snapshot().totals.bytesOut>0);
});
