import test from 'node:test';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ALL_AVATAR_IDS } from '../src/avatars.js';
import { createAvatarLibrary } from '../src/graphics/avatars.js';

const ids = ['courier', 'engineer', 'guard', 'runner'];
async function readAsset(id) {
  const bytes = await readFile(new URL(`../assets/characters/${id}.glb`, import.meta.url));
  const compressed = await readFile(new URL(`../assets/characters/${id}.glb.gz`, import.meta.url));
  assert.deepEqual(gunzipSync(compressed), bytes, `${id} compressed bytes match the source`);
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
      assert.ok(spineAngle > -.24 && spineAngle < -.085, `bounded boost lean ${spineAngle} at dt=${dt}`);
    }
    avatar.update({ phase: 'running', distance, lane: 1 }, dt);
    assert.ok(avatar.group.getObjectByName('spine').rotation.x < -.16, 'boost release eases out instead of snapping upright');
    for (let i = 0; i < 1 / dt; i++) avatar.update({ phase: 'running', distance, lane: 1 }, dt);
    assert.ok(Math.abs(avatar.group.getObjectByName('spine').rotation.x + .09) < .005, 'boost release settles back to the base pose');
    const state = { phase: 'running', distance, lane: 1, reducedMotion: true };
    avatar.update(state, dt);
    const initial = avatar.group.getObjectByName('hair').quaternion.toArray();
    for (let i = 0; i < 80; i++) avatar.update(state, dt);
    assert.ok(avatar.group.getObjectByName('hair').quaternion.toArray().every((value, index) => Math.abs(value - initial[index]) < .000001), 'secondary motion does not decay repeatedly at fixed phase');
    avatar.dispose();
  }
});

function bonePose(avatar) {
  const pose = [];
  avatar.group.traverse((object) => {
    if (object.isBone) pose.push(...object.position.toArray(), ...object.quaternion.toArray());
  });
  return pose;
}

test('boost enters smoothly and the same elapsed time produces the same lean at 30, 60 and 120 Hz', async () => {
  const library = createAvatarLibrary({ loadAsset: readAsset });
  await library.preloadAvatars();
  const samples = [];
  for (const hz of [30, 60, 120]) {
    const avatar = library.createAvatar('courier');
    const state = { phase: 'running', lane: 1, distance: 20 };
    for (let i = 0; i < hz; i++) avatar.update(state, 1 / hz);
    const spine = avatar.group.getObjectByName('spine');
    const base = spine.rotation.x;
    avatar.update({ ...state, boostRemaining: 1 }, 1 / hz);
    assert.ok(Math.abs(spine.rotation.x - base) < .045, `no one-frame boost snap at ${hz} Hz`);
    for (let i = 1; i < hz / 5; i++) avatar.update({ ...state, boostRemaining: 1 }, 1 / hz);
    samples.push(spine.rotation.x);
    assert.ok(spine.rotation.x < base - .07, 'boost still has a visible forward lean');
    avatar.dispose();
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) < .00001, 'boost response depends on seconds, not frame count');
});

test('pause freezes every bone and reset clears boost, lane banking and landing recovery', async () => {
  const library = createAvatarLibrary({ loadAsset: readAsset });
  await library.preloadAvatars();
  const avatar = library.createAvatar('courier');
  const fresh = library.createAvatar('courier');
  avatar.update({ phase: 'running', distance: 20, visualLane: 2, boostRemaining: 1, jumpRemaining: .01, jumpDuration: .8 }, .1);
  avatar.update({ phase: 'running', distance: 21, visualLane: 1.7, boostRemaining: 1 }, .03);
  const beforePause = bonePose(avatar);
  for (let i = 0; i < 60; i++) avatar.update({ phase: 'paused', distance: 50, visualLane: 0, boostRemaining: 0 }, 1 / 60);
  assert.deepEqual(bonePose(avatar), beforePause, 'paused frames cannot decay a landing or change a sampled pose');
  assert.equal(typeof avatar.reset, 'function', 'avatars support a clean replay without replacing shared assets');
  avatar.reset();
  assert.deepEqual(bonePose(avatar), bonePose(fresh), 'reset exactly matches a fresh ready pose');
  const next = { phase: 'running', distance: 1, visualLane: .9 };
  avatar.update(next, 1 / 60); fresh.update(next, 1 / 60);
  assert.deepEqual(bonePose(avatar), bonePose(fresh), 'no hidden previous-match motion resumes on the next frame');
  avatar.dispose(); fresh.dispose();
});

