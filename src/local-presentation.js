import {CONFIG,ABILITIES} from './game.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=value=>Number.isFinite(value)&&value>=0;
const validSeq=value=>Number.isSafeInteger(value)&&value>0;
const maxSpeed=CONFIG.topSpeed*Math.max(ABILITIES.boost.multiplier,ABILITIES.longJump.multiplier);

// Render-only lane intentions. Rules, collisions, balances and results are never
// simulated here; snapshots remain the only authoritative game state.
export function createLocalPresentation({maxPending=60,intentTtlMs=250,maxPredictionMs=120,forwardBufferMs=0,onCount=()=>{}}={}){
  if(!Number.isSafeInteger(maxPending)||maxPending<1||maxPending>60||!finite(intentTtlMs)||intentTtlMs===0
    ||!finite(maxPredictionMs)||maxPredictionMs>120||!finite(forwardBufferMs)||forwardBufferMs>150)throw new RangeError('Invalid local presentation bounds');
  let latest=null,receivedAt=0,pending=[],lastQueued=0,velocity=0,projectionBlocked=false;
  let lastSample=null,wasAnticipated=false;
  let cursor=null,cursorAt=null,offsets=[],history=[],recovering=false,forceAnchor=false,forceAnchorReason='none';
  let corrections=0,expired=0;
  const retiredRounds=new Set();
  const simulationTime=(value,at)=>finite(value.room.raceElapsed)?value.room.raceElapsed*1000
    :finite(value.you.game.elapsed)?value.you.game.elapsed*1000:Number.isFinite(value.serverTime)?value.serverTime:at;
  const active=()=>latest?.room.phase==='racing'&&latest.you.game.phase==='running';
  const target=()=>pending.reduce((lane,input)=>clamp(lane+(input.action==='left'?-1:1),0,CONFIG.laneCount-1),latest?.you.game.lane??1);
  function changedTarget(before){
    if(wasAnticipated&&target()!==before){corrections++;onCount('laneCorrections');}
  }
  function expire(at,recordCorrection=true){
    const before=target(),kept=[];
    for(const input of pending){if(at-input.sentAt>intentTtlMs){expired++;onCount('laneExpired');}else kept.push(input);}
    pending=kept;if(recordCorrection)changedTarget(before);
  }
  function clearMotion(){lastSample=null;wasAnticipated=false;recovering=false;}
  function resetClock(){cursor=null;cursorAt=null;offsets=[];history=[];forceAnchor=false;forceAnchorReason='none';}
  function clearRound(){pending=[];lastQueued=0;velocity=0;projectionBlocked=false;clearMotion();resetClock();}
  return {
    reconcile(snapshot,at){
      const state=snapshot?.you?.game,room=snapshot?.room,seq=snapshot?.you?.inputSeq;
      if(!finite(at)||!state||typeof room?.roundId!=='string'||!room.roundId||retiredRounds.has(room.roundId)
        ||!Number.isSafeInteger(seq)||seq<0||!Number.isInteger(state.lane)||state.lane<0||state.lane>=CONFIG.laneCount
        ||!finite(state.distance))return false;
      const newIdentity=!latest||room.roundId!==latest.room.roundId||room.mapId!==latest.room.mapId||room.seed!==latest.room.seed||snapshot.you.id!==latest.you.id;
      if(!newIdentity&&(at<receivedAt||seq<latest.you.inputSeq))return false;
      if(newIdentity){
        if(latest&&latest.room.roundId!==room.roundId){retiredRounds.add(latest.room.roundId);if(retiredRounds.size>8)retiredRounds.delete(retiredRounds.values().next().value);}
        clearRound();
      }
      const before=target(),old=latest;
      const simTime=simulationTime(snapshot,at),oldSim=old?simulationTime(old,receivedAt):null;
      const reversed=old&&(Number.isFinite(snapshot.serverTime)&&snapshot.serverTime<old.serverTime||simTime<oldSim);
      const phaseChanged=old&&(old.room.phase!==room.phase||old.you.game.phase!==state.phase);
      if(reversed||phaseChanged){pending=[];clearMotion();resetClock();}
      velocity=finite(state.speed)?clamp(state.speed,0,maxSpeed):0;
      if(!newIdentity&&!reversed&&old?.you.game.phase==='running'&&simTime>oldSim){
        const observed=clamp((state.distance-old.you.game.distance)*1000/(simTime-oldSim),0,maxSpeed);
        velocity=finite(state.speed)?Math.min(velocity,observed):observed;
      }
      // Distinguish plausible late travel from a collision or a discontinuity.
      const distanceJump=old&&Math.abs(state.distance-old.you.game.distance)>maxSpeed*Math.max(0,simTime-oldSim)/1000+6;
      forceAnchor=forceAnchor||!!(state.stunRemaining>0||state.hitFlash>0||distanceJump);
      if(distanceJump)forceAnchorReason='discontinuity';
      else if(state.stunRemaining>0||state.hitFlash>0)forceAnchorReason='collision';
      if(history.at(-1)?.time===simTime)history.pop();
      history.push({time:simTime,state,seq});if(history.length>64)history.shift();
      offsets.push(at-simTime);if(offsets.length>40)offsets.shift();
      latest=snapshot;receivedAt=at;projectionBlocked=false;
      pending=pending.filter(input=>input.seq>seq);
      // Confirm first, then expire only still-unconfirmed intentions. Otherwise
      // one late packet could invent a rollback and recovery never drawn.
      expire(at,false);
      if(!active()){pending=[];clearMotion();}
      else if(!newIdentity)changedTarget(before);
      return true;
    },
    enqueue(input){
      if(!input||!['left','right'].includes(input.action)||!validSeq(input.seq)||!finite(input.sentAt)
        ||!latest||input.roundId!==latest.room.roundId||input.seq<=Math.max(lastQueued,latest.you.inputSeq)
        ||input.sentAt<receivedAt||!active()||projectionBlocked)return false;
      expire(input.sentAt);
      if(pending.length===maxPending){pending.shift();expired++;onCount('laneExpired');}
      pending.push({action:input.action,seq:input.seq,sentAt:input.sentAt,roundId:input.roundId});lastQueued=input.seq;
      return true;
    },
    result(result){
      if(!latest||result?.roundId!==latest.room.roundId||!validSeq(result.seq)||typeof result.accepted!=='boolean')return;
      const index=pending.findIndex(input=>input.seq===result.seq);if(index<0||pending[index].accepted!==undefined)return;
      if(result.accepted){pending[index].accepted=true;return;}
      const before=target();pending.splice(index,1);changedTarget(before);
    },
    sample(at){
      if(!latest||!finite(at))return null;
      if(lastSample!==null&&at-lastSample>250){pending=[];projectionBlocked=true;clearMotion();}
      expire(at);lastSample=at;
      const state=latest.you.game,running=active();
      const simTime=simulationTime(latest,receivedAt),desired=at-Math.min(...offsets)-(running?forwardBufferMs:0);
      const frameMs=cursorAt===null?0:Math.max(0,at-cursorAt);
      let clockReason='tracking';
      // Start from confirmed history. With no history yet, the existing bounded
      // clock easing builds the reserve gradually rather than freezing startup.
      if(cursor===null)cursor=clamp(desired,running?history[0].time:simTime,simTime+(running&&!projectionBlocked?maxPredictionMs:0));
      else if(!running||forceAnchor) {clockReason=forceAnchor?forceAnchorReason:'tracking';cursor=running?Math.max(cursor,simTime):simTime;recovering=false;}
      else if(projectionBlocked){clockReason='resume';cursor=clamp(cursor,simTime,simTime+maxPredictionMs);}
      else {
        const behind=simTime-cursor;
        // A short delivery interruption recovers on physical drawing frames,
        // rather than jumping the clock to the new snapshot in a single frame.
        if(behind>500||cursor<history[0].time){clockReason='long-gap';cursor=simTime;recovering=false;}
        else {
          const rate=clamp(1+(desired-cursor-frameMs)/500,.85,behind>0||recovering?1.35:1.1);
          if(rate>1.01)clockReason='recovery';
          cursor=Math.min(cursor+frameMs*rate,simTime+maxPredictionMs);
          recovering=cursor<simTime;
        }
      }
      forceAnchor=false;forceAnchorReason='none';
      cursorAt=at;
      const projectionMs=running?Math.max(0,cursor-simTime):0;
      const extra=projectionMs/1000;
      let visualInputSeq=latest.you.inputSeq;
      const game={...state,lane:running?target():state.lane,raceElapsed:latest.room.raceElapsed};
      if(running){
        game.distance=state.distance+velocity*extra;
        // Interpolate retained, confirmed own snapshots when the visual clock
        // is temporarily behind authority. Use that same clock for jump/debris.
        let before=history[0],after=history.at(-1);
        for(const entry of history){if(entry.time<=cursor)before=entry;if(entry.time>=cursor){after=entry;break;}}
        if(cursor<simTime&&before&&after){
          // Conservative sequence coverage prevents an older jump pose from
          // being reported as the rendered response to a newer command.
          visualInputSeq=cursor>=after.time?after.seq:before.seq;
          const a=before.state,b=after.state,span=after.time-before.time;
          const t=span>0?clamp((cursor-before.time)/span,0,1):1;
          game.distance=a.distance+(b.distance-a.distance)*t;
          if(Number.isFinite(a.elapsed)&&Number.isFinite(b.elapsed))game.elapsed=a.elapsed+(b.elapsed-a.elapsed)*t;
          game.jumpDuration=b.jumpDuration;game.jumpKind=b.jumpKind;game.jumpRemaining=b.jumpRemaining||0;
          const sameArc=a.jumpRemaining>0&&a.jumpRemaining>=b.jumpRemaining&&a.jumpDuration===b.jumpDuration&&(b.jumpRemaining===0||a.jumpKind===b.jumpKind);
          if(sameArc){game.jumpRemaining=Math.max(0,a.jumpRemaining-(cursor-before.time)/1000);game.jumpKind=game.jumpRemaining>0?a.jumpKind:null;}
          else if(b.jumpRemaining>0&&span>0){
            const start=span/1000-(b.jumpDuration-b.jumpRemaining),along=(cursor-before.time)/1000;
            game.jumpRemaining=along<start?0:Math.max(0,b.jumpDuration-(along-start));
            if(!game.jumpRemaining)game.jumpKind=null;
          }
        }else{
          if(Number.isFinite(game.elapsed))game.elapsed+=extra;
          game.jumpRemaining=Math.max(0,(state.jumpRemaining||0)-extra);
          if(!game.jumpRemaining)game.jumpKind=null;
        }
        game.distance=clamp(game.distance,0,CONFIG.courseLength-.001);
        if(Number.isFinite(game.raceElapsed))game.raceElapsed=cursor/1000;
      }
      const anticipatedLane=running&&pending.length&&game.lane!==state.lane
        ?{seq:pending.at(-1).seq,roundId:latest.room.roundId,targetLane:game.lane}:null;
      wasAnticipated=!!anticipatedLane;
      return {game,provenance:{inputSeq:visualInputSeq,boostInputSeq:latest.you.inputSeq,roundId:latest.room.roundId,
        anticipatedLane,forwardClockReason:clockReason,forwardPredictionMs:projectionMs,recoveryLagMs:Math.max(0,simTime-cursor),renderedServerTime:Number.isFinite(latest.serverTime)?latest.serverTime+cursor-simTime:null,
        latestServerTime:latest.serverTime,latestReceivedAt:receivedAt}};
    },
    suspend(){pending=[];projectionBlocked=true;clearMotion();},
    reset(){latest=null;receivedAt=0;clearRound();retiredRounds.clear();},
    diagnostics:()=>({pending:pending.length,corrections,expired,forwardBufferMs,maxPredictionMs}),
  };
}
