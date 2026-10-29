import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createTelemetry,makeReport,addObservation,encodeTelemetryReports} from '../src/telemetry.js';
import {METRIC_BINS} from '../src/metric-schema.js';
import {createMonitoring,validReport} from '../src/server/monitoring.js';

const controls=['controlDispatch','controlRecognize','controlRender','controlConfirmRender','controlAnticipatedRender','renderStateAge','renderLead'];
const counters=['controlSent','controlMatched','controlUnmatched','controlCancelled','controlAnticipated','laneCorrections','laneExpired'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function ingest(m,body){
 const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});
 let status;m.handle(req,{writeHead(value){status=value;},end(){}});req.end(typeof body==='string'?body:JSON.stringify(body));await tick();return status;
}
test('control timing schema accepts old clients, fixed phases and distinct anticipated timing',async()=>{
 assert.equal(validReport({input:[0,0,1,0,0,0,0,0],mode:'online'}),true);
 assert.equal(validReport({phase:'racing'}),true);
 assert.equal(validReport({phase:'custom stage'}),false);
 const report={...makeReport(),map:'orbital',inputMode:'touch',mode:'online',device:'mobile',phase:'racing'};
 for(const metric of controls){assert.ok(METRIC_BINS[metric]);addObservation(report,metric,73,12300);assert.equal(report.peaks[metric].ms,73);}
 for(const counter of counters)report[counter]=1;
 assert.equal(validReport(report),true);
 const m=createMonitoring({token:'x'.repeat(40),autoStart:false});
 for(const body of encodeTelemetryReports(report))assert.equal(await ingest(m,body),204);
 const c=m.snapshot().client;
 for(const metric of controls){assert.equal(c[metric].count,1);assert.equal(c[metric].maxMs,73);assert.equal(c.byPhase[0][metric].count,1);assert.equal(c.byDevice[0][metric].count,1);assert.equal(c.byMode[0][metric].count,1);}
 for(const counter of counters){assert.equal(c[counter],1);assert.equal(c.byPhase[0][counter],1);assert.equal(c.byMode[0][counter],1);assert.equal(c.byDevice[0][counter],1);}
 assert.equal(c.byPhase[0].name,'racing');
 assert.equal(await ingest(m,{input:[1,0,0,0,0,0,0,0]}),204);
 assert.equal(m.snapshot().client.byPhase.find(group=>group.name==='unknown').input.count,1);m.dispose();
});
test('serialization partitions worst-case timing arrays with matching peaks and no duplicated counters',()=>{
 const report={...makeReport(),map:'orbital',inputMode:'keyboard',mode:'online',device:'desktop',phase:'racing'};
 for(const metric of Object.keys(METRIC_BINS)){addObservation(report,metric,999999999,1793225000000);report[metric].fill(100000);}
 for(const counter of counters)report[counter]=100000;
 const encoded=encodeTelemetryReports(report);assert.ok(encoded.length>1);
 const parts=encoded.map(body=>{assert.ok(Buffer.byteLength(body)<=2048);const p=JSON.parse(body);assert.equal(validReport(p),true);assert.equal(p.phase,'racing');return p;});
 for(const metric of Object.keys(METRIC_BINS)){
  const included=parts.filter(part=>part[metric]);assert.equal(included.length,1);assert.deepEqual(included[0][metric],report[metric]);
  if(report.peaks[metric])assert.deepEqual(included[0].peaks[metric],report.peaks[metric]);
 }
 for(const counter of counters)assert.equal(parts.reduce((sum,p)=>sum+(p[counter]||0),0),100000);
 const sparse=JSON.parse(encodeTelemetryReports({...makeReport(),phase:'solo',controlSent:1})[0]);
 assert.deepEqual(sparse,{phase:'solo',controlSent:1});
 const peakOnly=JSON.parse(encodeTelemetryReports({phase:'solo',peaks:{controlRender:{ms:99,at:1000}}})[0]);
 assert.deepEqual(peakOnly.controlRender,Array(8).fill(0));assert.equal(validReport(peakOnly),true);
});
test('phase changes preserve queued measurements even while the previous request is in flight',async()=>{
 const sent=[],release=[];const t=createTelemetry({request:async(url,options)=>{
  if(url==='/ops/config')return {ok:true,json:async()=>({enabled:true})};
  sent.push(JSON.parse(options.body));await new Promise(resolve=>release.push(resolve));return {ok:true};
 }});await t.init();
 t.context('tunnel','touch','online','countdown');t.observe('controlDispatch',4);t.count('controlSent');const flushed=t.flush();
 t.observe('controlDispatch',7);t.count('controlSent');t.context('tunnel','touch','online','racing');
 t.observe('controlDispatch',12);t.count('controlMatched');const complete=t.flush();
 assert.equal(sent.length,1);release.shift()();await tick();assert.equal(sent[1].phase,'countdown');release.shift()();await tick();assert.equal(sent[2].phase,'racing');release.shift()();await Promise.all([flushed,complete]);
 assert.equal(sent[0].controlSent,1);assert.equal(sent[1].controlSent,1);assert.equal(sent[2].controlMatched,1);
 assert.deepEqual(sent.map(p=>p.peaks.controlDispatch.ms),[4,7,12]);
});
test('report queue is bounded, explicitly counts dropped payloads and never retries failed posts',async()=>{
 const sent=[],release=[];const t=createTelemetry({request:async(url,options)=>{
  if(url==='/ops/config')return {ok:true,json:async()=>({enabled:true})};
  sent.push(JSON.parse(options.body));await new Promise(resolve=>release.push(resolve));throw new Error('offline');
 }});await t.init();t.context('tunnel','touch','online','racing');
 for(let i=0;i<8;i++){t.count('controlSent');void t.flush();}
 assert.equal(sent.length,1);
 for(let i=0;i<4;i++){release.shift()();await tick();}
 assert.equal(sent.length,4,'one active and at most three queued payloads');
 const drained=t.flush();assert.equal(sent.length,5);assert.equal(sent[4].telemetryDropped,8,'four queue drops and four failed requests');
 release.shift()();await drained;await tick();assert.equal(sent.length,5,'no automatic failure retries');
});
