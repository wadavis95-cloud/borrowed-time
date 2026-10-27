import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRoomManager } from '../src/server/rooms.js';
import { createGameServer } from '../src/server/app.js';

function setup(options = {}) {
  let time = 1000;
  let next = 0;
  const manager = createRoomManager({
    now: () => time,
    makeId: () => `round-${++next}`,
    makeSeed: () => ++next,
    ...options,
  });
  const connect = (id) => manager.connect(id);
  const send = (id, message) => manager.handle(id, message);
  const advance = (milliseconds) => {
    time += milliseconds;
    return manager.tick(time);
  };
  const create = (id = 'host') => {
    connect(id);
    assert.equal(send(id, { type: 'create', name: 'Host' }).ok, true);
    return manager.snapshot(id).room.code;
  };
  const join = (code, id = 'guest') => {
    connect(id);
    return send(id, { type: 'join', code, name: id });
  };
  const race = () => {
    const code = create();
    assert.equal(join(code).ok, true);
    assert.equal(send('host', { type: 'start' }).ok, true);
    advance(3000);
    return code;
  };
  return { manager, connect, send, advance, create, join, race };
}

test('rooms allow four connected guests, normalize codes, and reject duplicate membership', () => {
  const { manager, create, join, send } = setup();
  const code = create();
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal(join(code.toLowerCase(), 'second').ok, true);
  assert.equal(join(code, 'third').ok, true);
  assert.equal(join(code, 'fourth').ok, true);
  assert.equal(join(code, 'fifth').code, 'ROOM_FULL');
  assert.equal(send('host', { type: 'create', name: 'Again' }).code, 'ALREADY_IN_ROOM');
  assert.equal(manager.snapshot('host').players.length, 4);
  assert.equal(manager.snapshot('host').room.hostId, 'host');
  assert.equal(manager.snapshot('fifth'), null);
});

test('boosting racer advances the same roof-collapse schedule for everyone in the room', () => {
  const { manager, send, advance, race } = setup();
  const code = race();
  const room = manager.rooms.get(code);
  const original = manager.snapshot('host').debris[0].impactAt;
  for (const player of room.players.values()) {
    player.game.obstacles = []; player.game.checkpoints = [];
    player.game.lane = (player.game.debris[0].lane + 1) % 3;
  }
  send('guest', { type: 'input', action: 'boost', seq: 1, roundId: room.roundId });
  for (let i = 0; i < 60; i++) advance(100);
  const host = manager.snapshot('host'), guest = manager.snapshot('guest');
  assert.deepEqual(host.debris, guest.debris);
  assert.ok(host.debris[0].impactAt < original);
  assert.deepEqual(Object.keys(host.debris[0]).sort(), ['fallAt', 'id', 'impactAt', 'lane', 'warnAt', 'z']);
  assert.ok(guest.you.game.distance >= host.debris[0].z || guest.you.game.elapsed < host.debris[0].impactAt + .5);
});

test('standings follow progress, then escape order, preserve DNF results and reset on rematch', () => {
  const { manager, create, join, send, advance } = setup();
  const code = create();
  for (const id of ['second', 'third', 'fourth']) join(code, id);
  assert.ok(manager.snapshot('host').standings.every(p => p.position === null && p.status === 'ready'));
  send('host', { type: 'start' });
  advance(3000);
  const players = manager.rooms.get(code).players;
  players.get('host').game.distance = 500;
  players.get('second').game.distance = 600;
  assert.equal(manager.snapshot('host').standings[0].id, 'second');
  players.get('third').game.phase = 'won';
  players.get('third').game.distance = 1350;
  players.get('third').game.finishTime = 45;
  manager.disconnect('fourth');
  let board = manager.snapshot('host').standings;
  assert.deepEqual(board.map(p => [p.id, p.position, p.status]), [
    ['third', 1, 'escaped'], ['second', 2, 'racing'], ['host', 3, 'racing'], ['fourth', null, 'disconnected'],
  ]);
  // Both finish at the same distance, but actual finish time decides order.
  players.get('second').game.phase = 'won';
  players.get('second').game.distance = 1350;
  players.get('second').game.finishTime = 44.99;
  players.get('host').game.phase = 'lost';
  advance(17);
  board = manager.snapshot('host').standings;
  assert.deepEqual(board.map(p => [p.id, p.position, p.status]), [
    ['second', 1, 'escaped'], ['third', 2, 'escaped'], ['host', null, 'dnf'], ['fourth', null, 'disconnected'],
  ]);
  assert.equal(manager.snapshot('host').room.winnerId, board[0].id);
  assert.deepEqual(Object.keys(board[0]).sort(), ['id', 'position', 'status']);
  manager.disconnect('second');
  assert.equal(manager.snapshot('host').standings[0].status, 'escaped');
  send('host', { type: 'rematch' });
  assert.ok(manager.snapshot('host').standings.every(p => p.position === null && p.status === 'ready'));
});

