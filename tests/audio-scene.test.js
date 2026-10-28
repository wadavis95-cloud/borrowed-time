import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_SURFACES, createAudioScene } from '../src/audio-scene.js';

test('six surfaces differ and scene cues use nearby authoritative race time, once per event',()=>{
  assert.equal(new Set(Object.values(AUDIO_SURFACES).map(v=>v.frequency)).size,6);
  const scene=createAudioScene();
  const state={mapId:'pirate',phase:'running',elapsed:5,raceElapsed:5,timeLeft:40,distance:100,debris:[{id:'a',z:130,warnAt:5,fallAt:6,impactAt:7},{id:'far',z:800,warnAt:1,impactAt:7}]};
  scene.update(state);
  let cues=scene.update({...state,elapsed:5.1,raceElapsed:5.1});
  assert.equal(cues.warning.id,'a');assert.equal(cues.impact,null);
  assert.equal(scene.update({...state,raceElapsed:5.2}).warning,null);
  for(const t of [5.5,5.9,6.3,6.7])scene.update({...state,raceElapsed:t});
  cues=scene.update({...state,raceElapsed:7.1});assert.equal(cues.impact.id,'a');
  assert.equal(scene.update({...state,raceElapsed:7.2}).impact,null);
  assert.equal(scene.update({...state,phase:'paused'}).active,false);
  assert.equal(scene.update({...state,raceElapsed:8}).warning,null,'resume does not replay old warnings');
  scene.reset();assert.equal(scene.update(state).warning,null,'new session baselines silently');
});
test('clock urgency follows actual remaining budget without mutating state or changing hazard time',()=>{
  const scene=createAudioScene();const state={mapId:'frozen',phase:'running',elapsed:2,distance:50,timeLeft:60,debris:[]};
  const copy=structuredClone(state);scene.update(state);assert.deepEqual(state,copy);
  const relaxed=scene.update({...state,elapsed:3});
  const urgent=scene.update({...state,elapsed:4,timeLeft:8});
  assert.ok(urgent.urgency>relaxed.urgency);assert.ok(urgent.beatSeconds<relaxed.beatSeconds);
});

test('clock ticks become sharply faster in the last fifteen seconds using only the local budget',()=>{
 const scene=createAudioScene();
 const interval=timeLeft=>scene.update({phase:'running',mapId:'tunnel',distance:100,elapsed:4,timeLeft,debris:[]}).beatSeconds;
 assert.equal(interval(60),1);
 assert.ok(interval(15)<interval(30));assert.ok(interval(5)<interval(15));
 assert.ok(interval(15)<=.45);assert.ok(interval(10)<=.3);assert.ok(interval(5)<=.2);
 assert.ok(interval(0)>=.1&&interval(0)<.15);
});
