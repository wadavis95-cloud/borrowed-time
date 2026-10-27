import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTunnel, DISTANCE_SCALE, LANE_WIDTH } from '../src/graphics/tunnel.js';

// Texture painting isn't under test. Use real Three.js geometry and raycasts
// to verify a roof panel actually stops occluding the sky after it detaches.
test('collapsing panels open real sky holes in every lane and restore on a new course', () => {
  const previous = globalThis.document;
  const context = new Proxy({}, {
    get: (_, key) => ['createLinearGradient', 'createRadialGradient'].includes(key)
      ? () => ({ addColorStop() {} }) : () => {},
    set: () => true,
  });
  globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };
  try {
    const scene = new THREE.Scene();
    const tunnel = createTunnel(scene, 1350);
    const events = [0, 1, 2].map(lane => ({ id: `roof-${lane}`, lane, z: 172.5 + lane * 50, warnAt: 1, fallAt: 3, impactAt: 3.65 }));
    const firstHitHeight = event => {
      scene.updateMatrixWorld(true);
      const meshes = [];
      tunnel.root.traverse(item => {
        let visible = item.visible;
        for (let parent = item.parent; parent; parent = parent.parent) visible &&= parent.visible;
        if (item.isMesh && visible) meshes.push(item);
      });
      const ray = new THREE.Raycaster(new THREE.Vector3((event.lane - 1) * LANE_WIDTH, 1, -event.z * DISTANCE_SCALE + 180 * DISTANCE_SCALE), new THREE.Vector3(0, 1, 0));
      return ray.intersectObjects(meshes, false)[0]?.point.y;
    };
    tunnel.update(180, 0, false, events);
    for (const event of events) assert.ok(firstHitHeight(event) < 9, 'intact roof must cover the sky');
    tunnel.update(180, 3.2, false, events);
    for (const event of events) assert.ok(firstHitHeight(event) > 20, 'the detached roof must expose the overhead sky');
    tunnel.update(180, 20, false, events);
    for (const event of events) assert.ok(firstHitHeight(event) > 20, 'openings must persist after impact');
    tunnel.update(180, 0, false, events.map(e => ({ ...e, id: `rematch-${e.id}` })));
    for (const event of events) assert.ok(firstHitHeight(event) < 9, 'new round must restore intact roof');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
