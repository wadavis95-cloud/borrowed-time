import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMotionEffects} from '../src/graphics/motion-effects.js';

test('contact particles have their final instance-color layout before shader preparation',()=>{
 const scene=new THREE.Scene(),effect=createMotionEffects(scene);
 try{
  const particles=scene.getObjectByName('local-contact-particles');
  assert.ok(particles.instanceColor,'the warmup must see USE_INSTANCING_COLOR before the first footstep');
  const colors=particles.instanceColor;
  effect.update({phase:'running',mapId:'tunnel',distance:1,lane:1,jumpRemaining:0,hits:0},{lane:1,jumpHeight:0},1/60,false);
  assert.equal(particles.instanceColor,colors);
  effect.reset();assert.equal(particles.instanceColor,colors);
 }finally{effect.dispose();}
});

test('hidden shadow probe exercises an untextured, ordinary mesh caster',async()=>{
 const {createShadowWarmupProbe}=await import('../src/renderer.js');
 assert.equal(typeof createShadowWarmupProbe,'function');
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
 try{
  const probe=createShadowWarmupProbe(geometry,material);
  assert.equal(probe.isMesh,true);assert.equal(probe.isInstancedMesh,undefined);assert.equal(probe.castShadow,true);
  assert.equal(probe.material.map,null);assert.equal(probe.material.side,THREE.FrontSide);
  assert.equal(probe.geometry,geometry);assert.equal(probe.material,material);assert.equal(probe.frustumCulled,false);
 }finally{geometry.dispose();material.dispose();}
});
