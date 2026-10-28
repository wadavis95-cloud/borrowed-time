import { AVATARS } from '../src/avatars.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoRace, chooseDemoAction } from '../src/demo.js';
import { createRoomManager } from '../src/server/rooms.js';
import { createGame, startGame, updateGame, moveLane, jump, buyAbility } from '../src/game.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

// Only the browser socket boundary is replaced. Room capacity, snapshots,
// countdowns, rematches, identities and membership cleanup are the real rules.
function roomTransport(options = {}) {
  let time = 0;
  const manager = createRoomManager({ now: () => time, makeSeed: () => 42, ...options });
  const records = [];
  function broadcast() {
    queueMicrotask(() => {
      for (const record of records) {
        const snapshot = manager.snapshot(record.id);
        if (!record.closed && snapshot) record.callbacks.onSnapshot(snapshot);
      }
    });
  }
  function connect(callbacks) {
    const record = { id: `demo-${records.length}`, callbacks, closed: false, seq: 0, roundId: null };
    records.push(record);
    manager.connect(record.id);
    function send(message) {
      if (record.closed) return false;
      const result = manager.handle(record.id, message);
      if (!result.ok) queueMicrotask(() => callbacks.onError(result.message, result.code));
      broadcast();
      return true;
    }
    queueMicrotask(() => {
      if (record.closed) return;
      callbacks.onStatus('open');
      send(callbacks.initialMessage);
    });
    return {
      send,
      input(action) {
        const roundId = manager.snapshot(record.id)?.room.roundId;
        if (record.roundId !== roundId) { record.roundId = roundId; record.seq = 0; }
        return send({ type: 'input', action, seq: ++record.seq, roundId });
      },
      close() {
        if (record.closed) return;
        record.closed = true;
        manager.disconnect(record.id);
      },
    };
  }
  return { manager, records, connect, advance(ms) { time += ms; manager.tick(time); broadcast(); } };
}

test('demo creates a full real room, starts once, and only exposes the host view', async (t) => {
  const transport = roomTransport();
  const snapshots = [], errors = [];
  const demo = createDemoRace({ connect: transport.connect, onSnapshot: value => snapshots.push(value), onStatus() {}, onError: value => errors.push(value) });
  t.after(() => demo.close());
  await flush();
  assert.equal(transport.manager.rooms.size, 1);
  const room = [...transport.manager.rooms.values()][0];
  assert.equal(room.players.size, 4);
  assert.equal(room.phase, 'countdown');
  assert.ok([...room.players.values()].every(player => player.name === AVATARS[player.avatarId].name));
  assert.equal(new Set([...room.players.values()].map(player => player.avatarId)).size, 4);
  assert.ok(snapshots.length > 0);
  assert.ok(snapshots.every(snapshot => snapshot.you.id === 'demo-0'));
  assert.deepEqual(errors, []);
  transport.advance(3000);
  await flush();
  assert.equal(snapshots.at(-1).room.phase, 'racing');
  for (const player of room.players.values()) player.game.timeLeft = .001;
  transport.advance(17);
  await flush();
  assert.equal(snapshots.at(-1).room.phase, 'finished');
  const before = snapshots.at(-1).room.roundId;
  assert.equal(demo.send({ type: 'rematch' }), true);
  await flush();
  assert.equal(snapshots.at(-1).room.phase, 'countdown');
  assert.notEqual(snapshots.at(-1).room.roundId, before);
  demo.close();
  assert.equal(transport.manager.rooms.size, 0);
  assert.ok(transport.records.every(record => record.closed));
});

test('one failed demo connection closes every membership and ignores late callbacks', async () => {
  const transport = roomTransport();
  const snapshots = [], errors = [], statuses = [];
  const demo = createDemoRace({ connect: transport.connect, onSnapshot: value => snapshots.push(value), onStatus: value => statuses.push(value), onError: value => errors.push(value) });
  await flush();
  const late = transport.manager.snapshot('demo-0');
  transport.records[2].callbacks.onStatus('disconnected');
  assert.equal(transport.manager.rooms.size, 0);
  assert.ok(transport.records.every(record => record.closed));
  assert.equal(errors.length, 1);
  assert.equal(statuses.at(-1), 'disconnected');
  const count = snapshots.length;
  transport.records[0].callbacks.onSnapshot(late);
  transport.records[1].callbacks.onError('late error');
  transport.records[0].callbacks.onStatus('open');
  assert.equal(snapshots.length, count);
  assert.equal(errors.length, 1);
  assert.equal(demo.send({ type: 'rematch' }), false);
  demo.close();
});

