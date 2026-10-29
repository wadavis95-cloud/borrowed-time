// Visual state only: course rules and the shared hazard clock live in game.js.
import * as THREE from 'three';
import {runShaderWarmup} from './shader-warmup.js';
import { getMap } from './maps.js';
import { createAtmosphere } from './graphics/atmosphere.js';
import { createFinish } from './graphics/finish.js';
import { createWorld } from './graphics/worlds.js';
import { createMapObstacle } from './graphics/map-obstacles.js';
import { CONFIG, getJumpHeight } from './game.js';
import { getDebrisPhase } from './hazards.js';
import { addObstacleReadability, warningPresentation } from './graphics/readability.js';
import { createMotionEffects } from './graphics/motion-effects.js';
import { createAvatar } from './graphics/avatars.js';
import { radialTexture, masonrySurface, beveledBoxGeometry, roofSlabGeometry, roofHeight, DISTANCE_SCALE, LANE_WIDTH } from './graphics/tunnel.js';

const clamp = THREE.MathUtils.clamp;
const VISIBLE_METRES = 255;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const opponentKey = (opponent) => opponent.id || `${opponent.avatarId}:${opponent.color}`;

/** Pure presentation state shared by the actual renderer and regression tests.
 * Actors keep the exact rules-owned height; only the camera follows a soft arc. */
export function createPresentationMotion({ reducedMotion = false } = {}) {
  const view = { lane: 1, laneVelocity: 0, cameraLane: 1, cameraJump: 0, jumpHeight: 0, boostFeel: 0, opponents: new Map() };
  let previousJumpHeight = 0, initialized = false;
  function update(state, dt = 0, opponents = []) {
    const paused = state.phase === 'paused';
    if (paused && initialized) return view;
    const step = paused ? 0 : clamp(finite(dt), 0, .1);
    const lane = clamp(finite(state.lane, 1), 0, 2);
    if (!initialized || paused) view.lane = view.cameraLane = lane;
    const laneDecay = Math.exp(-step * 22);
    view.lane = lane + (view.lane - lane) * laneDecay;
    view.laneVelocity = (lane - view.lane) * 22;
    view.cameraLane += (lane - view.cameraLane) * (1 - Math.exp(-step * 9));
    view.jumpHeight = getJumpHeight(state);
    if (reducedMotion) view.cameraJump = 0;
    else if (step > 0) {
      // Integrate a linearly changing height target over the whole frame instead
      // of treating its end value as if it had existed since the frame began.
      const decay = Math.exp(-step * 14);
      const ramp = (view.jumpHeight - previousJumpHeight) / (step * 14);
      view.cameraJump = view.jumpHeight + (view.cameraJump - previousJumpHeight) * decay - ramp * (1 - decay);
    }
    previousJumpHeight = view.jumpHeight;
    const boost = !reducedMotion && state.phase === 'running' && state.boostRemaining > 0 ? 1 : 0;
    view.boostFeel += (boost - view.boostFeel) * (1 - Math.exp(-step * 6));
    const visibleOpponents = opponents.slice(0, 3);
    const keys = new Set(visibleOpponents.map(opponentKey));
    for (const key of view.opponents.keys()) if (!keys.has(key)) view.opponents.delete(key);
    for (const opponent of visibleOpponents) {
      const key = opponentKey(opponent), targetLane = clamp(finite(opponent.lane, 1), 0, 2);
      const track = view.opponents.get(key) || { lane: targetLane, laneVelocity: 0 };
      track.lane = targetLane + (track.lane - targetLane) * laneDecay;
      track.laneVelocity = (targetLane - track.lane) * 22;
      view.opponents.set(key, track);
    }
    initialized = true;
    return view;
  }
  function reset() {
    Object.assign(view, { lane: 1, laneVelocity: 0, cameraLane: 1, cameraJump: 0, jumpHeight: 0, boostFeel: 0 });
    previousJumpHeight = 0; initialized = false; view.opponents.clear();
  }
  return { update, reset };
}

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

