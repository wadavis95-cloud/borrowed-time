import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlTiming } from '../src/control-timing.js';

const game = (overrides = {}) => ({
  phase: 'running', lane: 1, jumpRemaining: 0, jumpDuration: .65,
  jumpKind: null, boostRemaining: 0, boostCooldown: 0, timeSpent: 0, ...overrides,
});
const snapshot = (seq, state, roundId = 'one', serverTime = seq * 50) => ({
  serverTime, room: { roundId }, you: { inputSeq: seq, game: state },
});
const pose = (overrides = {}) => ({ lane: 1, jumpHeight: 0, boostFeel: 0, ...overrides });
function setup(options = {}) {
  const observations = [], counters = {};
  let clock = 0;
  const timing = createControlTiming({
    observe: (key, ms) => observations.push([key, ms]),
    count: key => { counters[key] = (counters[key] || 0) + 1; },
    now: () => clock, ...options,
  });
  const send = (action, seq = 1, baseline = game(), sentAt = 100, roundId = 'one') => timing.sent(
    action, { seq, roundId, sentAt }, { eventAt: sentAt - 20, recognizedAt: sentAt - 5, source: 'touch' }, baseline,
  );
  const draw = (renderedPose, seq, state, at, extra = {}) => timing.rendered(
    renderedPose, { inputSeq: seq, state, isPredicted: false, ...extra }, at,
  );
  return { timing, observations, counters, send, draw, clock: value => { clock = value; } };
}

test('separates dispatch, recognized response, and confirmed render timing using actual lane easing', () => {
  const h = setup(), state = game({ lane: 2 });
  h.draw(pose(), 0, game(), 90);
  h.send('right');
  h.timing.confirm(snapshot(1, state), 150);
  h.draw(pose(), 1, state, 160); // Target changed, but the renderer has not moved yet.
  assert.deepEqual(h.observations, [['controlDispatch', 20], ['controlRecognize', 5]]);
  h.draw(pose({ lane: 1.2 }), 1, state, 176);
  h.draw(pose({ lane: 1.4 }), 1, state, 192);
  assert.deepEqual(h.observations, [
    ['controlDispatch', 20], ['controlRecognize', 5],
    ['controlRender', 81], ['controlConfirmRender', 26],
  ]);
  assert.equal(h.counters.controlSent, 1);
  assert.equal(h.counters.controlMatched, 1);
  assert.equal(h.timing.diagnostics().pending, 0);
});

test('a buffered pose cannot respond to an input its source snapshot does not cover', () => {
  const h = setup(), state = game({ lane: 2 });
  h.send('right'); h.timing.confirm(snapshot(1, state), 150);
  h.draw(pose({ lane: 1.2 }), 0, state, 160);
  h.draw(pose({ lane: .8 }), 1, state, 170); // Movement in the wrong direction.
  assert.equal(h.counters.controlMatched || 0, 0);
  h.draw(pose({ lane: 1.3 }), 1, state, 180);
  assert.equal(h.counters.controlMatched, 1);
});

test('an interpolated lane state can identify the first actual eased onset before it reaches the target', () => {
  const h = setup(), target = game({ lane: 2 });
  h.send('right'); h.timing.confirm(snapshot(1, target), 150);
  h.draw(pose({ lane: 1.1 }), 1, game({ lane: 1.2 }), 160);
  assert.equal(h.counters.controlMatched, 1);
  assert.deepEqual(h.observations.slice(-2), [['controlRender', 65], ['controlConfirmRender', 10]]);
});

test('boost uses its authoritative field coverage when lane and jump still use an older buffered snapshot', () => {
  const h = setup(), active = game({ boostRemaining: 3.9, boostCooldown: 6.9, timeSpent: 5 });
  h.send('boost'); h.timing.confirm(snapshot(1, active), 150);
  h.draw(pose({ boostFeel: .1 }), 0, active, 160, { boostInputSeq: 1 });
  assert.equal(h.counters.controlMatched, 1);
  assert.deepEqual(h.observations.slice(-2), [['controlRender', 65], ['controlConfirmRender', 10]]);
});

