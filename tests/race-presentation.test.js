import test from 'node:test';
import assert from 'node:assert/strict';
import { createRacePresentation, finishPresentation } from '../src/race-presentation.js';

const running={phase:'running',timeLeft:60,timeSpent:0,boostRemaining:0,jumpRemaining:0,jumpKind:null};
test('only confirmed spending produces a debit, with authoritative balance untouched',()=>{
  const p=createRacePresentation();p.update(running,{},0);
  assert.equal(p.update({...running,timeLeft:59}, {},100).spend,null);
  const state={...running,timeLeft:54,timeSpent:5,boostRemaining:4};const before=structuredClone(state);
  const view=p.update(state,{},200);assert.equal(view.spend.amount,5);assert.deepEqual(view.spend.abilities,['boost']);assert.deepEqual(state,before);
  assert.equal(p.update({...state,timeLeft:53.8}, {},400).spend.id,view.spend.id);
  assert.equal(p.update(state,{},1400).spend,null);
});
test('rapid confirmed purchases aggregate and do not depend on last event text',()=>{
  const p=createRacePresentation();p.update(running,{},0);
  p.update({...running,timeSpent:5,boostRemaining:4}, {},100);
  const view=p.update({...running,timeSpent:9,boostRemaining:3.9,jumpRemaining:1.4,jumpKind:'long',recentEvent:{kind:'warning'}},{},200);
  assert.equal(view.spend.amount,9);assert.deepEqual(view.spend.abilities,['boost','longJump']);
  const q=createRacePresentation();q.update(running,{},0);
  const both=q.update({...running,timeSpent:9,boostRemaining:4,jumpRemaining:1.4,jumpKind:'long'},{},100);
  assert.equal(both.spend.amount,9);assert.deepEqual(both.spend.abilities,['boost','longJump']);
});
test('server countdown changes trigger once, GO follows racing and solo has no added delay',()=>{
  const p=createRacePresentation(),context=n=>({mode:'online',room:{phase:'countdown',countdown:n,roundId:'a'}});
  assert.equal(p.update(running,context(3),0).cue.kind,'countdown');
  assert.equal(p.update(running,context(3),50).cue,null);
  assert.equal(p.update(running,context(1),200).countdown,1);
  assert.equal(p.update(running,context(0),250).countdown,1);
  const go=p.update(running,{mode:'online',room:{phase:'racing',roundId:'a'}},300);assert.equal(go.go,true);assert.equal(go.cue.kind,'go');
  assert.equal(p.update(running,{mode:'online',room:{phase:'racing',roundId:'a'}},1100).go,false);
  const solo=createRacePresentation();solo.startSolo(0);assert.equal(solo.update(running,{},0).go,true);
  const paused={...running,phase:'paused'};solo.update(paused,{},900);assert.equal(solo.update(running,{},1000).go,false);
});
test('new rounds, reset, late joins and spending rewinds never replay old purchases',()=>{
  const p=createRacePresentation();assert.equal(p.update({...running,timeSpent:9},{},0).spend,null);
  p.reset();assert.equal(p.update(running,{},0).spend,null);
  p.update({...running,timeSpent:5,boostRemaining:4},{room:{roundId:'one'}},100);
  assert.equal(p.update(running,{room:{roundId:'two'}},150).spend,null);
  assert.equal(p.update(running,{room:{phase:'racing',roundId:'two'},mode:'online'},200).go,false);
});
test('finish presents own authoritative outcome, distinguishes winner from escape and respects waiting',()=>{
  const snap={you:{id:'me'},room:{phase:'racing',winnerId:'other'},players:[{id:'me',name:'Courier'},{id:'other',name:'Captain'}],standings:[{id:'other',position:1,status:'escaped'},{id:'me',position:2,status:'escaped'}]};
  const before=structuredClone(snap);
  const pending=finishPresentation({phase:'won'},snap,'online');assert.equal(pending.kind,'escaped');assert.equal(pending.waiting,true);assert.match(pending.badge,/#2/);
  snap.room.phase='finished';assert.equal(finishPresentation({phase:'won'},snap,'online').title,'Captain wins.');
  snap.room.winnerId='me';assert.equal(finishPresentation({phase:'won'},snap,'online').kind,'winner');
  assert.equal(finishPresentation({phase:'lost'},snap,'online').kind,'dnf');
  assert.equal(finishPresentation({phase:'won'},null,'solo').kind,'escaped');
  assert.equal(before.room.phase,'racing');
});