test('only the host can start, with two players, and countdown starts both clocks together', () => {
  const { manager, create, join, send, advance } = setup();
  const code = create();
  assert.equal(send('host', { type: 'start' }).code, 'NEED_PLAYERS');
  join(code);
  assert.equal(send('guest', { type: 'start' }).code, 'HOST_ONLY');
  assert.equal(send('host', { type: 'start' }).ok, true);
  advance(2999);
  assert.equal(manager.snapshot('host').room.countdown, 1);
  assert.equal(manager.snapshot('host').you.game.phase, 'ready');
  assert.equal(manager.snapshot('host').you.game.elapsed, 0);
  assert.equal(join(code, 'late').code, 'ROUND_ACTIVE');
  advance(1);
  assert.equal(manager.snapshot('host').room.phase, 'racing');
  assert.equal(manager.snapshot('guest').you.game.phase, 'running');
  advance(1000);
  assert.ok(Math.abs(manager.snapshot('host').you.game.distance - 24.08) < 1e-7);
  assert.equal(manager.snapshot('host').you.game.elapsed, manager.snapshot('guest').you.game.elapsed);
});

test('server actions move and charge only their connection owner, rejecting stale rounds and sequences', () => {
  const { manager, send, race } = setup();
  race();
  const { roundId } = manager.snapshot('host').room;
  const input = (action, seq, extra = {}) => send('host', { type: 'input', action, seq, roundId, ...extra });
  assert.equal(input('left', 1, { playerId: 'guest', timeLeft: 1000 }).ok, true);
  assert.equal(manager.snapshot('host').you.game.lane, 0);
  assert.equal(manager.snapshot('guest').you.game.lane, 1);
  assert.equal(input('boost', 2).ok, true);
  assert.equal(manager.snapshot('host').you.game.timeLeft, 55);
  assert.equal(manager.snapshot('host').you.game.timeSpent, 5);
  assert.equal(manager.snapshot('guest').you.game.timeLeft, 60);
  assert.equal(input('longJump', 2).code, 'STALE_INPUT');
  assert.equal(input('longJump', 3, { roundId: 'old-round' }).code, 'STALE_ROUND');
  assert.equal(input('teleport', 3).code, 'INVALID_ACTION');
  assert.equal(input('longJump', 3).ok, true);
  assert.equal(manager.snapshot('host').you.game.timeLeft, 51);
  assert.equal(input('boost', 4).code, 'ACTION_UNAVAILABLE');
  assert.equal(manager.snapshot('host').you.game.timeLeft, 51);
});

