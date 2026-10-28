import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoRace} from '../src/demo.js';
import {MAP_IDS,getMap} from '../src/maps.js';
const flush=()=>new Promise(r=>setImmediate(r));
function setup(options={}){const snapshots=[],errors=[],statuses=[];let sockets=0;const demo=createDemoRace({seed:42,onSnapshot:s=>snapshots.push(s),onStatus:s=>statuses.push(s),onError:e=>errors.push(e),connect(){sockets++;throw new Error('No demo sockets allowed');},...options});return {demo,snapshots,errors,statuses,get sockets(){return sockets;}};}
function advance(demo,seconds){for(let i=0;i<Math.round(seconds*60);i++)demo.update(1/60);}
test('showcase advances locally, uses no transport and stops all callbacks on exit',async()=>{
 const run=setup();await flush();assert.equal(run.sockets,0);assert.deepEqual(run.errors,[]);assert.equal(typeof run.demo.update,'function');assert.equal(run.snapshots.at(-1).room.phase,'countdown');
 advance(run.demo,3.2);assert.equal(run.snapshots.at(-1).room.phase,'racing');assert.ok(run.demo.view().distance>0);
 const before=run.demo.view().distance;for(let i=0;i<120;i++)run.demo.update(1/60,{visible:false});assert.equal(run.demo.view().distance,before);
 const count=run.snapshots.length;run.demo.close();advance(run.demo,5);await flush();assert.equal(run.snapshots.length,count);assert.equal(run.demo.send({type:'rematch'}),false);
});
test('all map showcases retain distinct themed roles, early spending and close racing with real rules',async()=>{
 for(const mapId of MAP_IDS){
  const run=setup({mapId});await flush();const roster=run.snapshots.at(-1).players;
  assert.equal(new Set(roster.map(p=>p.avatarId)).size,4);assert.ok(roster.every(p=>getMap(mapId).avatars.includes(p.avatarId)));
  let close=0,total=0,spentEarly=false,leapedEarly=false;
  for(let tick=0;tick<70*60;tick++){
   run.demo.update(1/60);const view=run.demo.view(),others=run.demo.opponents();
   if(view.elapsed<6&&view.timeSpent>0)spentEarly=true;
   if(view.elapsed<6&&(view.jumpKind==='long'||others.some(p=>p.jumpDuration===1.2&&p.jumpRemaining>0)))leapedEarly=true;
   if(view.phase==='running'&&view.elapsed>3){total++;if(others.some(p=>p.distance-view.distance>=-18&&p.distance-view.distance<45))close++;}
  }
  const result=run.snapshots.at(-1);assert.equal(result.room.phase,'finished');assert.ok(result.players.every(p=>p.phase==='won'),mapId);assert.ok(spentEarly&&leapedEarly,mapId+' early abilities');assert.ok(close/total>.85,mapId+' close racing');assert.equal(run.sockets,0);
  const round=result.room.roundId;assert.equal(run.demo.send({type:'rematch'}),true);assert.equal(run.demo.snapshot().room.phase,'countdown');assert.notEqual(run.demo.snapshot().room.roundId,round);run.demo.close();
 }
});
test('closing before the first microtask suppresses setup and demo state never aliases old snapshots',async()=>{
 const early=setup();early.demo.close();await flush();assert.equal(early.snapshots.length,0);assert.equal(early.statuses.length,0);
 const run=setup();await flush();advance(run.demo,4);const previous=run.snapshots.at(-1),distance=previous.you.game.distance;advance(run.demo,1);assert.equal(previous.you.game.distance,distance);assert.ok(run.demo.view().distance>distance);run.demo.close();
});