test('ghost animation cannot reveal private boost or stun values', async () => {
  const library = createAvatarLibrary({ loadAsset: readAsset });
  await library.preloadAvatars();
  const publicGhost = library.createAvatar('runner', { ghost: true });
  const privateGhost = library.createAvatar('runner', { ghost: true });
  for (let i = 0; i < 80; i++) {
    const state = { phase: 'running', distance: i * .45, lane: 1 };
    publicGhost.update(state, 1 / 60);
    privateGhost.update({ ...state, boostRemaining: 2, stunRemaining: 1 }, 1 / 60);
  }
  assert.deepEqual(bonePose(privateGhost), bonePose(publicGhost));
  publicGhost.dispose(); privateGhost.dispose();
});

test('landing recovery begins at actual contact time, independent of the final airborne frame', async () => {
  const library = createAvatarLibrary({ loadAsset: readAsset });
  await library.preloadAvatars();
  const poses = [];
  // Contact occurs at .81 seconds, between frame boundaries at every rate.
  for (const hz of [30, 60, 120]) {
    const avatar = library.createAvatar('courier');
    for (let i = 0; i < hz; i++) avatar.update({ phase: 'running', distance: 0, lane: 1 }, 1 / hz);
    for (let frame = 1; frame <= hz; frame++) {
      const seconds = frame / hz;
      avatar.update({ phase: 'running', distance: seconds * 24, lane: 1, jumpRemaining: Math.max(0, .81 - seconds), jumpDuration: .81 }, 1 / hz);
    }
    poses.push(bonePose(avatar));
    avatar.dispose();
  }
  for (const pose of poses.slice(1)) assert.ok(pose.every((value, i) => Math.abs(value - poses[0][i]) < .00001), 'landing compression and recovery use the actual contact age');
});

test('finish reactions blend from the running pose and remain deterministic across frame rates', async () => {
  const library = createAvatarLibrary({ loadAsset: readAsset });
  await library.preloadAvatars();
  for (const phase of ['won', 'lost']) {
    const poses = [];
    for (const hz of [30, 60, 120]) {
      const avatar = library.createAvatar('courier');
      for (let frame = 0; frame < hz; frame++) avatar.update({ phase: 'running', distance: 35, lane: 1 }, 1 / hz);
      const bone = avatar.group.getObjectByName(phase === 'won' ? 'upperArmL' : 'head');
      const before = bone.quaternion.clone();
      avatar.update({ phase, distance: 35, lane: 1 }, 1 / hz);
      assert.ok(before.angleTo(bone.quaternion) < (phase === 'won' ? .7 : .1), `${phase} does not snap on its first frame at ${hz} Hz`);
      for (let frame = 1; frame < hz; frame++) avatar.update({ phase, distance: 35, lane: 1 }, 1 / hz);
      assert.ok(phase === 'won' ? bone.rotation.x > 2.2 : bone.rotation.x < -.2, 'reaction reaches the readable finished pose');
      poses.push(bonePose(avatar));
      const frozen = bonePose(avatar);
      avatar.update({ phase: 'paused', distance: 35, lane: 1 }, .1);
      assert.deepEqual(bonePose(avatar), frozen, 'finish reaction also freezes during pause');
      avatar.reset();
      const fresh = library.createAvatar('courier');
      assert.deepEqual(bonePose(avatar), bonePose(fresh), 'finish reaction is cleared on replay');
      avatar.dispose(); fresh.dispose();
    }
    for (const pose of poses.slice(1)) assert.ok(pose.every((value, i) => Math.abs(value - poses[0][i]) < .00001), 'finish blend uses elapsed seconds');
  }
});


test('twenty themed avatars have distinct geometry and finite animated skeletons', async () => {
  const sizes = new Set();
  for (const id of ALL_AVATAR_IDS.filter(id => !ids.includes(id))) {
    const asset = await readAsset(id);
    assert.deepEqual(asset.animations.map(clip => clip.name).sort(), ['idle','jump','run','stumble']);
    const geometryHash = createHash('sha256');
    asset.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      assert.ok(mesh.isSkinnedMesh);
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) assert.ok([...mesh.geometry.attributes[name].array].every(Number.isFinite), `${id} ${name}`);
      geometryHash.update(Buffer.from(mesh.geometry.attributes.position.array.buffer));
    });
    sizes.add(geometryHash.digest('hex'));
  }
  assert.equal(sizes.size, ALL_AVATAR_IDS.length - ids.length, 'distinct modeled silhouettes, not only recolors');
});