test('processed input acknowledgments alone cannot mark unavailable actions successful', () => {
  const h = setup();
  h.send('right', 1, game({ lane: 2 }));
  h.timing.confirm(snapshot(1, game({ lane: 2 })), 150);
  h.draw(pose({ lane: 2 }), 1, game({ lane: 2 }), 160);
  h.send('jump', 2, game(), 200);
  h.timing.confirm(snapshot(2, game()), 250); // Already landed or never accepted.
  h.draw(pose({ jumpHeight: .5 }), 2, game(), 260);
  assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.counters.controlUnmatched, 2);
});

test('coalesced opposing controls cancel ambiguous earlier targets and retain the latest intent', () => {
  const h = setup();
  h.send('left', 1); h.send('right', 2, game(), 110); h.send('left', 3, game(), 120);
  h.timing.confirm(snapshot(3, game({ lane: 0 })), 170);
  h.draw(pose({ lane: .8 }), 3, game({ lane: 0 }), 180);
  assert.equal(h.counters.controlCancelled, 2);
  assert.equal(h.counters.controlMatched, 1);
  assert.deepEqual(h.observations.slice(-2), [['controlRender', 65], ['controlConfirmRender', 10]]);
});

test('opposing inputs returning to the already rendered lane do not invent a response', () => {
  const h = setup();
  h.draw(pose(), 0, game(), 90);
  h.send('left', 1); h.send('right', 2, game(), 110);
  h.timing.confirm(snapshot(2, game()), 160);
  h.draw(pose(), 2, game(), 180);
  assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.counters.controlCancelled, 1);
  assert.equal(h.counters.controlUnmatched, 1);
});

test('a coalesced repeated lane input at the boundary cannot claim the earlier accepted move', () => {
  const h = setup(), target = game({ lane: 2 });
  h.send('right', 1); h.send('right', 2, game(), 110);
  h.timing.confirm(snapshot(2, target), 160);
  h.draw(pose({ lane: 1.3 }), 2, target, 180);
  assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.counters.controlCancelled, 1);
  assert.equal(h.counters.controlUnmatched, 1);
});

test('a coalesced lane burst returning to its authority origin cannot claim prior easing as a new response', () => {
  const h = setup(), left = game({ lane: 0 });
  h.send('left', 1); h.timing.confirm(snapshot(1, left), 150);
  h.draw(pose({ lane: .8 }), 1, left, 160);
  assert.equal(h.counters.controlMatched, 1);
  h.send('right', 2, left, 170); h.send('left', 3, left, 180);
  h.timing.confirm(snapshot(3, left), 200);
  h.draw(pose({ lane: .6 }), 3, left, 210);
  assert.equal(h.counters.controlMatched, 1, 'continuing the original easing must not match the final tap');
  assert.equal(h.counters.controlUnmatched, 1);
  assert.equal(h.counters.controlCancelled, 1);
});

test('a coalesced lane burst ending at a different target can still match a new visible response', () => {
  const h = setup(), left = game({ lane: 0 }), right = game({ lane: 2 });
  h.send('left', 1); h.timing.confirm(snapshot(1, left), 150);
  h.draw(pose({ lane: .8 }), 1, left, 160);
  h.send('right', 2, left, 170); h.send('right', 3, left, 180);
  h.timing.confirm(snapshot(3, right), 200);
  h.draw(pose({ lane: .9 }), 3, game({ lane: 1.1 }), 210);
  assert.equal(h.counters.controlMatched, 2);
  assert.equal(h.counters.controlCancelled, 1);
});

