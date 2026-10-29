import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createGameServer as baseGameServer} from '../src/server/app.js';
const createGameServer=(options={})=>baseGameServer({...options,roomOptions:{voteDurationMs:0,...options.roomOptions}});
import {createSnapshotDecoder} from '../src/race-protocol.js';

const networkTest=process.env.RUN_NETWORK_TESTS==='1'?test:test.skip;
async function peer(origin){
  const socket=new WebSocket(origin.replace('http:','ws:')+'/race');
  const decode=createSnapshotDecoder(),inbox=[],results=[],wireSequences=[],waiters=new Set();
  let failure;
  socket.on('message',raw=>{
    let message=JSON.parse(raw.toString());
    if(message.type==='snapshot'){
      if(message.wire===2)wireSequences.push({seq:message.seq,reset:message.reset});
      try{message=decode(message);}catch(error){failure=error;}
    }
    if(message.type==='inputResult')results.push(message);
    inbox.push(message);for(const check of [...waiters])check();
  });
  socket.on('error',error=>{failure=error;for(const check of [...waiters])check();});
  await once(socket,'open');
  const until=predicate=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiters.delete(check);reject(new Error('Timed out waiting for '+String(predicate)));},1500);
    const check=()=>{
      if(failure){clearTimeout(timer);waiters.delete(check);reject(failure);return;}
      const index=inbox.findIndex(predicate);if(index<0)return;
      clearTimeout(timer);waiters.delete(check);resolve(inbox.splice(index,1)[0]);
    };
    waiters.add(check);check();
  });
  return {socket,until,results,wireSequences,send:message=>socket.send(JSON.stringify(message))};
}
async function setup(t){
  let at=1000;
  const app=createGameServer({now:()=>at});
  t.after(()=>app.close());
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const origin='http://127.0.0.1:'+app.server.address().port;
  const host=await peer(origin),guest=await peer(origin);
  t.after(()=>{host.socket.terminate();guest.socket.terminate();});
  await Promise.all([host.until(m=>m.type==='connected'),guest.until(m=>m.type==='connected')]);
  host.send({type:'create',mapId:'tunnel',snapshotVersion:2});
  const initial=await host.until(m=>m.type==='snapshot');
  guest.send({type:'join',code:initial.room.code,snapshotVersion:2});
  await guest.until(m=>m.type==='snapshot');
  await host.until(m=>m.type==='snapshot'&&m.players.length===2);
  const start=async()=>{
    host.send({type:'start'});await host.until(m=>m.type==='snapshot'&&m.room.phase==='countdown');
    at+=3001;app.rooms.tick(at);
    return host.until(m=>m.type==='snapshot'&&m.room.phase==='racing');
  };
  return {app,host,guest,initial,start};
}

networkTest('private input results identify acceptance without changing compact snapshot sequence or prices',async t=>{
  const {host,guest,initial,start}=await setup(t),roundId=initial.room.roundId;
  host.send({type:'input',action:'left',seq:1,roundId});
  assert.deepEqual(await host.until(m=>m.type==='inputResult'),{type:'inputResult',seq:1,roundId,accepted:false,code:'NOT_RACING'});
  assert.equal((await host.until(m=>m.type==='error')).code,'NOT_RACING');
  await start();
  for(const [seq,action,accepted,code] of [[2,'left',true],[3,'left',false,'ACTION_UNAVAILABLE'],[4,'boost',true],[5,'longJump',true],[6,'jump',false,'ACTION_UNAVAILABLE']]){
    host.send({type:'input',action,seq,roundId});
    assert.deepEqual(await host.until(m=>m.type==='inputResult'&&m.seq===seq),{type:'inputResult',seq,roundId,accepted,...(code?{code}:{})});
  }
  const own=await host.until(m=>m.type==='snapshot'&&m.you.inputSeq===6);
  assert.equal(own.you.game.lane,0);assert.equal(own.you.game.timeSpent,9);assert.equal(own.you.game.timeLeft,51);
  const other=await guest.until(m=>m.type==='snapshot'&&m.players.some(p=>p.id===own.you.id&&p.lane===0));
  assert.equal(other.you.game.timeSpent,0);
  assert.deepEqual(guest.results,[],'another racer must not receive private command results');
  assert.equal(host.results.length,6,'each input returns one result');
  for(let i=1;i<host.wireSequences.length;i++){
    const previous=host.wireSequences[i-1],current=host.wireSequences[i];
    assert.equal(current.seq,current.reset?1:previous.seq+1,'input results must not consume compact snapshot sequence numbers');
  }
});

networkTest('stale-round and rate-limited inputs get explicit rejection while game state remains authoritative',async t=>{
  const {app,host,initial,start}=await setup(t);await start();
  const room=app.rooms.rooms.get(initial.room.code),player=room.players.get(initial.you.id),roundId=room.roundId;
  const beforeStale=structuredClone(player.game);
  host.send({type:'input',action:'boost',seq:1,roundId:'old-round'});
  assert.deepEqual(await host.until(m=>m.type==='inputResult'),{type:'inputResult',seq:1,roundId:'old-round',accepted:false,code:'STALE_ROUND'});
  assert.deepEqual(player.game,beforeStale);
  for(let seq=1;seq<=29;seq++){
    host.send({type:'input',action:seq%2?'right':'left',seq,roundId});
    assert.equal((await host.until(m=>m.type==='inputResult'&&m.seq===seq&&m.roundId===roundId)).accepted,true);
  }
  const beforeLimited=structuredClone(player.game);
  host.send({type:'input',action:'boost',seq:30,roundId});
  assert.deepEqual(await host.until(m=>m.type==='inputResult'&&m.seq===30),{type:'inputResult',seq:30,roundId,accepted:false,code:'RATE_LIMIT'});
  assert.deepEqual(player.game,beforeLimited);assert.equal(player.lastSeq,29);
});

networkTest('malformed correlation envelopes are not reflected as input results',async t=>{
  const {host,initial}=await setup(t),roundId=initial.room.roundId;
  for(const message of [
    {type:'input',action:'left',seq:0,roundId},
    {type:'input',action:'left',seq:'1',roundId},
    {type:'input',action:'left',seq:Number.MAX_SAFE_INTEGER+1,roundId},
    {type:'input',action:'left',seq:1,roundId:''},
    {type:'input',action:'left',seq:1,roundId:'x'.repeat(65)},
    {type:'input',action:'left',seq:1,roundId:{value:roundId}},
    {type:'unknown',seq:1,roundId},
  ]){
    host.send(message);await host.until(m=>m.type==='error');
  }
  assert.deepEqual(host.results,[]);
});
