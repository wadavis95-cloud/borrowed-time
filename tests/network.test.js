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

test('view uses server collapse timings instead of the original seeded schedule', () => {
  const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
  const first = snapshot(100);
  first.debris = [{ id: 'roof', lane: 0, z: 150, warnAt: 1, fallAt: 2.75, impactAt: 3.4 }];
  view.push(first, 1000);
  assert.deepEqual(view.sample(1000).game.debris, first.debris);
  const next = snapshot(120);
  next.debris = [{ ...first.debris[0], fallAt: 2.1, impactAt: 2.75 }];
  view.push(next, 1050);
  assert.deepEqual(view.sample(1075).game.debris, next.debris);
  assert.equal(first.debris[0].impactAt, 3.4);
});

test('rendering interpolates actual positions without advancing authoritative state', () => {
  const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
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
  const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
  view.push(snapshot(800), 1000);
  const next = snapshot(0, 1, 'two');
  next.players[1].connected = false;
  view.push(next, 1050);
  const result = view.sample(1050);
  assert.equal(result.game.distance, 0);
  assert.equal(result.opponents.length, 0);
});

test('jump starts occur on the buffered timeline without blending from grounded', () => {
  const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
  view.push(snapshot(100), 1000);
  const next = snapshot(101);
  next.players[1].jumpRemaining = 1.4;
  next.players[1].jumpDuration = 1.4;
  view.push(next, 1050);
  assert.equal(view.sample(1060).opponents[0].jumpRemaining, 0);
  assert.equal(view.sample(1100).opponents[0].jumpRemaining, 1.4);
});

test('a runner whose race ended disappears instead of freezing on the course', () => {
  for (const phase of ['won', 'lost']) {
    const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
    view.push(snapshot(100), 1000);
    const next = snapshot(105);
    next.players[1].phase = phase;
    next.players[1].jumpRemaining = .5;
    view.push(next, 1050);
    assert.equal(view.sample(1051).opponents.length, 0);
  }
});

test('the view interpolates the race clock with positions and regenerates seeded debris', () => {
  const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
  const first = snapshot(18), next = snapshot(36);
  first.room.raceElapsed = 1;
  first.you.game.elapsed = 1;
  next.room.raceElapsed = 2;
  next.you.game.elapsed = 2;
  next.you.game.avatarId = 'engineer';
  next.players[1].avatarId = 'courier';
  next.players[1].color = '#ffc482';
  view.push(first, 1000);
  view.push(next, 1050);
  const result = view.sample(1075);
  assert.equal(result.game.raceElapsed, 1.5);
  assert.equal(result.game.elapsed, 1.5);
  assert.equal(result.game.distance, 27);
  assert.ok(result.game.debris.length >= 3);
  assert.equal(result.game.avatarId, 'engineer');
  assert.equal(result.opponents[0].avatarId, 'courier');
  assert.equal(result.opponents[0].color, '#ffc482');
  assert.equal(next.you.game.elapsed, 2);
  assert.equal(view.sample(5000).game.raceElapsed, 2, 'stale sockets cannot advance hazards');
});

test('the shared debris clock continues while a finished local runner watches opponents', () => {
  const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
  const first = snapshot(900), next = snapshot(900);
  for (const current of [first, next]) {
    current.you.game.phase = 'won';
    current.you.game.elapsed = 30;
  }
  first.room.raceElapsed = 31;
  next.room.raceElapsed = 32;
  view.push(first, 1000);
  view.push(next, 1050);
  const result = view.sample(1075);
  assert.equal(result.game.elapsed, 30);
  assert.equal(result.game.raceElapsed, 31.5);
  const newRound = snapshot(0, 1, 'rematch');
  newRound.room.seed = 100;
  newRound.room.raceElapsed = 0;
  newRound.you.game.elapsed = 0;
  view.push(newRound, 1080);
  assert.equal(view.sample(1080).game.raceElapsed, 0);
  assert.notDeepEqual(view.sample(1080).game.debris, result.game.debris);
});

test('landing interpolates local and remote jump motion through the last snapshot interval', () => {
  const view = createRaceView({maxPredictionMs:0,minDelayMs:50,initialDelayMs:50,maxDelayMs:50});
  const first = snapshot(100), next = snapshot(101);
  for (const state of [first.you.game, first.players[1]]) {
    state.jumpRemaining = .04;
    state.jumpKind = 'long';
    state.jumpDuration = 1.4;
  }
  for (const state of [next.you.game, next.players[1]]) {state.jumpDuration = 1.4;state.jumpKind=null;}
  view.push(first, 1000);
  view.push(next, 1050);
  const result = view.sample(1075);
  assert.ok(Math.abs(result.game.jumpRemaining-.015)<1e-8);
  assert.ok(Math.abs(result.opponents[0].jumpRemaining-.015)<1e-8);
  assert.equal(view.sample(5000).opponents[0].jumpRemaining, 0);
});
