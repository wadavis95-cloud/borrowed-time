// Visual state only: course rules and the shared hazard clock live in game.js.
import * as THREE from 'three';
import { CONFIG } from './game.js';
import { getDebrisPhase } from './hazards.js';
import { createAvatar } from './graphics/avatars.js';
import { createTunnel, radialTexture, DISTANCE_SCALE, LANE_WIDTH } from './graphics/tunnel.js';

const clamp = THREE.MathUtils.clamp;
const VISIBLE_METRES = 255;

function signTexture(text, foreground, background, width = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, 64);
  ctx.strokeStyle = foreground; ctx.lineWidth = 3; ctx.strokeRect(5, 5, width - 10, 54);
  ctx.fillStyle = foreground; ctx.font = '600 27px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width / 2, 33);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function stripeTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 32;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#edba62'; ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#3b4648';
  for (let x = -40; x < 160; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 19, 0); ctx.lineTo(x + 51, 32); ctx.lineTo(x + 32, 32); ctx.fill(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createRenderer(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (cause) {
    throw new Error('This 3D tunnel needs WebGL 2. Enable hardware acceleration or try a browser with WebGL support.', { cause });
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#172c3e');
  scene.fog = new THREE.Fog('#253b4c', 35, 210);
  const camera = new THREE.PerspectiveCamera(58, 1, .1, 480);
  camera.position.set(0, 3.15, 7.7);
  const lookTarget = new THREE.Vector3(0, 2.05, -18);
  const darkSky = new THREE.Color('#172c3e'), brightSky = new THREE.Color('#b6d1d8');
  const darkFog = new THREE.Color('#253b4c'), brightFog = new THREE.Color('#dfd6ba');
  const coolLight = new THREE.Color('#a7c1e1'), warmLight = new THREE.Color('#ffe0a4');

  const ambient = new THREE.HemisphereLight('#9ebbdc', '#58594a', 1.7); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#f7e1ba', 2.1);
  sun.position.set(-8, 12, 8); sun.target.position.set(0, 0, -8);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 50; sun.shadow.bias = -.0006; sun.shadow.normalBias = .035;
  scene.add(sun, sun.target);
  // A cool bounce keeps clothing and hazard silhouettes readable in the dark.
  const bounce = new THREE.DirectionalLight('#9ec9e6', 1.3); bounce.position.set(3, 5, 7); scene.add(bounce);
  const lampLeft = new THREE.PointLight('#ffbb70', 10, 13, 2), lampRight = new THREE.PointLight('#ffbb70', 10, 13, 2);
  lampLeft.position.set(-3.8, 2.8, -3); lampRight.position.set(3.8, 2.8, -11); scene.add(lampLeft, lampRight);
  const tunnel = createTunnel(scene, CONFIG.courseLength);

  const stone = new THREE.MeshStandardMaterial({ color: '#92978d', roughness: .95, flatShading: true });
  const brokenStone = new THREE.MeshStandardMaterial({ color: '#a5a090', roughness: .95, flatShading: true });
  const darkIron = new THREE.MeshStandardMaterial({ color: '#39464b', roughness: .6, metalness: .35 });
  const stripe = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: .86, emissive: '#51351b', emissiveIntensity: .15 });
  const mint = new THREE.MeshBasicMaterial({ color: '#a4e6cb', toneMapped: false });
  const gapDark = new THREE.MeshBasicMaterial({ color: '#02070c' });
  const glowMap = radialTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: glowMap, color: '#07131c', transparent: true, opacity: .63, depthWrite: false });
  const stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const ringGeometry = new THREE.RingGeometry(.88, 1.02, 40);
  const object = new THREE.Object3D();
  const localVisualState = {};
  const obstacleCache = new Map(), debrisCache = new Map(), ghosts = new Map();
  let localAvatar = null, localAvatarKey = '', visualLane = 1, disposed = false, contextLost = false;
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), shadowMaterial);
  contactShadow.rotation.x = -Math.PI / 2; contactShadow.position.y = .025; scene.add(contactShadow);

  function makeMesh(group, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); item.scale.set(sx, sy, sz); group.add(item); return item;
  }
  function stones(group, count, scale = 1) {
    const items = new THREE.InstancedMesh(stoneGeometry, brokenStone, count);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39, s = (.22 + (i % 3) * .08) * scale;
      object.position.set(Math.sin(a) * .61 * scale, s * .6, Math.cos(a) * .34 * scale);
      object.rotation.set(a * .7, a, a * .2); object.scale.set(s * 1.35, s, s * .85); object.updateMatrix(); items.setMatrixAt(i, object.matrix);
    }
    items.castShadow = true; items.receiveShadow = true; group.add(items); return items;
  }
  function makeObstacle(obstacle) {
    const group = new THREE.Group(); scene.add(group);
    if (obstacle.type === 'gap') {
      const length = (obstacle.length || 8) * DISTANCE_SCALE;
      const pit = makeMesh(group, boxGeometry, gapDark, 0, -.015, -length / 2, 2.13, .07, length);
      pit.renderOrder = 1;
      for (const x of [-1.08, 1.08]) makeMesh(group, boxGeometry, darkIron, x, .045, -length / 2, .1, .15, length + .15);
      for (const z of [.07, -length - .07]) makeMesh(group, boxGeometry, stripe, 0, .06, z, 2.2, .13, .13);
      const sign = makeMesh(group, new THREE.PlaneGeometry(1.2, .32), new THREE.MeshBasicMaterial({ map: signTexture('LONG JUMP', '#ffe2a1', '#2a343c'), transparent: false }), 0, .025, -length * .5);
      sign.rotation.x = -Math.PI / 2;
    } else if (obstacle.type === 'barrier') {
      // Tall blocks stay visibly taller than a hop; the jagged upper edge is stone.
      const block = makeMesh(group, boxGeometry, stone, 0, .94, -.22, 1.95, 1.88, .7);
      block.castShadow = block.receiveShadow = true;
      const cap = makeMesh(group, boxGeometry, brokenStone, -.17, 1.94, -.22, 1.7, .19, .77); cap.rotation.z = .035; cap.castShadow = true;
      makeMesh(group, boxGeometry, stripe, 0, 1.09, .145, 1.98, .32, .025);
      makeMesh(group, boxGeometry, darkIron, -.56, 1.53, .16, .04, .72, .027).rotation.z = -.2;
    } else {
      stones(group, 8, 1.2);
      makeMesh(group, boxGeometry, stripe, 0, .21, .44, 1.75, .19, .08);
    }
    return group;
  }
  function makeDebris() {
    const group = new THREE.Group(); scene.add(group);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffc069', transparent: true, opacity: .95, side: THREE.DoubleSide, toneMapped: false });
    const ring = makeMesh(group, ringGeometry, ringMaterial, 0, .045, 0); ring.rotation.x = -Math.PI / 2;
    const fillMaterial = new THREE.MeshBasicMaterial({ color: '#ff9a55', transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false });
    const fill = makeMesh(group, new THREE.CircleGeometry(.88, 32), fillMaterial, 0, .035, 0); fill.rotation.x = -Math.PI / 2;
    const chunk = new THREE.Group(); group.add(chunk);
    const main = makeMesh(chunk, stoneGeometry, stone, 0, 0, 0, .74, .81, .61); main.castShadow = true;
    for (let i = 0; i < 4; i++) makeMesh(chunk, stoneGeometry, brokenStone, Math.sin(i * 2.4) * .87, .4 + Math.cos(i) * .4, Math.cos(i * 2.4) * .6, .15, .23, .2);
    const rubble = new THREE.Group(); stones(rubble, 9, 1.2); group.add(rubble);
    const marker = makeMesh(group, new THREE.PlaneGeometry(.72, .72), new THREE.MeshBasicMaterial({ map: signTexture('!', '#ffe8b6', '#73492f', 64), side: THREE.DoubleSide, toneMapped: false }), 0, 2.65, .1);
    const dustMaterial = new THREE.MeshBasicMaterial({ map: glowMap, color: '#c9b791', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const dust = new THREE.Group(); group.add(dust);
    for (let i = 0; i < 6; i++) {
      const puff = makeMesh(dust, new THREE.PlaneGeometry(1, 1), dustMaterial, Math.sin(i * 2.4), .35, Math.cos(i * 2.4));
      puff.rotation.y = (i % 3) * Math.PI / 3;
    }
    return { group, ring, ringMaterial, fill, fillMaterial, chunk, rubble, marker, dust, dustMaterial };
  }
  const checkpointGroups = CONFIG.checkpointDistances.map((distance) => {
    const group = new THREE.Group(); scene.add(group);
    makeMesh(group, boxGeometry, mint, 0, .025, 0, 8.6, .035, .12);
    for (const side of [-1, 1]) {
      makeMesh(group, boxGeometry, darkIron, side * 4.12, 1.2, 0, .12, 2.4, .15);
      makeMesh(group, boxGeometry, mint, side * 4.12, 1.85, .1, .19, .64, .05);
    }
    makeMesh(group, new THREE.PlaneGeometry(2.25, .56), new THREE.MeshBasicMaterial({ map: signTexture(`+${CONFIG.checkpointBonus} SECONDS`, '#bfe9d4', '#314d4e'), side: THREE.DoubleSide }), 0, 4.3, 0);
    return { group, distance };
  });

  function resize() {
    if (disposed) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // A portrait viewport widens the view enough to retain both outside lanes.
    camera.fov = camera.aspect < .9 ? 69 : 58;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); resize();
  function onContextLost(event) { event.preventDefault(); contextLost = true; }
  canvas.addEventListener('webglcontextlost', onContextLost);

  function jumpHeight(state) {
    if (!(state.jumpRemaining > 0 && state.jumpDuration > 0)) return 0;
    const phase = clamp(1 - state.jumpRemaining / state.jumpDuration, 0, 1);
    // Opponents expose jump motion, but never the private purchase/ability flag.
    // Use duration so their visible arc matches the same jump on their screen.
    return Math.sin(phase * Math.PI) * (state.jumpDuration > CONFIG.normalJumpDuration ? 1.6 : 1.05);
  }

  function draw(state, animationTime, dt = 1 / 60, opponents = []) {
    if (disposed) return;
    if (contextLost || renderer.getContext().isContextLost()) throw new Error('The browser lost the 3D graphics context. Reload the game to restore the tunnel.');
    const distance = state.distance || 0;
    // Hazards, dust and actors freeze with solo pause. The online view provides
    // its interpolated authoritative race clock even after a runner finishes.
    const elapsed = state.raceElapsed ?? state.elapsed ?? 0;
    const progression = THREE.MathUtils.smoothstep(distance, 80, CONFIG.courseLength);
    const daylight = THREE.MathUtils.smoothstep(distance, CONFIG.courseLength - 145, CONFIG.courseLength);
    scene.background.copy(darkSky).lerp(brightSky, progression * .55 + daylight * .45);
    scene.fog.color.copy(darkFog).lerp(brightFog, progression * .55 + daylight * .45);
    scene.fog.far = 210 + daylight * 110;
    ambient.intensity = 1.45 + progression * .7;
    sun.color.copy(coolLight).lerp(warmLight, progression);
    sun.intensity = 1.55 + progression * 1.4;
    lampLeft.intensity = lampRight.intensity = 10 * (1 - daylight * .75);
    renderer.toneMappingExposure = 1.12 - daylight * .12;
    tunnel.update(distance, elapsed, reducedMotion);

    const avatarKey = `${state.avatarId || 'courier'}:${state.playerColor || ''}`;
    if (localAvatarKey !== avatarKey) {
      if (localAvatar) { scene.remove(localAvatar.group); localAvatar.dispose(); }
      localAvatar = createAvatar(state.avatarId || 'courier', { color: state.playerColor, ghost: false });
      localAvatarKey = avatarKey; scene.add(localAvatar.group);
    }
    visualLane += (state.lane - visualLane) * Math.min(1, dt * 18);
    Object.assign(localVisualState, state, { reducedMotion, visualLane });
    localAvatar.update(localVisualState, state.phase === 'paused' ? 0 : dt);
    localAvatar.group.position.set((visualLane - 1) * LANE_WIDTH, jumpHeight(state), 0);
    contactShadow.position.x = localAvatar.group.position.x;
    contactShadow.scale.setScalar(1 + localAvatar.group.position.y * .16);
    shadowMaterial.opacity = .63 - localAvatar.group.position.y * .15;

    for (const record of ghosts.values()) record.avatar.group.visible = false;
    for (const opponent of opponents) {
      const relative = opponent.distance - distance;
      if (opponent.connected === false || opponent.phase === 'disconnected' || !Number.isFinite(relative) || !Number.isFinite(opponent.lane) || relative < -18 || relative > VISIBLE_METRES) continue;
      const key = opponent.id || `${opponent.avatarId}:${opponent.color}`;
      let record = ghosts.get(key);
      if (record && (record.id !== opponent.avatarId || record.color !== opponent.color)) {
        scene.remove(record.avatar.group); record.avatar.dispose(); ghosts.delete(key); record = null;
      }
      if (!record) {
        record = { avatar: createAvatar(opponent.avatarId || 'engineer', { ghost: true, color: opponent.color }), id: opponent.avatarId, color: opponent.color, lane: opponent.lane, visualState: {} };
        ghosts.set(key, record); scene.add(record.avatar.group);
      }
      record.lane += (opponent.lane - record.lane) * Math.min(1, dt * 18);
      Object.assign(record.visualState, opponent, { reducedMotion, visualLane: record.lane });
      record.avatar.group.visible = true; record.avatar.update(record.visualState, dt);
      record.avatar.group.position.set((record.lane - 1) * LANE_WIDTH, jumpHeight(opponent), -relative * DISTANCE_SCALE);
    }

    for (const entry of obstacleCache.values()) entry.visible = false;
    for (const obstacle of state.obstacles || []) {
      const relative = obstacle.z - distance;
      if (relative < -18 || relative > VISIBLE_METRES) continue;
      const key = `${obstacle.id}:${obstacle.type}:${obstacle.length || 0}`;
      let group = obstacleCache.get(key);
      if (!group) { group = makeObstacle(obstacle); obstacleCache.set(key, group); }
      group.visible = true; group.position.set((obstacle.lane - 1) * LANE_WIDTH, 0, -relative * DISTANCE_SCALE);
    }
    for (const entry of debrisCache.values()) entry.group.visible = false;
    for (const event of state.debris || []) {
      const relative = event.z - distance;
      if (relative < -18 || relative > VISIBLE_METRES) continue;
      const phase = getDebrisPhase(event, elapsed);
      if (phase === 'waiting') continue;
      let entry = debrisCache.get(event.id);
      if (!entry) { entry = makeDebris(); debrisCache.set(event.id, entry); }
      entry.group.visible = true; entry.group.position.set((event.lane - 1) * LANE_WIDTH, 0, -relative * DISTANCE_SCALE);
      const warning = phase === 'warning', falling = phase === 'falling', landed = phase === 'landed';
      entry.ring.visible = entry.fill.visible = !landed;
      entry.marker.visible = warning;
      entry.rubble.visible = landed;
      entry.chunk.visible = warning || falling;
      const pulse = reducedMotion ? 1 : .5 + .5 * Math.sin((elapsed - event.warnAt) * 9);
      entry.ringMaterial.opacity = .65 + .35 * pulse;
      entry.fillMaterial.opacity = .1 + .12 * pulse;
      const fall = falling ? clamp((elapsed - event.fallAt) / (event.impactAt - event.fallAt), 0, 1) : 0;
      entry.chunk.position.y = 7.15 - fall * fall * 6.55;
      entry.chunk.rotation.set(fall * 1.6, fall * 2.1, fall * .8);
      const impactAge = elapsed - event.impactAt;
      entry.dust.visible = !reducedMotion && landed && impactAge >= 0 && impactAge < .85;
      if (entry.dust.visible) {
        const t = impactAge / .85;
        entry.dust.scale.setScalar(.55 + t * 1.8);
        entry.dust.position.y = t * .45;
        entry.dustMaterial.opacity = (1 - t) * .52;
      }
    }
    for (const entry of checkpointGroups) {
      const relative = entry.distance - distance;
      entry.group.visible = relative > -10 && relative < VISIBLE_METRES;
      entry.group.position.z = -relative * DISTANCE_SCALE;
    }
    // Follow only a fraction of lane movement; looking forward keeps all routes clear.
    const shake = !reducedMotion && state.phase === 'running' ? (state.hitFlash || 0) * .06 : 0;
    camera.position.x = localAvatar.group.position.x * .075 + Math.sin(elapsed * 65) * shake;
    camera.position.y = 3.15 + Math.cos(elapsed * 49) * shake;
    camera.position.z = camera.aspect < .9 ? 9.9 : 7.7;
    lookTarget.x = localAvatar.group.position.x * .08;
    camera.lookAt(lookTarget);
    renderer.render(scene, camera);
  }

  function reset() {
    visualLane = 1;
    for (const entry of obstacleCache.values()) entry.visible = false;
    for (const entry of debrisCache.values()) entry.group.visible = false;
    for (const entry of ghosts.values()) { scene.remove(entry.avatar.group); entry.avatar.dispose(); }
    ghosts.clear();
  }
  function dispose() {
    if (disposed) return;
    disposed = true; resizeObserver.disconnect(); canvas.removeEventListener('webglcontextlost', onContextLost);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(item => {
      if (item.geometry) geometries.add(item.geometry);
      if (item.material) {
        const list = Array.isArray(item.material) ? item.material : [item.material];
        for (const material of list) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    obstacleCache.clear(); debrisCache.clear(); ghosts.clear(); renderer.dispose();
  }
  return { draw, reset, dispose };
}
