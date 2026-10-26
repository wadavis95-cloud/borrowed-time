import * as THREE from 'three';

// Compress only the course's longitudinal presentation. The same scale is used
// for every runner, obstacle and landmark; all simulation distances stay metres.
export const DISTANCE_SCALE = .34;
export const LANE_WIDTH = 2.4;

function random(seed) {
  let value = seed;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function masonryTexture(floor = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const rng = random(floor ? 71 : 42);
  ctx.fillStyle = floor ? '#252b2e' : '#333b3f';
  ctx.fillRect(0, 0, 512, 512);
  const rows = floor ? 8 : 16, columns = floor ? 5 : 8;
  const h = 512 / rows, w = 512 / columns;
  for (let row = 0; row < rows; row++) for (let column = -1; column <= columns; column++) {
    const x = (column + (row % 2) * .5) * w, y = row * h;
    const shade = Math.floor(rng() * 22);
    ctx.fillStyle = floor ? `rgb(${92 + shade},${96 + shade},${93 + shade})` : `rgb(${105 + shade},${108 + shade},${103 + shade})`;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.strokeStyle = '#d4d4bc30'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 3, y + h - 4); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x + w - 4, y + 3); ctx.stroke();
    for (let n = 0; n < 7; n++) {
      ctx.fillStyle = n % 2 ? '#101e2819' : '#eff2c410';
      ctx.fillRect(x + rng() * w, y + rng() * h, 2 + rng() * 9, 1 + rng() * 4);
    }
    if (rng() < .13) {
      ctx.strokeStyle = '#202b2b88'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w * .65, y + 2); ctx.lineTo(x + w * .53, y + h * .45); ctx.lineTo(x + w * .63, y + h * .65); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(.25, '#ffffffcc'); glow.addColorStop(1, '#ffffff00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function archShell(radius, spring, length) {
  const positions = [], uv = [], indices = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32 * Math.PI;
    positions.push(Math.cos(t) * radius, spring + Math.sin(t) * radius, 0,
      Math.cos(t) * radius, spring + Math.sin(t) * radius, -length);
    uv.push(i / 32 * 4, 0, i / 32 * 4, length / 5);
    if (i < 32) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

// Static architecture is instanced by material: hundreds of stone details cost
// one draw per material, not a draw per brick. Only the parent moves each frame.
export function createTunnel(scene, courseLength) {
  const root = new THREE.Group();
  root.name = 'Victorian railway tunnel'; scene.add(root);
  const length = courseLength * DISTANCE_SCALE;
  const stoneMap = masonryTexture(), groundMap = masonryTexture(true);
  const wallMap = stoneMap.clone(); wallMap.needsUpdate = true; wallMap.repeat.set(length / 5, 1.5);
  const floorMap = groundMap.clone(); floorMap.needsUpdate = true; floorMap.repeat.set(1.4, length / 5);
  const stone = new THREE.MeshStandardMaterial({ color: '#99a5a7', map: stoneMap, roughness: .96, side: THREE.DoubleSide });
  const wall = new THREE.MeshStandardMaterial({ color: '#94a0a2', map: wallMap, roughness: .96 });
  const trim = new THREE.MeshStandardMaterial({ color: '#737d78', roughness: .9 });
  const iron = new THREE.MeshStandardMaterial({ color: '#233c48', roughness: .62, metalness: .55 });
  const brass = new THREE.MeshStandardMaterial({ color: '#9b7643', roughness: .55, metalness: .65 });
  const rail = new THREE.MeshStandardMaterial({ color: '#8c9595', roughness: .36, metalness: .72 });
  const timber = new THREE.MeshStandardMaterial({ color: '#343330', roughness: .98 });
  const floor = new THREE.MeshStandardMaterial({ color: '#87918b', map: floorMap, roughness: .9 });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffd294', toneMapped: false });
  const batch = new Map();
  const object = new THREE.Object3D();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  function box(material, x, y, z, sx, sy, sz, angle = 0) {
    if (!batch.has(material)) batch.set(material, []);
    object.position.set(x, y, z); object.rotation.set(0, 0, angle); object.scale.set(sx, sy, sz); object.updateMatrix();
    batch.get(material).push(object.matrix.clone());
  }
  function mesh(geometry, material, x, y, z) {
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); root.add(item); return item;
  }

  mesh(archShell(4.65, 4.05, length + 15), stone, 0, 0, 15);
  for (const side of [-1, 1]) {
    const sideWall = mesh(new THREE.PlaneGeometry(length + 15, 4.1), wall, side * 4.65, 2.02, -(length - 15) / 2);
    sideWall.rotation.y = -side * Math.PI / 2;
    box(trim, side * 4.58, .26, -length / 2, .28, .52, length + 30);
    box(iron, side * 4.43, 3.54, -length / 2, .1, .12, length + 30);
    box(brass, side * 4.43, 3.77, -length / 2, .06, .055, length + 30);
  }
  const pavement = mesh(new THREE.PlaneGeometry(9.4, length + 130), floor, 0, -.055, -(length + 100) / 2 + 15);
  pavement.rotation.x = -Math.PI / 2; pavement.receiveShadow = true;
  // The service paths occupy all three lanes. Narrow sunken rail beds run
  // between them, making the lane boundaries legible without glowing paint.
  for (const x of [-3.85, -1.2, 1.2, 3.85]) {
    box(timber, x, -.02, -length / 2, .27, .05, length + 30);
    box(rail, x, .04, -length / 2, .075, .12, length + 30);
    box(iron, x, .1, -length / 2, .095, .035, length + 30);
    for (let z = 8; z > -length - 15; z -= 1.7) box(timber, x, -.025, z, .58, .055, .17);
  }

  for (let z = 7; z > -length - .1; z -= 9.2) {
    for (const side of [-1, 1]) {
      box(trim, side * 4.42, 1.99, z, .4, 3.98, .54);
      box(trim, side * 4.37, .38, z, .6, .76, .8);
      box(trim, side * 4.37, 3.83, z, .65, .35, .74);
      box(iron, side * 4.13, 2.24, z + .32, .065, 3.1, .075);
      box(iron, side * 4.13, 3.6, z + .32, .28, .075, .13);
      // Lantern stem, cap, glass and small dark metal mullions.
      box(brass, side * 4.07, 2.72, z + .42, .55, .065, .065);
      box(brass, side * 3.83, 2.42, z + .42, .33, .07, .33);
      box(brass, side * 3.83, 3, z + .42, .38, .11, .38);
      box(amber, side * 3.83, 2.7, z + .42, .24, .49, .24);
      for (const dx of [-.14, .14]) for (const dz of [-.14, .14]) box(iron, side * 3.83 + dx, 2.7, z + .42 + dz, .026, .5, .026);
      // Recessed wall bays and angular iron brackets break up the silhouette.
      box(iron, side * 4.55, 1.85, z - 4.4, .06, 2.1, 1.75);
      for (let j = 0; j < 6; j++) box(trim, side * 4.49, .94 + j * .36, z - 4.4, .11, .035, 1.66);
      box(iron, side * 3.89, 4.35, z, .075, 1.45, .09, side * -.7);
    }
    for (let i = 0; i < 21; i++) {
      const angle = (i + .5) / 21 * Math.PI;
      box(trim, Math.cos(angle) * 4.4, 4.05 + Math.sin(angle) * 4.4, z, .67, .3, .56, angle + Math.PI / 2);
      box(iron, Math.cos(angle) * 4.17, 4.05 + Math.sin(angle) * 4.17, z + .3, .66, .075, .09, angle + Math.PI / 2);
    }
    box(iron, 0, 7.4, z + .31, 4.2, .09, .08);
    for (const side of [-1, 1]) box(iron, side * .75, 7.8, z + .31, 1.75, .065, .065, side * .52);
  }
  // Small weathered masonry along the sides is decorative and never occupies a lane.
  const rng = random(19);
  const rubbleGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rubble = new THREE.InstancedMesh(rubbleGeometry, trim, 180);
  for (let i = 0; i < 180; i++) {
    const s = .07 + rng() * .19;
    object.position.set((i % 2 ? 1 : -1) * (4.08 + rng() * .37), s * .45, -rng() * length);
    object.rotation.set(rng(), rng(), rng()); object.scale.set(s * 1.7, s, s); object.updateMatrix(); rubble.setMatrixAt(i, object.matrix);
  }
  root.add(rubble);

  // An original city landmark, built as real geometry beyond the actual exit.
  const city = new THREE.Group(); city.position.z = -length; root.add(city);
  const cityStone = new THREE.MeshStandardMaterial({ color: '#d8c5a1', roughness: .88, fog: false });
  const cityRoof = new THREE.MeshStandardMaterial({ color: '#50777b', roughness: .63, metalness: .25, fog: false });
  const windowMat = new THREE.MeshStandardMaterial({ color: '#3e606c', roughness: .4, metalness: .2, fog: false });
  function cityBox(material, x, y, z, sx, sy, sz) {
    const item = new THREE.Mesh(boxGeometry, material); item.position.set(x, y, z); item.scale.set(sx, sy, sz); city.add(item); return item;
  }
  cityBox(cityStone, 4.4, 11, -43, 4.7, 22, 4.7);
  cityBox(cityStone, 4.4, 22.6, -43, 6.1, 3.5, 6.1);
  cityBox(cityRoof, 4.4, 25, -43, 6.7, .5, 6.7);
  for (const x of [1.6, 7.2]) for (const z of [-40.2, -45.8]) {
    cityBox(cityStone, x, 25.8, z, .6, 3.1, .6);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(.56, 2.6, 4), cityRoof); spire.position.set(x, 28.2, z); spire.rotation.y = Math.PI / 4; city.add(spire);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.7, 8, 4), cityRoof);
  spire.rotation.y = Math.PI / 4; spire.position.set(4.4, 29.3, -43); city.add(spire);
  cityBox(brass, 4.4, 34.1, -43, .12, 2.1, .12);
  for (let y = 4; y < 21; y += 3.4) {
    cityBox(cityStone, 4.4, y - 1.3, -40.52, 5.1, .22, .3);
    for (const x of [3.2, 4.4, 5.6]) cityBox(windowMat, x, y, -40.6, .5, 1.85, .08);
  }
  const clockCanvas = document.createElement('canvas'); clockCanvas.width = clockCanvas.height = 256;
  const cc = clockCanvas.getContext('2d');
  cc.fillStyle = '#f6e6b5'; cc.beginPath(); cc.arc(128, 128, 119, 0, Math.PI * 2); cc.fill();
  cc.strokeStyle = '#5d604d'; cc.lineWidth = 9; cc.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    cc.lineWidth = 5; cc.beginPath(); cc.moveTo(128 + Math.sin(a) * 93, 128 - Math.cos(a) * 93); cc.lineTo(128 + Math.sin(a) * 108, 128 - Math.cos(a) * 108); cc.stroke();
  }
  cc.lineWidth = 8; cc.beginPath(); cc.moveTo(90, 95); cc.lineTo(128, 128); cc.lineTo(170, 57); cc.stroke();
  const clockTexture = new THREE.CanvasTexture(clockCanvas); clockTexture.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ map: clockTexture, fog: false }));
  clock.position.set(4.4, 22.6, -39.93); city.add(clock);
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, x = side * (9 + Math.floor(i / 2) * 7), h = 5 + rng() * 6;
    cityBox(cityStone, x, h / 2, -36 - rng() * 15, 5.5, h, 6);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.3, 3.2, 4), cityRoof); roof.rotation.y = Math.PI / 4; roof.position.set(x, h + 1.6, -40); city.add(roof);
    cityBox(cityStone, x + 1.8, h + 2.4, -42, .5, 3.8, .7);
  }

  // Warm portal halo stays beyond the masonry and cannot obscure the course.
  const haloMaterial = new THREE.SpriteMaterial({ map: radialTexture(), color: '#ffe8b0', transparent: true, opacity: .65, depthWrite: false, fog: false, toneMapped: false });
  const halo = new THREE.Sprite(haloMaterial); halo.position.set(0, 4, -length - .7); halo.scale.set(16, 18, 1); root.add(halo);
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 16; skyCanvas.height = 128;
  const sc = skyCanvas.getContext('2d'), skyGradient = sc.createLinearGradient(0, 0, 0, 128);
  skyGradient.addColorStop(0, '#78adca'); skyGradient.addColorStop(.6, '#cee5e6'); skyGradient.addColorStop(1, '#fff0cb');
  sc.fillStyle = skyGradient; sc.fillRect(0, 0, 16, 128);
  const skyMap = new THREE.CanvasTexture(skyCanvas); skyMap.colorSpace = THREE.SRGBColorSpace;
  mesh(new THREE.PlaneGeometry(350, 130), new THREE.MeshBasicMaterial({ map: skyMap, fog: false }), 0, 31, -length - 85);

  // Ivy around the mouth and occasional grasses make the outside feel inhabited.
  const leaves = new THREE.MeshStandardMaterial({ color: '#708247', roughness: 1 });
  const ivy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), leaves, 80);
  for (let i = 0; i < 80; i++) {
    const a = rng() * Math.PI;
    object.position.set(Math.cos(a) * (4.2 + rng() * .4), 4 + Math.sin(a) * 4.3 - rng() * 1.1, -length + .15);
    object.rotation.set(rng(), rng(), rng()); object.scale.set(.13 + rng() * .15, .19 + rng() * .22, .04); object.updateMatrix(); ivy.setMatrixAt(i, object.matrix);
  }
  root.add(ivy);
  // Late-course breaches spill shafts of daylight onto the paving. Their
  // transparent volume is static, so reduced motion leaves the lighting intact.
  const shaftMaterial = new THREE.MeshBasicMaterial({ color: '#ffdf9f', transparent: true, opacity: .038, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const breachMaterial = new THREE.MeshBasicMaterial({ color: '#ffeac2', toneMapped: false });
  for (const metres of [460, 640, 765, 840]) {
    const shaft = mesh(new THREE.CylinderGeometry(.12, 2, 8.5, 7, 1, true), shaftMaterial, 1.15, 4.4, -metres * DISTANCE_SCALE);
    shaft.rotation.z = -.47;
    const breach = mesh(new THREE.CircleGeometry(.7, 5), breachMaterial, 3.1, 8.13, -metres * DISTANCE_SCALE);
    breach.rotation.x = Math.PI / 2; breach.rotation.y = -.45; breach.scale.set(1, 1.7, 1);
  }
  // Final structural entrance pilasters, with a brass edge catching the sun.
  for (const side of [-1, 1]) box(trim, side * 4.5, 2, -length, .65, 4, 1.3);
  for (let i = 0; i < 25; i++) {
    const a = (i + .5) / 25 * Math.PI;
    box(trim, Math.cos(a) * 4.45, 4.05 + Math.sin(a) * 4.45, -length, .58, .5, 1.1, a + Math.PI / 2);
  }
  for (const [material, matrices] of batch) {
    const instances = new THREE.InstancedMesh(boxGeometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) instances.setMatrixAt(i, matrices[i]);
    instances.receiveShadow = material === trim || material === timber; root.add(instances);
  }

  const dustPositions = new Float32Array(96 * 3);
  for (let i = 0; i < 96; i++) { dustPositions[i * 3] = (rng() - .5) * 8; dustPositions[i * 3 + 1] = rng() * 6; dustPositions[i * 3 + 2] = -rng() * 65; }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#d7d3ad', size: .035, map: radialTexture(), transparent: true, opacity: .36, depthWrite: false })); scene.add(dust);

  return {
    update(distance, elapsed, reducedMotion) {
      root.position.z = distance * DISTANCE_SCALE;
      haloMaterial.opacity = .62 * (1 - THREE.MathUtils.smoothstep(distance, courseLength - 90, courseLength - 10));
      dust.visible = !reducedMotion;
      dust.position.z = reducedMotion ? 0 : (distance * DISTANCE_SCALE) % 12;
      dust.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * .07) * .025;
    },
    root,
  };
}
