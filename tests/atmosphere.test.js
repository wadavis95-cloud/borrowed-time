import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAtmosphere} from '../src/graphics/atmosphere.js';

test('all six atmospheres are bounded, avoid lanes, respect reduced motion and release resources',()=>{
  for(const id of ['tunnel','pirate','jungle','frozen','orbital','desert']) {
    const scene=new THREE.Scene(),effect=createAtmosphere(scene,id);
    const counts=[];let geometries=0,materials=0;
    scene.traverse(item=>{if(item.geometry){counts.push(item.geometry.attributes.position.count);item.geometry.addEventListener('dispose',()=>geometries++);}if(item.material)item.material.addEventListener('dispose',()=>materials++);});
    effect.update(100,4,false);
    const cloud=scene.getObjectByName('ambient-edge-particles');
    assert.equal(cloud.geometry.attributes.position.count,72);
    for(let i=0;i<72;i++)assert.ok(Math.abs(cloud.geometry.attributes.position.getX(i))>=5.1,'never drift through a collision lane');
    const a=Array.from(cloud.geometry.attributes.position.array);effect.update(100,5,false);
    assert.notDeepEqual(Array.from(cloud.geometry.attributes.position.array),a);
    effect.update(100,6,true);assert.equal(cloud.visible,false);
    const count=scene.children.length;for(let i=0;i<200;i++)effect.update(i,i/60,false);assert.equal(scene.children.length,count);
    assert.ok(counts.reduce((a,b)=>a+b,0)<500);
    effect.dispose();assert.equal(scene.children.length,0);assert.ok(geometries>0&&materials>0);
  }
});

test('edge particles and station lights move toward the runner with their supporting course',()=>{
  const scene=new THREE.Scene(),effect=createAtmosphere(scene,'orbital');
  effect.update(0,0,false);
  const cloud=scene.getObjectByName('ambient-edge-particles');
  const z=cloud.geometry.attributes.position.getZ(20);
  const lights=scene.getObjectByName('station-warning-lights'),before=new THREE.Matrix4(),after=new THREE.Matrix4();
  lights.getMatrixAt(2,before);
  effect.update(30,0,false);lights.getMatrixAt(2,after);
  assert.ok(cloud.geometry.attributes.position.getZ(20)>z,'particle flow matches forward course scrolling');
  assert.ok(after.elements[14]>before.elements[14],'lights stay aligned with station supports');
  effect.dispose();
});
