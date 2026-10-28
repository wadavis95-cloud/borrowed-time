import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceView} from '../src/network.js';
const snapshot=(t,d=t*.03)=>({serverTime:100000+t,room:{roundId:'one',mapId:'tunnel',seed:42,raceElapsed:t/1000},you:{id:'me',game:{phase:'running',distance:d,speed:30,lane:1,elapsed:t/1000,timeLeft:60-t/1000,jumpRemaining:0,jumpDuration:.65}},players:[{id:'other',connected:true,phase:'running',distance:d+10,lane:0,jumpRemaining:0,jumpDuration:.65}]});
function warm(options={}){const view=createRaceView({minDelayMs:75,initialDelayMs:75,maxDelayMs:75,onMetric(){},onUnderrun(){},...options});for(let t=0;t<=500;t+=10){if(t%50===0)view.push(snapshot(t),t);view.sample(t);}return view;}
test('short missing updates continue forward but stop at 120ms of predicted travel',()=>{
 const view=warm();let a,b;
 for(let t=510;t<=1200;t+=10){const x=view.sample(t);if(t===620)a=x;if(t===640)b=x;}
 assert.ok(b.game.distance>a.game.distance,'render must continue beyond last confirmed distance');
 assert.ok(Math.abs(view.sample(1210).game.distance-18.6)<1e-6,'prediction capped at 3.6m for 30m/s');
 assert.equal(view.current().distance,15);assert.equal(view.current().timeLeft,59.5);
 assert.ok(view.diagnostics().maxPredictionMs<=120);
});
test('an unseen collision is corrected gradually without changing authority',()=>{
 const view=warm();for(let t=510;t<=650;t+=10)view.sample(t);
 const before=view.sample(660).game.distance;assert.ok(before>16.5,"must have predicted past the unseen collision");
 const hit=snapshot(650,16);hit.you.game.speed=0;hit.players[0].distance=26;
 view.push(hit,670);const after=view.sample(670).game.distance;
 assert.ok(Math.abs(after-before)<.7,`recovery snapped ${before} to ${after}`);
 assert.equal(view.current().distance,16);
 for(let t=680;t<=1100;t+=10)view.sample(t);
 assert.ok(Math.abs(view.sample(1110).game.distance-16)<.01,'correction converges');
});
test('prediction does not invent lane changes, jump starts, elapsed authority or finish',()=>{
 const view=warm();for(let t=510;t<=700;t+=10)view.sample(t);
 const x=view.sample(710);assert.equal(x.game.lane,1);assert.equal(x.game.jumpRemaining,0);assert.equal(x.game.phase,'running');assert.equal(view.current().elapsed,.5);
 const end=snapshot(750,1350);end.you.game.phase='won';view.push(end,750);
 assert.equal(view.sample(750).game.distance,1350);assert.equal(view.sample(750).game.phase,'won');
});
test('confirmed speed zero prevents forward prediction and disabling prediction preserves reference behavior',()=>{
 const view=warm({maxPredictionMs:0});for(let t=510;t<=800;t+=10)view.sample(t);assert.equal(view.sample(810).game.distance,15);
 const stopped=warm();const s=snapshot(550);s.you.game.speed=0;stopped.push(s,550);for(let t=560;t<=900;t+=10)stopped.sample(t);assert.equal(stopped.sample(910).game.distance,16.5);
});
test('new round and visibility suspension discard prediction and correction history',()=>{
 const view=warm();for(let t=510;t<=650;t+=10)view.sample(t);view.suspend();assert.equal(view.sample(660).game.distance,15);
 const next=snapshot(0);next.room.roundId='two';view.push(next,1000);assert.equal(view.sample(1000).game.distance,0);
});

test('a forward-running character stays below the finish until the server confirms it',()=>{
 const view=createRaceView();for(let t=0;t<=500;t+=10){if(t%50===0)view.push(snapshot(t,1340+t*.01),t);view.sample(t);}
 for(let t=510;t<=900;t+=10){const result=view.sample(t);assert.equal(result.game.phase,'running');assert.ok(result.game.distance<1350);}
});
test('an acknowledged jump follows predicted time without restarting on recovery',()=>{
 const view=createRaceView({minDelayMs:75,initialDelayMs:75,maxDelayMs:75});let prior=null;
 for(let t=0;t<=1100;t+=10){
  if(t<=500&&t%50===0||t>=700&&t%50===0){const s=snapshot(t);for(const actor of [s.you.game,...s.players]){actor.jumpRemaining=Math.max(0,.65-t/1000);actor.jumpKind=actor.jumpRemaining?'hop':null;}view.push(s,t);}
  const r=view.sample(t);if(!r)continue;const remaining=r.game.jumpRemaining;if(prior!==null)assert.ok(remaining<=prior+1e-8,`jump restarted at ${t}`);prior=remaining;
 }
});

test('visibility resume cannot restart prediction until a fresh update arrives',()=>{
 const view=warm();for(let t=510;t<=650;t+=10)view.sample(t);view.suspend();
 for(let t=660;t<=950;t+=10)assert.equal(view.sample(t).game.distance,15);
});
test('large corrections reanchor immediately and server-clock reversal discards residuals',()=>{
 const view=warm();for(let t=510;t<=650;t+=10)view.sample(t);
 view.push(snapshot(650,200),660);assert.ok(view.sample(660).game.distance>100,'large correction cannot linger');
 view.push(snapshot(0,0),670);assert.equal(view.sample(670).game.distance,0);
});
