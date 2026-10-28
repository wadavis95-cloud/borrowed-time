// Transport sends intentions; it never decides whether an ability or movement succeeds.
import {createMovementBuffer} from './movement-buffer.js';
import {createSnapshotDecoder} from './race-protocol.js';
import {telemetry} from './telemetry.js';
import { createGame } from './game.js';

export function connectRace({ initialMessage, onSnapshot, onStatus, onError }) {
  const url = new URL('/race', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  const decode=createSnapshotDecoder();
  let closed = false;
  let sequence = 0;
  let roundId = null;
  let lastMessage = performance.now(),lastSnapshotAt=null,probeAt=null;
  let wasVisible=!document.hidden;
  let probing=false;const pendingInputs=new Map();
  const resetTiming=()=>{lastSnapshotAt=null;probeAt=null;pendingInputs.clear();wasVisible=!document.hidden;};
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
    socket.send(JSON.stringify(message));
    return true;
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
      const visible=!document.hidden;if(!visible||!wasVisible){lastSnapshotAt=null;pendingInputs.clear();}wasVisible=visible;
      const at=performance.now();if(lastSnapshotAt!==null)telemetry.observe('gap',at-lastSnapshotAt);lastSnapshotAt=at;
      if (roundId !== message.room.roundId) { roundId = message.room.roundId; sequence = 0;pendingInputs.clear(); }
      for(const [seq,sentAt]of pendingInputs){if(seq<=message.you.inputSeq){telemetry.observe('input',performance.now()-sentAt);pendingInputs.delete(seq);}}
      onSnapshot(message);
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
      if (roundId === null) return false;
      const seq=++sequence;if(probing){pendingInputs.set(seq,performance.now());if(pendingInputs.size>60)pendingInputs.delete(pendingInputs.keys().next().value);}
      return send({ type: 'input', action, seq, roundId });
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
  const buffer=createMovementBuffer({onMetric:(key,ms)=>telemetry.observe(key,ms),onUnderrun:()=>telemetry.count('bufferUnderruns'),...options});
  let latest=null,course=[],debris=[];
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
    if(sameArc){result.jumpRemaining=blend(before.jumpRemaining,after.jumpRemaining,t);if(result.jumpRemaining>0)result.jumpKind=before.jumpKind;}
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
      const newRound=!latest||latest.room.roundId!==snapshot.room.roundId||latest.room.mapId!==snapshot.room.mapId||latest.room.seed!==snapshot.room.seed||latest.you.id!==snapshot.you.id;
      if(newRound){const generated=createGame({seed:snapshot.room.seed,mapId:snapshot.room.mapId});course=generated.obstacles;debris=generated.debris;buffer.reset();}
      if(snapshot.debris)debris=snapshot.debris;
      if(!newRound&&latest.you.game.phase==='ready'&&snapshot.you.game.phase==='running')buffer.reset();
      latest=snapshot;buffer.push(snapshot,receivedAt);
    },
    sample(now){
      const pair=buffer.sample(now);if(!pair)return null;
      const {before,after,latest:current,t,intervalMs}=pair;
      const game=motion(before.you.game,after.you.game,current.you.game,t,intervalMs);
      game.obstacles=course;game.debris=debris;
      game.raceElapsed=Number.isFinite(before.room.raceElapsed)&&Number.isFinite(after.room.raceElapsed)?blend(before.room.raceElapsed,after.room.raceElapsed,t):current.room.raceElapsed;
      const opponents=current.players.filter(p=>p.id!==current.you.id&&p.connected&&!['won','lost'].includes(p.phase)).map(player=>{
        const old=before.players.find(p=>p.id===player.id),next=after.players.find(p=>p.id===player.id);
        return next?motion(old,next,player,t,intervalMs):{...player};
      });
      return {game,opponents};
    },
    current:()=>latest?{...latest.you.game,obstacles:course,debris,raceElapsed:latest.room.raceElapsed}:null,
    suspend:buffer.suspend,
    diagnostics:buffer.diagnostics,
  };
}
