import test from 'node:test';
import assert from 'node:assert/strict';
import {raceWindow,createMotionDiagnostics} from '../src/startup-timing.js';
import {createTelemetry} from '../src/telemetry.js';
import {validReport,createMonitoring} from '../src/server/monitoring.js';
import {PassThrough} from 'node:stream';

test('startup windows use authoritative race elapsed and keep non-racing separate',()=>{
  for(const [elapsed,expected] of [[0,'0-2s'],[1.99,'0-2s'],[2,'2-5s'],[5,'5-10s'],[10,'10-30s'],[30,'30s+']])
    assert.equal(raceWindow('racing',elapsed),expected);
  assert.equal(raceWindow('countdown',0),'outside');
  assert.equal(raceWindow('racing',undefined),'unknown');
  assert.equal(raceWindow('racing',-1),'unknown');
});
test('motion diagnostics separate a render-only hold and a catch-up step, without mutating game state',()=>{
  const seen=[],d=createMotionDiagnostics((...event)=>seen.push(event));
  const state=(distance,extra={})=>Object.freeze({phase:'running',distance,speed:30,...extra});
  d.sample(state(0),'one',0);
  d.sample(state(.48),'one',16);
  d.sample(state(.48),'one',32);
  d.sample(state(.48),'one',48);
  d.sample(state(4.08),'one',64);
  assert.deepEqual(seen.filter(([key])=>key==='ownHold'),[['ownHold',32]]);
  assert.ok(Math.abs(seen.find(([key])=>key==='forwardExcess')[1]-104)<.0001);
  d.reset();d.sample(state(100),'two',100);d.sample(state(100),'two',500);
  assert.equal(seen.filter(([key])=>key==='ownHold').length,1,'suspension must not become a movement hold');
});
test('motion diagnostics exclude round changes, stopped players and backward corrections',()=>{
  const seen=[],d=createMotionDiagnostics((...event)=>seen.push(event));
  const state=(distance,speed=30)=>({phase:'running',distance,speed});
  d.sample(state(0),'one',0);d.sample(state(100),'two',16);
  d.sample(state(90),'two',32);d.sample(state(90,0),'two',48);
  d.sample({...state(90),phase:'won'},'two',64);
  assert.deepEqual(seen,[]);
});
test('telemetry preserves startup-window attribution and backend rejects arbitrary labels',async()=>{
  const bodies=[],t=createTelemetry({request:async(url,options)=>url==='/ops/config'?{ok:true,json:async()=>({enabled:true})}:(bodies.push(JSON.parse(options.body)),{ok:true})});
  await t.init();t.context('tunnel','touch','online','racing','0-2s');t.observe('drawWork',7);
  t.context('tunnel','touch','online','racing','2-5s');t.observe('forwardExcess',100);await t.flush();
  assert.equal(bodies[0].raceWindow,'0-2s');assert.equal(bodies[1].raceWindow,'2-5s');
  assert.ok(bodies.every(validReport));assert.equal(validReport({raceWindow:'arbitrary'}),false);
  const m=createMonitoring({token:'x'.repeat(40),autoStart:false});
  for(const body of bodies){
    const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});
    let status;m.handle(req,{writeHead(code){status=code;},end(){}});req.end(JSON.stringify(body));
    await new Promise(resolve=>setImmediate(resolve));assert.equal(status,204);
  }
  const c=m.snapshot().client;
  assert.equal(c.byRaceWindow.find(g=>g.name==='0-2s').drawWork.count,1);
  assert.equal(c.byRaceWindow.find(g=>g.name==='2-5s').forwardExcess.maxMs,100);
  assert.ok(c.byDeviceWindow.some(g=>g.name.endsWith(' / 0-2s')));m.dispose();
});
