import {createSnapshotDecoder} from '../../src/race-protocol.js';
import {WebSocket} from 'ws';
import {performance} from 'node:perf_hooks';
import {createGame} from '../../src/game.js';
import {chooseDemoAction} from '../../src/demo.js';
import {Samples,localOrigin} from './metrics.mjs';
export function measurements(){return {gaps:new Samples(),snapshotAge:new Samples(),rtt:new Samples(),laneConfirmation:new Samples(),joins:new Samples(),bytes:0,snapshots:0,roundTransitions:0,unexpectedCloses:0,laneTimeouts:0,errors:{}};}
export function client(origin,metrics,index=0,snapshotVersion=2){
 const decode=createSnapshotDecoder();
 localOrigin(origin);const url=new URL('/race',origin);url.protocol='ws:';
 const socket=new WebSocket(url,{origin:new URL(origin).origin,handshakeTimeout:5000});
 let latest=null,course=null,round=null,seq=0,last=0,measuring=false,expectedClose=false,failure=null,pendingLane=null,pingAt=null;
 const waiters=new Set(),history=[];
 const wake=()=>{for(const check of [...waiters])check();};
 socket.on('unexpected-response',(_request,response)=>{failure=new Error(`HTTP ${response.statusCode}`);response.resume();socket.terminate();wake();});
 socket.on('error',error=>{failure??=error;wake();});
 socket.on('close',()=>{if(measuring&&!expectedClose)metrics.unexpectedCloses++;failure??=new Error('Connection closed');wake();});
 socket.on('pong',()=>{if(measuring&&pingAt!==null)metrics.rtt.add(performance.now()-pingAt);pingAt=null;});
 socket.on('message',raw=>{
  let message=JSON.parse(raw.toString());if(message.type==='snapshot')message=decode(message);const now=performance.now();history.push(message);if(history.length>8)history.shift();
  if(measuring)metrics.bytes+=raw.length;
  if(message.type==='error'&&measuring)metrics.errors[message.code]=(metrics.errors[message.code]||0)+1;
  if(message.type==='snapshot'){
   latest=message;
   if(round!==message.room.roundId){if(measuring&&round!==null)metrics.roundTransitions++;round=message.room.roundId;course=createGame({seed:message.room.seed,mapId:message.room.mapId});seq=0;pendingLane=null;}
   if(measuring){metrics.snapshots++;if(last)metrics.gaps.add(now-last);metrics.snapshotAge.add(Math.max(0,Date.now()-message.serverTime));last=now;
    if(pendingLane&&message.you.game.lane===pendingLane.lane){metrics.laneConfirmation.add(now-pendingLane.at);pendingLane=null;}
   }
  }
  wake();
 });
 function send(message){if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(['create','join'].includes(message.type)?{...message,snapshotVersion}:message));}
 function wait(predicate,timeout=6000){return new Promise((resolve,reject)=>{
  let timer;const check=()=>{const match=history.find(predicate);if(match){clearTimeout(timer);waiters.delete(check);resolve(match);}else if(failure){clearTimeout(timer);waiters.delete(check);reject(failure);}};
  timer=setTimeout(()=>{waiters.delete(check);reject(new Error('Client wait timed out: '+String(predicate)));},timeout);waiters.add(check);check();
 });}
 return {socket,send,wait,get snapshot(){return latest;},
  measure(){measuring=true;last=0;},
  stop(){measuring=false;expectedClose=true;},
  ping(){if(socket.readyState===WebSocket.OPEN&&pingAt===null){pingAt=performance.now();socket.ping();}},
  drive(){
   if(!latest)return;
   const {room,you}=latest;
   if(room.phase==='finished'&&latest.room.hostId===you.id){send({type:'rematch'});return;}
   if(room.phase==='lobby'&&latest.room.hostId===you.id&&latest.players.length===4){send({type:'start'});return;}
   if(room.phase!=='racing'||you.game.phase!=='running')return;
   if(pendingLane&&performance.now()-pendingLane.at>1000){metrics.laneTimeouts++;pendingLane=null;}
   const action=chooseDemoAction({...you.game,obstacles:course.obstacles,debris:latest.debris},index,{showcase:true,pack:latest.players.map(p=>({id:p.id,lane:p.lane,distance:p.distance}))});
   if(!action)return;
   if(action==='left'||action==='right'){
    if(pendingLane)return;
    const lane=Math.max(0,Math.min(2,you.game.lane+(action==='left'?-1:1)));
    if(lane===you.game.lane)return;
    pendingLane={lane,at:performance.now()};
   }
   send({type:'input',action,seq:++seq,roundId:room.roundId});
  },
  close(){expectedClose=true;measuring=false;socket.terminate();wake();}
 };
}
export async function populate(origin,count,{burst=false,metrics=measurements(),clients=[],snapshotVersion=2}={}){
 const maps=['tunnel','pirate','jungle','frozen','orbital','desert'];
 async function room(index){
  const started=performance.now(),host=client(origin,metrics,0,snapshotVersion);clients.push(host);await host.wait(m=>m.type==='connected');
  host.send({type:'create',mapId:maps[index%maps.length]});
  const snapshot=await host.wait(m=>m.type==='snapshot'||m.type==='error');
  if(snapshot.type==='error')throw new Error(snapshot.code);
  for(let i=1;i<4;i++){
   const guest=client(origin,metrics,i,snapshotVersion);clients.push(guest);await guest.wait(m=>m.type==='connected');guest.send({type:'join',code:snapshot.room.code});
   await guest.wait(m=>m.type==='snapshot');
  }
  host.send({type:'start'});metrics.joins.add(performance.now()-started);
 }
 if(burst)await Promise.all(Array.from({length:count},(_,i)=>room(i)));else for(let i=0;i<count;i++)await room(i);
 return {clients,metrics};
}
