import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// GLBs are original, reproducible project assets. The generator and asset notes
// live in scripts/build-avatars.mjs and assets/characters/README.md.
const IDS = Object.freeze(['courier', 'engineer', 'guard', 'runner']);
const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function validateAsset(asset, id) {
  let skinned = false;
  asset?.scene?.traverse((object) => { if (object.isSkinnedMesh) skinned = true; });
  if (!skinned || !['idle', 'run', 'jump', 'stumble'].every((name) => asset.animations?.some((clip) => clip.name === name))) {
    throw new Error(`Avatar ${id} has an invalid rig or animation clips`);
  }
  return asset;
}

/** A library owns shared immutable geometry; each created avatar owns its materials
 * and skeleton. The injectable loader is also the test boundary for failed loads. */
export function createAvatarLibrary({ loadAsset } = {}) {
  const loader = new GLTFLoader();
  const load = loadAsset || ((id) => loader.loadAsync(new URL(`../../assets/characters/${id}.glb`, import.meta.url).href));
  let assets = null;
  let pending = null;

  function preloadAvatars() {
    if (assets) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.all(IDS.map(async (id) => [id, validateAsset(await load(id), id)]))
      .then((entries) => { assets = new Map(entries); })
      .catch((error) => { pending = null; throw error; });
    return pending;
  }

  /** Feet at y=0, faces -Z. World position and jump height remain renderer-owned. */
  function createAvatar(avatarId, { ghost = false, color = '#65d9cb' } = {}) {
    if (!assets) throw new Error('Call and await preloadAvatars() before creating an avatar');
    const id = IDS.includes(avatarId) ? avatarId : 'courier';
    const asset = assets.get(id);
    const group = new THREE.Group(); group.name = `${id}${ghost ? '-ghost' : ''}`;
    const model = cloneSkeleton(asset.scene); group.add(model);
    const bones = {};
    const materials = new Map();
    const skeletons = new Set();
    const tint = new THREE.Color(color);
    model.traverse((object) => {
      if (object.isBone) bones[object.name] = object;
      if (!object.isMesh) return;
      // Skinned bounds must include stride/jump poses, not only the GLB rest pose.
      // There are at most four avatars; render visibility is managed by the scene.
      object.frustumCulled = false;
      object.castShadow = !ghost; object.receiveShadow = !ghost;
      if (object.skeleton) skeletons.add(object.skeleton);
      const copyMaterial = (original) => {
        if (materials.has(original)) return materials.get(original);
        const material = original.clone();
        if (ghost) {
          material.color.copy(tint); material.vertexColors = false;
          material.emissive.copy(tint).multiplyScalar(.14);
          material.transparent = true; material.opacity = .4;
          material.depthWrite = false; material.forceSinglePass = true;
          material.metalness = .02; material.roughness = .85;
        } else if (original.name === 'identity mark') {
          material.color.copy(tint); material.vertexColors = false;
          material.emissive.copy(tint).multiplyScalar(.08);
        }
        materials.set(original, material); return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(copyMaterial) : copyMaterial(object.material);
    });
    const mixer = new THREE.AnimationMixer(model);
    const restHipHeight = bones.pelvis.position.y;
    const identity = new THREE.Quaternion();
    const reactionEuler = new THREE.Euler(), reactionQuaternion = new THREE.Quaternion();
    // PropertyMixer can skip a binding write when its sampled value did not
    // change. Restore the previous sampled pose before touching the mixer so
    // procedural lean/compression never accumulates on an unchanged track.
    const sampledPose = Object.values(bones).map((bone) => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(),
      restPosition: bone.position.clone(), restQuaternion: bone.quaternion.clone() }));
    const actions = Object.fromEntries(asset.animations.map((clip) => {
      const action = mixer.clipAction(clip); action.play(); action.paused = true;
      action.setEffectiveWeight(0); return [clip.name, action];
    }));
    let elapsed = 0, lean = 0, activity = 0, boostFeel = 0, stumbleFeel = 0, lastLane = null;
    let previousJumpRemaining = 0, landingAge = Infinity, initialized = false, disposed = false;
    let finishWeight = 0, finishPhase = '';

    function blendReaction(name, x, y = bones[name].rotation.y, z = bones[name].rotation.z) {
      reactionQuaternion.setFromEuler(reactionEuler.set(x, y, z));
      bones[name].quaternion.slerp(reactionQuaternion, finishWeight);
    }

    function update(state = {}, dt = 0) {
      if (disposed || (state.phase === 'paused' && initialized)) return;
      const step = clamp(finite(dt), 0, .1); elapsed += step;
      const response = initialized ? 1 - Math.exp(-step * 15) : 1;
      const running = state.phase === 'running';
      const reduced = state.reducedMotion === true;
      const motion = reduced ? .25 : 1;
      const jumping = finite(state.jumpRemaining) > 0;
      const duration = Math.max(.001, finite(state.jumpDuration, .8));
      const jumpProgress = jumping ? clamp(1 - state.jumpRemaining / duration, 0, .9999) : 0;
      // Only the local silhouette may communicate private ability/hit state.
      const boost = !ghost && running && finite(state.boostRemaining) > 0 ? 1 : 0;
      const stumble = !ghost && running && finite(state.stunRemaining) > 0 ? 1 : 0;
      const distance = finite(state.distance);
      const lane = finite(state.visualLane, finite(state.lane, 1));
      const laneVelocity = finite(state.visualLaneVelocity, lastLane === null || step === 0 ? 0 : (lane - lastLane) / step);
      lastLane = lane;
      lean += (clamp(-laneVelocity * .055, -.18, .18) - lean) * response;
      activity += ((running ? 1 : 0) - activity) * response;
      boostFeel += (boost - boostFeel) * (1 - Math.exp(-step * 9));
      const nextFinish = state.phase === 'won' || state.phase === 'lost' ? state.phase : '';
      if (nextFinish !== finishPhase) finishWeight = 0;
      finishPhase = nextFinish;
      if (finishPhase) finishWeight += (1 - finishWeight) * (1 - Math.exp(-step * 7));
      // Hits remain immediate and readable; only recovery is eased.
      stumbleFeel = stumble ? 1 : stumbleFeel * Math.exp(-step * 12);
      if (previousJumpRemaining > 0 && !jumping && running) {
        // The countdown gives the contact within this frame. Starting at a whole
        // frame of compression would make 30 Hz land differently from 120 Hz.
        landingAge = Math.max(0, step - previousJumpRemaining);
      } else landingAge += step;
      if (jumping) landingAge = Infinity;
      previousJumpRemaining = Math.max(0, finite(state.jumpRemaining));
      const jumpWeight = jumping
        ? THREE.MathUtils.smoothstep(jumpProgress, 0, .14) * (1 - .82 * THREE.MathUtils.smoothstep(jumpProgress, .76, 1))
        : .18 * (1 - THREE.MathUtils.smoothstep(landingAge, 0, .12));
      const stumbleWeight = !jumping ? stumbleFeel * .68 : 0;
      const runWeight = activity * (1 - jumpWeight) * (1 - stumbleWeight);
      actions.idle.time = elapsed % actions.idle.getClip().duration;
      actions.run.time = ((distance * .058) % actions.run.getClip().duration + actions.run.getClip().duration) % actions.run.getClip().duration;
      // Carry the terminal jump pose into the first planted steps, never loop the
      // jump clip back to its takeoff pose during landing recovery.
      actions.jump.time = (jumping ? jumpProgress : .9999) * actions.jump.getClip().duration;
      actions.stumble.time = (elapsed * 1.4) % actions.stumble.getClip().duration;
      actions.idle.setEffectiveWeight((1 - activity) * (1 - jumpWeight));
      actions.run.setEffectiveWeight(runWeight);
      actions.jump.setEffectiveWeight(jumpWeight);
      actions.stumble.setEffectiveWeight(stumbleWeight * activity * (1 - jumpWeight));
      for (const pose of sampledPose) { pose.bone.position.copy(pose.position); pose.bone.quaternion.copy(pose.quaternion); }
      mixer.update(0);
      for (const pose of sampledPose) { pose.position.copy(pose.bone.position); pose.quaternion.copy(pose.bone.quaternion); }
      // A lane change banks the whole silhouette; torso and head counter-rotate.
      bones.pelvis.rotation.z += lean * motion;
      bones.chest.rotation.y -= lean * .25 * motion;
      bones.head.rotation.z -= lean * .5 * motion;
      bones.spine.rotation.x -= boostFeel * .11 * motion + stumbleFeel * .04;
      bones.head.rotation.x += boostFeel * .065 * motion;
      // Authored distance-matched gait supplies the oscillation. These restrained
      // offsets let flexible accessories trail a turn or acceleration coherently.
      bones.bag.rotation.z -= lean * .35 * motion;
      bones.hair.rotation.z -= lean * .22 * motion;
      bones.hairTip.rotation.z -= lean * .3 * motion;
      for (const name of ['coatL', 'coatR', 'hemL', 'hemR']) bones[name].rotation.x -= boostFeel * .055 * motion;
      if (reduced) {
        // Preserve essential readable gait/jump; suppress camera-adjacent bob and
        // secondary fabric/hair movement when the OS asks for reduced motion.
        bones.pelvis.position.y = restHipHeight - runWeight * .1;
        bones.pelvis.rotation.z *= .3;
        for (const name of ['hair', 'hairTip', 'bag', 'coatL', 'coatR', 'hemL', 'hemR']) bones[name].quaternion.slerp(identity, .75);
      }
      if (landingAge < .3) {
        const compression = THREE.MathUtils.smoothstep(landingAge, 0, .07) * (1 - THREE.MathUtils.smoothstep(landingAge, .07, .3));
        const impact = compression * (reduced ? .45 : 1);
        bones.pelvis.position.y -= impact * .055;
        bones.spine.rotation.x -= impact * .065;
        for (const side of ['L', 'R']) { bones[`thigh${side}`].rotation.x += impact * .15; bones[`shin${side}`].rotation.x -= impact * .25; }
      }
      if (state.phase === 'won') {
        for (const [side, sign] of [['L', -1], ['R', 1]]) {
          blendReaction(`upperArm${side}`, 2.25, 0, -sign * .34);
          blendReaction(`foreArm${side}`, .62);
        }
        blendReaction('head', .08);
      } else if (state.phase === 'lost') {
        blendReaction('spine', -.22); blendReaction('head', -.21);
        blendReaction('upperArmL', .08); blendReaction('upperArmR', .08);
      }
      initialized = true;
    }
    function reset() {
      if (disposed) return;
      // Deactivate bindings before restoring rest. Re-activation refreshes the
      // mixer's cached values, including constant tracks such as the hands.
      mixer.stopAllAction();
      elapsed = lean = activity = boostFeel = stumbleFeel = previousJumpRemaining = finishWeight = 0;
      finishPhase = '';
      lastLane = null; landingAge = Infinity; initialized = false;
      for (const pose of sampledPose) {
        pose.position.copy(pose.restPosition); pose.quaternion.copy(pose.restQuaternion);
        pose.bone.position.copy(pose.position); pose.bone.quaternion.copy(pose.quaternion);
      }
      for (const action of Object.values(actions)) { action.reset().play(); action.paused = true; action.setEffectiveWeight(0); }
      update({ phase: 'ready', distance: 0, lane: 1 }, 0);
    }
    reset();
    return {
      group, update, reset,
      dispose() {
        if (disposed) return;
        disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(model);
        for (const skeleton of skeletons) skeleton.dispose();
        for (const material of materials.values()) material.dispose();
        // Geometry and original materials stay in the process-wide preload cache.
        materials.clear(); group.removeFromParent(); group.clear();
      },
    };
  }
  return { preloadAvatars, createAvatar };
}

const library = createAvatarLibrary();
export const preloadAvatars = library.preloadAvatars;
export const createAvatar = library.createAvatar;