export function createRenderer(canvas,{onProgram=()=>{}}={}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (cause) {
    throw new Error('This 3D tunnel needs WebGL 2. Enable hardware acceleration or try a browser with WebGL support.', { cause });
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#142b3c');
  scene.fog = new THREE.Fog('#294657', 36, 158);
  const camera = new THREE.PerspectiveCamera(57, 1, .1, 680);
  camera.position.set(0, 3.45, 7.3);
  const lookTarget = new THREE.Vector3(0, 1.95, -18);
  const darkSky = new THREE.Color('#142b3c'), brightSky = new THREE.Color('#a8cbd9');
  const darkFog = new THREE.Color('#294657'), brightFog = new THREE.Color('#e4d9bb');
  const coolLight = new THREE.Color('#a9c9eb'), warmLight = new THREE.Color('#ffe0ac');

  const ambient = new THREE.HemisphereLight('#c8e3f4', '#59645b', .92); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#bfd4e8', 2.05);
  // Side lighting reveals rounded forms; a single shadow map stays near the runner.
  sun.position.set(-8, 10, 5); sun.target.position.set(0, .5, -9);
  const shadowResolution = window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
  sun.castShadow = true; sun.shadow.mapSize.set(shadowResolution, shadowResolution);
  sun.shadow.radius = 2;
  sun.shadow.camera.left = -13; sun.shadow.camera.right = 13; sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 50; sun.shadow.bias = -.00025; sun.shadow.normalBias = .025;
  scene.add(sun, sun.target);
  // Gentle front fill preserves bright clothing without washing out the key light.
  const bounce = new THREE.DirectionalLight('#d5e8f5', .38); bounce.position.set(5, 4, 7); scene.add(bounce);
  // An unshadowed rear edge separates the runner from similarly colored scenery.
  const rim = new THREE.DirectionalLight('#ffe7bf', .7);
  rim.position.set(3, 5, -10); rim.target.position.set(0, 1, 0); scene.add(rim, rim.target);
  const lampLeft = new THREE.PointLight('#ffba76', 12, 12, 2), lampRight = new THREE.PointLight('#ffba76', 12, 12, 2);
  lampLeft.position.set(-4.05, 2.55, -3); lampRight.position.set(4.05, 2.55, -11); scene.add(lampLeft, lampRight);
  let warmupWork=null,warmGroup=null;
  const warmAvatars=[],seenPrograms=new Set();
  function rememberPrograms(running=false){
    for(const program of renderer.info.programs||[])if(!seenPrograms.has(program.id)&&seenPrograms.size<512){seenPrograms.add(program.id);if(running)onProgram();}
  }
  let currentMapId = 'tunnel';
  let world = createWorld(scene, currentMapId, CONFIG.courseLength);
  let atmosphere = createAtmosphere(scene,currentMapId);
  let finish = createFinish(scene,currentMapId,CONFIG.courseLength);

  const hazardSurface = masonrySurface();
  const stone = new THREE.MeshStandardMaterial({ color: '#b6b8a6', ...hazardSurface, bumpScale: .045, roughness: .9 });
  const roofSlabMaterial = stone.clone(); roofSlabMaterial.side = THREE.DoubleSide;
  const brokenStone = new THREE.MeshStandardMaterial({ color: '#a4b1ab', ...hazardSurface, bumpScale: .06, roughness: .96 });
  const darkIron = new THREE.MeshStandardMaterial({ color: '#39464b', roughness: .6, metalness: .35 });
  const stripe = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: .86, emissive: '#51351b', emissiveIntensity: .15 });
  const mint = new THREE.MeshBasicMaterial({ color: '#a4e6cb', toneMapped: false });
  const gapDark = new THREE.MeshBasicMaterial({ color: '#02070c' });
  const glowMap = radialTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: glowMap, color: '#07131c', transparent: true, opacity: .46, depthWrite: false });
  const stoneGeometry = new THREE.IcosahedronGeometry(1, 1);
  const boxGeometry = beveledBoxGeometry(.065);
  const ringGeometry = new THREE.RingGeometry(.88, 1.02, 40);
  const object = new THREE.Object3D();
  const localVisualState = {};
  const obstacleCache = new Map(), debrisCache = new Map(), ghosts = new Map();
  const motion = createPresentationMotion({ reducedMotion });
  const movementEffects = createMotionEffects(scene);
  let localAvatar = null, localAvatarKey = '', disposed = false, contextLost = false, hasDrawn = false;
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.65), shadowMaterial);
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
    if (currentMapId !== 'tunnel') {
      const themed = createMapObstacle(currentMapId, obstacle); scene.add(themed); return themed;
    }
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
      // Broken masonry tops out below the shared 2.2m clearance plane.
      // Separate rounded stones give the barrier a readable damaged silhouette.
      for (let row = 0; row < 3; row++) {
        const widths = row === 1 ? [1.18, .73] : [.63, .63, .63];
        let left = -.98;
        widths.forEach((width, column) => {
          const block = makeMesh(group, boxGeometry, (row + column) % 3 ? stone : brokenStone,
            left + width / 2, .34 + row * .62, -.22 + (column % 2) * .018,
            width - .025, .6, .77);
          block.rotation.z = ((row + column) % 3 - 1) * .012;
          block.castShadow = block.receiveShadow = true; left += width;
        });
      }
      const cap = makeMesh(group, boxGeometry, brokenStone, -.14, 1.96, -.22, 1.66, .22, .8);
      cap.rotation.z = .035; cap.castShadow = true;
      makeMesh(group, boxGeometry, stripe, 0, 1.01, .185, 1.98, .22, .035);
      for (const x of [-.76, .76]) {
        makeMesh(group, boxGeometry, darkIron, x, .99, .21, .065, .34, .035);
        makeMesh(group, new THREE.SphereGeometry(.024, 6, 4), darkIron, x, .99, .245);
      }
    } else {
      stones(group, 8, 1.2);
      makeMesh(group, boxGeometry, stripe, 0, .21, .44, 1.75, .19, .08);
    }
    return addObstacleReadability(group,obstacle,'tunnel');
  }
  function makeDebris(event) {
    const group = new THREE.Group(); scene.add(group);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffc069', transparent: true, opacity: .95, side: THREE.DoubleSide, toneMapped: false });
    const outlineMaterial = new THREE.MeshBasicMaterial({color:'#142832',side:THREE.DoubleSide,toneMapped:false});
    const outline = makeMesh(group,new THREE.RingGeometry(.82,1.08,40),outlineMaterial,0,.055,0);outline.rotation.x=-Math.PI/2;
    const ring = makeMesh(group, ringGeometry, ringMaterial, 0, .065, 0); ring.rotation.x = -Math.PI / 2;
    const countdownMaterial=new THREE.MeshBasicMaterial({color:'#fff4d0',side:THREE.DoubleSide,toneMapped:false});
    const countdownGeometry=new THREE.RingGeometry(.72,.77,48);
    const countdown=makeMesh(group,countdownGeometry,countdownMaterial,0,.07,0);countdown.rotation.x=-Math.PI/2;
    const fillMaterial = new THREE.MeshBasicMaterial({ color: '#ff9a55', transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false });
    const fill = makeMesh(group, new THREE.CircleGeometry(.88, 32), fillMaterial, 0, .035, 0); fill.rotation.x = -Math.PI / 2;
    const chunk = new THREE.Group(); group.add(chunk);
    const geometry = currentMapId === 'tunnel' ? roofSlabGeometry(event.lane)
      : currentMapId === 'pirate' ? new THREE.SphereGeometry(.48, 12, 8) : new THREE.DodecahedronGeometry(.68, 1);
    const material = currentMapId === 'tunnel' ? roofSlabMaterial : new THREE.MeshStandardMaterial({
      color: getMap(currentMapId).impactColor || (currentMapId === 'pirate' ? '#283b42' : '#563a32'), roughness: .7, metalness: currentMapId === 'pirate' ? .7 : 0,
      emissive: getMap(currentMapId).impactGlow || (currentMapId === 'pirate' ? '#000000' : '#ff4c08'), emissiveIntensity: .7 });
    const main = makeMesh(chunk, geometry, material, 0, 0, 0); main.castShadow = true;
    for (let i = 0; i < (currentMapId === 'pirate' ? 0 : 4); i++) makeMesh(chunk, stoneGeometry, brokenStone, Math.sin(i * 2.4) * .87, .4 + Math.cos(i) * .4, Math.cos(i * 2.4) * .6, .15, .23, .2);
    const rubble = new THREE.Group();
    if (currentMapId === 'pirate') {
      const splinter = new THREE.MeshStandardMaterial({ color: '#a0784c', roughness: .9 });
      for (let i = 0; i < 7; i++) {
        const plank = makeMesh(rubble, boxGeometry, splinter, Math.sin(i * 2.4) * .6, .15 + (i % 3) * .08, Math.cos(i * 2.4) * .35, .13, .16, .65);
        plank.rotation.set(i * .2, i * .85, i * .12);
      }
    } else if (['frozen','orbital','desert'].includes(currentMapId)) rubble.add(createMapObstacle(currentMapId, { type:'rubble', length:2 }));
    else stones(rubble, 9, 1.2);
    addObstacleReadability(rubble,{type:'rubble'},currentMapId);
    group.add(rubble);
    const marker = makeMesh(group, new THREE.PlaneGeometry(.72, .72), new THREE.MeshBasicMaterial({ map: signTexture('!', '#ffe8b6', '#73492f', 64), side: THREE.DoubleSide, toneMapped: false }), 0, 2.65, .1);
    const dustMaterial = new THREE.MeshBasicMaterial({ map: glowMap, color: '#c9b791', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const dust = new THREE.Group(); group.add(dust);
    for (let i = 0; i < 6; i++) {
      const puff = makeMesh(dust, new THREE.PlaneGeometry(1, 1), dustMaterial, Math.sin(i * 2.4), .35, Math.cos(i * 2.4));
      puff.rotation.y = (i % 3) * Math.PI / 3;
    }
    return { group, ring, ringMaterial, outline, countdown, countdownGeometry, fill, fillMaterial, chunk, rubble, marker, dust, dustMaterial };
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
    camera.fov = camera.aspect < .9 ? 66 : 57;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); resize();
  function onContextLost(event) { event.preventDefault(); contextLost = true; }
  canvas.addEventListener('webglcontextlost', onContextLost);

  // The bounded trail pool is purely visual and never exposes opponent abilities.
  const trailMaterial = new THREE.MeshBasicMaterial({ color: '#b2e7e2', transparent: true, opacity: .28,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const boostTrails = new THREE.InstancedMesh(boxGeometry, trailMaterial, 14);
  boostTrails.frustumCulled = false; boostTrails.visible = false; scene.add(boostTrails);

  function ensureLocalAvatar(state){
    const avatarKey = `${state.avatarId || 'courier'}:${state.playerColor || ''}`;
    if (localAvatarKey !== avatarKey) {
      if (localAvatar) { scene.remove(localAvatar.group); localAvatar.dispose(); }
      localAvatar = createAvatar(state.avatarId || 'courier', { color: state.playerColor, ghost: false });
      localAvatarKey = avatarKey; scene.add(localAvatar.group);
    }
  }

  function warmup(state){
    if(state.mapId!=='tunnel')return Promise.resolve(null);
    if(warmupWork)return warmupWork;
    warmupWork=(async()=>{
      ensureLocalAvatar(state);
      warmGroup=new THREE.Group();warmGroup.name='tunnel-shader-warmup';warmGroup.visible=false;scene.add(warmGroup);
      for(const [i,type]of ['rubble','barrier','gap'].entries()){
        const item=makeObstacle({id:`warm-${type}`,type,length:8});warmGroup.add(item);item.position.set((i-1)*2,0,-10);
      }
      for(let lane=0;lane<3;lane++){
        const item=makeDebris({id:`warm-debris-${lane}`,lane});warmGroup.add(item.group);
        item.group.position.set((lane-1)*2,0,-14);item.chunk.position.y=3;item.dustMaterial.opacity=.35;
      }
      for(const id of getMap('tunnel').avatars)for(const ghost of [false,true]){
        const avatar=createAvatar(id,{ghost});warmAvatars.push(avatar);warmGroup.add(avatar.group);
        avatar.group.position.set(ghost?2:-2,0,-8);avatar.update({...state,phase:'running',visualLane:1,reducedMotion:true},0);
      }
      const target=new THREE.WebGLRenderTarget(256,256,{depthBuffer:true});
      const variants=[warmGroup,boostTrails];
      scene.traverse(node=>{if(node.name==='local-contact-particles'||node.name==='local-contact-ripple')variants.push(node);});
      try{return await runShaderWarmup({renderer,scene,camera,target,variants});}
      finally{target.dispose();warmGroup.visible=false;rememberPrograms();}
    })();
    return warmupWork;
  }

  function draw(state, animationTime, dt = 1 / 60, opponents = []) {
    if (disposed) return;
    if (contextLost || renderer.getContext().isContextLost()) throw new Error('The browser lost the 3D graphics context. Reload the game to restore the tunnel.');
    // Preserve the entire last frame on pause, including pending lane movement,
    // camera hit response, rival animations and boost particles.
    if (state.phase === 'paused' && hasDrawn) { renderer.render(scene, camera); return; }
    const mapId = getMap(state.mapId).id;
    if (mapId !== currentMapId) {
      reset(); world.dispose(); atmosphere.dispose(); finish.dispose(); currentMapId = mapId;
      world = createWorld(scene, currentMapId, CONFIG.courseLength);
      atmosphere = createAtmosphere(scene,currentMapId);
      finish = createFinish(scene,currentMapId,CONFIG.courseLength);
    }
    const distance = state.distance || 0;
    // Hazards, dust and actors freeze with solo pause. The online view provides
    // its interpolated authoritative race clock even after a runner finishes.
    const elapsed = state.raceElapsed ?? state.elapsed ?? 0;
    const progression = THREE.MathUtils.smoothstep(distance, 180, CONFIG.courseLength);
    const running = state.phase === 'running';
    const daylight = THREE.MathUtils.smoothstep(distance, CONFIG.courseLength - 250, CONFIG.courseLength);
    scene.background.copy(darkSky).lerp(brightSky, progression * .2 + daylight * .8);
    scene.fog.color.copy(darkFog).lerp(brightFog, progression * .2 + daylight * .8);
    scene.fog.far = 158 + daylight * 160;
    ambient.intensity = .92 + progression * .12 + daylight * .32;
    bounce.intensity = .38; rim.intensity = .65 + daylight * .15; rim.color.set('#ffe7bf');
    sun.color.copy(coolLight).lerp(warmLight, progression * .25 + daylight * .75);
    sun.intensity = 2.65 + daylight * .6;
    lampLeft.intensity = lampRight.intensity = 12 * (1 - daylight * .7);
    renderer.toneMappingExposure = 1.04 - daylight * .09;
    if (currentMapId !== 'tunnel') {
      const ship = currentMapId === 'pirate';
      scene.background.set(getMap(currentMapId).sky || (ship ? '#83becd' : '#a1d5bc'));
      scene.fog.color.set(getMap(currentMapId).fog || (ship ? '#9dbfca' : '#9fc4a5'));
      scene.fog.near = 75; scene.fog.far = ship ? 260 : 330;
      // Keep skylight bright, but let the key create a readable light/shade side.
      ambient.intensity = currentMapId === 'frozen' ? 1.18 : currentMapId === 'orbital' ? 1.05 : 1.02;
      bounce.intensity = currentMapId === 'orbital' ? .5 : .34;
      rim.color.set(currentMapId === 'orbital' ? '#8bdfff' : currentMapId === 'frozen' ? '#e2f5ff' : '#ffe2b4');
      rim.intensity = currentMapId === 'orbital' ? 1.05 : .72;
      sun.color.set(getMap(currentMapId).sun || '#ffe1ae'); sun.intensity = currentMapId === 'orbital' ? 2.5 : 3.25;
      lampLeft.intensity = lampRight.intensity = 0; renderer.toneMappingExposure = 1.02;
    } else scene.fog.near = 36;
    world.update(distance, elapsed, reducedMotion, state.debris || []);
    atmosphere.update(distance,elapsed,reducedMotion);
    finish.update(state,dt,reducedMotion);

    ensureLocalAvatar(state);
    const view = motion.update(state, dt, opponents);
    const visualLane = view.lane, boostFeel = view.boostFeel;
    Object.assign(localVisualState, state, { reducedMotion, visualLane, visualLaneVelocity: view.laneVelocity });
    localAvatar.update(localVisualState, state.phase === 'paused' ? 0 : dt);
    localAvatar.group.position.set((visualLane - 1) * LANE_WIDTH, view.jumpHeight, 0);
    const landingPulse=movementEffects.update(state,view,dt,reducedMotion);
    contactShadow.position.x = localAvatar.group.position.x;
    contactShadow.scale.setScalar(1 + localAvatar.group.position.y * .16 + landingPulse * .12);
    shadowMaterial.opacity = Math.max(.10, .46 - localAvatar.group.position.y * .13 + landingPulse * .08);

    const visibleOpponents = opponents.slice(0, 3);
    const opponentKeys = new Set(visibleOpponents.map(opponentKey));
    for (const [key, record] of ghosts) {
      if (!opponentKeys.has(key)) { scene.remove(record.avatar.group); record.avatar.dispose(); ghosts.delete(key); }
      else record.avatar.group.visible = false;
    }
    for (const opponent of visibleOpponents) {
      const relative = opponent.distance - distance;
      if (opponent.connected === false || opponent.phase === 'disconnected' || !Number.isFinite(relative) || !Number.isFinite(opponent.lane) || relative < -18 || relative > VISIBLE_METRES) continue;
      const key = opponentKey(opponent);
      let record = ghosts.get(key);
      if (record && (record.id !== opponent.avatarId || record.color !== opponent.color)) {
        scene.remove(record.avatar.group); record.avatar.dispose(); ghosts.delete(key); record = null;
      }
      if (!record) {
        record = { avatar: createAvatar(opponent.avatarId || 'engineer', { ghost: true, color: opponent.color }), id: opponent.avatarId, color: opponent.color, visualState: {} };
        ghosts.set(key, record); scene.add(record.avatar.group);
      }
      const track = view.opponents.get(key);
      Object.assign(record.visualState, { phase: opponent.phase, distance: opponent.distance,
        jumpRemaining: opponent.jumpRemaining, jumpDuration: opponent.jumpDuration,
        reducedMotion, visualLane: track.lane, visualLaneVelocity: track.laneVelocity });
      record.avatar.group.visible = true; record.avatar.update(record.visualState, dt);
      record.avatar.group.position.set((track.lane - 1) * LANE_WIDTH, getJumpHeight(opponent), -relative * DISTANCE_SCALE);
    }

    for (const entry of obstacleCache.values()) entry.visible = false;
    for (const obstacle of state.obstacles || []) {
      const relative = obstacle.z - distance;
      if (relative < -18 || relative > VISIBLE_METRES) continue;
      const key = `${obstacle.id}:${obstacle.type}:${obstacle.length || 0}`;
      let group = obstacleCache.get(key);
      if (!group) { group = makeObstacle(obstacle); obstacleCache.set(key, group); }
      if (group.userData.barrel && !reducedMotion) group.userData.barrel.rotation.x = elapsed * .9;
      group.visible = true; group.position.set((obstacle.lane - 1) * LANE_WIDTH, 0, -relative * DISTANCE_SCALE);
    }
    for (const entry of debrisCache.values()) entry.group.visible = false;
    for (const event of state.debris || []) {
      const relative = event.z - distance;
      if (relative < -18 || relative > VISIBLE_METRES) continue;
      const phase = getDebrisPhase(event, elapsed);
      if (phase === 'waiting') continue;
      let entry = debrisCache.get(event.id);
      if (!entry) { entry = makeDebris(event); debrisCache.set(event.id, entry); }
      entry.group.visible = true; entry.group.position.set((event.lane - 1) * LANE_WIDTH, 0, -relative * DISTANCE_SCALE);
      const warning = phase === 'warning', falling = phase === 'falling', landed = phase === 'landed';
      entry.ring.visible = entry.outline.visible = entry.countdown.visible = entry.fill.visible = !landed;
      entry.marker.visible = warning;
      entry.rubble.visible = landed;
      entry.chunk.visible = falling;
      const warningView=warningPresentation(event,elapsed,reducedMotion);
      entry.ringMaterial.opacity=.78+.22*warningView.pulse;
      entry.fillMaterial.opacity=(warningView.urgent?.17:.10)+.10*warningView.pulse;
      entry.countdownGeometry.setDrawRange(0,Math.ceil(warningView.remaining*48)*6);
      entry.marker.scale.setScalar(warningView.urgent&&!reducedMotion?1.08:1);
      const fall = falling ? clamp((elapsed - event.fallAt) / (event.impactAt - event.fallAt), 0, 1) : 0;
      if (currentMapId === 'pirate') {
        // Side-entry projectile aims only at its marked lane at the shared impact.
        const side = Number(event.id.replace(/\D/g, '')) % 2 ? 1 : -1;
        entry.chunk.position.set(side * (1 - fall) * 10, .6 + Math.sin(fall * Math.PI) * .7, 0);
      } else {
        const height = currentMapId === 'tunnel' ? roofHeight(event.lane) : 12;
        entry.chunk.position.set(0, height - fall * fall * (height - .6), 0);
      }
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
    // Small FOV/height responses communicate speed without sacrificing aim.
    boostTrails.visible = boostFeel > .015 && !reducedMotion;
    if (boostTrails.visible) {
      for (let i = 0; i < 14; i++) {
        const t = ((elapsed * 1.5 + i / 14) % 1);
        const side = i % 2 ? 1 : -1;
        object.position.set(localAvatar.group.position.x + side * (.3 + (i % 3) * .13),
          .12 + (i % 4) * .14 + localAvatar.group.position.y * .3, .4 + t * 2.4);
        object.rotation.set(0, side * .035, 0); object.scale.set(.018, .018, .25 + .5 * t);
        object.updateMatrix(); boostTrails.setMatrixAt(i, object.matrix);
      }
      boostTrails.instanceMatrix.needsUpdate = true; trailMaterial.opacity = boostFeel * .26;
    }
    const stride = !reducedMotion && running ? Math.sin(distance * .058 / .72 * Math.PI * 4) * .012 : 0;
    camera.position.x = (view.cameraLane - 1) * LANE_WIDTH * .065;
    camera.position.y = 3.45 + stride + view.cameraJump * .11;
    camera.position.z = (camera.aspect < .9 ? 9.3 : 7.3) + boostFeel * .18;
    const targetFov = (camera.aspect < .9 ? 66 : 57) + boostFeel * 3.2;
    if (Math.abs(camera.fov - targetFov) > .01) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
    lookTarget.x = (view.cameraLane - 1) * LANE_WIDTH * .065;
    lookTarget.y = 1.95 + view.cameraJump * .06;
    camera.lookAt(lookTarget);
    renderer.render(scene, camera);
    rememberPrograms(state.phase==='running');
    hasDrawn = true;
    // Software submission only: these are the eased values actually drawn.
    return {lane:view.lane,jumpHeight:view.jumpHeight,boostFeel:view.boostFeel};
  }

  const retainedGeometries = new Set([stoneGeometry, boxGeometry, ringGeometry]);
  const retainedMaterials = new Set([stone, roofSlabMaterial, brokenStone, darkIron, stripe, mint, gapDark, shadowMaterial]);
  function disposeDynamicGroup(group) {
    scene.remove(group);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    group.traverse(item => {
      if (item.isInstancedMesh) item.dispose();
      if (item.geometry && !retainedGeometries.has(item.geometry)) geometries.add(item.geometry);
      if (item.material && !retainedMaterials.has(item.material)) materials.add(item.material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture && value !== glowMap) textures.add(value);
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    group.clear();
  }
  function reset() {
    motion.reset(); movementEffects.reset(); finish.reset(); hasDrawn = false; boostTrails.visible = false;
    localAvatar?.reset(); localAvatar?.group.position.set(0, 0, 0);
    contactShadow.position.x = 0; contactShadow.scale.setScalar(1); shadowMaterial.opacity = .46;
    camera.position.set(0, 3.45, camera.aspect < .9 ? 9.3 : 7.3);
    camera.fov = camera.aspect < .9 ? 66 : 57; camera.updateProjectionMatrix();
    lookTarget.set(0, 1.95, -18); camera.lookAt(lookTarget);
    // Match-specific signs/effects are released between seeds, keeping rematches
    // bounded even when obstacle IDs and lengths differ from the previous race.
    for (const entry of obstacleCache.values()) disposeDynamicGroup(entry);
    for (const entry of debrisCache.values()) disposeDynamicGroup(entry.group);
    obstacleCache.clear(); debrisCache.clear();
    for (const entry of ghosts.values()) { scene.remove(entry.avatar.group); entry.avatar.dispose(); }
    ghosts.clear();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for(const avatar of warmAvatars){avatar.group.removeFromParent();avatar.dispose();}
    warmAvatars.length=0;
    movementEffects.dispose(); world.dispose(); atmosphere.dispose(); finish.dispose(); resizeObserver.disconnect(); canvas.removeEventListener('webglcontextlost', onContextLost);
    // GLB geometry belongs to the reusable preload cache. Detach avatar clones
    // before disposing scene-owned graphics; each clone disposes its own materials.
    if (localAvatar) { scene.remove(localAvatar.group); localAvatar.dispose(); localAvatar = null; }
    for (const record of ghosts.values()) { scene.remove(record.avatar.group); record.avatar.dispose(); }
    ghosts.clear();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(item => {
      if (item.isInstancedMesh) item.dispose();
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
  return { draw, reset, dispose, warmup };
}
