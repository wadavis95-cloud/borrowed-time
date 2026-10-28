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