test('public transforms cannot disclose another runner’s balance, purchases, or ability flags', () => {
  const { manager, send, race } = setup();
  race();
  const roundId = manager.snapshot('host').room.roundId;
  send('guest', { type: 'input', action: 'longJump', seq: 1, roundId });
  const snapshot = manager.snapshot('host');
  assert.equal(snapshot.you.id, 'host');
  assert.equal(snapshot.you.game.timeLeft, 60);
  assert.equal(Object.hasOwn(snapshot.you.game, 'obstacles'), false);
  assert.deepEqual(Object.keys(snapshot.players[1]).sort(), [
    'avatarId', 'color', 'connected', 'distance', 'id', 'jumpDuration', 'jumpRemaining', 'lane', 'name', 'phase',
  ]);
  assert.equal(snapshot.players[1].jumpRemaining, 1.4);
  assert.equal(manager.snapshot('guest').you.game.timeLeft, 56);
  const room = manager.rooms.get(snapshot.room.code);
  assert.deepEqual(room.players.get('host').game.obstacles, room.players.get('guest').game.obstacles);
});

test('a disconnected racer loses without pausing the other racer and host ownership transfers', () => {
  const { manager, advance, race } = setup();
  race();
  manager.disconnect('host');
  advance(1000);
  const snapshot = manager.snapshot('guest');
  assert.equal(snapshot.room.hostId, 'guest');
  assert.equal(snapshot.room.phase, 'racing');
  assert.equal(snapshot.you.game.phase, 'running');
  assert.ok(snapshot.you.game.distance > 17);
  const departed = snapshot.players.find((player) => player.id === 'host');
  assert.equal(departed.phase, 'lost');
  assert.equal(departed.connected, false);
});

test('disconnecting during countdown keeps its original deadline for remaining racers', () => {
  const { manager, create, join, send, advance } = setup();
  const code = create();
  join(code);
  send('host', { type: 'start' });
  advance(1000);
  manager.disconnect('host');
  advance(2000);
  assert.equal(manager.snapshot('guest').room.phase, 'racing');
  assert.equal(manager.snapshot('guest').you.game.phase, 'running');
});

test('winner uses earliest engine finish time even when another player is processed first', () => {
  const { manager, advance, race } = setup();
  const code = race();
  const room = manager.rooms.get(code);
  for (const player of room.players.values()) {
    player.game.obstacles = [];
    player.game.checkpoints = [];
    player.game.distance = player.id === 'host' ? 1349.8 : 1349.9;
    player.game.elapsed = 50;
  }
  advance(17);
  const snapshot = manager.snapshot('host');
  assert.equal(snapshot.room.phase, 'finished');
  assert.equal(snapshot.room.winnerId, 'guest');
  assert.equal(snapshot.you.game.phase, 'won');
});

test('the first finisher does not stop racers who are still running', () => {
  const { manager, advance, send, race } = setup();
  const code = race();
  const first = manager.rooms.get(code).players.get('host').game;
  first.distance = 1349.99;
  first.obstacles = [];
  first.checkpoints = [];
  advance(17);
  assert.equal(manager.snapshot('host').you.game.phase, 'won');
  assert.equal(manager.snapshot('guest').room.phase, 'racing');
  assert.equal(manager.snapshot('guest').room.winnerId, 'host');
  assert.equal(send('host', { type: 'rematch' }).code, 'ROUND_ACTIVE');
  const distance = manager.snapshot('guest').you.game.distance;
  advance(1000);
  assert.ok(manager.snapshot('guest').you.game.distance > distance + 17);
});

test('only a finished round can rematch, clearing old slots and rejecting previous-round input', () => {
  const { manager, send, advance, race } = setup();
  const code = race();
  const previous = manager.snapshot('host').room;
  assert.equal(send('host', { type: 'rematch' }).code, 'ROUND_ACTIVE');
  manager.disconnect('guest');
  const game = manager.rooms.get(code).players.get('host').game;
  game.timeLeft = 0.001;
  advance(17);
  assert.equal(manager.snapshot('host').room.phase, 'finished');
  assert.equal(manager.snapshot('host').room.winnerId, null);
  assert.equal(send('host', { type: 'rematch' }).ok, true);
  const snapshot = manager.snapshot('host');
  assert.equal(snapshot.room.phase, 'lobby');
  assert.notEqual(snapshot.room.roundId, previous.roundId);
  assert.notEqual(snapshot.room.seed, previous.seed);
  assert.equal(snapshot.players.length, 1);
  assert.equal(snapshot.you.game.phase, 'ready');
  assert.equal(snapshot.you.game.timeLeft, 60);
  assert.equal(snapshot.you.game.distance, 0);
  assert.equal(send('host', { type: 'input', action: 'boost', seq: 99, roundId: previous.roundId }).code, 'STALE_ROUND');
});

