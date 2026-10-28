import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceUI} from '../src/race-ui.js';
function node(){const classes=new Set();return {hidden:false,textContent:'',dataset:{},style:{setProperty(k,v){this[k]=v;}},classList:{toggle(k,on){on?classes.add(k):classes.delete(k);},remove(k){classes.delete(k);}},animations:[],animate(frames,options){const animation={cancelled:false,cancel(){this.cancelled=true;}};this.animations.push(animation);return animation;}};}
function elements(){return Object.fromEntries(['clock','debit','status','trail','note','boost','jump','go','title','overlay','finishMark','finishBadge'].map(id=>[id,node()]));}
const base={phase:'running',timeSpent:0,timeLeft:60,boostRemaining:0};
test('purchase UI occupies the status slot and resets every transient element',()=>{
  const el=elements(),ui=createRaceUI({elements:el});ui.update(base,{},0);
  ui.update({...base,timeLeft:55,timeSpent:5,boostRemaining:4},{},100);
  assert.equal(el.debit.textContent,'−5s');assert.equal(el.status.hidden,true);assert.equal(el.boost.animations.length,1);assert.equal(el.note.textContent,'Boost · −5 seconds');
  ui.update({...base,timeLeft:54.9,timeSpent:5,boostRemaining:3.9},{},200);assert.equal(el.boost.animations.length,1);
  ui.reset();assert.equal(el.status.hidden,false);assert.equal(el.debit.hidden,true);assert.equal(el.trail.hidden,true);assert.equal(el.note.textContent,'');assert.equal(el.boost.animations[0].cancelled,true);
});
test('reduced motion preserves debit, lights and result information without Web Animations',()=>{
  const el=elements(),ui=createRaceUI({elements:el,reducedMotion:true});ui.update(base,{},0);ui.update({...base,timeSpent:4,timeLeft:56,jumpRemaining:1.4,jumpKind:'long'},{},100);
  ui.result({kind:'escaped',mark:'✓',badge:'ESCAPED',waiting:false});
  assert.equal(el.debit.textContent,'−4s');assert.equal(el.finishBadge.textContent,'ESCAPED');assert.equal(el.finishMark.hidden,false);assert.ok(Object.values(el).every(n=>n.animations.length===0));
});
