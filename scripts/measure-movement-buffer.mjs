// Deterministic local render replay; no sockets or public load test.
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {createRaceView} from '../src/network.js';
const base='078569683962e20112566914f95dbd153e794664';
const legacySource=execFileSync('git',['show',`${base}:src/network.js`],{encoding:'utf8'}).replace(/from '(\.\/[^']+)'/g,(_match,path)=>`from '${new URL('../src/'+path.slice(2),import.meta.url).href}'`);
const legacy=await import('data:text/javascript;base64,'+Buffer.from(legacySource).toString('base64'));
const percentile=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1]:null;
function snapshot(t){return {serverTime:100000+t,room:{code:'test',roundId:'replay',mapId:'tunnel',seed:42,raceElapsed:t/1000},you:{id:'local',game:{phase:'running',distance:t*.03,lane:1,elapsed:t/1000,jumpRemaining:0,jumpDuration:.65}},players:[{id:'opponent',phase:'running',connected:true,distance:t*.03+10,lane:0,jumpRemaining:0,jumpDuration:.65}]};}
function schedule(kind){
 const entries=[];let previous=0;
 for(let sent=0;sent<=12000;sent+=50){
  const phase=sent%2000;
  if(kind==='server-pauses'&&sent>1000&&phase>=0&&phase<100)continue;
  let arrival=sent+30;
  if(kind==='jitter')arrival+=[0,12,2,22,0,7,18,3][sent/50%8];
  if(kind==='network-bursts'&&sent>1000&&phase<150)arrival=sent-phase+180;
  if(kind==='long-stall'&&sent>=5000&&sent<5500)arrival=5530;
  arrival=Math.max(previous,arrival);previous=arrival;entries.push({sent,arrival,snapshot:snapshot(sent)});
 }
 return entries;
}
function replay(factory,kind){
 const events=schedule(kind),view=factory(),delays=[];let index=0,previous=null,heldFrames=0,maxForwardStep=0,reversals=0;
 for(let now=0;now<12000;now+=1000/60){
  while(index<events.length&&events[index].arrival<=now){const e=events[index++];view.push(e.snapshot,e.arrival);}
  const sample=view.sample(now);if(!sample)continue;
  const distance=sample.game.distance;
  if(now>1000&&previous!==null){const step=distance-previous;if(Math.abs(step)<1e-7)heldFrames++;if(step< -1e-7)reversals++;maxForwardStep=Math.max(maxForwardStep,step);delays.push(now-30-distance/.03);}
  previous=distance;
 }
 return {heldFrames,maxForwardStepMeters:maxForwardStep,reversals,visualBufferDelayMs:{p50:percentile(delays,.5),p95:percentile(delays,.95),max:Math.max(...delays)},diagnostics:view.diagnostics?.()??null};
}
const profiles=['steady','jitter','network-bursts','server-pauses','long-stall'].map(profile=>({profile,before:replay(legacy.createRaceView,profile),after:replay(()=>createRaceView({onMetric(){},onUnderrun(){}}),profile)}));
const report={at:new Date().toISOString(),baseline:base,description:'30m/s constant motion,20Hz authored snapshots,60Hz renderer,30ms nominal one-way delay. Bursts delay150ms every2s, server pauses omit100ms snapshots every2s; long outage500ms once.',limitations:['Synthetic timing replay, not a phone or Render benchmark.','Buffering deliberately adds visual delay; no local prediction.','No extrapolation: long outages remain visible holds.'],profiles};
const directory=new URL('../artifacts/performance/',import.meta.url);await mkdir(directory,{recursive:true});await writeFile(new URL('movement-buffer-20261028.json',directory),JSON.stringify(report,null,2)+'\n');
for(const p of profiles)console.log(`${p.profile}: held frames ${p.before.heldFrames}→${p.after.heldFrames}; max step ${p.before.maxForwardStepMeters.toFixed(2)}→${p.after.maxForwardStepMeters.toFixed(2)}m; p95 visual buffer ${p.before.visualBufferDelayMs.p95.toFixed(0)}→${p.after.visualBufferDelayMs.p95.toFixed(0)}ms`);
