import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startGame, pauseGame, resumeGame,
  moveLane, jump, buyAbility, updateGame,
} from '../src/game.js';

function running(course = []) {
  const game = createGame({ course });
  startGame(game);
  return game;
}

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} should be close to ${expected}`);
}

test('games use an automatic valid avatar and retain explicit server identity', () => {
  const game = createGame({ course: [] });
  assert.ok(['courier', 'engineer', 'guard', 'runner'].includes(game.avatarId));
  const assigned = createGame({ course: [], avatarId: 'engineer', playerColor: '#abcdef' });
  startGame(assigned);
  updateGame(assigned, 1);
  assert.equal(assigned.avatarId, 'engineer');
  assert.equal(assigned.playerColor, '#abcdef');
});

test('the clock and movement start together and freeze while paused', () => {
  const game = createGame({ course: [] });
  updateGame(game, 1);
  assert.equal(game.phase, 'ready');
  assert.equal(game.distance, 0);
  assert.equal(game.timeLeft, 60);
  startGame(game);
  updateGame(game, 1);
  closeTo(game.distance, 22.1);
  closeTo(game.timeLeft, 59);
  pauseGame(game);
  const paused = structuredClone(game);
  updateGame(game, 4);
  assert.deepEqual(game, paused);
  resumeGame(game);
  updateGame(game, 1);
  closeTo(game.distance, 44.4);
  closeTo(game.elapsed, 2);
});

test('lane changes stay inside the three lanes and require a running game', () => {
  const game = createGame({ course: [] });
  moveLane(game, -1);
  assert.equal(game.lane, 1);
  startGame(game);
  moveLane(game, -1);
  moveLane(game, -1);
  assert.equal(game.lane, 0);
  moveLane(game, 1);
  moveLane(game, 1);
  moveLane(game, 1);
  assert.equal(game.lane, 2);
  moveLane(game, NaN);
  assert.equal(game.lane, 2);
});

test('an unobstructed run is winnable and stops exactly at the exit', () => {
  const game = running();
  updateGame(game, 90);
  assert.equal(game.phase, 'won');
  assert.equal(game.distance, 1350);
  closeTo(game.elapsed, 50);
  closeTo(game.finishTime, 50);
  closeTo(game.timeLeft, 20);
  assert.ok(game.checkpoints.every((checkpoint) => checkpoint.passed));
  const finished = structuredClone(game);
  updateGame(game, 10);
  assert.deepEqual(game, finished);
});

test('running out of time stops movement at the moment the clock expires', () => {
  const game = running();
  game.timeLeft = 0.5;
  updateGame(game, 10);
  assert.equal(game.phase, 'lost');
  assert.equal(game.timeLeft, 0);
  closeTo(game.distance, 11.025);
  closeTo(game.elapsed, 0.5);
  assert.equal(game.finishTime, null);
});

test('reaching the exit exactly as the clock expires counts as an escape', () => {
  const game = running();
  game.distance = 1327.9;
  game.timeLeft = 1;
  game.checkpoints.forEach((checkpoint) => { checkpoint.passed = true; });
  updateGame(game, 3);
  assert.equal(game.phase, 'won');
  assert.equal(game.timeLeft, 0);
});

test('a boost spends time immediately, increases speed, and cannot bypass its cooldown', () => {
  const game = running();
  assert.deepEqual(buyAbility(game, 'boost'), { ok: true });
  assert.equal(game.timeLeft, 57);
  assert.equal(game.timeSpent, 3);
  assert.equal(buyAbility(game, 'boost').ok, false);
  assert.equal(game.timeLeft, 57);
  updateGame(game, 1);
  closeTo(game.distance, 40.885);
  closeTo(game.timeLeft, 56);
  updateGame(game, 3);
  assert.equal(game.boostRemaining, 0);
  assert.equal(buyAbility(game, 'boost').ok, false);
  updateGame(game, 3);
  assert.equal(buyAbility(game, 'boost').ok, true);
  assert.equal(game.timeSpent, 6);
});

test('abilities require more time than their price and a running game', () => {
  const game = running();
  game.timeLeft = 3;
  assert.equal(buyAbility(game, 'boost').ok, false);
  game.timeLeft = 2;
  assert.equal(buyAbility(game, 'longJump').ok, false);
  assert.equal(game.timeSpent, 0);
  game.timeLeft = 10;
  pauseGame(game);
  assert.equal(buyAbility(game, 'longJump').ok, false);
  resumeGame(game);
  assert.equal(buyAbility(game, 'unknown').ok, false);
});

test('a barrier crossed during a long frame hits only once and briefly slows the runner', () => {
  const game = running([{ id: 'wall', z: 9, lane: 1, type: 'barrier' }]);
  jump(game);
  updateGame(game, 0.6);
  assert.equal(game.hits, 1);
  assert.ok(game.speed < 18);
  closeTo(game.timeLeft, 56.4);
  updateGame(game, 3);
  assert.equal(game.hits, 1);
  closeTo(game.speed, 22.72);
});

test('changing lanes avoids a barrier', () => {
  const game = running([{ id: 'wall', z: 9, lane: 1, type: 'barrier' }]);
  moveLane(game, -1);
  updateGame(game, 1);
  assert.equal(game.hits, 0);
  closeTo(game.timeLeft, 59);
});

test('the free hop clears rubble at its crossing time within a long frame', () => {
  const game = running([{ id: 'rubble', z: 9, lane: 1, type: 'rubble' }]);
  assert.equal(jump(game), true);
  assert.equal(jump(game), false);
  updateGame(game, 2);
  assert.equal(game.hits, 0);
  assert.equal(game.jumpRemaining, 0);
});

test('a normal hop cannot clear a gap but a paid long jump can', () => {
  const course = [{ id: 'gap', z: 9, lane: 1, type: 'gap', length: 8 }];
  const shortJump = running(course);
  jump(shortJump);
  updateGame(shortJump, 1);
  assert.equal(shortJump.hits, 1);

  const longJump = running(course);
  jump(longJump);
  assert.equal(buyAbility(longJump, 'longJump').ok, true);
  assert.equal(longJump.jumpKind, 'long');
  assert.equal(buyAbility(longJump, 'longJump').ok, false);
  updateGame(longJump, 2);
  assert.equal(longJump.hits, 0);
  assert.equal(longJump.timeSpent, 2);
});

test('a long jump that ends before the gap does not grant permanent protection', () => {
  const game = running([{ id: 'gap', z: 36, lane: 1, type: 'gap' }]);
  buyAbility(game, 'longJump');
  updateGame(game, 3);
  assert.equal(game.hits, 1);
});

test('a checkpoint awards five seconds once even across multiple updates', () => {
  const game = running();
  game.distance = 449;
  game.timeLeft = 1;
  updateGame(game, 1);
  assert.equal(game.phase, 'running');
  closeTo(game.timeLeft, 5);
  assert.equal(game.checkpoints[0].passed, true);
  updateGame(game, 1);
  closeTo(game.timeLeft, 4);
});

test('a checkpoint cannot revive a runner whose collision consumed the remaining time', () => {
  const game = running([{ id: 'wall-at-checkpoint', z: 450, lane: 1, type: 'barrier' }]);
  game.distance = 449;
  game.timeLeft = 1;
  updateGame(game, 1);
  assert.equal(game.phase, 'lost');
  assert.equal(game.timeLeft, 0);
  assert.equal(game.distance, 450);
  assert.equal(game.checkpoints[0].passed, false);
});

test('reaching a checkpoint exactly as natural time expires still awards its bonus', () => {
  const game = running();
  game.distance = 427.9;
  game.timeLeft = 1;
  updateGame(game, 1);
  assert.equal(game.phase, 'running');
  assert.equal(game.timeLeft, 5);
  assert.equal(game.checkpoints[0].passed, true);
});

test('invalid time deltas cannot corrupt the simulation', () => {
  const game = running();
  const before = structuredClone(game);
  for (const dt of [0, -1, Infinity, NaN, undefined, '1']) updateGame(game, dt);
  assert.deepEqual(game, before);
});

test('seeded courses are repeatable and leave at least one open lane per encounter', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = createGame({ seed });
    assert.deepEqual(game.obstacles, createGame({ seed }).obstacles);
    assert.ok(game.obstacles.length > 10);
    const lanesByDistance = new Map();
    for (const obstacle of game.obstacles) {
      assert.ok(obstacle.z >= 70);
      assert.ok(obstacle.z < 1350);
      const lanes = lanesByDistance.get(obstacle.z) ?? new Set();
      lanes.add(obstacle.lane);
      lanesByDistance.set(obstacle.z, lanes);
    }
    assert.ok([...lanesByDistance.values()].every((lanes) => lanes.size < 3));
  }
  assert.notDeepEqual(createGame({ seed: 1 }).obstacles, createGame({ seed: 2 }).obstacles);
});

test('running a course does not mutate the fixture used for a fresh run', () => {
  const course = [{ id: 'rubble', z: 9, lane: 1, type: 'rubble' }];
  const original = structuredClone(course);
  updateGame(running(course), 1);
  assert.deepEqual(course, original);
  const nextRun = running(course);
  updateGame(nextRun, 1);
  assert.equal(nextRun.hits, 1);
});
