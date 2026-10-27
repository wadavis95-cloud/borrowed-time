import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, MAP_IDS, getMap, resolveMapVote } from '../src/maps.js';
import { createGame, startGame, updateGame, moveLane, jump } from '../src/game.js';
import { chooseDemoAction } from '../src/demo.js';
import { createRaceView } from '../src/network.js';
import { createRoomManager } from '../src/server/rooms.js';

test('three maps provide unique four-person rosters and reproducible courses', () => {
  assert.equal(MAP_IDS.length, 3);
  assert.equal(new Set(MAP_IDS.flatMap(id => MAPS[id].avatars)).size, 12);
  for (const mapId of MAP_IDS) {
    const a = createGame({ mapId, seed: 42 });
    const b = createGame({ mapId, seed: 42 });
    assert.equal(a.mapId, mapId);
    assert.ok(MAPS[mapId].avatars.includes(a.avatarId));
    assert.deepEqual(a.obstacles, b.obstacles);
    assert.ok(a.obstacles.some(o => o.type === 'gap'));
    assert.ok(a.obstacles.some(o => o.type === 'barrier'));
    assert.ok(a.debris.length > 0);
    assert.notDeepEqual(a.obstacles, createGame({ mapId, seed: 43 }).obstacles);
  }
  assert.equal(getMap('invalid').id, 'tunnel');
  assert.equal(createGame({ mapId: 'invalid' }).mapId, 'tunnel');
});

test('plurality votes, ties and empty votes resolve to a valid map', () => {
  assert.equal(resolveMapVote(['pirate', 'pirate', 'jungle'], 'tunnel', () => 0), 'pirate');
  assert.equal(resolveMapVote(['pirate', 'jungle'], 'tunnel', () => 0), 'pirate');
  assert.equal(resolveMapVote(['pirate', 'jungle'], 'tunnel', () => .99), 'jungle');
  assert.equal(resolveMapVote([], 'jungle'), 'jungle');
});

function setup() {
  let time = 0, identity = 0;
  const manager = createRoomManager({ now: () => time, makeId: () => `round-${identity++}`, random: () => 0 });
  for (const id of ['host', 'guest', 'third', 'fourth']) manager.connect(id);
  assert.ok(manager.handle('host', { type: 'create', name: 'Host', mapId: 'pirate' }).ok);
  const code = manager.snapshot('host').room.code;
  for (const id of ['guest', 'third', 'fourth']) assert.ok(manager.handle(id, { type: 'join', name: id, code }).ok);
  return { manager, advance: n => { time += n; manager.tick(time); } };
}

test('lobby votes are validated, authoritative and lock at countdown; themed avatars are unique', () => {
  const { manager } = setup();
  assert.equal(manager.handle('guest', { type: 'vote', mapId: '__proto__' }).ok, false);
  assert.equal(manager.handle('guest', { type: 'vote', mapId: null }).ok, false);
  for (const id of ['guest', 'third', 'fourth']) assert.ok(manager.handle(id, { type: 'vote', mapId: 'jungle' }).ok);
  const before = manager.snapshot('host');
  assert.equal(before.room.votes.guest, 'jungle');
  assert.ok(manager.handle('host', { type: 'start' }).ok);
  const snapshot = manager.snapshot('guest');
  assert.equal(snapshot.room.mapId, 'jungle');
  assert.equal(snapshot.you.game.mapId, 'jungle');
  assert.equal(new Set(snapshot.players.map(p => p.avatarId)).size, 4);
  assert.ok(snapshot.players.every(p => MAPS.jungle.avatars.includes(p.avatarId)));
  assert.equal(manager.handle('host', { type: 'vote', mapId: 'pirate' }).ok, false);
});

test('departed votes disappear and rematches reopen voting', () => {
  const { manager, advance } = setup();
  manager.handle('guest', { type: 'vote', mapId: 'jungle' });
  manager.disconnect('guest');
  assert.equal(manager.snapshot('host').room.votes.guest, undefined);
  manager.handle('host', { type: 'start' });
  for (let n = 0; n < 70; n++) advance(1000);
  assert.equal(manager.snapshot('host').room.phase, 'finished');
  assert.ok(manager.handle('host', { type: 'rematch' }).ok);
  assert.ok(manager.handle('host', { type: 'vote', mapId: 'jungle' }).ok);
});


