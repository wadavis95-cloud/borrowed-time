import test from 'node:test';
import assert from 'node:assert/strict';
import {bindGameplayButton,bindCanvasGestures} from '../src/gameplay-input.js';

function target(){
 const listeners=new Map(),captures=new Set();
 return {disabled:false,listeners,captures,
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
  setPointerCapture(id){captures.add(id);},releasePointerCapture(id){captures.delete(id);},
  emit(type,event={}){for(const fn of listeners.get(type)||[])fn({pointerId:1,pointerType:'touch',button:0,isPrimary:true,clientX:100,clientY:100,...event});},
 };
}
function setup(kind='button'){
 let at=100;const el=target(),actions=[];
 const dispose=kind==='button'?bindGameplayButton(el,'left',(...args)=>actions.push(args),{now:()=>at}):bindCanvasGestures(el,(...args)=>actions.push(args),{now:()=>at});
 return {el,actions,dispose,time(value){at=value;}};
}
test('a held gameplay button dispatches at pointerdown before finger release',()=>{
 const s=setup();s.el.emit('pointerdown');assert.deepEqual(s.actions,[['left',{eventAt:100,recognizedAt:100,source:'button'}]]);
 s.time(250);s.el.emit('pointerup');s.el.emit('click',{detail:1});assert.equal(s.actions.length,1);
});
test('long holds, repeated down and cancellation do not double-fire compatibility click',()=>{
 const s=setup();s.el.emit('pointerdown');s.el.emit('pointerdown');s.time(10000);s.el.emit('pointerup');s.el.emit('click',{detail:1});assert.equal(s.actions.length,1);
 s.time(11000);s.el.emit('pointerdown');s.el.emit('pointercancel');s.el.emit('click',{detail:1});assert.equal(s.actions.length,2);
});
test('keyboard and assistive clicks remain usable after pointer input',()=>{
 const s=setup();s.el.emit('pointerdown');s.el.emit('pointerup');s.el.emit('click',{detail:1});
 s.time(120);s.el.emit('click',{detail:0});assert.equal(s.actions.length,2);assert.equal(s.actions[1][1].eventAt,120);
});
test('click fallback works without pointer events, disabled and secondary buttons do not activate',()=>{
 const s=setup();s.el.emit('click',{detail:1});assert.equal(s.actions.length,1);
 s.el.disabled=true;s.el.emit('pointerdown');s.el.emit('pointerup');s.el.emit('click',{detail:0});assert.equal(s.actions.length,1);
 s.el.disabled=false;s.el.emit('pointerdown',{button:2,pointerType:'mouse'});assert.equal(s.actions.length,1);
});
test('each button permits distinct simultaneous fingers and one activation per press',()=>{
 const a=setup(),b=setup();a.el.emit('pointerdown',{pointerId:1});b.el.emit('pointerdown',{pointerId:2,isPrimary:false});
 assert.equal(a.actions.length,1);assert.equal(b.actions.length,1);
 a.el.emit('lostpointercapture',{pointerId:99});a.el.emit('pointerdown',{pointerId:1});assert.equal(a.actions.length,1);
 a.el.emit('lostpointercapture',{pointerId:1});a.el.emit('click',{detail:1});assert.equal(a.actions.length,1);
});
test('swipe dispatches at existing direction threshold, before pointerup',()=>{
 const s=setup('canvas');s.el.emit('pointerdown');s.time(120);s.el.emit('pointermove',{clientX:125});assert.equal(s.actions.length,0);
 s.time(130);s.el.emit('pointermove',{clientX:126});assert.deepEqual(s.actions,[['right',{eventAt:100,recognizedAt:130,source:'swipe'}]]);
 s.time(200);s.el.emit('pointermove',{clientX:20});s.el.emit('pointerup',{clientX:100});assert.equal(s.actions.length,1,'consumed swipe cannot become another swipe or tap hop');
});
test('upward threshold dispatches a hop once during pointermove',()=>{
 const s=setup('canvas');s.el.emit('pointerdown');s.time(115);s.el.emit('pointermove',{clientY:74});s.el.emit('pointerup',{clientY:70});
 assert.deepEqual(s.actions,[['jump',{eventAt:100,recognizedAt:115,source:'swipe'}]]);
});
test('short tap retains release hop and long downward motion is ignored',()=>{
 const s=setup('canvas');s.el.emit('pointerdown');s.time(250);s.el.emit('pointerup',{clientX:105,clientY:104});
 assert.deepEqual(s.actions,[['jump',{eventAt:100,recognizedAt:250,source:'tap'}]]);
 s.el.emit('pointerdown');s.el.emit('pointerup',{clientY:150});assert.equal(s.actions.length,1);
});
test('release-only directional fallback works when no move event was delivered',()=>{
 const s=setup('canvas');s.el.emit('pointerdown');s.time(140);s.el.emit('pointerup',{clientX:70});assert.equal(s.actions[0][0],'left');
 s.time(200);s.el.emit('pointerdown');s.time(230);s.el.emit('pointerup',{clientY:70});assert.equal(s.actions[1][0],'jump');
});
test('canvas ignores unrelated pointers and cancellation never creates a tap',()=>{
 const s=setup('canvas');s.el.emit('pointerdown');s.el.emit('pointerdown',{pointerId:2,isPrimary:false});s.el.emit('pointermove',{pointerId:2,clientX:150});s.el.emit('pointerup',{pointerId:2});
 assert.equal(s.actions.length,0);s.el.emit('pointercancel',{pointerId:2});s.time(130);s.el.emit('pointermove',{clientX:130});assert.equal(s.actions.length,1);
 s.el.emit('pointercancel');s.el.emit('pointerup');assert.equal(s.actions.length,1);
 s.time(200);s.el.emit('pointerdown');s.el.emit('pointercancel');s.el.emit('pointerup');assert.equal(s.actions.length,1);
});
test('pointer capture failure is safe; new gestures recover; disposal removes listeners',()=>{
 const s=setup('canvas');s.el.setPointerCapture=()=>{throw new Error('capture unavailable');};s.el.emit('pointerdown');s.time(110);s.el.emit('pointermove',{clientX:130});assert.equal(s.actions.length,1);
 s.time(200);s.el.emit('pointerdown');s.time(210);s.el.emit('pointerup');assert.equal(s.actions.length,2);
 s.dispose();s.el.emit('pointerdown');s.el.emit('pointermove',{clientX:140});s.el.emit('pointerup');assert.equal(s.actions.length,2);
 assert.ok([...s.el.listeners.values()].every(set=>set.size===0));
});
test('disposing a button removes pointer and click behavior',()=>{
 const s=setup();s.dispose();s.el.emit('pointerdown');s.el.emit('click',{detail:0});assert.equal(s.actions.length,0);assert.ok([...s.el.listeners.values()].every(set=>set.size===0));
});
test('outside release clears capture-failure button and canvas presses',()=>{
 let at=100;const document=target(),button=target(),canvas=target(),actions=[];
 for(const element of [button,canvas]){element.ownerDocument=document;element.setPointerCapture=()=>{throw new Error('capture unavailable');};}
 const removeButton=bindGameplayButton(button,'left',(...args)=>actions.push(args),{now:()=>at});
 const removeCanvas=bindCanvasGestures(canvas,(...args)=>actions.push(args),{now:()=>at});
 button.emit('pointerdown');document.emit('pointerup');button.emit('pointerdown');assert.equal(actions.length,2,'outside release allows a new button press');
 canvas.emit('pointerdown',{pointerId:2});document.emit('pointerup',{pointerId:2});at=200;canvas.emit('pointerdown',{pointerId:3});canvas.emit('pointerup',{pointerId:3});assert.equal(actions.length,3,'outside release must not leave a stale canvas gesture');
 removeButton();removeCanvas();assert.ok([...document.listeners.values()].every(set=>set.size===0));
});
test('lost canvas capture only clears its matching gesture',()=>{
 const s=setup('canvas');s.el.emit('pointerdown');s.el.emit('lostpointercapture',{pointerId:2});s.el.emit('pointermove',{clientX:130});assert.equal(s.actions.length,1);
 s.el.emit('lostpointercapture');s.el.emit('pointerup');assert.equal(s.actions.length,1);
 s.el.emit('pointerdown');s.el.emit('lostpointercapture');s.el.emit('pointerup');assert.equal(s.actions.length,1,'lost capture cannot create a tap');
});
