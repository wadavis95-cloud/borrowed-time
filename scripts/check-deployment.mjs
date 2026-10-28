import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { MAP_IDS } from '../src/maps.js';
import { ALL_AVATAR_IDS } from '../src/avatars.js';
import { ABILITIES } from '../src/game.js';

// Run after deployment. This creates one temporary two-player room, exercises
// the real transport, then removes the room. No browser or extra dependencies.
const USAGE = 'Usage: node scripts/check-deployment.mjs https://your-game.onrender.com';
const ASSETS = [
  '/styles.css', '/favicon.svg', '/src/main.js', '/src/game.js', '/src/maps.js',
  '/src/graphics/worlds.js', '/src/graphics/map-obstacles.js', '/src/movement-feedback.js', '/src/graphics/readability.js', '/src/graphics/motion-effects.js',
  ...MAP_IDS.map(id => `/assets/maps/${id}.svg`),
  '/src/graphics/expansion-worlds.js', '/src/graphics/world-utils.js',
  '/src/renderer.js', '/src/unity-renderer.js', '/src/unity-protocol.js', '/src/network.js', '/src/avatars.js', '/src/hazards.js',
  '/src/graphics/avatars.js', '/src/graphics/tunnel.js', '/src/demo.js', '/src/audio.js', '/src/input.js', '/src/ability-coach.js',
  '/vendor/three.module.js', '/vendor/three.core.js', '/vendor/loaders/GLTFLoader.js',
  '/vendor/utils/BufferGeometryUtils.js', '/vendor/utils/SkeletonUtils.js',
  '/docs/character-preview.html', ...ALL_AVATAR_IDS.map(id => `/assets/characters/${id}.glb`),
];

function parseTarget(args) {
  if (args.length !== 1) throw new Error(USAGE);
  let target;
  try { target = new URL(args[0]); } catch { throw new Error(`Enter a valid deployment URL. ${USAGE}`); }
  if (target.username || target.password) throw new Error('Use a public URL without credentials.');
  if (target.pathname !== '/' || target.search || target.hash) {
    throw new Error('Use the deployment origin only, without a path, query, or fragment.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (target.protocol !== 'https:' && !(local && target.protocol === 'http:')) {
    throw new Error('HTTPS is required for public deployments; HTTP is allowed only on localhost.');
  }
  return target;
}

async function request(target, path, { method = 'GET', timeout = 15000 } = {}) {
  let response;
  try {
    response = await fetch(new URL(path, target), {
      method, redirect: 'error', signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error(`${method} ${path} failed or timed out. Check the URL, network, and service deploy logs.`);
  }
  assert.equal(response.status, 200, `${method} ${path} returned HTTP ${response.status}; check the deployment files and public routes.`);
  return response;
}

function createClient(target, label) {
  const endpoint = new URL('/race', target);
  endpoint.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(endpoint, { origin: target.origin, handshakeTimeout: 10000 });
  const inbox = [];
  const waiters = new Set();
  let failure;
  const wake = () => { for (const check of [...waiters]) check(); };
  socket.on('message', (raw) => {
    try { inbox.push(JSON.parse(raw.toString())); }
    catch { failure = new Error(`${label}: the server sent invalid JSON.`); }
    // Snapshots arrive at 20 Hz. Keep recent messages without growing forever.
    if (inbox.length > 200) inbox.shift();
    wake();
  });
  socket.on('error', () => {
    failure = new Error(`${label}: WebSocket connection failed. Check /race routing, HTTPS/WSS, and the service logs.`);
    wake();
  });
  socket.on('close', () => { wake(); });

  function until(predicate, description, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const finish = (error, message) => {
        clearTimeout(timer);
        waiters.delete(check);
        if (error) reject(error); else resolve(message);
      };
      const check = () => {
        const index = inbox.findIndex(predicate);
        if (index !== -1) return finish(null, inbox.splice(index, 1)[0]);
        const serverError = inbox.find(message => message.type === 'error');
        if (serverError) return finish(new Error(`${label}: server rejected the request while ${description}. Check the service logs.`));
        if (failure) return finish(failure);
        if (socket.readyState === WebSocket.CLOSED) return finish(new Error(`${label}: disconnected while ${description}.`));
      };
      const timer = setTimeout(() => finish(new Error(`${label}: timed out while ${description}. Check that all connections reach the same server instance.`)), timeout);
      waiters.add(check);
      check();
    });
  }

  function send(message) {
    assert.equal(socket.readyState, WebSocket.OPEN, `${label}: WebSocket is not open.`);
    socket.send(JSON.stringify(message));
  }

  function close() {
    if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { socket.terminate(); resolve(); }, 1500);
      socket.once('close', done);
      if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Deployment check complete');
      else socket.terminate();
    });
  }

  return { until, send, close };
}