test('a guest cannot rematch a finished round and both connected players get fresh games', () => {
  const { manager, send, advance, race } = setup();
  const code = race();
  const roundId = manager.snapshot('host').room.roundId;
  for (const player of manager.rooms.get(code).players.values()) player.game.timeLeft = 0.001;
  advance(17);
  assert.equal(send('guest', { type: 'rematch' }).code, 'HOST_ONLY');
  assert.equal(manager.snapshot('host').room.roundId, roundId);
  assert.equal(send('host', { type: 'rematch' }).ok, true);
  for (const id of ['host', 'guest']) {
    assert.equal(manager.snapshot(id).you.game.timeLeft, 60);
    assert.equal(manager.snapshot(id).you.game.phase, 'ready');
  }
  assert.equal(send('host', { type: 'start' }).ok, true);
  advance(3000);
  assert.equal(send('guest', { type: 'input', action: 'boost', seq: 1, roundId: manager.snapshot('guest').room.roundId }).ok, true);
});

test('leaving a lobby removes the slot and leaving the final connected runner deletes the room', () => {
  const { manager, create, join, send } = setup();
  const code = create();
  join(code);
  assert.equal(send('host', { type: 'leave' }).ok, true);
  assert.equal(manager.snapshot('host'), null);
  assert.equal(manager.snapshot('guest').room.hostId, 'guest');
  assert.equal(manager.snapshot('guest').players.length, 1);
  manager.disconnect('guest');
  assert.equal(manager.rooms.size, 0);
  assert.equal(send('host', { type: 'create', name: 'Back' }).ok, true);
});

test('idle rooms expire after five minutes and room capacity rejects new rooms', () => {
  const { manager, create, connect, send, advance } = setup({ maxRooms: 1 });
  create();
  connect('other');
  assert.equal(send('other', { type: 'create', name: 'Other' }).code, 'SERVER_FULL');
  advance(299999);
  assert.equal(manager.rooms.size, 1);
  const expired = advance(1);
  assert.equal(manager.rooms.size, 0);
  assert.equal(manager.snapshot('host'), null);
  assert.equal(expired[0].id, 'host');
  assert.equal(send('other', { type: 'create', name: 'Other' }).ok, true);
});

test('inputs over thirty a second are rejected, then recover after the rate window', () => {
  const { manager, send, advance, race } = setup();
  race();
  const roundId = manager.snapshot('host').room.roundId;
  for (let seq = 1; seq <= 30; seq += 1) {
    assert.equal(send('host', { type: 'input', action: seq % 2 ? 'left' : 'right', seq, roundId }).ok, true);
  }
  assert.equal(send('host', { type: 'input', action: 'boost', seq: 31, roundId }).code, 'RATE_LIMIT');
  assert.equal(manager.snapshot('host').you.game.timeSpent, 0);
  advance(1000);
  assert.equal(send('host', { type: 'input', action: 'boost', seq: 32, roundId }).ok, true);
});

test('invalid envelopes and sequence numbers never mutate game state', () => {
  const { manager, send, race } = setup();
  race();
  const before = manager.snapshot('host').you.game;
  for (const message of [null, [], 'input', {}, { type: 'unknown' }]) {
    assert.equal(send('host', message).ok, false);
  }
  for (const seq of [0, -1, 1.2, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(send('host', { type: 'input', action: 'boost', seq, roundId: manager.snapshot('host').room.roundId }).code, 'INVALID_INPUT');
  }
  assert.deepEqual(manager.snapshot('host').you.game, before);
});

// Real sockets require permission in restricted development sandboxes.
const networkTest = process.env.RUN_NETWORK_TESTS === '1' ? test : test.skip;

async function listen(app) {
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  return `http://127.0.0.1:${app.server.address().port}`;
}

async function client(url) {
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/race');
  const inbox = [];
  const waiters = new Set();
  socket.on('message', (raw) => {
    const value = JSON.parse(raw.toString());
    inbox.push(value);
    for (const wake of waiters) wake();
  });
  await once(socket, 'open');
  const until = (predicate) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      waiters.delete(check);
      reject(new Error('Timed out waiting for a server message'));
    }, 6000);
    const check = () => {
      const index = inbox.findIndex(predicate);
      if (index < 0) return;
      clearTimeout(timeout);
      waiters.delete(check);
      resolve(inbox.splice(index, 1)[0]);
    };
    waiters.add(check);
    check();
  });
  return { socket, until, send: (message) => socket.send(JSON.stringify(message)) };
}

