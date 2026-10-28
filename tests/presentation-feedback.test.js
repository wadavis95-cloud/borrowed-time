import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MAP_IDS } from '../src/maps.js';
import { createGame, startGame } from '../src/game.js';
import { addObstacleReadability, warningPresentation } from '../src/graphics/readability.js';
import { createMovementFeedback, SURFACE_FEEDBACK } from '../src/movement-feedback.js';

test('all six maps get distinct hop, paid-jump and gap cues without changing obstacle data', () => {
  for(const mapId of MAP_IDS) for(const type of ['rubble','barrier','gap']) {
    const obstacle={id:'fixture',type,lane:1,z:90,length:type==='gap'?8:2};
    const before=structuredClone(obstacle),group=new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1.8,type==='barrier'?2:.5,.6),new THREE.MeshStandardMaterial()));
    addObstacleReadability(group,obstacle,mapId);
    assert.deepEqual(obstacle,before);
    assert.equal(group.userData.readability,type==='rubble'?'hop':'long-jump');
    assert.equal(group.getObjectByName('hop-cue')!==undefined,type==='rubble');
    assert.equal(group.getObjectByName('long-jump-cue')!==undefined,type!=='rubble');
    assert.ok(group.getObjectByName(type==='gap'?'gap-edge-near':'hazard-contrast-pad'));
    assert.ok(new THREE.Box3().setFromObject(group).max.y<2.2);
    assert.ok(SURFACE_FEEDBACK[mapId]);
  }
});

test('warning urgency follows existing times, has a nonflashing reduced-motion state and is read-only', () => {
  const event={warnAt:2,fallAt:3.75,impactAt:4.4};const before=structuredClone(event);
  assert.equal(warningPresentation(event,1).visible,false);
  const early=warningPresentation(event,2.1),late=warningPresentation(event,4.2);
  assert.ok(early.remaining>late.remaining);
  assert.ok(late.urgent);
  assert.equal(warningPresentation(event,4.4).visible,false);
  assert.equal(warningPresentation(event,3,true).pulse,1);
  assert.deepEqual(event,before);
});

test('local movement emits one takeoff, landing and hit without changing simulation state', () => {
  const tracker=createMovementFeedback(),game=createGame();startGame(game);
  const initial=structuredClone(game);assert.deepEqual(tracker.update(game,.016),[]);assert.deepEqual(game,initial);
  const air={...game,distance:1,elapsed:.04,jumpRemaining:.6,jumpDuration:.65};
  assert.deepEqual(tracker.update(air,.04).map(event=>event.kind),['takeoff']);
  assert.deepEqual(tracker.update({...air,distance:2,elapsed:.08,jumpRemaining:.56},.04),[]);
  assert.deepEqual(tracker.update({...air,distance:14,elapsed:.6,jumpRemaining:.04},.1),[]);
  const land={...game,distance:16,elapsed:.68};
  assert.deepEqual(tracker.update(land,.1).map(event=>event.kind),['landing']);
  assert.deepEqual(tracker.update({...land,elapsed:.7,hits:1,stunRemaining:.8},.02).map(event=>event.kind),['hit']);
  assert.deepEqual(tracker.update({...land,elapsed:.72,hits:1,stunRemaining:.78},.02),[]);
});

test('feedback skips stale frames, pause, rewinds and reduced motion; reset starts silently', () => {
  const tracker=createMovementFeedback(),base={phase:'running',distance:0,elapsed:0,lane:1,hits:0};
  tracker.update(base,0);
  assert.deepEqual(tracker.update({...base,distance:7,elapsed:.25},.1).map(e=>e.kind),['footstep']);
  assert.deepEqual(tracker.update({...base,phase:'paused',distance:20,elapsed:2},.1),[]);
  assert.deepEqual(tracker.update({...base,distance:0,elapsed:0},.1),[]);
  assert.deepEqual(tracker.update({...base,distance:100,elapsed:4},.1),[]);
  assert.deepEqual(tracker.update({...base,distance:107,elapsed:4.25},.1,true),[]);
  tracker.reset();assert.deepEqual(tracker.update({...base,distance:200,elapsed:10},.1),[]);
});

test('contact effects stay in one fixed pool, freeze on pause, clear on reduced motion and release resources', async () => {
  const {createMotionEffects}=await import('../src/graphics/motion-effects.js');
  const scene=new THREE.Scene(),effects=createMotionEffects(scene);
  const view=Object.freeze({lane:1,jumpHeight:0});
  let state={phase:'running',mapId:'frozen',distance:0,elapsed:0,hits:0,jumpRemaining:0};
  effects.update(state,view,0,false);
  for(let i=1;i<=40;i++){state={...state,distance:i*7,elapsed:i*.25};const before=structuredClone(state);effects.update(state,view,.1,false);assert.deepEqual(state,before);}
  const pool=scene.getObjectByName('local-contact-particles');
  assert.equal(pool.count,48);assert.ok(pool.visible);assert.equal(scene.children.length,2);
  const before=[...pool.instanceMatrix.array];
  effects.update({...state,phase:'paused'},view,.1,false);assert.deepEqual([...pool.instanceMatrix.array],before);
  effects.update({...state,distance:state.distance+1,elapsed:state.elapsed+.04},view,.04,true);assert.equal(pool.visible,false);
  effects.reset();effects.update(state,view,.1,false);assert.equal(pool.visible,false);
  let disposed=0;pool.geometry.addEventListener('dispose',()=>disposed++);
  effects.dispose();effects.dispose();assert.equal(scene.children.length,0);assert.equal(disposed,1);
});

test('near and far gap cues remain visible above themed deck and trail edges', async () => {
  const {createMapObstacle}=await import('../src/graphics/map-obstacles.js');
  const {DISTANCE_SCALE}=await import('../src/graphics/tunnel.js');
  for(const mapId of MAP_IDS.filter(id=>id!=='tunnel')) {
    const group=createMapObstacle(mapId,{type:'gap',length:8});group.updateMatrixWorld(true);
    for(const [end,z] of [['near',.10],['far',-8*DISTANCE_SCALE-.1]]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(.8,5,z),new THREE.Vector3(0,-1,0));
      assert.equal(ray.intersectObject(group,true)[0]?.object.name,'gap-edge-'+end,`${mapId} ${end} strip must be exposed`);
    }
  }
});
