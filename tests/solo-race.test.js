import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloRace} from '../src/solo-race.js';
import {MAP_IDS,getMap} from '../src/maps.js';
import {buyAbility,pauseGame,resumeGame} from '../src/game.js';
import {chooseDemoAction} from '../src/demo.js';

test('every map starts a human and three distinct CPU roles on one course/grid without sockets',()=>{
 for(const mapId of MAP_IDS){
  const race=createSoloRace({seed:42,mapId,avatarId:getMap(mapId).avatars[0]});race.start();
  const s=race.snapshot();assert.equal(s.players.length,4);assert.equal(s.players.filter(p=>p.isComputer).length,3);
  assert.equal(new Set(s.players.map(p=>p.avatarId)).size,4);assert.deepEqual(s.players.map(p=>p.lane),[1,0,2,1]);
  assert.equal(s.you.id,'you');assert.equal(s.room.phase,'racing');
  for(const opponent of race.racers.slice(1)){assert.deepEqual(opponent.game.obstacles,race.player.obstacles);assert.equal(opponent.game.debris,race.player.debris);}
 }
});
test('pause freezes all racers, purchases affect only their owner, and a new race has no old progress',()=>{
 const race=createSoloRace({seed:42});race.start();race.update(.1);
 const balances=race.racers.slice(1).map(r=>r.game.timeLeft);assert.equal(buyAbility(race.player,'boost').ok,true);
 assert.deepEqual(race.racers.slice(1).map(r=>r.game.timeLeft),balances);
 pauseGame(race.player);const frozen=structuredClone(race.racers);for(let i=0;i<20;i++)race.update(.1);assert.deepEqual(race.racers,frozen);
 assert.ok(race.opponents().every(p=>p.phase==='paused'));
 resumeGame(race.player);race.update(.1);assert.ok(race.racers.every(p=>p.game.distance>0));
 const fresh=createSoloRace({seed:43});fresh.start();assert.equal(fresh.player.timeSpent,0);assert.ok(fresh.racers.every(r=>r.game.elapsed===0&&r.game.distance===0));
});
test('CPU racers use normal rules, finish naturally and keep standings after the human ends',()=>{
 const race=createSoloRace({seed:42});race.start();
 // Drive the human with normal inputs too, to test a complete race deterministically.
 let elapsed=0;
 for(let tick=0;tick<60*70&&!race.finished;tick++){
  if(tick%9===0){const action=chooseDemoAction(race.player,0);if(action)race.input(action);}
  race.update(1/60);elapsed+=1/60;
 }
 const s=race.snapshot();assert.equal(s.room.phase,'finished');assert.ok(s.players.every(p=>p.phase==='won'));
 assert.deepEqual(s.standings.map(p=>p.position),[1,2,3,4]);assert.ok(s.room.winnerId);assert.ok(elapsed<70);
 assert.ok(race.racers.slice(1).every(r=>r.game.timeSpent>0));
 assert.ok(race.racers.every(r=>r.game.timeLeft>=0&&r.game.timeLeft<=70));
});
test('a timed-out human does not stop CPU racing and DNF gets no finishing position',()=>{
 const race=createSoloRace({seed:42});race.start();race.player.timeLeft=.01;race.update(1/60);
 assert.equal(race.player.phase,'lost');const before=race.racers[1].game.distance;race.update(.1);assert.ok(race.racers[1].game.distance>before);
 const own=race.snapshot().standings.find(p=>p.id==='you');assert.equal(own.status,'dnf');assert.equal(own.position,null);
});