test('closing during connection setup prevents guest creation and suppresses notifications', async () => {
  const transport = roomTransport();
  const notices = [];
  const demo = createDemoRace({ connect: transport.connect, onSnapshot: value => notices.push(value), onStatus: value => notices.push(value), onError: value => notices.push(value) });
  demo.close();
  await flush();
  assert.equal(transport.records.length, 1);
  assert.equal(transport.manager.rooms.size, 0);
  assert.deepEqual(notices, []);
});

test('a server capacity failure closes the host without starting guest clients', async () => {
  const transport = roomTransport({ maxRooms: 0 });
  const errors = [], statuses = [];
  const demo = createDemoRace({ connect: transport.connect, onSnapshot() {}, onStatus: value => statuses.push(value), onError: (message, code) => errors.push({ message, code }) });
  await flush();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'SERVER_FULL');
  assert.equal(statuses.at(-1), 'disconnected');
  assert.equal(transport.records.length, 1);
  assert.equal(transport.records[0].closed, true);
  assert.equal(demo.send({ type: 'rematch' }), false);
});

test('leaving through the public transport closes all four demo memberships', async () => {
  const transport = roomTransport();
  const demo = createDemoRace({ connect: transport.connect, onSnapshot() {}, onStatus() {}, onError() {} });
  await flush();
  assert.equal(demo.send({ type: 'leave' }), true);
  assert.equal(transport.manager.rooms.size, 0);
  assert.ok(transport.records.every(record => record.closed));
});

function applyAction(game, action) {
  if (action === 'left' || action === 'right') return moveLane(game, action === 'left' ? -1 : 1);
  if (action === 'jump') return jump(game);
  if (action) return buyAbility(game, action).ok;
  return true;
}

test('demo recognizes a full-width row and takes its free-hop route when conserving time', () => {
  const game = createGame({ course: [
    { z: 18, lane: 0, type: 'barrier' }, { z: 18, lane: 1, type: 'gap' },
    { z: 18, lane: 2, type: 'rubble' },
  ] });
  startGame(game);
  game.timeSpent = 16;
  assert.equal(chooseDemoAction(game, 1), 'right');
  moveLane(game, 1);
  updateGame(game, 0.55);
  assert.equal(chooseDemoAction(game, 1), 'jump');
  jump(game);
  updateGame(game, 0.5);
  assert.equal(game.hits, 0);
});

test('four demo strategies complete a seeded course using normal inputs and build meaningful leads', () => {
  const games = Array.from({ length: 4 }, () => createGame({ seed: 42 }));
  games.forEach(startGame);
  const actions = new Set();
  let largestSpread = 0;
  for (let tick = 0; tick < 60 * 70; tick += 1) {
    if (tick % 9 === 0) {
      for (const [index, game] of games.entries()) {
        const action = chooseDemoAction(game, index);
        if (action) actions.add(action);
        assert.equal(applyAction(game, action), true, `${index}: invalid ${action}`);
      }
    }
    games.forEach(game => updateGame(game, 1 / 60));
    if (games.every(game => game.phase === 'running')) {
      const distances = games.map(game => game.distance);
      largestSpread = Math.max(largestSpread, Math.max(...distances) - Math.min(...distances));
    }
  }
  assert.ok(games.every(game => game.phase === 'won'), JSON.stringify(games.map(({ phase, hits, timeLeft }) => ({ phase, hits, timeLeft }))));
  assert.ok(largestSpread > 60, `independent purchases should separate runners, spread was ${largestSpread}m`);
  assert.ok(actions.has('longJump'));
  assert.ok(actions.has('jump'));
  assert.ok(actions.has('boost'));
  assert.ok(actions.has('left') && actions.has('right'));
});

