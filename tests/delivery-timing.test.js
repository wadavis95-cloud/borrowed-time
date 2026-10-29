import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeliveryTiming} from '../src/delivery-timing.js';
import {raceEndpoint} from '../src/endpoints.js';
import {createSnapshotEncoder,createSnapshotDecoder} from '../src/race-protocol.js';
test('split endpoints retain same-origin fallback and reject unsafe configuration',()=>{
 assert.equal(raceEndpoint('/race',{page:'http://localhost:4173/',origin:'http://localhost:4174'}),'http://localhost:4174/race');
 assert.equal(raceEndpoint('/ops/config',{page:'https://game.example/'}),'https://game.example/ops/config');
 for(const origin of ['http://user:pass@race.example','https://race.example/path','http://race.example'])assert.throws(()=>raceEndpoint('/race',{page:'https://game.example/',origin}));
});
test('timing separates server scheduling and excess arrival delay without clock synchronization',()=>{
 const seen=[],timing=createDeliveryTiming((...x)=>seen.push(x));
 timing.sample({scheduledAt:100,sentAt:110,periodic:true},5000);
 timing.sample({scheduledAt:150,sentAt:160,periodic:true},5200);
 assert.deepEqual(seen,[['scheduleLag',10],['scheduleLag',10],['sendGap',50],['arrivalExcess',150]]);
 timing.reset();timing.sample({scheduledAt:200,sentAt:210,periodic:true},9000);assert.equal(seen.length,5);
});
test('old, event and invalid packets do not invent timing and server restarts reset interval',()=>{
 const seen=[],timing=createDeliveryTiming((...x)=>seen.push(x));
 timing.sample(undefined,0);timing.sample({scheduledAt:20,sentAt:10,periodic:true},10);timing.sample({scheduledAt:0,sentAt:10,periodic:false},10);assert.equal(seen.length,0);
 timing.sample({scheduledAt:100,sentAt:110,periodic:true},500);timing.sample({scheduledAt:0,sentAt:10,periodic:true},550);assert.equal(seen.length,2);
});

test('compact snapshot transport preserves optional timing metadata and old packets',()=>{
 const s={type:'snapshot',serverTime:1000,room:{code:'A',roundId:'one',mapId:'tunnel',seed:42},you:{id:'me',game:{}},players:[],debris:[],standings:[],timing:{scheduledAt:100,sentAt:103,periodic:true}};
 const encoder=createSnapshotEncoder(),decoder=createSnapshotDecoder();assert.deepEqual(decoder(encoder(s)).timing,s.timing);
 const old={...s};delete old.timing;assert.equal(decoder(encoder(old)).timing,undefined);
});

test('all encoded timing peaks and histogram counters fit the existing ingress cap',async()=>{
 const {makeReport,addObservation,encodeTelemetryReports}=await import('../src/telemetry.js');const {METRIC_BINS}=await import('../src/metric-schema.js');
 const {validReport}=await import('../src/server/monitoring.js');
 const report={...makeReport(),map:'orbital',mode:'online',device:'mobile',inputMode:'touch'};
 for(const key of Object.keys(METRIC_BINS)){addObservation(report,key,999999999,1793225000000);report[key].fill(100000);}
 const encoded=encodeTelemetryReports(report);assert.ok(encoded.length>0);
 for(const body of encoded){assert.ok(Buffer.byteLength(body)<=2048,Buffer.byteLength(body)+' bytes');assert.equal(validReport(JSON.parse(body)),true);}
});
