import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelemetry,makeReport,addObservation} from '../src/telemetry.js';
import {createMonitoring,validReport} from '../src/server/monitoring.js';
import {PassThrough} from 'node:stream';
async function ingest(m,report){const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});let status;m.handle(req,{writeHead(s){status=s;},end(){}});req.end(JSON.stringify(report));await new Promise(r=>setImmediate(r));return status;}
test('rare spikes keep exact maxima and p99 instead of disappearing behind p95',async()=>{
 const report={...makeReport(),device:'mobile',inputMode:'touch',map:'tunnel',mode:'online'};
 for(let i=0;i<98;i++)addObservation(report,'gap',50,1000+i);
 addObservation(report,'gap',180,1200);addObservation(report,'gap',420,1300);
 assert.deepEqual(report.peaks.gap,{ms:420,at:1300});
 const m=createMonitoring({token:'x'.repeat(40),autoStart:false});assert.equal(await ingest(m,report),204);
 const c=m.snapshot().client;assert.equal(c.gap.p95UpperMs,50);assert.equal(c.gap.p99UpperMs,200);assert.equal(c.gap.maxMs,420);assert.equal(c.gap.overThreshold,2);
 assert.equal(c.byDevice[0].gap.maxMs,420);assert.equal(c.byMode[0].gap.count,100);assert.equal(c.recentSpikes[0].metric,'gap');m.dispose();
});
test('fixed peak schema rejects identifiers, oversized maxima and invalid timestamps',()=>{
 assert.equal(validReport({...makeReport(),peaks:{name:{ms:1,at:1000}}}),false);
 assert.equal(validReport({...makeReport(),peaks:{gap:{ms:Infinity,at:1000}}}),false);
 assert.equal(validReport({...makeReport(),peaks:{gap:{ms:1e15,at:1000}}}),false);
 assert.equal(validReport({...makeReport(),peaks:{gap:{ms:200,at:'phone'}}}),false);
 assert.equal(validReport({...makeReport(),peaks:{gap:{ms:200,at:1000,player:'Captain'}}}),false);
 assert.equal(validReport({gap:[0,0,0,1,0,0,0,0]}),true,'old clients still accepted');
});
test('browser peak timing excludes hidden samples and report size stays bounded',async()=>{
 let visible=true;const sent=[];const t=createTelemetry({visible:()=>visible,now:()=>12300,request:async(u,o)=>{if(o?.body)sent.push(JSON.parse(o.body));return {ok:true,json:async()=>({enabled:true})};}});await t.init();
 t.observe('rtt',250);visible=false;t.observe('rtt',900);visible=true;t.observe('bufferHold',80);await t.flush();
 assert.deepEqual(sent[0].peaks.rtt,{ms:250,at:12300});assert.equal(sent[0].peaks.bufferHold.ms,80);
 assert.ok(JSON.stringify(sent[0]).length<2048);assert.equal(validReport(sent[0]),true);
});
test('recent spike display is bounded and peak-only reports expire with observations',async()=>{
 let now=1000;const m=createMonitoring({token:'x'.repeat(40),now:()=>now,autoStart:false});
 for(let i=0;i<30;i++){const r=makeReport();addObservation(r,'input',200,now);assert.equal(await ingest(m,r),204);now++;}
 assert.equal(m.snapshot().client.recentSpikes.length,24);now+=1800001;assert.equal(m.snapshot().client.recentSpikes.length,0);m.dispose();
});
test('server spike timestamps survive chart compaction without unbounded event storage',()=>{
 let now=0;const m=createMonitoring({token:'x'.repeat(40),now:()=>now,autoStart:false,state:()=>({simulationBacklogMs:now===3000?150:0})});
 for(let i=1;i<=120;i++){now=i*1000;m.sample();}
 assert.equal(m.snapshot().serverSpikes[0].at,3000);assert.equal(m.snapshot().serverSpikes[0].simulationBacklogMs,150);
 m.dispose();
});
