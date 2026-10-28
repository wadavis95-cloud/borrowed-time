import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, updateGame, jump, buyAbility, pauseGame, resumeGame } from '../src/game.js';
import * as hazards from '../src/hazards.js';

function run(debris, course = []) {
  const game = createGame({ course, debris });
  startGame(game);
  return game;
}
const chunk = { id: 'ceiling', lane: 1, z: 24.08, warnAt: 0, fallAt: 0.5, impactAt: 1 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('debris presentation changes phase exactly on the shared event boundaries', () => {
  assert.equal(typeof hazards.getDebrisPhase, 'function');
  const event = { ...chunk, warnAt: 2, fallAt: 4, impactAt: 5 };
  for (const [elapsed, expected] of [[0, 'waiting'], [2, 'warning'], [3.999, 'warning'], [4, 'falling'], [4.999, 'falling'], [5, 'landed'], [30, 'landed']]) {
    assert.equal(hazards.getDebrisPhase(event, elapsed), expected);
  }
});

test('approaching roof collapse lands ahead of normal and boosted arrivals, including a boost after warning', () => {
  for (const boostAt of [null, 0, 'warning']) {
    const game = createGame({ seed: 42 });
    const event = game.debris[0];
    game.debris = [event];
    game.obstacles = []; game.checkpoints = [];
    game.lane = (event.lane + 1) % 3;
    startGame(game);
    let bought = false, initialImpact = event.impactAt;
    for (let tick = 0; tick < 1200 && game.distance < event.z; tick++) {
      if (!bought && (boostAt === 0 || boostAt === 'warning' && game.elapsed >= event.warnAt)) {
        assert.equal(buyAbility(game, 'boost').ok, true);
        bought = true;
      }
      updateGame(game, 1 / 120);
    }
    assert.ok(game.distance >= event.z);
    assert.ok(event.armed);
    assert.ok(event.impactAt <= game.elapsed, 'the runner must not pass before impact');
    assert.ok(game.elapsed - event.impactAt < .3, 'collapse should happen near arrival');
    assert.ok(event.warnAt < event.fallAt && event.fallAt < event.impactAt);
    assert.ok(event.impactAt < initialImpact);
    assert.equal(game.hits, 0);
  }
});

test('falling masonry hits at its impact time even during a paid jump', () => {
  const game = run([{...chunk,z:45.752}]);
  buyAbility(game, 'longJump');
  updateGame(game, 1);
  assert.equal(game.hits, 1);
  near(game.timeLeft, 52);
  near(game.stunRemaining,.8);
});

test('a runner can pass a warning before impact without being hit', () => {
  const game = run([{ ...chunk, z: 9, impactAt: 2 }]);
  updateGame(game, 3);
  assert.equal(game.hits, 0);
  near(game.distance, 72.72);
});

test('an impact covers a runner just past the landing point', () => {
  const game = run([{ ...chunk, z: 23.08 }]);
  updateGame(game, 1);
  assert.equal(game.hits, 1);
});

test('landed rubble can be hopped, while grounded runners receive the normal hit response', () => {
  const landed = { ...chunk, z: 9, fallAt: 0, impactAt: 0 };
  const grounded = run([landed]);
  updateGame(grounded, .5);
  assert.equal(grounded.hits, 1);
  near(grounded.timeLeft, 56.5);
  const airborne = run([landed]);
  jump(airborne);
  updateGame(airborne, 2);
  assert.equal(airborne.hits, 0);
});

test('an impact and its rubble charge at most once per runner and never alter the shared event', () => {
  const events = [{ ...chunk, z: 23.1 }];
  const original = structuredClone(events);
  const game = run(events);
  updateGame(game, 1);
  assert.equal(game.hits, 1);
  updateGame(game, 2);
  assert.equal(game.hits, 1);
  near(game.timeLeft, 54);
  assert.deepEqual(events, original);
  const another = run(events);
  updateGame(another, 1);
  assert.equal(another.hits, 1);
});

test('solo pause freezes fixed fixture impact time while a forward leap can still be struck', () => {
  const game = run([{...chunk,z:28.42592}]);
  updateGame(game, .8);
  buyAbility(game, 'longJump');
  const events = structuredClone(game.debris);
  pauseGame(game);
  updateGame(game, 10);
  near(game.elapsed, .8);
  assert.equal(game.hits, 0);
  resumeGame(game);
  updateGame(game, .2);
  assert.equal(game.hits, 1);
  assert.deepEqual(game.debris, events);
});

test('large updates and small updates resolve the same impacts and slowdowns', () => {
  const events = [chunk, { ...chunk, id: 'later', z: 74.32144, warnAt: 2, fallAt: 3, impactAt: 3.5 }];
  const whole = run(events), stepped = run(events);
  updateGame(whole, 8);
  for (let i = 0; i < 800; i += 1) updateGame(stepped, .01);
  assert.equal(whole.hits, 2);
  assert.equal(stepped.hits, whole.hits);
  for (const key of ['distance', 'elapsed', 'timeLeft', 'stunRemaining']) near(stepped[key], whole[key]);
});

test('fatal masonry cannot be revived by a checkpoint at the same position', () => {
  const game = run([{ ...chunk, z: 450, impactAt: .1 }]);
  game.distance = 447.5992;
  game.timeLeft = 1;
  updateGame(game, 1);
  assert.equal(game.phase, 'lost');
  assert.equal(game.checkpoints[0].passed, false);
});

test('custom courses stay isolated from generated debris', () => {
  assert.deepEqual(createGame({ course: [] }).debris, []);
  assert.deepEqual(createGame({ course: [{ z: 9, lane: 1, type: 'barrier' }] }).debris, []);
});

test('normal courses contain frequent deterministic debris between regular encounters', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = createGame({ seed });
    assert.ok(game.debris?.length >= 8 && game.debris.length <= 20);
    assert.deepEqual(game.debris, createGame({ seed }).debris);
    for (const event of game.debris) {
      assert.ok([0, 1, 2].includes(event.lane));
      assert.ok(event.warnAt >= 0 && event.fallAt > event.warnAt && event.impactAt > event.fallAt);
      assert.ok(event.impactAt - event.warnAt >= 2);
      assert.ok(game.obstacles.every(obstacle => Math.abs(obstacle.z - event.z) >= 18));
    }
  }
  assert.notDeepEqual(createGame({ seed: 1 }).debris, createGame({ seed: 2 }).debris);
});

