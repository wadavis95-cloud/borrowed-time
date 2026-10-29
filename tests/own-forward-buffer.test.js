import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceView} from '../src/network.js';
import {createLocalPresentation} from '../src/local-presentation.js';
const snap=t=>({serverTime:100000+t,room:{roundId:'one',seed:42,mapId:'tunnel',phase:'racing',raceElapsed:t/1000},you:{id:'me',inputSeq:0,game:{phase:'running',lane:1,distance:t*.03,speed:30,elapsed:t/1000,timeLeft:60-t/1000,timeSpent:0,jumpRemaining:0,jumpDuration:.65,jumpKind:null,boostRemaining:0}},players:[{id:'rival',avatarId:'engineer',connected:true,phase:'running',lane:0,distance:t*.03+10,jumpRemaining:0,jumpDuration:.65}]});
function replay(gap,options={}){
 const v=createRaceView({anticipateLocalLanes:true,onMetric(){},onUnderrun(){},onLocalCount(){},...options});
 let last,holds=0,maxLead=0,maxStep=0,lastAt=0,shown;const queue=[];
 for(let at=0;at<=4000;at++){
  if(at%50===0)queue.push(snap(at));
  if(at<=2000||at>=2000+gap){for(const s of queue)v.push(s,at);queue.length=0;}
  if(at%10)continue;
  shown=v.sample(at);maxLead=Math.max(maxLead,shown.provenance.forwardPredictionMs);
  if(last&&at>2000&&at<2000+gap&&shown.game.distance===last.game.distance)holds++;
  if(last&&at>=2000+gap&&at<3000)maxStep=Math.max(maxStep,shown.game.distance-last.game.distance);
  if(last)assert.ok(shown.game.raceElapsed>=last.game.raceElapsed-1e-9);
  last=shown;lastAt=at;
 }
 return {v,shown,holds,maxLead,maxStep,lastAt};
}
test('production own-forward view keeps a small reserve instead of chasing the newest snapshot',()=>{
 const r=replay(0);assert.ok(Math.abs(r.shown.game.distance-(r.lastAt-125)*.03)<.4);
 assert.equal(r.shown.game.timeSpent,0);assert.equal(r.v.current().distance,120);
});
for(const gap of [219,230,239])test(`${gap}ms delivery gap consumes reserve without stopping own forward motion`,()=>{
 const r=replay(gap);assert.equal(r.holds,0);assert.ok(r.maxLead<=120);assert.ok(r.maxStep<=.03*10*1.36);
 const previous=replay(gap,{localForwardBufferMs:0});assert.ok(previous.holds>0,'fixture reproduces previous cap exhaustion');
});
test('longer interruptions remain capped and recover without increasing prediction',()=>{
 const r=replay(500);assert.ok(r.holds>0);assert.ok(r.maxLead<=120);assert.ok(r.maxStep<=.03*10*1.36);
});
test('buffered forward movement keeps local lanes immediate and opponents unchanged',()=>{
 const buffered=createRaceView({anticipateLocalLanes:true,onMetric(){}}),reference=createRaceView({anticipateLocalLanes:true,localForwardBufferMs:0,onMetric(){}});
 for(let t=0;t<=2000;t+=10){if(t%50===0){buffered.push(snap(t),t);reference.push(snap(t),t);}buffered.sample(t);reference.sample(t);}
 assert.equal(buffered.anticipate('right',{seq:1,roundId:'one',sentAt:2001}),true);
 const a=buffered.sample(2010),b=reference.sample(2010);assert.equal(a.game.lane,2);assert.deepEqual(a.opponents,b.opponents);
 assert.equal(a.game.timeLeft,b.game.timeLeft);assert.equal(a.game.timeSpent,b.game.timeSpent);
});
test('configured forward reserve is bounded, and no authority snapshot is changed',()=>{
 for(const value of [-1,NaN,151])assert.throws(()=>createLocalPresentation({forwardBufferMs:value}),/bounds/);
 const p=createLocalPresentation({forwardBufferMs:125}),s=snap(1000),original=JSON.stringify(s);p.reconcile(s,1000);p.sample(1010);assert.equal(JSON.stringify(s),original);
});
