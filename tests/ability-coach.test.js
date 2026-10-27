import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, buyAbility } from '../src/game.js';
import { createAbilityCoach } from '../src/ability-coach.js';

function running(course = []) {
  const game = createGame({ course });
  startGame(game); updateGame(game, .8);
  return game;
}

test('an unused boost is highlighted on a clear stretch without changing the game', () => {
  const game = running();
  const before = structuredClone(game);
  const coach = createAbilityCoach();
  assert.equal(coach.update(game).ability, 'boost');
  assert.deepEqual(game, before, 'a hint must never purchase or alter the race');
  buyAbility(game, 'boost');
  assert.notEqual(coach.update(game)?.ability, 'boost');
  updateGame(game, 12);
  assert.notEqual(coach.update(game)?.ability, 'boost', 'a successfully used skill must stop its hints');
  coach.reset();
  assert.equal(coach.update(running()).ability, 'boost');
});

test('long-jump highlight occurs inside a usable barrier window and a purchase clears it', () => {
  const game = running([{ id: 'wall', z: 37, lane: 1, type: 'barrier', length: 2 }]);
  const coach = createAbilityCoach();
  assert.equal(coach.update(game)?.ability, 'longJump');
  assert.equal(buyAbility(game, 'longJump').ok, true);
  assert.notEqual(coach.update(game)?.ability, 'longJump');
  updateGame(game, 1.2);
  assert.equal(game.hits, 0);
});

test('the gap suggestion accounts for its far edge and clears it after purchase', () => {
  const game = running([{ id: 'gap', z: 36, lane: 1, type: 'gap', length: 8 }]);
  assert.equal(createAbilityCoach().update(game)?.ability, 'longJump');
  buyAbility(game, 'longJump'); updateGame(game, 1.3);
  assert.equal(game.hits, 0);
});

test('no cues suggest unaffordable purchases, a late leap, boosting into obstacles, or jumping under a roof fall', () => {
  const close = running([{ id: 'wall', z: 22, lane: 1, type: 'barrier' }]);
  assert.equal(createAbilityCoach().update(close), null);
  const rubble = running([{ id: 'rubble', z: 34, lane: 1, type: 'rubble' }]);
  assert.equal(createAbilityCoach().update(rubble), null, 'free-hop rubble should not sell a long jump');
  const low = running(); low.timeLeft = 10;
  assert.equal(createAbilityCoach().update(low), null);
  const roof = running();
  roof.debris = [{ id: 'fall', lane: 1, z: roof.distance + 20, impactAt: roof.elapsed + .9 }];
  assert.equal(createAbilityCoach().update(roof), null);
  const early = createGame({ course: [] }); startGame(early);
  assert.equal(createAbilityCoach().update(early), null);
  assert.equal(createAbilityCoach().update(running(), false), null);
});

test('hints expire, do not repeat on one obstacle, and are capped at two opportunities per skill per run', () => {
  const game = running();
  const coach = createAbilityCoach();
  assert.equal(coach.update(game)?.ability, 'boost');
  updateGame(game, 3);
  assert.equal(coach.update(game), null);
  updateGame(game, 10);
  assert.equal(coach.update(game), null, 'same stretch must not keep blinking');
  game.obstacles = [{ id: 'next-stretch', z: game.distance + 150, lane: game.lane, type: 'barrier' }];
  assert.equal(coach.update(game)?.ability, 'boost');
  updateGame(game, 11);
  game.obstacles = [];
  assert.equal(coach.update(game), null, 'two ignored hints are enough');
});
