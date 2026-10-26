import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceView } from '../src/network.js';

function snapshot(distance, lane = 1, roundId = 'one') {
  return {
    room: { seed: 42, roundId },
    you: { id: 'me', game: { phase: 'running', distance, lane, jumpRemaining: 0, jumpDuration: .65 } },
    players: [
      { id: 'me', distance, lane, connected: true, phase: 'running' },
      { id: 'other', distance: distance + 10, lane, connected: true, phase: 'running', jumpRemaining: 0, jumpDuration: .65 },
    ],
  };
}

test('rendering interpolates actual positions without advancing authoritative state', () => {
  const view = createRaceView();
  const first = snapshot(100, 0), second = snapshot(110, 2);
  view.push(first, 1000);
  view.push(second, 1050);
  const result = view.sample(1075);
  assert.equal(result.game.distance, 105);
  assert.equal(result.opponents.length, 1);
  assert.equal(result.opponents[0].distance, 115);
  assert.equal(result.opponents[0].lane, 1);
  assert.equal(second.you.game.distance, 110);
  assert.ok(result.game.obstacles.length > 0);
  assert.equal(view.sample(5000).game.distance, 110, 'no invented progress during a stalled socket');
});

test('new rounds reset interpolation and remove disconnected ghosts immediately', () => {
  const view = createRaceView();
  view.push(snapshot(800), 1000);
  const next = snapshot(0, 1, 'two');
  next.players[1].connected = false;
  view.push(next, 1050);
  const result = view.sample(1050);
  assert.equal(result.game.distance, 0);
  assert.equal(result.opponents.length, 0);
});

test('jump starts do not blend with the previous grounded state', () => {
  const view = createRaceView();
  view.push(snapshot(100), 1000);
  const next = snapshot(101);
  next.players[1].jumpRemaining = 1.4;
  next.players[1].jumpDuration = 1.4;
  view.push(next, 1050);
  assert.equal(view.sample(1060).opponents[0].jumpRemaining, 1.4);
});

test('a runner whose race ended disappears instead of freezing on the course', () => {
  for (const phase of ['won', 'lost']) {
    const view = createRaceView();
    view.push(snapshot(100), 1000);
    const next = snapshot(105);
    next.players[1].phase = phase;
    next.players[1].jumpRemaining = .5;
    view.push(next, 1050);
    assert.equal(view.sample(1051).opponents.length, 0);
  }
});
