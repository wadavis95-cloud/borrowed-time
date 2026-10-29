// Reproduce the actual presentation path with a controlled delivery gap at
// different race ages. No server, browser, game rules or packet rate is changed.
import {createRaceView} from '../src/network.js';
import {createMotionDiagnostics,raceWindow} from '../src/startup-timing.js';
import {MAP_IDS} from '../src/maps.js';
import assert from 'node:assert/strict';

const cases=[];
for(const mapId of MAP_IDS)for(const gapStart of [1000,6000,20000]){
  const view=createRaceView({anticipateLocalLanes:true,onMetric(){},onUnderrun(){},onLocalCount(){}});
  const incidents=[];let at=0,last=null,maxStep=0;
  const diagnostic=createMotionDiagnostics((metric,ms)=>incidents.push({metric,ms,at}));
  const snapshot=time=>({serverTime:100000+time,room:{roundId:'diagnostic',mapId,seed:42,phase:'racing',raceElapsed:time/1000},
    you:{id:'local',inputSeq:0,game:{mapId,phase:'running',lane:1,distance:time*.03,speed:30,elapsed:time/1000,timeLeft:60-time/1000,jumpRemaining:0,jumpDuration:.65,boostRemaining:0}},players:[]});
  let pending=[];
  for(at=0;at<=gapStart+600;at++){
    if(at%50===0)pending.push(snapshot(at));
    if(at<gapStart||at>=gapStart+300){for(const state of pending)view.push(state,at);pending=[];}
    if(at%16!==0)continue;
    const state=view.sample(at).game;diagnostic.sample(state,'diagnostic',at);
    if(last&&at>=gapStart&&at<=gapStart+400)maxStep=Math.max(maxStep,state.distance-last.distance);
    last=state;
  }
  const holds=incidents.filter(x=>x.metric==='ownHold'),steps=incidents.filter(x=>x.metric==='forwardExcess');
  assert.ok(holds.some(x=>x.ms>50),'controlled missing updates must exhaust prediction');
  assert.ok(maxStep<=30*.016*1.36,'recovery must advance within the physical frame bound');
  assert.ok(!steps.some(x=>x.ms>50),'short-gap recovery must not produce the old catch-up step');
  cases.push({mapId,gapAtSeconds:gapStart/1000,window:raceWindow('racing',gapStart/1000),gapMs:300,
    maxSingleFrameAdvanceMeters:maxStep,largestHoldMs:Math.max(...holds.map(x=>x.ms)),largestExcessAdvanceMs:Math.max(0,...steps.map(x=>x.ms))});
}
console.log(JSON.stringify({scope:'Synthetic 30m/s, 20Hz snapshots, 16ms frames; actual createRaceView; not GPU, physical phone or network diagnosis',cases},null,2));