test('all three maps have free routes across 32 seeds at ordinary input intervals', () => {
  for (const mapId of MAP_IDS) for (let seed = 1; seed <= 32; seed++) {
    const game = createGame({ mapId, seed }); startGame(game);
    for (let tick = 0; tick < 60 * 80 && game.phase === 'running'; tick++) {
      if (tick % 9 === 0) {
        const action = chooseDemoAction(game, 1);
        if (action === 'left' || action === 'right') moveLane(game, action === 'left' ? -1 : 1);
        if (action === 'jump') jump(game);
      }
      updateGame(game, 1 / 60);
    }
    assert.equal(game.phase, 'won', `${mapId}/${seed}`);
    assert.equal(game.hits, 0, `${mapId}/${seed}`);
    assert.equal(game.timeSpent, 0);
  }
});

test('client replaces course when a lobby vote changes map within the same round', () => {
  const { manager } = setup(), view = createRaceView();
  const before = manager.snapshot('host'); view.push(before, 0);
  for (const id of ['host','guest','third','fourth']) manager.handle(id, { type: 'vote', mapId: 'jungle' });
  manager.handle('host', { type: 'start' });
  const after = manager.snapshot('host'); view.push(after, 50);
  const client = view.sample(100).game;
  assert.equal(client.mapId, 'jungle');
  assert.deepEqual(client.obstacles, manager.rooms.get(after.room.code).players.get('host').game.obstacles);
  assert.notDeepEqual(client.obstacles, createGame({ seed: after.room.seed, mapId: 'pirate' }).obstacles);
});

test('changing votes replaces rather than adds votes; a tie is resolved once for everyone', () => {
  const { manager } = setup();
  manager.handle('host', { type: 'vote', mapId: 'jungle' });
  manager.handle('host', { type: 'vote', mapId: 'pirate' });
  manager.handle('guest', { type: 'vote', mapId: 'jungle' });
  manager.handle('third', { type: 'vote', mapId: 'pirate' });
  manager.handle('fourth', { type: 'vote', mapId: 'jungle' });
  assert.equal(Object.keys(manager.snapshot('host').room.votes).length, 4);
  assert.ok(manager.handle('host', { type: 'start' }).ok);
  const winner = manager.snapshot('host').room.mapId;
  assert.equal(winner, 'pirate');
  for (const id of ['guest','third','fourth']) assert.equal(manager.snapshot(id).room.mapId, winner);
  assert.equal(manager.handle('guest', { type: 'start' }).ok, false);
});

test('map obstacle art stays below the paid clearance height and keeps gap length aligned', async () => {
  const THREE = await import('three');
  const { createMapObstacle } = await import('../src/graphics/map-obstacles.js');
  const { DISTANCE_SCALE } = await import('../src/graphics/tunnel.js');
  for (const mapId of ['pirate','jungle']) for (const type of ['rubble','barrier','gap']) {
    const group = createMapObstacle(mapId, { type, length: 8 });group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    assert.ok(Number.isFinite(bounds.max.y));
    if(type === 'barrier') assert.ok(bounds.max.y <= 2.2 && bounds.max.y >= 1.8, `${mapId} visual clearance`);
    if(type === 'rubble') assert.ok(bounds.max.y < 1.15, `${mapId} hop silhouette`);
    if(type === 'gap') assert.ok(bounds.min.z <= -8 * DISTANCE_SCALE, `${mapId} gap far edge`);
  }
});

test('player names are automatically assigned roles, including after a winning map vote', async () => {
  const { AVATARS } = await import('../src/avatars.js');
  const { manager } = setup();
  for (const player of manager.snapshot('host').players) assert.equal(player.name, AVATARS[player.avatarId].name);
  for (const id of ['host','guest','third','fourth']) manager.handle(id, { type: 'vote', mapId: 'jungle' });
  manager.handle('host', { type: 'start' });
  for (const player of manager.snapshot('host').players) assert.equal(player.name, AVATARS[player.avatarId].name);
  const other = createRoomManager();other.connect('anonymous');
  assert.ok(other.handle('anonymous', { type: 'create', mapId: 'pirate' }).ok);
  assert.equal(other.snapshot('anonymous').you.name, AVATARS[other.snapshot('anonymous').you.game.avatarId].name);
});

test('batching scenery preserves textured UVs alongside untextured leaf geometry', async () => {
  const THREE = await import('three');
  const { batchWorldGeometry } = await import('../src/graphics/worlds.js');
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2,1,1), material));
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0],3));triangle.computeVertexNormals();
  root.add(new THREE.Mesh(triangle, material));
  batchWorldGeometry(root);
  const mesh = root.children.find(child => child.isMesh);
  assert.ok(mesh.geometry.getAttribute('uv'), 'textured deck/trail must retain UV coordinates');
  assert.ok([...mesh.geometry.getAttribute('uv').array].some(value => value !== 0), 'UVs must vary across the textured surface');
  assert.equal(mesh.geometry.getAttribute('uv').count, mesh.geometry.getAttribute('position').count);
});
