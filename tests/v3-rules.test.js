import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../src/game.js';
import { createRoomManager } from '../src/server/rooms.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
function running(course = [], debris = []) {
  const game = rules.createGame({ course, debris });
  rules.startGame(game);
  return game;
}

// These fixtures catch frame-based acceleration and speed calculated from the
// spendable clock. Distances are integrals of 24 + .16t, independently derived.
test('acceleration advances by elapsed running time and freezes during pause', () => {
  const game = running();
  rules.updateGame(game, 10);
  near(game.distance, 248);
  near(game.speed, 25.6);
  rules.pauseGame(game);
  rules.updateGame(game, 40);
  near(game.elapsed, 10);
  near(game.distance, 248);
  rules.resumeGame(game);
  rules.updateGame(game, 15);
  near(game.distance, 650);
  near(game.speed, 28);
  near(game.timeLeft, 40);
});

test('an uninterrupted escape reaches the 1350m exit at the analytically calculated finish time', () => {
  const whole = running(), stepped = running();
  rules.updateGame(whole, 90);
  for (let i = 0; i < 5000; i += 1) rules.updateGame(stepped, .01);
  for (const game of [whole, stepped]) {
    assert.equal(game.phase, 'won');
    near(game.distance, 1350);
    const finish = (-24 + Math.sqrt(24 ** 2 + .32 * 1350)) / .16;
    near(game.finishTime, finish);
    near(game.timeLeft, 70 - finish);
    assert.ok(game.checkpoints.every(checkpoint => checkpoint.passed));
  }
});

test('acceleration caps at 32m/s even when a slowdown delays arrival beyond 50 seconds', () => {
  const game = running();
  game.elapsed = 49;
  rules.updateGame(game, 2);
  near(game.distance, 63.92);
  near(game.speed, 32);
});

test('boost and stun multiply the integrated accelerating speed through their exact endpoints', () => {
  const whole = running(), stepped = running();
  for (const game of [whole, stepped]) {
    rules.buyAbility(game, 'boost');
    game.stunRemaining = .8;
  }
  rules.updateGame(whole, 4);
  for (let i = 0; i < 400; i += 1) rules.updateGame(stepped, .01);
  for (const game of [whole, stepped]) {
    near(game.distance, 160.379904);
    near(game.speed, 24.64);
    near(game.timeLeft, 51);
    assert.equal(game.boostRemaining, 0);
    assert.equal(game.stunRemaining, 0);
  }
});

test('collision time is solved inside the acceleration curve before a stun starts', () => {
  const course = [{ z: 24.08, lane: 1, type: 'barrier' }];
  const whole = running(course), stepped = running(course);
  rules.updateGame(whole, 4);
  for (let i = 0; i < 400; i += 1) rules.updateGame(stepped, .01);
  for (const game of [whole, stepped]) {
    assert.equal(game.hits, 1);
    near(game.distance, 86.62144);
    near(game.timeLeft, 53);
  }
});

test('the public jump arc has a lower forward-leap apex and a lower free hop', () => {
  assert.equal(typeof rules.getJumpHeight, 'function');
  near(rules.getJumpHeight({ jumpDuration: 1.2, jumpRemaining: .6 }), 2.6);
  near(rules.getJumpHeight({ jumpDuration: .65, jumpRemaining: .325 }), 1.15);
  near(rules.getJumpHeight({ jumpDuration: 1.2, jumpRemaining: 1.2 }), 0);
  near(rules.getJumpHeight({ jumpDuration: 1.2, jumpRemaining: 0 }), 0);
});

// The barrier appears at t=.4, t=.6 or t=.8 with the actual forward burst. All are inside the visible
// paid arc's clearance window, but the free hop can never rise high enough.
test('a paid jump has a usable barrier clearance window matching its rendered height', () => {
  for (const z of [.4,.6,.8].map(t=>1.9*(24*t+.08*t*t))) {
    const game = running([{ z, lane: 1, type: 'barrier' }]);
    rules.buyAbility(game, 'longJump');
    rules.updateGame(game, 2);
    assert.equal(game.hits, 0, `paid jump should clear barrier at ${z}`);
  }
  const hop = running([{ z: 7.80845, lane: 1, type: 'barrier' }]);
  rules.jump(hop);
  rules.updateGame(hop, 2);
  assert.equal(hop.hits, 1);
});

test('a paid jump below the barrier on ascent or descent still collides', () => {
  for (const z of [.1,1.1].map(t=>1.9*(24*t+.08*t*t))) {
    const game = running([{ z, lane: 1, type: 'barrier' }]);
    rules.buyAbility(game, 'longJump');
    rules.updateGame(game, 2);
    assert.equal(game.hits, 1);
  }
});

test('scheduled debris lands at accelerated nominal arrival with a fast readable fall', () => {
  const game = rules.createGame({ seed: 42 });
  assert.ok(game.debris.length >= 3);
  for (const event of game.debris) {
    const time = event.impactAt;
    near(event.z, 24 * time + .08 * time * time);
    near(event.impactAt - event.fallAt, .45);
    assert.ok(event.fallAt - event.warnAt >= 1.8);
    assert.ok(game.obstacles.every(obstacle => Math.abs(obstacle.z - event.z) >= rules.CONFIG.debrisMinimumGap / 2));
  }
});

test('a room assigns four distinct characters and reuses only a departed lobby identity', () => {
  const manager = createRoomManager({ random: () => 0 });
  manager.connect('one');
  manager.handle('one', { type: 'create', name: 'One' });
  const code = manager.snapshot('one').room.code;
  for (const id of ['two', 'three', 'four']) {
    manager.connect(id);
    assert.equal(manager.handle(id, { type: 'join', code, name: id }).ok, true);
  }
  assert.deepEqual(manager.snapshot('one').players.map(player => player.avatarId), ['courier', 'engineer', 'guard', 'runner']);
  manager.disconnect('three');
  manager.connect('replacement');
  manager.handle('replacement', { type: 'join', code, name: 'Replacement' });
  assert.equal(manager.snapshot('replacement').you.game.avatarId, 'guard');
  assert.equal(new Set(manager.snapshot('one').players.map(player => player.avatarId)).size, 4);
});
