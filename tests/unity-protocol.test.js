import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnityProtocol } from '../src/unity-protocol.js';
import { createGame, startGame, jump, buyAbility, updateGame } from '../src/game.js';

test('Unity receives the rules-owned jump arc and shared race clock without changing the game', () => {
  const game = createGame({ course: [], debris: [] });
  startGame(game); jump(game); updateGame(game, .325);
  game.raceElapsed = 9.75;
  const before = structuredClone(game);
  const bridge = createUnityProtocol();
  let packet = bridge.sample(game, 1 / 60, []);
  assert.ok(Math.abs(packet.frame.player.jumpHeight - 1.15) < 1e-9);
  assert.ok(Math.abs(packet.frame.player.jumpProgress - .5) < 1e-9);
  assert.equal(packet.frame.elapsed, 9.75);
  assert.deepEqual(game, before);
  buyAbility(game, 'longJump'); updateGame(game, .7);
  packet = bridge.sample(game, 1 / 60, []);
  assert.ok(Math.abs(packet.frame.player.jumpHeight - 3) < 1e-9);
  assert.equal(packet.frame.player.jumpDuration, 1.4);
});

test('only the local runner carries boost and hit effects; ghosts expose movement alone', () => {
  const game = createGame({ course: [], debris: [] });
  startGame(game); buyAbility(game, 'boost');
  const opponent = { id: 'other', avatarId: 'mara', color: '#fff', phase: 'running',
    distance: 25, lane: .5, jumpRemaining: 0, jumpDuration: .65,
    boostRemaining: 4, timeLeft: 50, hitFlash: .4, stunRemaining: .8 };
  const { frame } = createUnityProtocol().sample(game, 1 / 60, [opponent]);
  assert.equal(frame.player.boosting, true);
  assert.equal(frame.opponents[0].lane, .5);
  for (const key of ['boosting', 'boostRemaining', 'hitFlash', 'stunned', 'stunRemaining', 'timeLeft']) {
    assert.equal(key in frame.opponents[0], false, `ghost leaked ${key}`);
  }
});

test('opponents leave the screen by distance or race status', () => {
  const game = createGame({ course: [], debris: [] }); game.distance = 100;
  const ghost = (id, distance, extra = {}) => ({ id, distance, lane: 1, phase: 'running', ...extra });
  const { frame } = createUnityProtocol().sample(game, .016, [
    ghost('behind', 81), ghost('near', 90), ghost('far', 356),
    ghost('finished', 120, { phase: 'won' }), ghost('gone', 130, { connected: false }),
  ]);
  assert.deepEqual(frame.opponents.map(p => p.id), ['near']);
});

test('course delivery and epochs reset before a rematch; mutable hit state is never sent as geometry', () => {
  const bridge = createUnityProtocol();
  const game = createGame();
  let packet = bridge.sample(game, .016, []);
  const epoch = packet.frame.epoch;
  assert.equal(packet.course.epoch, epoch);
  assert.equal(packet.course.courseLength, 1350);
  assert.ok(packet.course.obstacles.length > 0);
  game.obstacles[0].resolved = true;
  packet = bridge.sample(game, .016, []);
  assert.equal(packet.course, null);
  assert.equal(packet.frame.sequence, 2);
  bridge.reset();
  packet = bridge.sample(game, .016, []);
  assert.ok(packet.frame.epoch > epoch);
  assert.equal(packet.frame.sequence, 1);
  assert.equal(packet.course.obstacles[0].resolved, undefined);
  assert.deepEqual(packet.course.checkpoints, [{ z: 450 }, { z: 900 }]);
});
