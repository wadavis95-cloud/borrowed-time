import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceView} from '../src/network.js';
import {createPresentationMotion} from '../src/renderer.js';

const snapshot=(time=1000,seq=0,lane=1)=>({serverTime:time,room:{roundId:'one',mapId:'tunnel',seed:42,phase:'racing',raceElapsed:time/1000},you:{id:'me',inputSeq:seq,game:{phase:'running',distance:time*.03,speed:30,lane,elapsed:time/1000,timeLeft:50,timeSpent:0,jumpRemaining:0,jumpDuration:.65,jumpKind:null,boostRemaining:0}},players:[{id:'other',connected:true,phase:'running',distance:time*.03+10,lane:0,jumpRemaining:0,jumpDuration:.65}]});
const receipt=(seq=1,sentAt=2060)=>({seq,roundId:'one',sentAt});
function pair(){
 const options={minDelayMs:75,initialDelayMs:75,maxDelayMs:75,onMetric(){}};
 const reference=createRaceView(options),view=createRaceView({...options,anticipateLocalLanes:true});
 for(const [time,at]of [[1000,2000],[1050,2050]]){reference.push(snapshot(time),at);view.push(snapshot(time),at);reference.sample(at);view.sample(at);}
 return {reference,view};
}
test('the real view anticipates only local lanes on the next drawn frame and leaves opponents unchanged',()=>{
 const {reference,view}=pair(),motion=createPresentationMotion();motion.update(view.sample(2050).game,1/60);
 assert.equal(view.anticipate('right',receipt()),true);
 const anticipated=view.sample(2067),draw=motion.update(anticipated.game,1/60);
 assert.ok(draw.lane>1&&draw.lane<2);assert.equal(anticipated.game.lane,2);
 assert.equal(view.current().lane,1);assert.equal(view.current().timeLeft,50);
 assert.equal(anticipated.provenance.anticipatedLane.seq,1);assert.equal(anticipated.provenance.inputSeq,0);
 assert.deepEqual(anticipated.opponents,reference.sample(2067).opponents);
 for(let t=2080;t<=2200;t+=10){
   if(t===2100){const next=snapshot(1100,1,2);view.push(next,t);reference.push(next,t);}
   const displayed=view.sample(t);assert.equal(displayed.game.lane,2);assert.deepEqual(displayed.opponents,reference.sample(t).opponents);
 }
 assert.equal(view.sample(2200).provenance.anticipatedLane,null);
});
test('unconfirmed free hop and paid abilities stay server-only, and failed sends never anticipate',()=>{
 const {view}=pair();
 assert.equal(view.anticipate('left',null),false);
 for(const action of ['jump','longJump','boost'])assert.equal(view.anticipate(action,receipt()),false);
 const display=view.sample(2067);assert.equal(display.game.jumpRemaining,0);assert.equal(display.game.boostRemaining,0);assert.equal(display.game.timeSpent,0);
 const accepted=snapshot(1100,1);Object.assign(accepted.you.game,{jumpKind:'long',jumpRemaining:1.2,jumpDuration:1.2,timeLeft:46,timeSpent:4});view.push(accepted,2100);
 const next=view.sample(2110);assert.equal(next.game.jumpRemaining,0,'confirmed jump waits for the buffered course clock');assert.ok(view.sample(2250).game.jumpRemaining>0,'the confirmed jump appears when its buffered timeline reaches takeoff');assert.equal(view.current().timeLeft,46);assert.equal(view.current().timeSpent,4);
});
test('private rejection and visibility suspension restore authoritative local targets',()=>{
 const {view}=pair();view.anticipate('left',receipt());view.sample(2067);
 view.inputResult({seq:1,roundId:'one',accepted:false,code:'RATE_LIMIT'});
 assert.equal(view.sample(2080).game.lane,1);
 view.anticipate('right',receipt(2,2090));view.sample(2100);view.suspend();
 assert.equal(view.sample(2110).game.lane,1);
 assert.equal(view.anticipate('left',receipt(3,2115)),false);
});