test('jump and boost responses require their matching active state and actual visible onset', () => {
  for (const [action, active, renderedPose] of [
    ['jump', { jumpRemaining: .6, jumpKind: 'normal' }, { jumpHeight: .2 }],
    ['longJump', { jumpRemaining: 1.1, jumpDuration: 1.2, jumpKind: 'long', timeSpent: 4 }, { jumpHeight: .5 }],
    ['boost', { boostRemaining: 3.9, boostCooldown: 6.9, timeSpent: 5 }, { boostFeel: .1 }],
  ]) {
    const h = setup(), state = game(active);
    h.send(action); h.timing.confirm(snapshot(1, state), 150);
    h.draw(pose(), 1, state, 160);
    assert.equal(h.counters.controlMatched || 0, 0, action);
    h.draw(pose(renderedPose), 1, state, 180);
    assert.equal(h.counters.controlMatched, 1, action);
    assert.deepEqual(h.observations.slice(-2), [['controlRender', 85], ['controlConfirmRender', 30]]);
  }
});

test('an existing hop, long leap, or boost cannot be attributed to an unavailable repeat', () => {
  for (const [action, baseline] of [
    ['jump', game({ jumpRemaining: .4, jumpKind: 'normal' })],
    ['longJump', game({ jumpRemaining: .8, jumpDuration: 1.2, jumpKind: 'long', timeSpent: 4 })],
    ['boost', game({ boostRemaining: 2, boostCooldown: 5, timeSpent: 5 })],
    ['boost', game({ boostCooldown: 2 })],
  ]) {
    const h = setup(); h.send(action, 1, baseline);
    h.timing.confirm(snapshot(1, baseline), 150);
    h.draw(pose({ jumpHeight: 1, boostFeel: .5 }), 1, baseline, 180);
    assert.equal(h.counters.controlMatched || 0, 0, action);
    assert.equal(h.counters.controlUnmatched, 1, action);
  }
});

test('coalesced different-channel acknowledgments can independently match visible responses', () => {
  const h = setup(), state = game({ lane: 2, boostRemaining: 3.9, timeSpent: 5 });
  h.send('right', 1); h.send('boost', 2, game(), 110);
  h.timing.confirm(snapshot(2, state), 160);
  h.draw(pose({ lane: 1.2, boostFeel: .1 }), 2, state, 180);
  assert.equal(h.counters.controlMatched, 2);
  assert.equal(h.counters.controlCancelled || 0, 0);
});

test('coalesced repeat abilities cannot claim the first accepted ability as their response', () => {
  for (const [action, active, renderedPose] of [
    ['jump', { jumpRemaining: .5, jumpKind: 'normal' }, { jumpHeight: .7 }],
    ['longJump', { jumpRemaining: 1, jumpDuration: 1.2, jumpKind: 'long', timeSpent: 4 }, { jumpHeight: 1 }],
    ['boost', { boostRemaining: 3.8, timeSpent: 5 }, { boostFeel: .3 }],
  ]) {
    const h = setup(), state = game(active);
    h.send(action, 1); h.send(action, 2, game(), 110);
    h.timing.confirm(snapshot(2, state), 150);
    h.draw(pose(renderedPose), 2, state, 180);
    assert.equal(h.counters.controlMatched || 0, 0, action);
    assert.equal(h.counters.controlCancelled, 1, action);
    assert.equal(h.counters.controlUnmatched, 1, action);
  }
});

test('three rapid ability taps remain ambiguous even after an excluded repeat was dropped', () => {
  const h = setup(), state = game({ boostRemaining: 3.8, boostCooldown: 6.8, timeSpent: 5 });
  h.send('boost', 1); h.send('boost', 2, game(), 110); h.send('boost', 3, game(), 120);
  h.timing.confirm(snapshot(3, state), 150);
  h.draw(pose({ boostFeel: .3 }), 3, state, 180);
  assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.counters.controlCancelled, 1);
  assert.equal(h.counters.controlUnmatched, 2);
});

test('a falling pose from the prior arc cannot be measured as a new hop response', () => {
  const h = setup(), state = game({ jumpRemaining: .6, jumpKind: 'normal' });
  h.draw(pose({ jumpHeight: .7 }), 0, game({ jumpRemaining: .1, jumpKind: 'normal' }), 90);
  h.send('jump'); h.timing.confirm(snapshot(1, state), 150);
  h.draw(pose({ jumpHeight: .3 }), 1, state, 160);
  assert.equal(h.counters.controlMatched || 0, 0);
  h.draw(pose({ jumpHeight: .9 }), 1, state, 180);
  assert.equal(h.counters.controlMatched, 1);
});

