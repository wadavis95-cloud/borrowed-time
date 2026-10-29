import {raceEndpoint} from './endpoints.js';
import {createDeliveryTiming} from './delivery-timing.js';
// Transport sends intentions; it never decides whether an ability or movement succeeds.
import {createMovementBuffer} from './movement-buffer.js';
import {createLocalPresentation} from './local-presentation.js';
import {createSnapshotDecoder} from './race-protocol.js';
import {telemetry} from './telemetry.js';
import { CONFIG, ABILITIES, createGame } from './game.js';

export function connectRace({ initialMessage, onSnapshot, onStatus, onError, onInputResult }) {
  const url = new URL(raceEndpoint('/race'));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  const decode=createSnapshotDecoder();
  let closed = false;
  let sequence = 0;
  let roundId = null;
  let lastMessage = performance.now(),lastSnapshotAt=null,probeAt=null;
  let wasVisible=!document.hidden;
  let probing=false;const pendingInputs=new Map();
  const delivery=createDeliveryTiming((key,ms)=>telemetry.observe(key,ms));
  const resetTiming=()=>{delivery.reset();lastSnapshotAt=null;probeAt=null;pendingInputs.clear();wasVisible=!document.hidden;};
  document.addEventListener('visibilitychange',resetTiming);
  const probeTimer=setInterval(()=>{if(probing&&socket.readyState===WebSocket.OPEN&&(probeAt===null||performance.now()-probeAt>10000)){probeAt=performance.now();send({type:'probe',at:probeAt});}},5000);
  const watchdog = setInterval(() => {
    if (performance.now() - lastMessage > 10000) {
      onError('The server stopped responding. Return to the menu to reconnect.');
      socket.close();
    }
  }, 2000);

  function send(message) {
    if (closed || socket.readyState !== WebSocket.OPEN) return false;
    try { socket.send(JSON.stringify(message)); return true; }
    catch { return false; }
  }
  socket.addEventListener('open', () => {
    if (closed) return;
    onStatus('open');
    send({...initialMessage,snapshotVersion:2});
  });
  socket.addEventListener('message', ({ data }) => {
    if (closed) return;
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if(message.type!=='probe')lastMessage = performance.now();
    if(message.type==='connected')probing=message.telemetry===true;
    if(message.type==='probe'&&message.at===probeAt){telemetry.observe('rtt',performance.now()-probeAt);probeAt=null;}
    if (message.type === 'snapshot') {
      try{message=decode(message);}catch(error){onError(error.message);socket.close();return;}
      const visible=!document.hidden;if(!visible||!wasVisible){delivery.reset();lastSnapshotAt=null;pendingInputs.clear();}wasVisible=visible;
      const at=performance.now();
      if (roundId !== message.room.roundId) { roundId = message.room.roundId; sequence = 0;pendingInputs.clear(); }
      // The coordinator updates phase attribution before this packet's measurements.
      onSnapshot(message,{receivedAt:at});
      if(visible&&wasVisible)delivery.sample(message.timing,at);if(lastSnapshotAt!==null)telemetry.observe('gap',at-lastSnapshotAt);lastSnapshotAt=at;
      for(const [seq,sentAt]of pendingInputs){if(seq<=message.you.inputSeq){telemetry.observe('input',at-sentAt);pendingInputs.delete(seq);}}
    } else if (message.type === 'inputResult') {
      if(message.roundId===roundId&&Number.isSafeInteger(message.seq)&&message.seq>0&&message.seq<=sequence&&typeof message.accepted==='boolean')onInputResult?.(message);
    } else if (message.type === 'error') {
      onError(message.message, message.code);
    } else if (message.type === 'left') {
      // Idle-room expiry also removes membership; don't leave a stale lobby clickable.
      onStatus('disconnected');
      socket.close();
    }
  });
  socket.addEventListener('error', () => {
    if (!closed) onError('Could not reach the race server. Check your connection and try again.');
  });
  socket.addEventListener('close', () => {
    clearInterval(watchdog);clearInterval(probeTimer);document.removeEventListener('visibilitychange',resetTiming);
    if (!closed){telemetry.count('disconnects');onStatus('disconnected');}
  });
  return {
    send,
    input(action) {
      if (roundId === null) return null;
      const seq=++sequence,sentAt=performance.now();
      if(!send({ type: 'input', action, seq, roundId }))return null;
      if(probing){pendingInputs.set(seq,sentAt);if(pendingInputs.size>60)pendingInputs.delete(pendingInputs.keys().next().value);}
      return {seq,roundId,sentAt};
    },
    close() {
      clearInterval(probeTimer);send({ type: 'leave' });
      closed = true;document.removeEventListener('visibilitychange',resetTiming);
      clearInterval(watchdog);clearInterval(probeTimer);
      socket.close();
    },
  };
}

