import test from 'node:test';import assert from 'node:assert/strict';
import {CONFIG,ABILITIES,createGame,startGame,buyAbility,updateGame,pauseGame,resumeGame,getJumpHeight,projectTravel} from '../src/game.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} differs from ${b}`);
function run(){const g=createGame({course:[]});startGame(g);return g;}
test('paid leap is lower, quicker and earns actual forward distance with unchanged price',()=>{
 const game=run();assert.equal(buyAbility(game,'longJump').ok,true);assert.equal(game.timeSpent,4);
 near(getJumpHeight({jumpDuration:ABILITIES.longJump.duration,jumpRemaining:ABILITIES.longJump.duration/2}),2.6);
 updateGame(game,1.2);near(game.distance,(24*1.2+.08*1.2**2)*1.9);assert.equal(game.jumpRemaining,0);assert.equal(game.jumpKind,null);
 updateGame(game,.8);near(game.distance,24*2+.08*4+(24*1.2+.08*1.2**2)*.9);near(game.timeLeft,54);
});
test('boost and leap do not multiply into an excessive launch; pause holds the airborne burst',()=>{
 const game=run();buyAbility(game,'boost');buyAbility(game,'longJump');pauseGame(game);const before=structuredClone(game);updateGame(game,5);assert.deepEqual(game,before);resumeGame(game);
 updateGame(game,1.2);near(game.distance,(24*1.2+.08*1.2**2)*1.9);
 const beforeLanding=game.distance;updateGame(game,.2);near(game.distance-beforeLanding,(24*.2+.08*(1.4**2-1.2**2))*1.85);
});
test('travel projection matches stepped simulation across leap, boost and stun endpoints',()=>{
 for(const both of [false,true]){
  const game=run();buyAbility(game,'longJump');if(both)buyAbility(game,'boost');game.stunRemaining=.4;
  const expected=projectTravel(game,2.3);for(let i=0;i<230;i++)updateGame(game,.01);near(game.distance,expected);
 }
});
test('the new forward leap clears a correctly timed tall barrier and gap without granting blanket immunity',()=>{
 for(const type of ['barrier','gap']){
  const game=createGame({course:[{z:27.3,lane:1,type,length:8}]});startGame(game);buyAbility(game,'longJump');updateGame(game,2);assert.equal(game.hits,0,type);
 }
 const late=createGame({course:[{z:3,lane:1,type:'barrier'}]});startGame(late);buyAbility(late,'longJump');updateGame(late,.5);assert.equal(late.hits,1);
});
