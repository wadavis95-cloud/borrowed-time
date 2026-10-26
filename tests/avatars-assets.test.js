import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAvatarLibrary } from '../src/graphics/avatars.js';

const ids = ['courier', 'engineer', 'guard', 'runner'];
async function readAsset(id) {
  const bytes = await readFile(new URL(`../assets/characters/${id}.glb`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

test('four original GLB assets contain finite skinned geometry and reusable motion', async () => {
  const signatures = new Set();
  for (const id of ids) {
    const asset = await readAsset(id);
    const clips = new Set(asset.animations.map((clip) => clip.name));
    for (const name of ['idle', 'run', 'jump', 'stumble']) assert.ok(clips.has(name), `${id} ${name}`);
    let vertices = 0;
    const seenPositions = new Set();
    let meshes = 0;
    asset.scene.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      assert.ok(object.isSkinnedMesh, `${id} is rigged`);
      assert.ok(object.skeleton.bones.length >= 20);
      // GLTF primitives share the same vertex accessor across material draws.
      if (!seenPositions.has(object.geometry.attributes.position)) {
        seenPositions.add(object.geometry.attributes.position);
        vertices += object.geometry.attributes.position.count;
      }
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        assert.ok(object.geometry.attributes[name], name);
        assert.ok([...object.geometry.attributes[name].array].every(Number.isFinite), `${id} ${name}`);
      }
      const weights = object.geometry.attributes.skinWeight;
      for (let vertex = 0; vertex < weights.count; vertex++) {
        const total = weights.getX(vertex) + weights.getY(vertex) + weights.getZ(vertex) + weights.getW(vertex);
        assert.ok(Math.abs(total - 1) < .0001, `${id} normalized skin weights`);
      }
    });
    assert.ok(vertices > 4000 && vertices < 80000, `${id} bounded vertex budget: ${vertices}`);
    assert.ok(meshes <= 8, `${id} bounded draw calls: ${meshes}`);
    signatures.add(vertices);
    for (const clip of asset.animations) {
      assert.ok(clip.duration > 0);
      for (const track of clip.tracks) {
        assert.ok([...track.times, ...track.values].every(Number.isFinite), `${id} finite ${clip.name}`);
      }
    }
  }
  assert.equal(signatures.size, 4, 'distinct modeled silhouettes, not four identical recolors');
});

test('preload is retryable, clones animate independently, and disposal preserves shared geometry', async () => {
  let attempts = 0;
  const library = createAvatarLibrary({ loadAsset: async (id) => {
    if (attempts++ === 0) throw new Error('simulated failed download');
    return readAsset(id);
  } });
  assert.throws(() => library.createAvatar('courier'), /preload/i);
  await assert.rejects(library.preloadAvatars(), /simulated failed download/);
  await library.preloadAvatars();
  const avatars = ids.map((id) => library.createAvatar(id));
  const ghost = library.createAvatar('courier', { ghost: true, color: '#c24cfd' });
  const clone = library.createAvatar('courier');
  assert.notEqual(avatars[0].group.getObjectByName('head'), clone.group.getObjectByName('head'));
  const rest = clone.group.getObjectByName('thighL').quaternion.clone();
  avatars[0].update({ phase: 'running', distance: 9, lane: 1 }, .1);
  assert.ok(avatars[0].group.getObjectByName('thighL').quaternion.angleTo(rest) > .1, 'embedded run animation is sampled');
  assert.deepEqual(clone.group.getObjectByName('thighL').quaternion.toArray(), rest.toArray(), 'other clone keeps its own pose');
  for (const avatar of [...avatars, ghost, clone]) {
    avatar.group.position.set(3, 4, 5);
    for (const phase of ['ready', 'running', 'paused', 'won', 'lost']) {
      for (let frame = 0; frame < 80; frame++) {
        avatar.update({ phase, distance: frame * .45, lane: frame % 3, jumpRemaining: frame < 50 ? .9 - frame * .018 : 0, jumpDuration: .9, jumpKind: 'long', stunRemaining: frame > 60 ? .2 : 0 }, 1 / 60);
        avatar.group.updateMatrixWorld(true);
        avatar.group.traverse((object) => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
      }
    }
    assert.deepEqual(avatar.group.position.toArray(), [3, 4, 5], 'renderer owns world position');
  }
  ghost.group.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      assert.ok(material.transparent);
      assert.equal(material.depthWrite, false);
      assert.ok(material.opacity >= .35 && material.opacity <= .45);
    }
  });
  let sharedGeometryDisposed = false;
  avatars[0].group.traverse((object) => {
    if (object.isMesh) object.geometry.addEventListener('dispose', () => { sharedGeometryDisposed = true; });
  });
  avatars[0].dispose();
  avatars[0].dispose();
  clone.update({ phase: 'running', distance: 20, lane: 1 }, .016);
  assert.equal(sharedGeometryDisposed, false);
  for (const avatar of [...avatars, clone, ghost]) avatar.dispose();
});

test('procedural boost and reduced-motion offsets never accumulate on cached mixer tracks', async () => {
  const library = createAvatarLibrary({ loadAsset: readAsset });
  await library.preloadAvatars();
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const avatar = library.createAvatar('courier');
    let distance = 0;
    for (let i = 0; i < 5 / dt; i++) {
      distance += dt * 24;
      avatar.update({ phase: 'running', distance, lane: 1 }, dt);
    }
    for (let i = 0; i < 4 / dt; i++) {
      distance += dt * 32;
      avatar.update({ phase: 'running', distance, lane: 1, boostRemaining: 1 }, dt);
      const spineAngle = avatar.group.getObjectByName('spine').rotation.x;
      assert.ok(spineAngle > -.24 && spineAngle < -.17, `bounded boost lean ${spineAngle} at dt=${dt}`);
    }
    avatar.update({ phase: 'running', distance, lane: 1 }, dt);
    assert.ok(Math.abs(avatar.group.getObjectByName('spine').rotation.x + .09) < .005, 'boost release restores base pose');
    const state = { phase: 'running', distance, lane: 1, reducedMotion: true };
    avatar.update(state, dt);
    const initial = avatar.group.getObjectByName('hair').quaternion.toArray();
    for (let i = 0; i < 80; i++) avatar.update(state, dt);
    assert.ok(avatar.group.getObjectByName('hair').quaternion.toArray().every((value, index) => Math.abs(value - initial[index]) < .000001), 'secondary motion does not decay repeatedly at fixed phase');
    avatar.dispose();
  }
});
