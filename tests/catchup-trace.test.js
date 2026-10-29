import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatchupTrace,validCatchupTrace} from '../src/catchup-trace.js';
import {createLocalPresentation} from '../src/local-presentation.js';
const state=(distance,hits=0)=>({phase:'running',distance,speed:30,hits});
const source=(reason='recovery')=>({latestReceivedAt:0,forwardPredictionMs:0,recoveryLagMs:125,forwardClockReason:reason});
test('captures a bounded event with collision provenance, not player identity',()=>{
 const events=[],trace=createCatchupTrace({emit:e=>events.push(e),wallNow:()=>1000});
 trace.sample(state(0),'private-round',0,source());trace.sample(state(.48),'private-round',16,source());
 trace.sample(state(5,1),'private-round',32,source('collision'));
 assert.equal(events.length,1);assert.equal(events[0].reason,'collision');assert.ok(events[0].excessMs>50);assert.equal(validCatchupTrace(events[0]),true);
 assert.ok(!JSON.stringify(events).includes('private-round'));assert.ok(events[0].samples.length<=6);
});
test('distinguishes ordinary recovery and caps four events per race',()=>{
 const events=[],trace=createCatchupTrace({emit:e=>events.push(e)});let distance=0;
 for(let at=0;at<3000;at+=16){distance+=at%256===0?4:.48;trace.sample(state(distance),'one',at,source());}
 assert.equal(events.length,4);assert.ok(events.every(e=>e.reason==='recovery'));assert.ok(events.every(validCatchupTrace));
 trace.reset();trace.sample(state(0),'two',4000,source());trace.sample(state(4),'two',4016,source());assert.equal(events.length,5);
});
test('does not trace backward movement, long frame stalls, or terminal states',()=>{
 const events=[],trace=createCatchupTrace({emit:e=>events.push(e)});
 trace.sample(state(10),'one',0,source());trace.sample(state(0),'one',16,source());trace.sample(state(20),'one',400,source());
 trace.sample({...state(100),phase:'lost'},'one',416,source());assert.equal(events.length,0);
});
test('trace validation rejects extra fields, unbounded arrays and free-form labels',()=>{
 const valid={at:1000,reason:'recovery',frameMs:16,excessMs:60,samples:[[16,76,100,120,0,0]]};assert.equal(validCatchupTrace(valid),true);
 for(const e of [{...valid,player:'me'},{...valid,reason:'secret'},{...valid,samples:Array(7).fill(valid.samples[0])},{...valid,samples:[[16,76,Infinity,120,0,0]]}])assert.equal(validCatchupTrace(e),false);
});
test('buffered ordinary collision keeps tracking without changing reserve or prediction',()=>{
 const p=createLocalPresentation({forwardBufferMs:125});
 const snap=(time,extra={})=>({serverTime:time,room:{roundId:'one',phase:'racing',mapId:'tunnel',raceElapsed:time/1000},you:{id:'me',inputSeq:0,game:{...state(time*.03),lane:1,elapsed:time/1000,...extra}}});
 p.reconcile(snap(1000),1000);p.sample(1000);p.reconcile(snap(1050,{stunRemaining:.3,hitFlash:.3}),1050);
 assert.equal(p.sample(1050).provenance.forwardClockReason,'tracking');assert.equal(p.diagnostics().forwardBufferMs,125);assert.equal(p.diagnostics().maxPredictionMs,120);
});

test('trace travels through the existing bounded telemetry and protected monitoring',async()=>{
 const {createTelemetry}=await import('../src/telemetry.js');
 const {validReport,createMonitoring}=await import('../src/server/monitoring.js');
 const {PassThrough}=await import('node:stream');
 const bodies=[],t=createTelemetry({device:'mobile',request:async(url,options)=>url==='/ops/config'?{ok:true,json:async()=>({enabled:true})}:(bodies.push(options.body),{ok:true})});
 await t.init();t.context('tunnel','touch','online','racing','5-10s');
 const event={at:1000,reason:'collision',frameMs:16,excessMs:104,samples:Array.from({length:6},()=>[16,120,239,120,125,3])};
 for(let i=0;i<9;i++)t.trace(event);t.observe('forwardExcess',104);await t.flush();
 assert.ok(bodies.every(body=>Buffer.byteLength(body)<=2048));assert.ok(bodies.map(JSON.parse).every(validReport));
 assert.equal(bodies.map(JSON.parse).flatMap(b=>b.catchupTraces||[]).length,4);
 assert.equal(validReport({catchupTraces:[{...event,player:'someone'}]}),false);
 const m=createMonitoring({token:'x'.repeat(40),autoStart:false});
 try{
  for(const body of bodies){const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});let status;m.handle(req,{writeHead(code){status=code;},end(){}});req.end(body);await new Promise(resolve=>setImmediate(resolve));assert.equal(status,204);}
  const c=m.snapshot().client;assert.equal(c.catchupTraces.length,4);assert.equal(c.catchupTraces[0].device,'mobile');assert.equal(c.catchupTraces[0].reason,'collision');assert.deepEqual(c.catchupTraces[0].samples,event.samples);
 }finally{m.dispose();}
});
test('visibility suspension clears nearby samples without resetting the race budget',()=>{
 const events=[],trace=createCatchupTrace({emit:e=>events.push(e)});
 trace.sample(state(0),'one',0,source());trace.sample(state(4),'one',16,source());trace.suspend();
 trace.sample(state(100),'one',1000,source());assert.equal(events.length,1);trace.sample(state(104),'one',1016,source());assert.equal(events[1].samples.length,1);
});