networkTest('two real clients share a countdown but receive private state and connection-owned inputs', async (t) => {
  const app = createGameServer();
  t.after(() => app.close());
  const url = await listen(app);
  const host = await client(url);
  const guest = await client(url);
  assert.equal((await host.until((m) => m.type === 'connected')).version, 1);
  host.send({ type: 'create', name: 'Host' });
  const created = await host.until((m) => m.type === 'snapshot');
  guest.send({ type: 'join', code: created.room.code, name: 'Guest' });
  const joined = await guest.until((m) => m.type === 'snapshot');
  assert.equal(joined.room.code, created.room.code);
  assert.notEqual(joined.you.id, created.you.id);
  host.send({ type: 'start' });
  await host.until((m) => m.type === 'snapshot' && m.room.phase === 'countdown');
  await guest.until((m) => m.type === 'snapshot' && m.room.phase === 'countdown');
  const racing = await host.until((m) => m.type === 'snapshot' && m.room.phase === 'racing');
  await guest.until((m) => m.type === 'snapshot' && m.room.phase === 'racing');
  host.send({ type: 'input', action: 'left', seq: 1, roundId: racing.room.roundId, playerId: joined.you.id });
  host.send({ type: 'input', action: 'boost', seq: 2, roundId: racing.room.roundId });
  const own = await host.until((m) => m.type === 'snapshot' && m.you.game.timeSpent === 5);
  const other = await guest.until((m) => m.type === 'snapshot' && m.players.some((p) => p.id === created.you.id && p.lane === 0));
  assert.equal(own.you.game.lane, 0);
  assert.equal(other.you.game.lane, 1);
  assert.equal(other.you.game.timeSpent, 0);
  assert.equal(Object.hasOwn(own.you.game, 'obstacles'), false);
  const ghost = other.players.find((p) => p.id === created.you.id);
  assert.deepEqual(Object.keys(ghost).sort(), ['avatarId', 'color', 'connected', 'distance', 'id', 'jumpDuration', 'jumpRemaining', 'lane', 'name', 'phase']);
  host.socket.send('{bad json');
  assert.equal((await host.until((m) => m.type === 'error')).code, 'INVALID_JSON');
  host.socket.close();
  const remaining = await guest.until((m) => m.type === 'snapshot' && m.room.hostId === joined.you.id);
  assert.equal(remaining.room.phase, 'racing');
  assert.equal(remaining.players.find((p) => p.id === created.you.id).connected, false);
  const game = app.rooms.rooms.get(created.room.code).players.get(joined.you.id).game;
  game.obstacles = [];
  game.checkpoints = [];
  game.distance = 1349.99;
  const finished = await guest.until((m) => m.type === 'snapshot' && m.room.phase === 'finished');
  assert.equal(finished.you.game.phase, 'won');
  assert.equal(finished.room.winnerId, joined.you.id);
  guest.send({ type: 'rematch' });
  const rematch = await guest.until((m) => m.type === 'snapshot' && m.room.phase === 'lobby');
  assert.notEqual(rematch.room.roundId, racing.room.roundId);
  assert.equal(rematch.players.length, 1);
  assert.equal(rematch.you.game.timeLeft, 60);
  guest.send({ type: 'leave' });
  await guest.until((m) => m.type === 'left');
  assert.equal(app.rooms.rooms.size, 0);
});

