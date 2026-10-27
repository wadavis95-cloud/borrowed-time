import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, CONFIG, startGame, updateGame, moveLane, jump } from '../src/game.js';
import { chooseDemoAction } from '../src/demo.js';

function rowsFor(game) {
  const rows = new Map();
  for (const obstacle of game.obstacles) {
    if (!rows.has(obstacle.z)) rows.set(obstacle.z, []);
    rows.get(obstacle.z).push(obstacle);
  }
  return [...rows].map(([z, obstacles]) => ({ z, obstacles }));
}

test('hard courses remove spare escape lanes and repeatedly require a hop', () => {
  for (let seed = 1; seed <= 64; seed += 1) {
    const game = createGame({ seed });
    const rows = rowsFor(game);
    assert.ok(rows.length >= 18 && rows.length <= 21, `seed ${seed}: only ${rows.length} rows`);
    assert.ok(rows.every(row => row.obstacles.length >= 2));
    const jumpRows = rows.filter(row => row.obstacles.length === CONFIG.laneCount);
    assert.ok(jumpRows.length >= 4, 'a lane-only run must face repeated jump decisions');
    for (const row of jumpRows) {
      assert.ok(row.obstacles.some(obstacle => obstacle.type === 'rubble'), 'a free hop route must exist');
    }
    for (let lane = 0; lane < CONFIG.laneCount; lane += 1) {
      assert.ok(game.obstacles.filter(o => o.lane === lane && o.type !== 'rubble').length >= 4,
        'no lane should provide a straight-through hop-only escape');
    }
  }
});

test('a free-move route weaves one lane at a time and the later decision gaps tighten', () => {
  for (let seed = 1; seed <= 64; seed += 1) {
    const rows = rowsFor(createGame({ seed }));
    let previousLane = 1;
    const early = [], late = [];
    for (const [index, row] of rows.entries()) {
      const route = [0, 1, 2].filter(lane => !row.obstacles.some(o => o.lane === lane)
        || row.obstacles.some(o => o.lane === lane && o.type === 'rubble'));
      const clear = [0, 1, 2].filter(lane => !row.obstacles.some(o => o.lane === lane));
      const candidates = clear.length ? clear : route;
      const lane = candidates.find(value => Math.abs(value - previousLane) <= 1);
      assert.notEqual(lane, undefined, 'every row must connect to the prior route without a two-lane teleport');
      if (index > 1 && clear.length) assert.notEqual(lane, previousLane, 'the open lane must move');
      previousLane = lane;
      if (index === 0) continue;
      const gap = row.z - rows[index - 1].z;
      assert.ok(gap >= 46, 'retain a readable decision window even at the tightest point');
      const previousEnd = Math.max(...rows[index - 1].obstacles.map(o => o.z + o.length));
      assert.ok((row.z - previousEnd) / CONFIG.topSpeed >= 1.15,
        'the clear space after a whole set must provide breathing room at top speed');
      // Wide gaps contain their own falling-debris encounter.
      if (gap < CONFIG.debrisEncounterSpacing) (row.z < 500 ? early : row.z > 850 ? late : []).push(gap);
    }
    const average = values => values.reduce((a, b) => a + b, 0) / values.length;
    assert.ok(average(late) < average(early) - 4, 'later rows should give less recovery time');
  }
});

test('128 hard courses can be cleared at normal input intervals without buying abilities', () => {
  for (let seed = 1; seed <= 128; seed += 1) {
    const game = createGame({ seed });
    startGame(game);
    let hops = 0, changes = 0;
    for (let tick = 0; tick < 60 * 80 && game.phase === 'running'; tick += 1) {
      if (tick % 9 === 0) {
        const action = chooseDemoAction(game, 1);
        if (action === 'left' || action === 'right') {
          assert.equal(moveLane(game, action === 'left' ? -1 : 1), true);
          changes += 1;
        } else if (action === 'jump') {
          assert.equal(jump(game), true);
          hops += 1;
        }
        // Purchases are deliberately ignored: the free-move route must work.
      }
      updateGame(game, 1 / 60);
    }
    assert.equal(game.phase, 'won', `seed ${seed}: free route did not finish`);
    assert.equal(game.hits, 0, `seed ${seed}: free route took a hit`);
    assert.equal(game.timeSpent, 0);
    assert.ok(hops >= 4 && changes >= 14, 'clearing the harder course must require repeated decisions');
  }
});