test('a delayed snapshot near boost onset cannot trigger a barrier jump too late to clear it', () => {
  const game = createGame({ seed: 18 });
  startGame(game);
  let snapshot = { ...game }, previous = { ...game };
  for (let tick = 0; tick < 4200 && game.phase === 'running'; tick += 1) {
    if (tick % 3 === 0) { snapshot = previous; previous = { ...game }; }
    if (tick % 9 === 0) applyAction(game, chooseDemoAction(snapshot, 0));
    updateGame(game, 1 / 60);
  }
  assert.equal(game.phase, 'won');
  assert.equal(game.hits, 0);
});

test('the opening timed impact occurs beside the demo runners before their first boost', () => {
  const game = createGame({ seed: 42 });
  const firstImpact = game.debris[0];
  startGame(game);
  for (let tick = 0; game.elapsed < firstImpact.impactAt; tick += 1) {
    if (tick % 9 === 0) applyAction(game, chooseDemoAction(game, 0));
    updateGame(game, 1 / 60);
  }
  assert.ok(firstImpact.z - game.distance >= 0 && firstImpact.z - game.distance < 6, 'the roof should land just ahead of the approaching runner');
  assert.equal(game.hits, 0);
});

test('demo runners route around extra barriers to preserve their own time budget', () => {
  const game = createGame({ course: [{ z: 15.5, lane: 1, type: 'barrier' }] });
  startGame(game);
  game.elapsed = 30;
  game.timeSpent = 16;
  game.timeLeft = 12;
  assert.ok(['left', 'right'].includes(chooseDemoAction(game, 0)));
});

test('the early burst leaves unboosted rivals behind and a later chaser returns into view', () => {
  const games = Array.from({ length: 4 }, () => createGame({ seed: 42 }));
  games.forEach(startGame);
  let earlyBreakaway = false, chaserWasHidden = false, chaserReturned = false;
  for (let tick = 0; tick < 27 * 60; tick += 1) {
    if (tick % 9 === 0) games.forEach((game, index) => applyAction(game, chooseDemoAction(game, index)));
    games.forEach(game => updateGame(game, 1 / 60));
    const [viewpoint, chaser, ...others] = games;
    const rivals = [chaser, ...others];
    // The renderer stops drawing rivals more than 18 game metres behind.
    if (viewpoint.boostRemaining > 0 && rivals.every(game => game.boostRemaining === 0
      && game.distance - viewpoint.distance < -18)) earlyBreakaway = true;
    const chaserRelative = chaser.distance - viewpoint.distance;
    if (chaserRelative < -18) chaserWasHidden = true;
    if (chaserWasHidden && chaserRelative >= -18 && chaser.boostRemaining > 0
      && viewpoint.boostRemaining === 0) chaserReturned = true;
  }
  assert.ok(earlyBreakaway, 'one early boost should leave the other three unboosted runners out of view');
  assert.ok(chaserReturned, 'a separate later purchase should bring a previously hidden rival back into view');
});

test('showcase spends time immediately on boost and a nearby leap without changing solo strategies', () => {
  const racer=()=>{const g=createGame({course:[]});startGame(g);return g;};
  const camera=racer();updateGame(camera,.6);
  assert.equal(chooseDemoAction(camera,0),null);
  assert.equal(chooseDemoAction(camera,0,{showcase:true}),'boost');
  assert.equal(applyAction(camera,'boost'),true);
  assert.equal(camera.timeSpent,5);
  assert.notEqual(chooseDemoAction(camera,0,{showcase:true}),'boost');
  const rival=racer();updateGame(rival,.9);
  assert.equal(chooseDemoAction(rival,1,{showcase:true}),'longJump');
  assert.equal(applyAction(rival,'longJump'),true);
  assert.equal(rival.timeSpent,4);
  assert.notEqual(chooseDemoAction(rival,1,{showcase:true}),'longJump');
  updateGame(camera,4.5);
  assert.equal(chooseDemoAction(camera,0,{showcase:true}),'longJump');
});
