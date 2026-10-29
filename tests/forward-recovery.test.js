import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceView} from '../src/network.js';

const state=(time,speed=30)=>({serverTime:100000+time,room:{roundId:'one',mapId:'tunnel',seed:42,phase:'racing',raceElapsed:time/1000},you:{id:'me',inputSeq:0,game:{phase:'running',lane:1,distance:time*speed/1000,speed,elapsed:time/1000,timeLeft:60-time/1000,timeSpent:0,jumpRemaining:0,jumpDuration:.65,jumpKind:null,boostRemaining:0}},players:[]});
function run(gapMs,speed=30){
 const view=createRaceView({anticipateLocalLanes:true,onMetric(){},onUnderrun(){},onLocalCount(){}});
 let queue=[],last=null,maxStep=0,maxClockStep=0,maxLead=0,atEnd=null;
 for(let at=0;at<=3500;at+=1){
  if(at%50===0)queue.push(state(at,speed));
  if(at<1000||at>=1000+gapMs){for(const s of queue)view.push(s,at);queue=[];}
  if(at%16)continue;
  const shown=view.sample(at);maxLead=Math.max(maxLead,shown.provenance.forwardPredictionMs);
  if(last&&at>=1000+gapMs&&at<=2200){maxStep=Math.max(maxStep,shown.game.distance-last.game.distance);maxClockStep=Math.max(maxClockStep,shown.game.raceElapsed-last.game.raceElapsed);}
  if(last)assert.ok(shown.game.raceElapsed>=last.game.raceElapsed-1e-9,'hazard clock must not reverse');
  last=shown;atEnd=at;
 }
 return {maxStep,maxClockStep,maxLead,last,atEnd};
}
for(const gap of [100,200,300,500])test(`forward recovery after ${gap}ms gap advances at a bounded frame rate`,()=>{
 const r=run(gap);
 assert.ok(r.maxStep<=30*.016*1.36,`single frame advanced ${r.maxStep}m`);
 assert.ok(r.maxClockStep<=.016*1.36,'course and hazard clocks must recover together');
 assert.ok(r.maxLead<=120);
 assert.ok(Math.abs(r.last.game.distance-r.atEnd*.03)<1,'recovery must converge rather than leave permanent lag');
 assert.equal(r.last.game.timeSpent,0);
});
test('fast confirmed travel receives the same bounded recovery without fabricating purchases',()=>{
 const r=run(300,55);assert.ok(r.maxStep<=55*.016*1.36);assert.equal(r.last.game.timeSpent,0);
});
test('collision and terminal authority interrupt recovery immediately',()=>{
 const v=createRaceView({anticipateLocalLanes:true,onMetric(){},onUnderrun(){}});
 v.push(state(1000),1000);for(let t=1000;t<1300;t+=16)v.sample(t);
 v.push(state(1300),1300);v.sample(1300);
 const hit=state(1350);Object.assign(hit.you.game,{distance:35,speed:0,hitFlash:.3,stunRemaining:.5,timeLeft:40});v.push(hit,1350);
 assert.equal(v.sample(1350).game.distance,35);assert.equal(v.sample(1350).game.timeLeft,40);
 const end=state(1400);end.you.game.phase='lost';end.room.phase='finished';v.push(end,1400);
 assert.equal(v.sample(1400).game.phase,'lost');assert.equal(v.sample(1400).game.distance,42);
});
test('recovery keeps the confirmed jump and hazard clock on the same retained timeline',()=>{
 const v=createRaceView({anticipateLocalLanes:true,onMetric(){},onUnderrun(){}});
 const a=state(1000);Object.assign(a.you.game,{jumpKind:'long',jumpDuration:1,jumpRemaining:.5});
 v.push(a,1000);let previous;
 for(let t=1000;t<=1288;t+=16)previous=v.sample(t);
 const b=state(1300);b.you.inputSeq=1;Object.assign(b.you.game,{jumpKind:'long',jumpDuration:1,jumpRemaining:.2,timeSpent:4,timeLeft:40});
 v.push(b,1300);const shown=v.sample(1304);
 assert.ok(shown.provenance.recoveryLagMs>0);
 assert.ok(shown.game.jumpRemaining<=previous.game.jumpRemaining);
 assert.ok(Math.abs(shown.game.jumpRemaining-(1.5-shown.game.raceElapsed))<1e-9);
 assert.equal(shown.game.timeSpent,4);assert.equal(shown.game.timeLeft,40,'balances come directly from authority');
 assert.equal(shown.provenance.inputSeq,0,'old timeline cannot confirm the new input');
 assert.equal(shown.provenance.boostInputSeq,1);
 assert.equal(b.you.game.jumpRemaining,.2,'authoritative snapshots are never mutated');
});
test('very long interruption and new rounds reanchor rather than hiding indefinite disagreement',()=>{
 const v=createRaceView({anticipateLocalLanes:true,onMetric(){},onUnderrun(){}});
 v.push(state(1000),1000);for(let t=1000;t<2000;t+=16)v.sample(t);
 v.push(state(2000),2000);assert.equal(v.sample(2000).game.distance,60);
 const next=state(0);next.room.roundId='next';v.push(next,2016);
 assert.equal(v.sample(2016).game.distance,0);
});
test('collision authority does not rewind an already displayed debris clock',()=>{
 const v=createRaceView({anticipateLocalLanes:true,onMetric(){},onUnderrun(){}});
 v.push(state(1000),1000);const before=v.sample(1100);
 const hit=state(1050);Object.assign(hit.you.game,{distance:30,speed:0,stunRemaining:.3,hitFlash:.3});v.push(hit,1110);
 const after=v.sample(1110);assert.equal(after.game.distance,30);
 assert.ok(after.game.raceElapsed>=before.game.raceElapsed);
});