const isSnapshot = message => message.type === 'snapshot';
const inPhase = phase => message => isSnapshot(message) && message.room.phase === phase;

async function checkMultiplayer(target) {
  const host = createClient(target, 'Host');
  const guest = createClient(target, 'Guest');
  try {
    const connected = await Promise.all([host, guest].map(client => client.until(message => message.type === 'connected', 'connecting')));
    for (const message of connected) assert.equal(message.version, 1, 'Unexpected WebSocket protocol version.');
    console.log('✓ Two same-origin WebSocket connections established');

    host.send({ type: 'create', name: 'Deployment host' });
    const created = await host.until(isSnapshot, 'creating a room');
    guest.send({ type: 'join', code: created.room.code, name: 'Deployment guest' });
    const joined = await guest.until(isSnapshot, 'joining the room');
    assert.equal(joined.room.code, created.room.code, 'Clients joined different rooms.');
    assert.notEqual(joined.you.id, created.you.id, 'Clients must have separate player identities.');
    assert.equal(joined.players.length, 2, 'Expected two players in the new room.');
    await host.until(message => isSnapshot(message) && message.players.length === 2, 'receiving the guest roster');
    console.log('✓ Create and join share one two-player room');

    host.send({ type: 'start' });
    await Promise.all([host, guest].map(client => client.until(inPhase('countdown'), 'receiving the countdown')));
    const [hostStart, guestStart] = await Promise.all([host, guest].map(client => client.until(inPhase('racing'), 'starting the race')));
    assert.equal(hostStart.room.roundId, guestStart.room.roundId, 'Clients started different rounds.');
    assert.equal(hostStart.room.seed, guestStart.room.seed, 'Clients received different course seeds.');
    assert.equal(hostStart.standings.length, 2, 'Leaderboard is missing players.');
    assert.deepEqual(hostStart.debris, guestStart.debris, 'Clients received different roof-collapse schedules.');
    console.log('✓ Both players receive the countdown and start the same race');

    host.send({ type: 'input', action: 'boost', seq: 1, roundId: hostStart.room.roundId });
    const boosted = await host.until(message => isSnapshot(message) && message.you.game.timeSpent > 0, 'buying the host boost');
    assert.equal(boosted.you.game.timeSpent, ABILITIES.boost.cost, 'Boost price does not match this release.');
    assert.ok(boosted.you.game.boostRemaining > 0, 'Host boost did not become active.');
    const guestAfter = await guest.until(message => isSnapshot(message) && message.room.raceElapsed >= boosted.room.raceElapsed + 0.25, 'observing forward movement');
    const ghost = guestAfter.players.find(player => player.id === created.you.id);
    assert.ok(guestAfter.you.game.distance > guestStart.you.game.distance, 'Guest is not moving forward.');
    assert.ok(ghost?.distance > hostStart.you.game.distance, 'Host movement is not reaching the guest.');
    assert.ok(ghost.distance > guestAfter.you.game.distance, 'The boosted host should pull ahead.');
    assert.equal(guestAfter.you.game.timeSpent, 0, 'The guest incorrectly paid for another player’s boost.');
    assert.equal(guestAfter.you.game.boostRemaining, 0, 'The guest incorrectly received another player’s boost.');
    console.log('✓ Movement advances, the host pulls ahead, and only the host spends time and boosts');

    guest.send({ type: 'input', action: 'longJump', seq: 1, roundId: guestStart.room.roundId });
    const leaping = await guest.until(message => isSnapshot(message) && message.you.game.timeSpent > 0, 'buying the guest long jump');
    assert.equal(leaping.you.game.timeSpent, ABILITIES.longJump.cost, 'Long-jump price does not match this release.');
    assert.equal(leaping.you.game.jumpKind, 'long');
    console.log('✓ Long-jump purchase, shared course, roof schedules and live standings verified');

    await host.close();
    await guest.until(message => isSnapshot(message) && message.room.hostId === joined.you.id && message.players.some(player => player.id === created.you.id && !player.connected), 'observing host disconnect cleanup');
    guest.send({ type: 'leave' });
    await guest.until(message => message.type === 'left', 'leaving the temporary room');
    // With the last player gone, joining this code must fail: the room was deleted.
    guest.send({ type: 'join', code: created.room.code, name: 'Cleanup check' });
    const gone = await guest.until(message => message.type === 'error', 'confirming the empty room was deleted');
    assert.equal(gone.code, 'ROOM_NOT_FOUND', 'The empty temporary room was not removed.');
    console.log('✓ Disconnects are broadcast and the empty test room is removed');
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log(`${USAGE}\nLocal development: node scripts/check-deployment.mjs http://localhost:4173\nCreates and removes one temporary multiplayer room. Allow up to 90 seconds for a sleeping host to wake.`);
    return;
  }
  const target = parseTarget(process.argv.slice(2));
  console.log(`Checking ${target.origin} (a sleeping free host can take about a minute to wake)…`);
  const health = await request(target, '/health', { timeout: 90000 });
  assert.equal((await health.text()).trim(), 'ok', '/health did not return the game health response.');
  console.log('✓ Health endpoint responds');

  const page = await request(target, '/');
  assert.match(page.headers.get('content-type') ?? '', /text\/html/, 'Home page must be HTML.');
  const html = await page.text();
  assert.match(html, /id="game-canvas"/, 'The home page is not the game.');
  assert.match(html, /src="\/src\/main\.js"/, 'The game entry module is missing.');
  // Bound concurrency so the check is gentle on a small free instance.
  for (let index = 0; index < ASSETS.length; index += 4) {
    await Promise.all(ASSETS.slice(index, index + 4).map(async path => {
      const asset = await request(target, path, { method: 'HEAD' });
      const type = asset.headers.get('content-type') ?? '';
      const expected = path.endsWith('.glb') ? 'model/gltf-binary' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'image/svg+xml';
      assert.ok(type.includes(expected), `${path} has the wrong content type; check the public asset route.`);
    }));
  }
  console.log(`✓ Game page and ${ASSETS.length} public assets, including the classic fallback`);
  for (const [file, type] of [
    ['Race.loader.js', 'text/javascript'], ['Race.framework.js.gz', 'text/javascript'],
    ['Race.data.gz', 'application/octet-stream'], ['Race.wasm.gz', 'application/wasm'],
  ]) {
    const asset = await request(target, `/assets/unity/v5/${file}`, { method: 'HEAD' });
    assert.ok((asset.headers.get('content-type') ?? '').includes(type), `${file}: wrong Unity MIME`);
    assert.ok(Number(asset.headers.get('content-length')) > 0, `${file}: missing Unity build`);
    if (file.endsWith('.gz')) assert.equal(asset.headers.get('content-encoding'), 'gzip', `${file}: missing gzip header`);
  }
  console.log('✓ Unity loader, scene data, framework and WebAssembly headers');
  await checkMultiplayer(target);
  console.log('Deployment checks passed. Next: open this URL on two devices and check the touch controls and graphics.');
}

main().catch(error => {
  console.error(`Deployment check failed: ${error.message}`);
  process.exitCode = 1;
});