// Buffer real snapshots on a server-time timeline; rules remain authoritative.
export function createRaceView(options={}) {
  const {anticipateLocalLanes=false,onLocalCount=key=>telemetry.count(key),...bufferOptions}=options;
  const buffer=createMovementBuffer({onMetric:(key,ms)=>telemetry.observe(key,ms),onUnderrun:()=>telemetry.count('bufferUnderruns'),...bufferOptions});
  const local=anticipateLocalLanes?createLocalPresentation({onCount:onLocalCount}):null;
  let latest=null,course=[],debris=[];
  const rendered=new Map();
  let correctionCount=0,maxCorrectionMeters=0,lastRenderAt=null;
  const maxSpeed=CONFIG.topSpeed*Math.max(ABILITIES.boost.multiplier,ABILITIES.longJump.multiplier);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function clearMotion(){rendered.clear();lastRenderAt=null;}
  function present(id,result,previous,confirmed,pair,now){
    const dt=pair.intervalMs/1000;
    let velocity=dt>0&&previous?.phase==='running'&&confirmed?.phase==='running'?clamp((confirmed.distance-previous.distance)/dt,0,maxSpeed):0;
    if(Number.isFinite(confirmed?.speed))velocity=Math.min(velocity,Math.max(0,confirmed.speed));
    if(result.phase!=='running'){rendered.delete(id);return result;}
    const extra=pair.predictionMs/1000;
    if(extra>0){
      result.distance=Math.min(CONFIG.courseLength-.001,result.distance+velocity*extra);
      if(Number.isFinite(result.elapsed))result.elapsed+=extra;
      // Only continue an acknowledged arc; never create a new jump.
      result.jumpRemaining=Math.max(0,(result.jumpRemaining||0)-extra);
      if(!result.jumpRemaining)result.jumpKind=null;
    }
    const last=rendered.get(id),frameDt=last?Math.max(0,now-last.at):0;
    let correction=last?.correction??null;
    if(last&&last.snapshot!==pair.latest&&last.predictionMs>0){
      const expected=last.distance+last.velocity*frameDt/1000;
      const offset=expected-result.distance;
      // Large disagreements snap to authority rather than drift through hazards.
      correction=Math.abs(offset)<=6?{offset,at:now}:null;
      if(correction&&Math.abs(offset)>.01){correctionCount++;maxCorrectionMeters=Math.max(maxCorrectionMeters,Math.abs(offset));}
    }
    if(correction){const t=clamp((now-correction.at)/300,0,1);result.distance+=correction.offset*(1-t*t*(3-2*t));if(t===1)correction=null;}
    result.distance=clamp(result.distance,0,CONFIG.courseLength-.001);
    const visibleSpeed=last&&frameDt>0?clamp((result.distance-last.distance)*1000/frameDt,0,maxSpeed):velocity;
    rendered.set(id,{at:now,distance:result.distance,velocity:visibleSpeed,predictionMs:pair.predictionMs,snapshot:pair.latest,correction});
    return result;
  }
  const blend=(a,b,t)=>a+(b-a)*t;
  function motion(before,after,current,t,intervalMs){
    if(!before||before.phase!==after.phase||current.phase!==after.phase)return {...current};
    const result={...current,distance:blend(before.distance,after.distance,t),lane:blend(before.lane,after.lane,t)};
    if(Number.isFinite(before.elapsed)&&Number.isFinite(after.elapsed))result.elapsed=blend(before.elapsed,after.elapsed,t);
    // Jump poses follow the same buffered timeline as the course. Switching to
    // a newer countdown mid-arc would reverse the pose as older frames catch up.
    result.jumpKind=after.jumpKind;result.jumpDuration=after.jumpDuration;
    result.jumpRemaining=after.jumpRemaining;
    const sameArc=before.jumpRemaining>0&&before.jumpRemaining>=after.jumpRemaining&&before.jumpDuration===after.jumpDuration&&(after.jumpRemaining===0||before.jumpKind===after.jumpKind);
    if(sameArc){result.jumpRemaining=after.jumpRemaining===0?Math.max(0,before.jumpRemaining-intervalMs*t/1000):blend(before.jumpRemaining,after.jumpRemaining,t);if(result.jumpRemaining>0)result.jumpKind=before.jumpKind;}
    else if(after.jumpRemaining>0&&intervalMs>0){
      const interval=intervalMs/1000;
      const start=interval-(after.jumpDuration-after.jumpRemaining);
      const along=interval*t;
      result.jumpRemaining=along<start?0:Math.max(0,after.jumpDuration-(along-start));
    }
    return result;
  }
  return {
    push(snapshot,receivedAt){
      if(latest&&Number.isFinite(snapshot.serverTime)&&snapshot.serverTime<latest.serverTime)clearMotion();
      const newRound=!latest||latest.room.roundId!==snapshot.room.roundId||latest.room.mapId!==snapshot.room.mapId||latest.room.seed!==snapshot.room.seed||latest.you.id!==snapshot.you.id;
      if(newRound){const generated=createGame({seed:snapshot.room.seed,mapId:snapshot.room.mapId});course=generated.obstacles;debris=generated.debris;buffer.reset();clearMotion();correctionCount=0;maxCorrectionMeters=0;}
      if(snapshot.debris)debris=snapshot.debris;
      if(!newRound&&latest.you.game.phase==='ready'&&snapshot.you.game.phase==='running'){buffer.reset();clearMotion();}
      latest=snapshot;buffer.push(snapshot,receivedAt);local?.reconcile(snapshot,receivedAt);
    },
    sample(now){
      const pair=buffer.sample(now);if(!pair)return null;
      const {before,after,latest:current,t,intervalMs}=pair;
      if(lastRenderAt!==null&&now-lastRenderAt>250)clearMotion();
      lastRenderAt=now;
      const game=present(current.you.id,motion(before.you.game,after.you.game,current.you.game,t,intervalMs),before.you.game,after.you.game,pair,now);
      game.obstacles=course;game.debris=debris;
      game.raceElapsed=Number.isFinite(before.room.raceElapsed)&&Number.isFinite(after.room.raceElapsed)?blend(before.room.raceElapsed,after.room.raceElapsed,t):current.room.raceElapsed;
      if(Number.isFinite(game.raceElapsed))game.raceElapsed+=pair.predictionMs/1000;
      const opponents=current.players.filter(p=>p.id!==current.you.id&&p.connected&&!['won','lost'].includes(p.phase)).map(player=>{
        const old=before.players.find(p=>p.id===player.id),next=after.players.find(p=>p.id===player.id);
        return next?present(player.id,motion(old,next,player,t,intervalMs),old,next,pair,now):{...player};
      });
      // Seq coverage follows the drawn interpolation, rather than the latest HUD.
      const direct=before.you.game.phase!==after.you.game.phase||current.you.game.phase!==after.you.game.phase;
      const source=direct?current:t>0?after:before;
      const renderedServerTime=Number.isFinite(before.serverTime)&&Number.isFinite(after.serverTime)
        ? direct?current.serverTime:blend(before.serverTime,after.serverTime,t)+pair.predictionMs : null;
      const view={game,opponents,provenance:{inputSeq:source.you.inputSeq,roundId:current.room.roundId,
        // Boost feel already uses latest authority; lane/jump use the buffer.
        boostInputSeq:current.you.inputSeq,forwardPredictionMs:pair.predictionMs,
        renderedServerTime,latestServerTime:current.serverTime,latestReceivedAt:pair.latestReceivedAt}};
      // Only the own-player timeline changes. Opponent buffer output is intact.
      const own=local?.sample(now);
      return own?{...view,game:{...game,...own.game},provenance:own.provenance}:view;
    },
    current:()=>latest?{...latest.you.game,obstacles:course,debris,raceElapsed:latest.room.raceElapsed}:null,
    anticipate:(action,receipt)=>local?.enqueue(receipt?{...receipt,action}:null)??false,
    inputResult(result){local?.result(result);},
    suspend(){buffer.suspend();clearMotion();local?.suspend();},
    diagnostics:()=>({...buffer.diagnostics(),correctionCount,maxCorrectionMeters,...(local?{local:local.diagnostics()}:{})}),
  };
}