networkTest('HTTP serves only public files and WebSocket upgrade rejects other browser origins', async (t) => {
  const app = createGameServer();
  t.after(() => app.close());
  const url = await listen(app);
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/src/server/rooms.js`)).status, 404);
  assert.equal((await fetch(`${url}/package.json`)).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  assert.equal(await (await fetch(`${url}/health`)).text(), 'ok');
  const allowed = new WebSocket(url.replace('http:', 'ws:') + '/race', { origin: url });
  await once(allowed, 'open');
  allowed.close();
  const rejected = new WebSocket(url.replace('http:', 'ws:') + '/race', { origin: 'https://other.example' });
  const error = await new Promise((resolve) => rejected.once('error', resolve));
  assert.match(error.message, /403/);
});

networkTest('transport bounds connection count, frame size, and message floods without crashing', async (t) => {
  const app = createGameServer({ maxConnections: 1 });
  t.after(() => app.close());
  const url = await listen(app);
  const first = await client(url);
  await assert.rejects(client(url), /503/);
  const closed = once(first.socket, 'close');
  first.socket.send('x'.repeat(4097));
  await closed;
  const next = await client(url);
  const limited = once(next.socket, 'close');
  for (let count = 0; count < 61; count += 1) next.send({ type: 'leave' });
  assert.equal((await limited)[0], 1008);
  const healthy = await client(url);
  healthy.send({ type: 'create', name: 'Still working' });
  assert.equal((await healthy.until((m) => m.type === 'snapshot')).room.phase, 'lobby');
});

networkTest('heartbeat removes a silent connection and shutdown closes active sockets', async (t) => {
  const app = createGameServer({ heartbeatMs: 40 });
  t.after(() => app.close());
  const url = await listen(app);
  const silent = new WebSocket(url.replace('http:', 'ws:') + '/race', { autoPong: false });
  await once(silent, 'open');
  await once(silent, 'close');
  const alive = await client(url);
  const closed = once(alive.socket, 'close');
  await app.close();
  await closed;
  assert.equal(app.server.listening, false);
  assert.equal(app.rooms.rooms.size, 0);
});

test('the server assigns four unique avatars across four players and ignores client character choices', () => {
  const { manager, connect, send } = setup({ random: () => 0 });
  connect('host');
  send('host', { type: 'create', name: 'Host', avatarId: 'engineer' });
  const code = manager.snapshot('host').room.code;
  for (const id of ['second', 'third', 'fourth']) {
    connect(id);
    assert.equal(send(id, { type: 'join', code, name: id, avatarId: 'invented' }).ok, true);
  }
  const snapshot = manager.snapshot('host');
  assert.deepEqual(snapshot.players.map(player => player.avatarId), ['courier', 'engineer', 'guard', 'runner']);
  assert.equal(new Set(snapshot.players.map(player => player.color)).size, 4);
  for (const player of snapshot.players) {
    assert.equal(manager.snapshot(player.id).you.game.avatarId, player.avatarId);
    assert.equal(manager.snapshot(player.id).you.game.playerColor, player.color);
  }
  const reversed = setup({ random: () => .99 });
  reversed.create();
  assert.equal(reversed.manager.snapshot('host').you.game.avatarId, 'runner');
});

test('rematches preserve all four identities while resetting the course and debris state', () => {
  const { manager, create, join, send, advance } = setup();
  const code = create();
  for (const id of ['second', 'third', 'fourth']) join(code, id);
  const identities = manager.snapshot('host').players.map(({ id, avatarId, color }) => ({ id, avatarId, color }));
  assert.ok(identities.every(player => ['courier', 'engineer', 'guard', 'runner'].includes(player.avatarId)));
  send('host', { type: 'start' });
  advance(3000);
  const room = manager.rooms.get(code);
  const oldEvents = structuredClone(room.players.get('host').game.debris);
  for (const player of room.players.values()) player.game.timeLeft = .001;
  advance(17);
  send('host', { type: 'rematch' });
  const next = manager.snapshot('host');
  assert.deepEqual(next.players.map(({ id, avatarId, color }) => ({ id, avatarId, color })), identities);
  assert.equal(next.room.raceElapsed, 0);
  for (const player of room.players.values()) {
    assert.equal(player.game.avatarId, identities.find(identity => identity.id === player.id).avatarId);
    assert.notDeepEqual(player.game.debris, oldEvents);
    assert.ok(Object.values(player.game.debrisProgress).every(progress => !progress.resolved && !progress.impactChecked));
  }
});

test('room race time tracks simulated time and continues after the viewing player finishes', () => {
  const { manager, race, send, advance } = setup();
  const code = race();
  const roundId = manager.snapshot('host').room.roundId;
  send('guest', { type: 'input', action: 'boost', seq: 1, roundId });
  advance(1000);
  const current = manager.snapshot('host');
  assert.ok(Math.abs(current.room.raceElapsed - 1) < 1e-7);
  assert.equal(current.room.raceElapsed, current.you.game.elapsed);
  assert.equal(current.room.raceElapsed, manager.snapshot('guest').you.game.elapsed);
  const host = manager.rooms.get(code).players.get('host').game;
  host.distance = 1349.99;
  host.obstacles = [];
  host.debris = [];
  host.checkpoints = [];
  advance(17);
  const finishedAt = manager.snapshot('host').you.game.elapsed;
  advance(1000);
  const after = manager.snapshot('host');
  assert.equal(after.you.game.phase, 'won');
  assert.equal(after.you.game.elapsed, finishedAt);
  assert.ok(after.room.raceElapsed > finishedAt + .99);
  assert.equal(after.room.raceElapsed, manager.snapshot('guest').you.game.elapsed);
  assert.equal(Object.hasOwn(after.you.game, 'debris'), false);
  assert.equal(Object.hasOwn(after.you.game, 'debrisProgress'), false);
  advance(10000);
  assert.ok(manager.snapshot('host').room.raceElapsed < 5, 'backlogged wall time is not presented as simulated time');
});

test('active player clocks stay synchronized through different collisions and purchases', () => {
  const { manager, race, send, advance } = setup();
  race();
  const roundId = manager.snapshot('host').room.roundId;
  send('host', { type: 'input', action: 'boost', seq: 1, roundId });
  send('host', { type: 'input', action: 'left', seq: 2, roundId });
  for (let seconds = 0; seconds < 15; seconds += 1) {
    advance(1000);
    const host = manager.snapshot('host'), guest = manager.snapshot('guest');
    assert.equal(host.you.game.phase, 'running');
    assert.equal(guest.you.game.phase, 'running');
    assert.equal(host.you.game.elapsed, host.room.raceElapsed);
    assert.equal(guest.you.game.elapsed, guest.room.raceElapsed);
  }
});

networkTest('four real clients race with four distinct avatars and preserve identities on rematch', async (t) => {
  const app = createGameServer();
  t.after(() => app.close());
  const url = await listen(app);
  const clients = await Promise.all(Array.from({ length: 4 }, () => client(url)));
  const [host] = clients;
  host.send({ type: 'create', name: 'Host', avatarId: 'invented' });
  const created = await host.until(message => message.type === 'snapshot');
  for (const [index, guest] of clients.entries()) {
    if (index === 0) continue;
    guest.send({ type: 'join', name: `Runner ${index}`, code: created.room.code, avatarId: 'invented' });
    await guest.until(message => message.type === 'snapshot');
  }
  const lobby = await host.until(message => message.type === 'snapshot' && message.players.length === 4);
  assert.equal(new Set(lobby.players.map(player => player.color)).size, 4);
  assert.deepEqual(lobby.players.map(player => player.avatarId).sort(), ['courier', 'engineer', 'guard', 'runner']);
  const identities = lobby.players.map(({ id, avatarId, color }) => ({ id, avatarId, color }));
  host.send({ type: 'start' });
  const races = await Promise.all(clients.map(connection => connection.until(message => message.type === 'snapshot' && message.room.phase === 'racing')));
  for (const snapshot of races) {
    assert.equal(snapshot.you.game.avatarId, identities.find(player => player.id === snapshot.you.id).avatarId);
    assert.equal(snapshot.you.game.elapsed, snapshot.room.raceElapsed);
    assert.equal(Object.hasOwn(snapshot.you.game, 'debris'), false);
  }
  for (const player of app.rooms.rooms.get(created.room.code).players.values()) player.game.timeLeft = .001;
  await host.until(message => message.type === 'snapshot' && message.room.phase === 'finished');
  host.send({ type: 'rematch' });
  const rematches = await Promise.all(clients.map(connection => connection.until(message => message.type === 'snapshot' && message.room.phase === 'lobby' && message.room.roundId !== created.room.roundId)));
  for (const snapshot of rematches) {
    assert.deepEqual(snapshot.players.map(({ id, avatarId, color }) => ({ id, avatarId, color })), identities);
    assert.equal(snapshot.room.raceElapsed, 0);
    assert.equal(snapshot.you.game.timeLeft, 60);
  }
});

networkTest('four real clients share map votes, themed rosters and private purchases on all maps', async t => {
  const { MAPS, MAP_IDS } = await import('../src/maps.js');
  for (const mapId of MAP_IDS) await t.test(mapId, async t => {
    let time = 1000;
    const app = createGameServer({ now: () => time }); t.after(() => app.close());
    const url = await listen(app);
    const clients = await Promise.all(Array.from({ length: 4 }, () => client(url)));
    clients[0].send({ type: 'create', name: 'Host', mapId: 'tunnel' });
    const created = await clients[0].until(m => m.type === 'snapshot');
    for (const [i, guest] of clients.slice(1).entries()) {
      guest.send({ type: 'join', name: `Guest ${i}`, code: created.room.code });
      await guest.until(m => m.type === 'snapshot');
    }
    for (const connection of clients) connection.send({ type: 'vote', mapId });
    await clients[0].until(m => m.type === 'snapshot' && Object.values(m.room.votes).filter(id => id === mapId).length === 4);
    clients[0].send({ type: 'start' });
    const locked = await clients[0].until(m => m.type === 'snapshot' && m.room.phase === 'countdown');
    assert.equal(locked.room.mapId, mapId);
    time += 3100;
    const racing = await Promise.all(clients.map(connection => connection.until(m => m.type === 'snapshot' && m.room.phase === 'racing')));
    for (const snapshot of racing) {
      assert.equal(snapshot.you.game.mapId, mapId);
      assert.equal(snapshot.room.seed, racing[0].room.seed);
      assert.deepEqual(snapshot.debris, racing[0].debris);
      assert.equal(new Set(snapshot.players.map(p => p.avatarId)).size, 4);
      assert.ok(snapshot.players.every(p => MAPS[mapId].avatars.includes(p.avatarId)));
    }
    clients[0].send({ type: 'input', action: 'boost', seq: 1, roundId: locked.room.roundId });
    const bought = await clients[0].until(m => m.type === 'snapshot' && m.you.game.timeSpent === 5);
    assert.ok(bought.you.game.boostRemaining > 0);
    const guest = await clients[1].until(m => m.type === 'snapshot' && m.players.find(p => p.id === bought.you.id));
    assert.equal(guest.you.game.timeSpent, 0);
    assert.equal(guest.you.game.boostRemaining, 0);
    for (const path of ['/src/maps.js','/src/graphics/worlds.js','/src/graphics/map-obstacles.js',MAPS[mapId].thumbnail,...MAPS[mapId].avatars.map(id => `/assets/characters/${id}.glb`)]) {
      const response = await fetch(url + path, { method: 'HEAD' }); assert.equal(response.status, 200, path);
    }
    assert.equal((await fetch(url + '/backups/pre-three-maps-20261027.bundle')).status, 404);
    for (const connection of clients) connection.socket.close();
  });
});
