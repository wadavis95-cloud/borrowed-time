import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceObjects,obstacleVisualKey,debrisVisualKey} from '../src/race-objects.js';
import {createGame} from '../src/game.js';
import {MAP_IDS} from '../src/maps.js';
function fixture(){
 const calls={obstacle:0,debris:0,ghost:0,disposed:0};
 const item=kind=>{calls[kind]++;return {kind};};
 const cache=createRaceObjects({makeObstacle:()=>item('obstacle'),makeDebris:()=>item('debris'),makeGhost:()=>item('ghost'),dispose:()=>calls.disposed++});
 return {cache,calls};
}
test('every map prepares hazards before their first visibility or debris warning',()=>{
 for(const mapId of MAP_IDS){const {cache,calls}=fixture(),state=createGame({mapId,seed:812});cache.prepare(state,[]);
  assert.equal(calls.obstacle,state.obstacles.length);assert.equal(calls.debris,state.debris.length);
  const before={...calls};
  for(const hazard of state.obstacles)assert.ok(cache.obstacles.get(obstacleVisualKey(hazard)));
  for(const event of state.debris)assert.ok(cache.debris.get(debrisVisualKey(event)));
  // Changing schedules, resolutions and distance must never rebuild resources.
  state.distance=1000;state.debris.forEach(e=>e.warnAt=3);cache.prepare(state,[]);assert.deepEqual(calls,before);
 }
});
test('opponents stay allocated while out of view and reuse their model when returning',()=>{
 const {cache,calls}=fixture(),state=createGame(),rival={id:'friend',avatarId:'engineer',color:'#ff0000',distance:0};
 cache.prepare(state,[rival]);const avatar=cache.ghosts.get('friend');
 rival.distance=1000;cache.prepare(state,[rival]);rival.distance=2;cache.prepare(state,[rival]);
 assert.equal(cache.ghosts.get('friend'),avatar);assert.equal(calls.ghost,1);
});
test('new seeds reconcile a bounded current course and replacement roster without stale geometry',()=>{
 const {cache,calls}=fixture();
 for(let seed=0;seed<40;seed++){
  const state=createGame({seed});cache.prepare(state,[{id:'friend',avatarId:seed%2?'engineer':'courier',color:'#ff0000'}]);
  assert.equal(cache.obstacles.size,state.obstacles.length);assert.equal(cache.debris.size,state.debris.length);assert.equal(cache.ghosts.size,1);
 }
 cache.clear();assert.equal(cache.obstacles.size+cache.debris.size+cache.ghosts.size,0);
 assert.equal(calls.disposed,calls.obstacle+calls.debris+calls.ghost);
});
test('lane-specific roof slabs change when the debris lane changes, but timing changes reuse them',()=>{
 const {cache,calls}=fixture(),state={obstacles:[],debris:[{id:'fall',lane:0}]};cache.prepare(state,[]);
 const first=cache.debris.get(debrisVisualKey(state.debris[0]));state.debris[0].warnAt=4;cache.prepare(state,[]);assert.equal(calls.debris,1);
 state.debris[0].lane=2;cache.prepare(state,[]);assert.equal(calls.debris,2);assert.equal(calls.disposed,1);assert.notEqual(cache.debris.get(debrisVisualKey(state.debris[0])),first);
});
test('anonymous visual fixtures use the same avatar/color key as rendering',()=>{
 const {cache}=fixture();cache.prepare(createGame(),[{avatarId:'engineer',color:'#abc'}]);assert.ok(cache.ghosts.has('engineer:#abc'));
});
test('map transitions release the prior graphics through an explicit clear',()=>{
 const {cache,calls}=fixture();cache.prepare(createGame({mapId:'tunnel'}),[{id:'p',avatarId:'courier'}]);
 const allocated=calls.obstacle+calls.debris+calls.ghost;cache.clear();assert.equal(calls.disposed,allocated);
 const next=createGame({mapId:'pirate'});cache.prepare(next,[]);assert.equal(cache.obstacles.size,next.obstacles.length);assert.equal(cache.ghosts.size,0);
});
