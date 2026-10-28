import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFinish,ESCAPE_DESTINATIONS} from '../src/graphics/finish.js';
import {withDeadline} from '../src/loading.js';

test('six themed exits keep celebration local, bounded, resettable and reduced-motion safe',()=>{
  assert.equal(new Set(Object.values(ESCAPE_DESTINATIONS).map(v=>v.arrival)).size,6);
  for(const id of Object.keys(ESCAPE_DESTINATIONS)) {
    const scene=new THREE.Scene(),effect=createFinish(scene,id,1350);
    effect.update({phase:'running',distance:1340,lane:1},.016,false);
    effect.update({phase:'won',distance:1350,lane:1},.016,false);
    const halo=scene.getObjectByName('local-escape-halo');assert.equal(halo.visible,true);
    for(let i=0;i<100;i++)effect.update({phase:'won',distance:1350,lane:1},.016,false);
    assert.equal(halo.visible,false,'no repeated celebration on won snapshots');
    effect.reset();assert.equal(halo.visible,false);
    effect.update({phase:'running',distance:1300,lane:1},.016,true);
    effect.update({phase:'won',distance:1350,lane:1},.016,true);assert.equal(halo.visible,false);
    effect.reset();effect.update({phase:'running',distance:1300,lane:1},.016,false);effect.update({phase:'lost',distance:1300,lane:1},.016,false);assert.equal(halo.visible,false);
    let disposed=0;scene.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));
    effect.dispose();assert.equal(scene.children.length,0);assert.ok(disposed>0);
  }
});
test('loading deadline settles failures and does not replace timely success',async()=>{
  assert.equal(await withDeadline(Promise.resolve('ready'),100), 'ready');
  await assert.rejects(withDeadline(new Promise(()=>{}),5),/taking too long/i);
  await assert.rejects(withDeadline(Promise.reject(new Error('asset failed')),100),/asset failed/);
});

test('whole graphics preparation times out stalled modules and ignores late completion',async()=>{
  const {loadClassicGraphics}=await import('../src/loading.js');
  let resolveModules,created=0;const progress=[];
  const stalled=new Promise(resolve=>{resolveModules=resolve;});
  await assert.rejects(loadClassicGraphics(()=>stalled,value=>progress.push(value),5),/taking too long/i);
  resolveModules([{createRenderer(){created++;}},{async preloadAvatars(report){report(1);}}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(created,0);assert.deepEqual(progress,[]);
  const create=()=>{};
  assert.equal(await loadClassicGraphics(async()=>[{createRenderer:create},{async preloadAvatars(report){report(.5);report(1);}}],value=>progress.push(value),100),create);
  assert.deepEqual(progress,[.5,1]);
});
