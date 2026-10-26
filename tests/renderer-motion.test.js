import test from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../src/renderer.js';
import { getJumpHeight } from '../src/game.js';

function createMotion(options) {
  assert.equal(typeof presentation.createPresentationMotion, 'function', 'renderer exposes its real presentation state without requiring a GPU');
  return presentation.createPresentationMotion(options);
}

function snapshot(view) {
  return { ...view, opponents: [...view.opponents].map(([key, value]) => [key, { ...value }]) };
}

test('local lane, rival lane, camera follow and boost have the same response at 30, 60 and 120 Hz', () => {
  const samples = [];
  for (const hz of [30, 60, 120]) {
    const motion = createMotion();
    motion.update({ phase: 'running', lane: 1 }, 0, [{ id: 'rival', lane: 0 }]);
    let view;
    for (let frame = 0; frame < hz / 5; frame++) {
      view = motion.update({ phase: 'running', lane: 2, boostRemaining: 1 }, 1 / hz, [{ id: 'rival', lane: 1 }]);
    }
    assert.ok(view.lane > 1.9 && view.lane < 2, 'lane change is prompt but continuous');
    assert.ok(view.cameraLane > 1 && view.cameraLane < view.lane, 'camera follows the lane with a gentler response');
    assert.ok(view.boostFeel > .5 && view.boostFeel < 1, 'speed response eases in');
    samples.push([view.lane, view.cameraLane, view.boostFeel, view.opponents.get('rival').lane]);
  }
  for (const sample of samples.slice(1)) assert.ok(sample.every((value, index) => Math.abs(value - samples[0][index]) < 1e-10), 'response must depend on seconds, not frame count');
});

test('pausing freezes camera and all racer lanes; reset removes every rival and visual impulse', () => {
  const motion = createMotion();
  motion.update({ phase: 'running', lane: 1 }, 0, [{ id: 'rival', lane: 0 }]);
  const active = { phase: 'running', lane: 2, boostRemaining: 1, jumpRemaining: .45, jumpDuration: .9 };
  const view = motion.update(active, .05, [{ id: 'rival', lane: 2 }]);
  const frozen = snapshot(view);
  for (let frame = 0; frame < 120; frame++) {
    motion.update({ ...active, phase: 'paused', lane: 0, jumpRemaining: 0 }, 1 / 60, []);
    assert.deepEqual(snapshot(view), frozen, 'pause cannot let pending lane movement or the camera drift');
  }
  motion.reset();
  const fresh = createMotion();
  assert.deepEqual(snapshot(motion.update({ phase: 'ready', lane: 1 }, 0)), snapshot(fresh.update({ phase: 'ready', lane: 1 }, 0)));
  assert.equal(view.opponents.size, 0, 'no rival lane survives rematch');
});

test('camera smooths the shared jump arc consistently without changing actor height', () => {
  const samples = [];
  for (const hz of [30, 60, 120]) {
    const motion = createMotion();
    let view;
    for (let frame = 0; frame <= hz * .8; frame++) {
      const state = { phase: 'running', lane: 1, jumpRemaining: Math.max(0, .8 - frame / hz), jumpDuration: .8 };
      view = motion.update(state, frame ? 1 / hz : 0);
      assert.equal(view.jumpHeight, getJumpHeight(state), 'actor height always follows rules exactly');
      if (frame === hz * .4) assert.ok(view.cameraJump > 1 && view.cameraJump < view.jumpHeight, 'camera eases into the apex');
    }
    samples.push(view.cameraJump);
    assert.equal(view.jumpHeight, 0, 'actor lands without a visual height delay');
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) < .004, 'camera filtering remains consistent over the changing arc');
});

test('rival motion stays bounded and reduced motion removes nonessential camera motion', () => {
  const motion = createMotion({ reducedMotion: true });
  const rivals = Array.from({ length: 8 }, (_, i) => ({ id: `rival-${i}`, lane: i % 3 }));
  const view = motion.update({ phase: 'running', lane: 2, boostRemaining: 1, jumpRemaining: .4, jumpDuration: .8 }, .1, rivals);
  assert.equal(view.opponents.size, 3, 'presentation retains at most three rival tracks');
  assert.equal(view.boostFeel, 0, 'reduced motion disables boost zoom');
  assert.equal(view.cameraJump, 0, 'reduced motion disables camera bob during jumps');
  assert.ok(view.jumpHeight > 2, 'essential actor jump is still visible');
  motion.update({ phase: 'running', lane: 2 }, .1, [rivals[1]]);
  assert.deepEqual([...view.opponents.keys()], ['rival-1'], 'departed rivals leave no cached motion');
});

test('an initially paused view can display its supplied local and rival positions without advancing them', () => {
  const motion = createMotion();
  const state = { phase: 'paused', lane: 2, jumpRemaining: .4, jumpDuration: .8, boostRemaining: 1 };
  const view = motion.update(state, .1, [{ id: 'rival', lane: 0 }]);
  assert.equal(view.lane, 2);
  assert.equal(view.opponents.get('rival')?.lane, 0, 'initial paused rendering has a usable rival lane');
  assert.equal(view.jumpHeight, getJumpHeight(state));
  assert.equal(view.boostFeel, 0);
  const frozen = snapshot(view);
  motion.update({ ...state, lane: 0, jumpRemaining: 0 }, .1, []);
  assert.deepEqual(snapshot(view), frozen);
});
