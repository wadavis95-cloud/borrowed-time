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
 for(let i=0;i<2000;i++){now+=1000;m.sample();}const retained=m.snapshot();assert.ok(retained.history.length<=240);assert.ok(retained.history[0].at>=now-1800000);assert.ok(retained.history[0].at<now-1700000);assert.equal(retained.history.at(-1).at,now);assert.equal(retained.history.at(-11).at,now-10000);m.dispose();
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
 const client=app.monitor.snapshot().client;assert.equal(client.reports,1);assert.equal(client.frame.p95UpperMs,16.8);assert.equal(client.rtt.p95UpperMs,null);assert.equal(client.rtt.p95OverMs,1000);assert.equal(client.byMap[0].name,'frozen');assert.equal(client.byInput[0].name,'touch');now+=121000;assert.equal(app.monitor.snapshot().client.reports,1);now+=1619000;assert.equal(app.monitor.snapshot().client.reports,1);now+=60001;assert.equal(app.monitor.snapshot().client.reports,0);
});
net('echo probes are rate-bounded ordinary messages and input acknowledgment is private to the player',async t=>{
 const {app,origin}=await start(t);const ws=new WebSocket(origin.replace('http','ws')+'/race',{origin});const messages=[];ws.on('message',data=>messages.push(JSON.parse(data)));await once(ws,'open');
 const wait=async pred=>{for(let i=0;i<100;i++){const m=messages.find(pred);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw new Error('Missing message');};
 t.after(()=>ws.terminate());await wait(m=>m.type==='connected');ws.send(JSON.stringify({type:'probe',at:123.5}));assert.equal((await wait(m=>m.type==='probe')).at,123.5);
 ws.send(JSON.stringify({type:'create',mapId:'tunnel'}));const snapshot=await wait(m=>m.type==='snapshot');assert.equal(snapshot.you.inputSeq,0);assert.ok(snapshot.players.every(p=>!('inputSeq'in p)));
 assert.ok(app.monitor.snapshot().totals.bytesOut>0);
});

test('map-switch latency is bounded, separated by reuse, map and estimated device',async()=>{
 const report={...makeReport(),map:'pirate',inputMode:'touch',mode:'solo',device:'mobile'};
 assert.ok(Array.isArray(report.mapFirst));addObservation(report,'mapFirst',175);addObservation(report,'mapRepeat',35);assert.equal(validReport(report),true);
 const m=createMonitoring({token:key,autoStart:false});
 // Exercise the real ingestion route with a minimal stream request and response.
 const {PassThrough}=await import('node:stream');const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});
 let status;const res={writeHead(code){status=code;},end(){}};m.handle(req,res);req.end(JSON.stringify(report));await new Promise(r=>setImmediate(r));assert.equal(status,204);
 const c=m.snapshot().client;assert.equal(c.mapFirst.p95UpperMs,200);assert.equal(c.mapRepeat.p95UpperMs,50);assert.equal(c.byDevice[0].name,'mobile');assert.equal(c.byDevice[0].mapFirst.count,1);assert.equal(c.byMap[0].mapRepeat.count,1);
 assert.equal(validReport({...report,device:'iPhone 25'}),false);m.dispose();
});
test('device estimate stays independent of controls and never sends raw identifiers',async()=>{
 const {detectDevice}=await import('../src/telemetry.js');assert.equal(typeof detectDevice,'function');
 assert.equal(detectDevice({userAgent:'Mozilla iPhone'}),'mobile');assert.equal(detectDevice({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}),'mobile');assert.equal(detectDevice({userAgent:'Android',userAgentData:{mobile:false}}),'mobile');assert.equal(detectDevice({userAgent:'Windows NT'}),'desktop');assert.equal(detectDevice({userAgent:'unrecognized'}),'unknown');
 const sent=[];const telemetry=createTelemetry({device:'mobile',request:async(url,options)=>{if(options?.body)sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({enabled:true})};}});
 await telemetry.init();telemetry.context('tunnel','keyboard','solo');telemetry.observe('mapFirst',80);await telemetry.flush();assert.equal(sent.at(-1).device,'mobile');assert.equal(sent.at(-1).inputMode,'keyboard');assert.equal('userAgent' in sent.at(-1),false);
});

test('a phone report survives a complete six-map session and expires after thirty minutes',async()=>{
 let now=0;const m=createMonitoring({token:key,now:()=>now,autoStart:false});
 const {PassThrough}=await import('node:stream');const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});
 let status;const res={writeHead(code){status=code;},end(){}};
 m.handle(req,res);const report={...makeReport(),map:'orbital',device:'mobile',inputMode:'touch',mode:'solo'};addObservation(report,'mapFirst',6500);req.end(JSON.stringify(report));await new Promise(r=>setImmediate(r));assert.equal(status,204);
 now=29*60*1000;const c=m.snapshot().client;assert.equal(c.windowSeconds,1800);assert.equal(c.mapFirst.count,1);assert.equal(c.byMap[0].name,'orbital');assert.equal(c.mapFirst.p95OverMs,5000);
 now=30*60*1000+1;assert.equal(m.snapshot().client.mapFirst.count,0);m.dispose();
});
test('longer retention still caps report memory and makes early cap eviction visible',async()=>{
 let now=0;const m=createMonitoring({token:key,now:()=>now,autoStart:false});const {PassThrough}=await import('node:stream');
 for(let i=0;i<6001;i++){
  now=i*100;const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});
  m.handle(req,{writeHead(){},end(){}});req.end(JSON.stringify({map:'orbital',device:'mobile',errors:0}));
  if(i%100===0)await new Promise(r=>setImmediate(r));
 }
 await new Promise(r=>setImmediate(r));const c=m.snapshot().client;assert.equal(c.reports,6000);assert.equal(c.reportLimitReached,true);assert.equal(c.retainedReportLimit,6000);m.dispose();
});
test('older chart buckets preserve traffic averages and delay peaks without thinning recent samples',()=>{
 let now=0;const m=createMonitoring({token:key,now:()=>now,autoStart:false,state:()=>({simulationBacklogMs:now===3000?99:0})});
 for(let i=1;i<=200;i++){now=i*1000;if(i===3)m.count('bytesOut',1000);m.sample();}
 const d=m.snapshot();assert.equal(d.history[0].at,10000);assert.equal(d.history[0].intervalSeconds,10);assert.equal(d.history[0].bytesOutPerSec,100);assert.equal(d.history[0].simulationBacklogMs,99);
 assert.equal(d.history.at(-1).bytesOutPerSec,0);assert.ok(d.history.slice(-30).every(p=>p.intervalSeconds===1));m.dispose();
});

test('hashed dashboard bundles remain monitoring traffic, while game bundles count toward game traffic',async()=>{
 const {EventEmitter}=await import('node:events');const m=createMonitoring({token:key,autoStart:false});
 for(const path of ['/client/dashboard-ABCDEFGH.js','/client/dashboard-style-ABCDEFGH.css','/client/main-ABCDEFGH.js']){
  const res=new EventEmitter();res.writeHead=function(status){this.statusCode=status;};res.getHeader=()=>undefined;
  m.http({url:path,method:'GET'},res);res.writeHead(200,{'Content-Length':100});res.emit('finish');
 }
 const totals=m.snapshot().totals;assert.equal(totals.monitorBytes,200);assert.equal(totals.otherBytes,100);assert.equal(totals.httpRequests,1);m.dispose();
});