test('a paid leap upgrading a normal hop can visibly reset to a lower forward-leap arc', () => {
  const h = setup(), hop = game({ jumpRemaining: .325, jumpKind: 'normal' });
  const leap = game({ jumpRemaining: 1.15, jumpDuration: 1.2, jumpKind: 'long', timeSpent: 4 });
  h.draw(pose({ jumpHeight: 1.15 }), 0, hop, 90);
  h.send('longJump', 1, hop);
  h.timing.confirm(snapshot(1, leap), 150);
  h.draw(pose({ jumpHeight: .339 }), 1, leap, 160);
  assert.equal(h.counters.controlMatched, 1);
  assert.deepEqual(h.observations.slice(-2), [['controlRender', 65], ['controlConfirmRender', 10]]);
});

test('an accepted paid leap can visibly replace an older buffered hop after authority has landed', () => {
  const h = setup(), leap = game({ jumpRemaining: 1.15, jumpDuration: 1.2, jumpKind: 'long', timeSpent: 4 });
  h.draw(pose({ jumpHeight: .51 }), 0, game({ jumpRemaining: .1, jumpKind: 'normal' }), 90);
  h.send('longJump', 1, game());
  h.timing.confirm(snapshot(1, leap), 150);
  h.draw(pose({ jumpHeight: .339 }), 1, leap, 160);
  assert.equal(h.counters.controlMatched, 1);
  assert.deepEqual(h.observations.slice(-2), [['controlRender', 65], ['controlConfirmRender', 10]]);
});

test('invalid timestamps and unknown actions do not invent latency samples', () => {
  const h = setup();
  h.timing.sent('right', { seq: 1, roundId: 'one', sentAt: 100 }, { eventAt: 120, recognizedAt: 110 }, game());
  h.timing.sent('unknown', { seq: 2, roundId: 'one', sentAt: 100 }, { eventAt: 80, recognizedAt: 90 }, game());
  h.timing.confirm(snapshot(2, game({ lane: 2 })), 150);
  h.draw(pose({ lane: 1.2 }), 2, game({ lane: 2 }), 160);
  assert.deepEqual(h.observations, []);
  assert.equal(h.counters.controlSent, 1);
  assert.equal(h.counters.controlUnmatched, 1);
});

test('confirmed actions are not assigned to a simulated future pose or an ended race', () => {
  const h = setup(), state = game({ lane: 2 });
  h.send('right'); h.timing.confirm(snapshot(1, state), 150);
  h.draw(pose({ lane: 1.2 }), 1, state, 160, { isPredicted: true });
  assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.timing.diagnostics().pending, 1);
  h.draw(pose({ lane: 1.3 }), 1, { ...state, phase: 'won' }, 180);
  assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.timing.diagnostics().pending, 0);
  assert.equal(h.counters.controlCancelled, 1);
});

test('round change and suspension discard pending actions and ignore stale round acknowledgments', () => {
  const h = setup(); h.send('right');
  h.timing.confirm(snapshot(0, game(), 'two'), 120);
  h.send('left', 1, game(), 130, 'two');
  h.timing.confirm(snapshot(1, game({ lane: 0 }), 'one'), 140);
  h.draw(pose({ lane: .8 }), 1, game({ lane: 0 }), 150);
  assert.equal(h.counters.controlMatched || 0, 0);
  h.timing.confirm(snapshot(1, game({ lane: 0 }), 'two'), 160);
  h.timing.reset();
  h.draw(pose({ lane: .7 }), 1, game({ lane: 0 }), 170);
  assert.equal(h.counters.controlCancelled, 2);
  assert.equal(h.counters.controlMatched || 0, 0);
});

