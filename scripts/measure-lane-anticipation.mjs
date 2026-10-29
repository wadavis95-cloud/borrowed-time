// Deterministic software replay: the actual network view and renderer's easing.
// This measures submission scheduling, not physical input or screen latency.
import assert from 'node:assert/strict';
import {createRaceView} from '../src/network.js';
import {createPresentationMotion} from '../src/renderer.js';
import {createControlTiming} from '../src/control-timing.js';

const sentAt=510,acceptedAt=550,arrivalDelay=25;
const snapshot=time=>({serverTime:100000+time,room:{roundId:'one',mapId:'tunnel',seed:42,phase:'racing',raceElapsed:time/1000},
  you:{id:'me',inputSeq:time>=acceptedAt?1:0,game:{phase:'running',lane:time>=acceptedAt?2:1,distance:time*.03,speed:30,elapsed:time/1000,timeLeft:60-time/1000,timeSpent:0,jumpRemaining:0,jumpDuration:.65,jumpKind:null,boostRemaining:0}},
  players:[{id:'other',connected:true,phase:'running',lane:0,distance:time*.03+10,jumpRemaining:0,jumpDuration:.65}]});
function runner(anticipateLocalLanes){
  const observations=[];
  return {view:createRaceView({anticipateLocalLanes,minDelayMs:75,initialDelayMs:75,maxDelayMs:75,onMetric(){},onUnderrun(){}}),
    motion:createPresentationMotion(),timing:createControlTiming({observe:(key,ms)=>observations.push({key,ms})}),observations,
    response:{firstMotionMs:null,halfwayMs:null,ninetyPercentMs:null}};
}
const cases=[runner(false),runner(true)];let nextFrame=0,previousFrame=0;
for(let at=0;at<=1400;at++){
  if(at>=arrivalDelay&&(at-arrivalDelay)%50===0){
    for(const c of cases){const next=snapshot(at-arrivalDelay);c.timing.confirm(next,at);c.view.push(next,at);}
  }
  if(at===sentAt){
    for(const c of cases){const receipt={seq:1,roundId:'one',sentAt};c.timing.sent('right',receipt,{eventAt:sentAt,recognizedAt:sentAt},c.view.current());c.view.anticipate('right',receipt);}
  }
  if(at<nextFrame)continue;
  nextFrame+=1000/60;const dt=(at-previousFrame)/1000;previousFrame=at;
  const displays=cases.map(c=>{
    const sampled=c.view.sample(at);if(!sampled)return null;
    const pose=c.motion.update(sampled.game,dt,sampled.opponents),source=sampled.provenance;
    if(source.anticipatedLane)c.timing.anticipated(pose,source.anticipatedLane,at);
    c.timing.rendered(pose,{...source,state:sampled.game,isPredicted:false},at);
    if(at>=sentAt){for(const [key,threshold]of [['firstMotionMs',1.0001],['halfwayMs',1.5],['ninetyPercentMs',1.9]])if(c.response[key]===null&&pose.lane>=threshold)c.response[key]=at-sentAt;}
    return sampled;
  });
  if(displays.every(Boolean))assert.deepEqual(displays[0].opponents,displays[1].opponents,'opponent trajectories must remain identical');
}
assert.ok(cases[1].response.firstMotionMs>0&&cases[1].response.firstMotionMs<=17,'local lane starts on the next eligible frame');
assert.ok(cases[1].response.firstMotionMs<cases[0].response.firstMotionMs);
for(const c of cases){assert.equal(c.view.current().lane,2);assert.equal(c.view.current().timeSpent,0);}
const result={scope:'Synthetic20Hz snapshots/60Hz frames,25ms snapshot delivery,unchanged22/s lane easing; not phone or physical display latency',
  inputAtMs:sentAt,firstConfirmAtMs:acceptedAt+arrivalDelay,opponentsIdentical:true,
  buffered:{...cases[0].response,timing:cases[0].observations},anticipated:{...cases[1].response,timing:cases[1].observations,diagnostics:cases[1].view.diagnostics().local}};
console.log(JSON.stringify(result,null,2));