test('the debris builder keeps its two-argument API and schedules arrivals after the speed ramp', () => {
  const obstacles = [1200, 1400, 1480, 1560].map(z => ({ z, length: 2, lane: 0, type: 'barrier' }));
  const [event] = hazards.createFallingDebris(42, obstacles);
  near(event.z, 1441);
  near(event.impactAt, 52.84375);
});

test('extra roof falls preserve the connecting route through tighter ground rows', () => {
  const route = row => [0, 1, 2].find(lane => !row.some(o => o.lane === lane))
    ?? row.find(o => o.type === 'rubble')?.lane;
  for (let seed = 1; seed <= 64; seed += 1) {
    const game = createGame({ seed });
    const distances = [...new Set(game.obstacles.map(o => o.z))];
    let extraFalls = 0;
    for (const event of game.debris) {
      const before = distances.filter(z => z < event.z).at(-1);
      const after = distances.find(z => z > event.z);
      const previous = game.obstacles.filter(o => o.z === before);
      const next = game.obstacles.filter(o => o.z === after);
      const previousEnd = Math.max(...previous.map(o => o.z + o.length));
      assert.ok(event.z - previousEnd >= 18 && after - event.z >= 18);
      if (after - previousEnd < 60) {
        extraFalls += 1;
        assert.notEqual(event.lane, route(previous));
        assert.notEqual(event.lane, route(next));
      }
    }
    assert.ok(extraFalls >= 1, `seed ${seed}: missing extra falls`);
  }
});

test('a forward leap bought during warning cannot outrun the shared impact schedule',()=>{
 const game=createGame({seed:42});game.obstacles=[];game.checkpoints=[];game.debris=[game.debris[0]];
 const event=game.debris[0];game.lane=(event.lane+1)%3;startGame(game);let bought=false;
 for(let i=0;i<2400&&game.distance<event.z;i++){
  if(!bought&&game.elapsed>=event.warnAt){buyAbility(game,'longJump');bought=true;}
  updateGame(game,1/120);
 }
 assert.equal(bought,true);assert.ok(game.distance>=event.z);assert.ok(event.impactAt<=game.elapsed);assert.ok(game.elapsed-event.impactAt<.3);
});