test('pending work expires and capacity eviction is counted exactly once', () => {
  const h = setup({ maxPending: 1, ttlMs: 500 });
  h.send('right', 1); h.send('boost', 2, game(), 110);
  assert.equal(h.counters.controlUnmatched, 1);
  h.clock(611);
  assert.equal(h.timing.diagnostics().pending, 0);
  assert.equal(h.counters.controlUnmatched, 2);
  h.clock(900); h.timing.diagnostics(); h.timing.reset();
  assert.equal(h.counters.controlUnmatched, 2);
});

test('out-of-order acknowledgments and duplicate receipts cannot create extra samples', () => {
  const h = setup(), state = game({ lane: 2 });
  h.send('right'); h.send('right');
  h.timing.confirm(snapshot(1, state, 'one', 100), 150);
  h.timing.confirm(snapshot(0, game(), 'one', 50), 160);
  h.draw(pose({ lane: 1.2 }), 1, state, 180);
  assert.equal(h.counters.controlSent, 1);
  assert.equal(h.counters.controlMatched, 1);
});

test('timing samples never mutate authority or expose input identifiers through diagnostics', () => {
  const h = setup(), state = Object.freeze(game({ lane: 2 }));
  const authority = Object.freeze({ serverTime: 50, room: Object.freeze({ roundId: 'one' }), you: Object.freeze({ inputSeq: 1, game: state }) });
  h.send('right', 1, Object.freeze(game())); h.timing.confirm(authority, 150);
  h.draw(Object.freeze(pose({ lane: 1.2 })), 1, state, 180);
  const diagnostics = h.timing.diagnostics();
  assert.equal(state.lane, 2);
  assert.ok(Object.values(diagnostics).every(Number.isFinite));
  assert.equal(diagnostics.matched, 1);
  assert.ok(!('seq' in diagnostics) && !('roundId' in diagnostics));
});

test('anticipated lane onset is measured once without claiming confirmation or retiring its trace', () => {
  const h = setup(); h.draw(pose(), 0, game(), 90); h.send('right');
  h.timing.anticipated(pose(), { seq: 1, roundId: 'one', targetLane: 2 }, 110);
  assert.equal(h.counters.controlAnticipated || 0, 0, 'a target change alone is not a drawn response');
  h.timing.anticipated(pose({ lane: 1.2 }), { seq: 1, roundId: 'one', targetLane: 2 }, 116);
  h.timing.anticipated(pose({ lane: 1.4 }), { seq: 1, roundId: 'one', targetLane: 2 }, 132);
  assert.deepEqual(h.observations, [['controlDispatch', 20], ['controlRecognize', 5], ['controlAnticipatedRender', 21]]);
  assert.equal(h.counters.controlAnticipated, 1); assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.timing.diagnostics().pending, 1);
  h.timing.confirm(snapshot(1, game({ lane: 2 })), 150);
  h.draw(pose({ lane: 1.6 }), 1, game({ lane: 2 }), 160);
  assert.equal(h.counters.controlMatched, 1);
  assert.deepEqual(h.observations.slice(-2), [['controlRender', 65], ['controlConfirmRender', 10]]);
});

test('anticipation cannot match a wrong sequence, round, target, direction or superseded input', () => {
  const h = setup(); h.send('right');
  for (const [drawn, source, at] of [
    [pose({ lane: 1.2 }), { seq: 9, roundId: 'one', targetLane: 2 }, 110],
    [pose({ lane: 1.2 }), { seq: 1, roundId: 'old', targetLane: 2 }, 110],
    [pose({ lane: 1.2 }), { seq: 1, roundId: 'one', targetLane: 0 }, 110],
    [pose({ lane: .8 }), { seq: 1, roundId: 'one', targetLane: 2 }, 110],
    [pose({ lane: NaN }), { seq: 1, roundId: 'one', targetLane: 2 }, 110],
    [pose({ lane: 1.2 }), { seq: 1, roundId: 'one', targetLane: 2 }, 99],
  ]) h.timing.anticipated(drawn, source, at);
  h.send('left', 2, game(), 120);
  h.timing.anticipated(pose({ lane: 1.2 }), { seq: 1, roundId: 'one', targetLane: 2 }, 130);
  assert.equal(h.counters.controlAnticipated || 0, 0);
  assert.equal(h.counters.controlCancelled, 1);
});

