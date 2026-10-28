import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameAudio} from '../src/audio.js';

test('countdown and GO sound only after opt-in and are silent while hidden or disposed',async()=>{
  const oldAudio=globalThis.AudioContext,oldDocument=globalThis.document;
  let created=0,started=0,cancelled=0;
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
  const graph=()=>({connect(){},disconnect(){}});
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
  globalThis.AudioContext=class {constructor(){created++;this.state='suspended';this.sampleRate=1000;this.currentTime=0;this.destination={};}createGain(){return {...graph(),gain:param()};}createBuffer(){return {getChannelData:()=>new Float32Array(300)};}createOscillator(){return {...graph(),frequency:param(),start(){started++;},stop(when){if(when===undefined)cancelled++;}};}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}};
  try {
    const audio=createGameAudio();assert.equal(audio.cue('countdown',3),false);assert.equal(created,0);
    await audio.toggle();audio.update({phase:'ready',distance:0,elapsed:0});assert.equal(audio.cue('countdown',3),true);assert.equal(started,1);
    audio.update({phase:'ready',distance:0,elapsed:0});assert.equal(cancelled,0,'a ready countdown frame must not cut its cue short');
    assert.equal(audio.cue('go'),true);assert.equal(started,3);
    globalThis.document.hidden=true;assert.equal(audio.cue('countdown',2),false);assert.equal(started,3);
    globalThis.document.hidden=false;await audio.toggle();assert.equal(audio.cue('go'),false);
    audio.dispose();assert.equal(audio.cue('go'),false);
  } finally {if(oldAudio===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=oldAudio;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});

test('race soundtrack and surface voices stay bounded and stop on pause, hide, mute and disposal',async()=>{
  const oldAudio=globalThis.AudioContext,oldDocument=globalThis.document;
  const sources=[],active=new Set(),listeners={};let ctx,disconnections=0;
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
  const graph=()=>({connect(){},disconnect(){disconnections++;}});
  const source=()=>{const s={...graph(),frequency:param(),start(){active.add(s);},stop(at){if(at===undefined){active.delete(s);s.onended?.();}else s.end=at;}};sources.push(s);return s;};
  globalThis.document={hidden:false,addEventListener(k,fn){listeners[k]=fn;},removeEventListener(k){delete listeners[k];}};
  globalThis.AudioContext=class {
    constructor(){ctx=this;this.state='suspended';this.sampleRate=1000;this.currentTime=0;this.destination={};}
    createGain(){return {...graph(),gain:param()};}createBuffer(){return {getChannelData:()=>new Float32Array(2000)};}
    createOscillator(){return source();}createBufferSource(){return source();}createBiquadFilter(){return {...graph(),Q:param(),frequency:param()};}
    createStereoPanner(){return {...graph(),pan:param()};}
    async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
  };
  try {
    const audio=createGameAudio(),state={phase:'running',mapId:'pirate',elapsed:0,distance:0,timeLeft:60,debris:[]};
    audio.update(state);assert.equal(sources.length,0);
    await audio.toggle();audio.update(state);
    for(let i=1;i<=600;i++) {
      ctx.currentTime=i/60;
      for(const s of [...active])if(s.end<=ctx.currentTime){active.delete(s);s.onended?.();}
      audio.update({...state,elapsed:i/60,distance:i*.5,timeLeft:60-i/60});
      assert.ok(active.size<=24);
    }
    assert.ok(sources.length>30,'footsteps, air and music are scheduled during a run');
    audio.update({...state,phase:'paused',elapsed:10,distance:300});assert.equal(active.size,0);
    audio.update({...state,elapsed:10,distance:300});ctx.currentTime+=.1;audio.update({...state,elapsed:10.1,distance:303});assert.ok(active.size>0);
    globalThis.document.hidden=true;listeners.visibilitychange();assert.equal(active.size,0);
    const count=sources.length;audio.update({...state,elapsed:11,distance:330});assert.equal(sources.length,count);
    globalThis.document.hidden=false;await audio.toggle();assert.equal(active.size,0);assert.equal(audio.enabled,false);
    audio.dispose();assert.equal(active.size,0);assert.ok(disconnections>0);assert.equal(listeners.visibilitychange,undefined);
  } finally {if(oldAudio===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=oldAudio;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
