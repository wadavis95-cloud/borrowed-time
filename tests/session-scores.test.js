import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionScores} from '../src/session-scores.js';
import {createSoloRace} from '../src/solo-race.js';
import {chooseDemoAction} from '../src/demo.js';

test('one first-place win per round, no award for nobody escaping, independent players',()=>{
 const score=createSessionScores();assert.equal(score.record('a',null),false);assert.equal(score.wins('you'),0);
 assert.equal(score.record('a','you'),true);assert.equal(score.record('a','cpu-1'),false);
 assert.equal(score.record('b','cpu-1'),true);assert.equal(score.record('c','you'),true);
 assert.equal(score.wins('you'),2);assert.equal(score.wins('cpu-1'),1);
});
test('solo wins carry across new races/maps and do not follow character names',()=>{
 const scores=createSessionScores();
 for(const [index,mapId] of ['tunnel','pirate'].entries()){
  const race=createSoloRace({seed:42,mapId,scores});race.start();
  for(let tick=0;tick<60*70&&!race.finished;tick++){
   if(tick%9===0){const action=chooseDemoAction(race.player,0);if(action)race.input(action);}race.update(1/60);
  }
  const s=race.snapshot();assert.equal(s.room.phase,'finished');assert.equal(s.players.reduce((sum,p)=>sum+p.wins,0),index+1);
  const winner=s.room.winnerId,before=scores.wins(winner);for(let i=0;i<100;i++)race.update(1/60);assert.equal(scores.wins(winner),before);
 }
});