test('only unconfirmed lane inputs can record anticipated render timings', () => {
  for (const action of ['jump', 'longJump', 'boost']) {
    const h = setup(); h.send(action);
    h.timing.anticipated(pose({ lane: 1.2, jumpHeight: .5, boostFeel: .2 }), { seq: 1, roundId: 'one', targetLane: 2 }, 116);
    assert.equal(h.counters.controlAnticipated || 0, 0, action);
  }
  const h = setup(); h.send('right'); h.timing.confirm(snapshot(1, game({ lane: 2 })), 110);
  h.timing.anticipated(pose({ lane: 1.2 }), { seq: 1, roundId: 'one', targetLane: 2 }, 116);
  assert.equal(h.counters.controlAnticipated || 0, 0, 'a confirmed state belongs to confirmed timing');
});

test('rejected anticipated moves stay unconfirmed and repeated rejection is counted once', () => {
  const h = setup(); h.send('right');
  h.timing.anticipated(pose({ lane: 1.2 }), { seq: 1, roundId: 'one', targetLane: 2 }, 116);
  h.timing.result({ seq: 1, roundId: 'one', accepted: false, code: 'ACTION_UNAVAILABLE' });
  h.timing.result({ seq: 1, roundId: 'one', accepted: false, code: 'ACTION_UNAVAILABLE' });
  h.timing.confirm(snapshot(1, game()), 150);
  h.draw(pose({ lane: 1.1 }), 1, game(), 160);
  assert.equal(h.counters.controlAnticipated, 1);
  assert.equal(h.counters.controlUnmatched, 1); assert.equal(h.counters.controlMatched || 0, 0);
  assert.equal(h.timing.diagnostics().pending, 0);
});

test('acceptance results and stale rejection results cannot fabricate confirmed timings', () => {
  const h = setup(); h.send('right');
  h.timing.result({ seq: 1, roundId: 'one', accepted: true });
  h.timing.result({ seq: 1, roundId: 'one', accepted: false, code: 'STALE_INPUT' });
  h.timing.result({ seq: 1, roundId: 'old', accepted: false });
  h.timing.result({ seq: 2, roundId: 'one', accepted: false });
  h.timing.result({ seq: 1, roundId: 'one', accepted: 'false' });
  h.draw(pose({ lane: 1.2 }), 1, game({ lane: 2 }), 130);
  assert.equal(h.counters.controlMatched || 0, 0); assert.equal(h.counters.controlUnmatched || 0, 0);
  assert.equal(h.timing.diagnostics().pending, 1);
  h.timing.confirm(snapshot(1, game({ lane: 2 })), 150); h.draw(pose({ lane: 1.4 }), 1, game({ lane: 2 }), 160);
  assert.equal(h.counters.controlMatched, 1);
});

test('a rejected lane intent cannot distort the next command target used for timing', () => {
  const h = setup(); h.send('right');
  h.timing.result({ seq: 1, roundId: 'one', accepted: false, code: 'RATE_LIMIT' });
  h.send('right', 2, game(), 130);
  h.timing.anticipated(pose({ lane: 1.2 }), { seq: 2, roundId: 'one', targetLane: 2 }, 146);
  assert.equal(h.counters.controlUnmatched, 1);
  assert.equal(h.counters.controlAnticipated, 1);
  assert.deepEqual(h.observations.at(-1), ['controlAnticipatedRender', 21]);
});

test('expired, reset and boundary-only traces do not produce anticipated samples', () => {
  for (const setupTrace of [
    h => { h.send('right'); h.clock(5101); },
    h => { h.send('right'); h.timing.reset(); },
    h => { h.send('right', 1, game({ lane: 2 })); },
  ]) {
    const h = setup(); setupTrace(h);
    h.timing.anticipated(pose({ lane: 1.2 }), { seq: 1, roundId: 'one', targetLane: 2 }, 5200);
    assert.equal(h.counters.controlAnticipated || 0, 0);
  }
});
