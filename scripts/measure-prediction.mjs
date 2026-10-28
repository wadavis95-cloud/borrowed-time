// Compare both renderers against identical synthetic update delivery, without network traffic.
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createRaceView} from '../src/network.js';
const base='ee90384481bbcc1585ce490733261ac72e049dba';
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const bufferURL=data(execFileSync('git',['show',`${base}:src/movement-buffer.js`],{encoding:'utf8'}));
const source=execFileSync('git',['show',`${base}:src/network.js`],{encoding:'utf8'}).replace(/from '(\.\/[^']+)'/g,(_m,p)=>`from '${p==='./movement-buffer.js'?bufferURL:new URL('../src/'+p.slice(2),import.meta.url).href}'`);
const old=await import(data(source));
const snapshot=t=>({serverTime:100000+t,room:{roundId:'one',mapId:'tunnel',seed:42,raceElapsed:t/1000},you:{id:'me',game:{phase:'running',distance:t*.03,speed:30,lane:1,elapsed:t/1000,jumpRemaining:0,jumpDuration:.65}},players:[]});
function run(factory,gap){const view=factory(),events=[];let arrival=0,index=0,previous=null,held=0,maxStep=0,minStep=0;for(let t=0;t<=12000;t+=50){arrival=Math.max(arrival,t+30+(t>1000&&t%2000<gap?gap-t%2000:0));events.push({arrival,s:snapshot(t)});}for(let t=0;t<12000;t+=1000/60){while(index<events.length&&events[index].arrival<=t){const e=events[index++];view.push(e.s,e.arrival);}const r=view.sample(t);if(!r)continue;if(previous!==null&&t>1000){const step=r.game.distance-previous;if(Math.abs(step)<1e-7)held++;maxStep=Math.max(step,maxStep);minStep=Math.min(step,minStep);}previous=r.game.distance;}return {heldFrames:held,maxStepMeters:maxStep,minStepMeters:minStep,diagnostics:view.diagnostics()};}
const results=[0,150,250,500].map(gapMs=>({gapMs,before:run(()=>old.createRaceView({onMetric(){},onUnderrun(){}}),gapMs),after:run(()=>createRaceView({onMetric(){},onUnderrun(){}}),gapMs)}));
await writeFile(new URL('../artifacts/performance/prediction-20261028.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),baseline:base,scope:'Synthetic 20Hz snapshots and 60Hz render; gaps batch every 2s; not physical phone/WAN improvement evidence.',results},null,2));
console.log(JSON.stringify(results,null,2));
