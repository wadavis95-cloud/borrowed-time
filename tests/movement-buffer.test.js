import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceView} from '../src/network.js';
function snap(ms,{round='one',phase='running'}={}){
 return {serverTime:100000+ms,room:{roundId:round,mapId:'tunnel',seed:42,raceElapsed:ms/1000},
 you:{id:'me',game:{phase,distance:ms*.03,lane:1,elapsed:ms/1000,jumpRemaining:0,jumpDuration:.65}},
 players:[{id:'other',phase:'running',distance:ms*.03+10,lane:0,connected:true,jumpRemaining:0,jumpDuration:.65}],debris:[{id:'roof',impactAt:2}]};
}
test('queue preserves time-spaced movement across batched arrivals',()=>{
 const view=createRaceView({onMetric(){},onUnderrun(){}});
 for(let t=0;t<=500;t+=50)view.push(snap(t),t);
 const before=view.sample(500).game.distance;
 // Three individually timed snapshots arrive together after a network pause.
 for(let t=550;t<=650;t+=50)view.push(snap(t),650);
 const a=view.sample(650).game.distance,b=view.sample(667).game.distance;
 assert.ok(b>a,'batched arrival must not collapse the timeline into one instant');
 assert.ok(a>=before);assert.ok(b<=19.51);
 assert.ok(view.diagnostics().bufferedSnapshots>2);
});
test('adaptive delay remains bounded and playback never reverses or invents progress',()=>{
 const view=createRaceView({onMetric(){},onUnderrun(){}});let prior=0,latest=0;
 for(let t=0;t<=6000;t+=10){
  if(t%50===0&&t%1000<850){latest=t;view.push(snap(t),t);}
  const result=view.sample(t);if(!result)continue;
  assert.ok(result.game.distance>=prior-1e-8);assert.ok(result.game.distance<=latest*.03+1e-8);prior=result.game.distance;
 }
 const d=view.diagnostics();assert.ok(d.targetDelayMs>=75&&d.targetDelayMs<=150);assert.ok(d.bufferedSnapshots<=32);
 assert.equal(view.sample(20000).game.distance,latest*.03);
 view.push(snap(0,{round:'two'}),20100);assert.equal(view.sample(20100).game.distance,0);
 assert.equal(view.diagnostics().underruns,0);
});
test('stall recovery records one underrun and an exact hold duration',()=>{
 const metrics=[],view=createRaceView({onMetric:(...v)=>metrics.push(v),onUnderrun(){}});
 for(let t=0;t<=500;t+=50){view.push(snap(t),t);view.sample(t);}
 view.sample(800);view.sample(820);view.push(snap(850),850);view.sample(850);
 assert.ok(view.diagnostics().underruns>=1);
 assert.ok(metrics.some(([key,ms])=>key==='bufferHold'&&ms>=20));
});
test('latest membership, phase and hazards apply without waiting for buffered movement',()=>{
 const view=createRaceView();view.push(snap(0),0);view.push(snap(50),50);view.sample(50);
 const next=snap(100,{phase:'won'});next.players[0].connected=false;next.debris[0].impactAt=1.2;
 view.push(next,100);const result=view.sample(100);
 assert.equal(result.game.phase,'won');assert.equal(result.game.distance,3);assert.equal(result.opponents.length,0);assert.equal(result.game.debris[0].impactAt,1.2);
});
test('HUD can read authoritative course state without advancing buffered render time',()=>{
 const view=createRaceView();for(let t=0;t<=500;t+=50)view.push(snap(t),t);
 const before=view.sample(500).game.distance;
 assert.equal(view.current().distance,15);assert.ok(view.current().obstacles.length>0);
 assert.equal(view.current().raceElapsed,.5);assert.equal(view.sample(500).game.distance,before);
});
test('duplicate timestamps keep the latest authority and phase start does not rewind',()=>{
 const view=createRaceView();for(let t=0;t<=500;t+=50)view.push(snap(t,{phase:'ready'}),t);
 view.sample(500);view.push(snap(0),550);let previous=0;
 for(let t=0;t<=300;t+=10){if(t%50===0)view.push(snap(t),550+t);const d=view.sample(550+t).game.distance;assert.ok(d>=previous);previous=d;}
 const changed=snap(300);changed.debris[0].impactAt=99;view.push(changed,850);assert.equal(view.current().debris[0].impactAt,99);
});
test('hidden-tab resume catches up to buffered time and server clock reversal reanchors',()=>{
 const view=createRaceView();for(let t=0;t<=500;t+=50)view.push(snap(t),t);view.sample(500);
 for(let t=550;t<=3500;t+=50)view.push(snap(t),t);
 assert.ok(view.sample(3500).game.distance>95);assert.ok(view.diagnostics().bufferedSnapshots<=32);
 const backwards=snap(0);view.push(backwards,3600);assert.equal(view.sample(3600).game.distance,0);
});
test('a buffered jump never rewinds its arc after the first acknowledged takeoff',()=>{
 const view=createRaceView();let remaining=null;
 for(let t=0;t<=1900;t+=10){
  if(t%50===0){const state=snap(t);const jump=Math.max(0,.65-(t-1000)/1000);for(const p of [state.you.game,...state.players]){p.jumpRemaining=t>=1000?jump:0;p.jumpDuration=.65;p.jumpKind=t>=1000?'hop':null;}view.push(state,t);}
  const current=view.sample(t).game.jumpRemaining;
  if(current>0&&remaining!==null)assert.ok(current<=remaining+1e-8,`jump rewound ${remaining} to ${current} at ${t}`);
  if(current>0)remaining=current;
 }
});
test('an interrupted render loop cannot report suspended time as a buffer hold',()=>{
 const metrics=[],view=createRaceView({onMetric:(...v)=>metrics.push(v),onUnderrun(){}});
 for(let t=0;t<=500;t+=50){view.push(snap(t),t);view.sample(t);}
 view.sample(800);view.sample(820);view.push(snap(100000),100000);view.sample(100000);
 assert.ok(!metrics.some(([key,ms])=>key==='bufferHold'&&ms>1000),'hidden interval must not become a visible hold');
});
test('explicit visibility suspension discards even a brief active hold',()=>{
 const metrics=[],view=createRaceView({onMetric:(...v)=>metrics.push(v),onUnderrun(){}});
 for(let t=0;t<=500;t+=50){view.push(snap(t),t);view.sample(t);}
 view.sample(800);view.suspend();view.push(snap(850),850);view.sample(850);
 assert.ok(!metrics.some(([key])=>key==='bufferHold'));
});
