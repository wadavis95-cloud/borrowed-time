import test from 'node:test';
import assert from 'node:assert/strict';
import {connectRace,createRaceView} from '../src/network.js';
import {createControlTiming} from '../src/control-timing.js';
import {createPresentationMotion} from '../src/renderer.js';

const snapshot=(time,seq,lane=1)=>({type:'snapshot',serverTime:time,room:{roundId:'one',mapId:'tunnel',seed:42,raceElapsed:time/1000},you:{id:'me',inputSeq:seq,game:{phase:'running',distance:time*.03,speed:30,lane,jumpRemaining:0,jumpDuration:.65}},players:[]});

test('input receipt identifies only successfully enqueued commands and carries receive timing',t=>{
  const saved={WebSocket:globalThis.WebSocket,document:globalThis.document,location:globalThis.location};
  let socket;
  class Socket {
    static OPEN=1;
    constructor(){socket=this;this.readyState=0;this.handlers={};this.messages=[];}
    addEventListener(type,callback){(this.handlers[type]??=[]).push(callback);}
    emit(type,event={}){for(const callback of this.handlers[type]??[])callback(event);}
    send(value){if(this.fail)throw new Error('closed during send');this.messages.push(JSON.parse(value));}
    close(){this.readyState=3;this.emit('close');}
  }
  globalThis.WebSocket=Socket;
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
  globalThis.location={href:'http://localhost:4173/'};
  let metadata;const results=[];
  const connection=connectRace({initialMessage:{type:'create'},onSnapshot:(_value,meta)=>metadata=meta,onStatus(){},onError(){},onInputResult:result=>results.push(result)});
  t.after(()=>{connection.close();Object.assign(globalThis,saved);});
  assert.equal(connection.input('left'),null,'no receipt before a round is known');
  socket.readyState=1;socket.emit('open');
  socket.emit('message',{data:JSON.stringify(snapshot(1000,0))});
  assert.ok(Number.isFinite(metadata.receivedAt));
  const receipt=connection.input('right');
  assert.deepEqual({...receipt,sentAt:0},{seq:1,roundId:'one',sentAt:0});
  assert.ok(Number.isFinite(receipt.sentAt));
  assert.deepEqual(socket.messages.at(-1),{type:'input',action:'right',seq:1,roundId:'one'});
  const accepted={type:'inputResult',seq:1,roundId:'one',accepted:true};
  for(const bad of [{...accepted,roundId:'old'},{...accepted,seq:2},{...accepted,seq:0},{...accepted,accepted:'yes'}])socket.emit('message',{data:JSON.stringify(bad)});
  assert.equal(results.length,0,'old, unsent and malformed results cannot affect presentation');
  socket.emit('message',{data:JSON.stringify(accepted)});
  assert.deepEqual(results,[accepted]);
  socket.fail=true;
  assert.equal(connection.input('left'),null,'send failure must not create a timing trace');
  socket.fail=false;socket.readyState=3;
  assert.equal(connection.input('jump'),null);
});

test('draw provenance follows buffered snapshots and exposes receipt-relative age inputs',()=>{
  const view=createRaceView({minDelayMs:50,initialDelayMs:50,maxDelayMs:50,maxPredictionMs:0,onMetric(){}});
  const before=snapshot(1000,0),after=snapshot(1050,1,2);
  view.push(before,2000);view.push(after,2050);
  const initial=view.sample(2050);
  assert.equal(initial.provenance.inputSeq,0,'newest ack must not label the older pose');
  assert.equal(initial.provenance.renderedServerTime,1000);
  const mixed=view.sample(2075);
  assert.equal(mixed.provenance.inputSeq,1);
  assert.equal(mixed.provenance.renderedServerTime,1025);
  assert.equal(mixed.provenance.latestServerTime,1050);
  assert.equal(mixed.provenance.latestReceivedAt,2050);
  assert.equal(mixed.game.lane,1.5);
  assert.equal(after.you.game.lane,2,'instrumentation leaves authority unchanged');
});

test('boost provenance follows its existing latest-authority overlay even on an older movement frame',()=>{
  const view=createRaceView({minDelayMs:50,initialDelayMs:50,maxDelayMs:50,maxPredictionMs:0,onMetric(){}});
  const before=snapshot(1000,0),after=snapshot(1050,1);
  before.you.game.boostRemaining=0;after.you.game.boostRemaining=4;
  view.push(before,2000);view.push(after,2050);
  const result=view.sample(2050);
  assert.equal(result.game.boostRemaining,4,'preserve the existing rendering path');
  assert.equal(result.provenance.inputSeq,0);
  assert.equal(result.provenance.boostInputSeq,1);
  assert.equal(result.provenance.forwardPredictionMs,0);
});

test('real buffered view and renderer easing report the first corresponding lane/boost pose',()=>{
  for(const action of ['right','boost']){
    const observations=[];
    const timing=createControlTiming({observe:(key,ms)=>observations.push([key,ms])});
    const view=createRaceView({minDelayMs:75,initialDelayMs:75,maxDelayMs:75,onMetric(){}});
    const motion=createPresentationMotion();
    let authority,firstDraw=null;
    for(let at=0;at<=800;at+=5){
      if(at%50===25){
        const applied=at-25>=550;
        authority=snapshot(100000+at-25,applied?1:0,applied&&action==='right'?2:1);
        Object.assign(authority.you.game,{boostRemaining:applied&&action==='boost'?4:0,timeSpent:applied&&action==='boost'?5:0});
        timing.confirm(authority,at);view.push(authority,at);
      }
      if(at===510)timing.sent(action,{seq:1,roundId:'one',sentAt:510},{eventAt:510,recognizedAt:510},authority.you.game);
      if(at%10!==0)continue;
      const sample=view.sample(at);if(!sample)continue;
      const drawn=motion.update(sample.game,.01);
      if(at>510&&firstDraw===null&&(action==='right'?drawn.lane>1.0001:drawn.boostFeel>.0001))firstDraw=at;
      timing.rendered(drawn,{...sample.provenance,state:sample.game,isPredicted:false},at);
    }
    assert.ok(firstDraw>575,'action is confirmed before it is displayed');
    assert.deepEqual(observations.filter(([key])=>key==='controlRender'),[['controlRender',firstDraw-510]],action);
    assert.equal(timing.diagnostics().matched,1);
  }
});