test('lane switches retain the forward run posture without sideways banking', async () => {
  const library=createAvatarLibrary({loadAsset:readAsset});await library.preloadAvatars();
  const straight=library.createAvatar('courier'),switching=library.createAvatar('courier');
  for(let i=0;i<30;i++) {
    const state={phase:'running',distance:i*.4,lane:1,visualLane:1,visualLaneVelocity:0};
    straight.update(state,1/60);
    switching.update({...state,lane:2,visualLane:1+i/30,visualLaneVelocity:2},1/60);
    for(const bone of ['pelvis','spine','chest','head'])assert.deepEqual(straight.group.getObjectByName(bone).quaternion.toArray(),switching.group.getObjectByName(bone).quaternion.toArray(),`${bone} stays forward`);
  }
  straight.dispose();switching.dispose();
});

test('asset loading reports actual completion counts and cached readiness',async()=>{
  const progress=[];
  const library=createAvatarLibrary({loadAsset:readAsset});
  await library.preloadAvatars(value=>progress.push(value));
  assert.equal(progress[0],0);assert.equal(progress.at(-1),1);
  assert.equal(progress.length,ALL_AVATAR_IDS.length+1);
  assert.ok(progress.every((value,index)=>index===0||value>=progress[index-1]));
  const cached=[];await library.preloadAvatars(value=>cached.push(value));assert.deepEqual(cached,[1]);
});

test('paid leap uses a forward torso and split-leg reach without accumulating pose offsets',async()=>{
 const library=createAvatarLibrary({loadAsset:readAsset});await library.preloadAvatars();
 const paid=library.createAvatar('courier'),hop=library.createAvatar('courier');
 const long={phase:'running',distance:20,jumpDuration:1.2,jumpRemaining:.6};
 const normal={phase:'running',distance:20,jumpDuration:.65,jumpRemaining:.325};
 paid.update(long,1/60);hop.update(normal,1/60);
 const bone=(avatar,name)=>avatar.group.getObjectByName(name).rotation.x;
 assert.ok(bone(paid,'spine')<bone(hop,'spine')-.2);
 assert.ok(bone(paid,'shinL')>bone(hop,'shinL')+.65,'lead lower leg reaches out of the knee tuck');
 assert.ok(bone(paid,'thighR')<bone(hop,'thighR')-.55,'trailing leg reaches back');
 const first=bone(paid,'spine');for(let i=0;i<100;i++)paid.update(long,1/60);
 assert.ok(Math.abs(bone(paid,'spine')-first)<1e-6);
 paid.dispose();hop.dispose();
});

test('detailed Courier has finite surface coordinates and owns its material textures', async () => {
  const asset=await readAsset('courier');
  asset.scene.traverse(object=>{
    if(!object.isMesh)return;
    const uv=object.geometry.getAttribute('uv');
    assert.ok(uv,'woven and leather surfaces have authored coordinates');
    assert.equal(uv.count,object.geometry.getAttribute('position').count);
    assert.ok([...uv.array].every(Number.isFinite));
  });
  const library=createAvatarLibrary({loadAsset:readAsset});await library.preloadAvatars();
  const courier=library.createAvatar('courier'),ghost=library.createAvatar('courier',{ghost:true});
  const textures=new Set();
  courier.group.traverse(object=>{for(const material of [object.material].flat().filter(Boolean))if(material.bumpMap)textures.add(material.bumpMap);});
  assert.equal(textures.size,2,'separate cloth weave and leather grain');
  ghost.group.traverse(object=>{for(const material of [object.material].flat().filter(Boolean))assert.ok(!material.bumpMap,'transparent opponents remain uncluttered');});
  let disposed=0;for(const texture of textures)texture.addEventListener('dispose',()=>disposed++);
  courier.dispose();courier.dispose();assert.equal(disposed,2,'owned textures released once');ghost.dispose();
});
