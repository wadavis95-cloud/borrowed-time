import * as THREE from 'three';

// Only longitudinal presentation is compressed; rules continue to use metres.
export const DISTANCE_SCALE = .34;
export const LANE_WIDTH = 2.4;
const SECTION_LENGTH = 18;
const SPRING = 3.5;
const RADIUS = 4.7;

function random(seed) {
  let value = seed;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Original deterministic surfaces. Albedo, relief and roughness share mortar/cracks. */
export function masonrySurface(floor = false) {
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; return canvas;
  });
  const [ctx, relief, rough] = canvases.map(canvas => canvas.getContext('2d'));
  const rng = random(floor ? 711 : 428);
  ctx.fillStyle = floor ? '#303d42' : '#3d494d'; ctx.fillRect(0, 0, 512, 512);
  relief.fillStyle = '#303030'; relief.fillRect(0, 0, 512, 512);
  rough.fillStyle = '#eeeeee'; rough.fillRect(0, 0, 512, 512);
  const rows = floor ? 5 : 9, columns = floor ? 4 : 5;
  const h = 512 / rows, w = 512 / columns;
  for (let row = 0; row < rows; row++) for (let column = -1; column <= columns; column++) {
    const x = (column + (row % 2) * .5) * w, y = row * h;
    const margin = 2.1 + rng() * 1.7, shade = Math.floor(rng() * 24);
    const path = context => {
      context.beginPath(); context.moveTo(x + margin + 3, y + margin);
      context.lineTo(x + w - margin - 5, y + margin + 1);
      context.quadraticCurveTo(x + w - margin, y + margin, x + w - margin, y + margin + 4);
      context.lineTo(x + w - margin - 1, y + h - margin - 4);
      context.quadraticCurveTo(x + w - margin, y + h - margin, x + w - margin - 5, y + h - margin);
      context.lineTo(x + margin + 2, y + h - margin - 1);
      context.quadraticCurveTo(x + margin - 1, y + h - margin, x + margin, y + h - margin - 4);
      context.lineTo(x + margin + 1, y + margin + 4); context.closePath();
    };
    path(ctx);
    const gradient = ctx.createLinearGradient(x, y, x + w * .4, y + h);
    const base = floor ? 94 : 121;
    gradient.addColorStop(0, `rgb(${base + shade + 10},${base + shade + 14},${base + shade + 10})`);
    gradient.addColorStop(.65, `rgb(${base + shade},${base + shade + 5},${base + shade + 3})`);
    gradient.addColorStop(1, `rgb(${base + shade - 19},${base + shade - 10},${base + shade - 6})`);
    ctx.fillStyle = gradient; ctx.fill();
    path(relief); relief.fillStyle = `rgb(${183 + shade},${183 + shade},${183 + shade})`; relief.fill();
    relief.strokeStyle = '#7b7b7b'; relief.lineWidth = 3; relief.stroke();
    path(rough); rough.fillStyle = floor && rng() < .23 ? '#666666' : '#c8c8c8'; rough.fill();
    ctx.save(); path(ctx); ctx.clip();
    for (let n = 0; n < 75; n++) {
      ctx.fillStyle = n % 3 ? '#182e3920' : '#ffffd71a';
      ctx.fillRect(x + rng() * w, y + rng() * h, .5 + rng() * 5, .5 + rng() * 1.8);
    }
    if (rng() < .26) {
      const cx = x + w * (.2 + rng() * .55);
      for (const context of [ctx, relief]) {
        context.strokeStyle = context === ctx ? '#28363d99' : '#555555'; context.lineWidth = 1;
        context.beginPath(); context.moveTo(cx, y + margin); context.lineTo(cx - 7, y + h * .35);
        context.lineTo(cx + 3, y + h * .6); context.lineTo(cx - 11, y + h - margin); context.stroke();
      }
    }
    ctx.restore();
  }
  // Large, very soft mineral/water stains prevent the stones reading as tiled plastic.
  for (let i = 0; i < 22; i++) {
    const x = rng() * 512, y = rng() * 512, radius = 18 + rng() * 95;
    const stain = ctx.createRadialGradient(x, y, 1, x, y, radius);
    stain.addColorStop(0, i % 3 ? '#152d3a19' : '#a88e5720'); stain.addColorStop(1, '#17313a00');
    ctx.fillStyle = stain; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const textures = canvases.map((canvas, index) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
    if (index === 0) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  return { map: textures[0], bumpMap: textures[1], roughnessMap: textures[2] };
}

export function radialTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), glow = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  glow.addColorStop(0, '#ffffff'); glow.addColorStop(.25, '#ffffffcc'); glow.addColorStop(1, '#ffffff00');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(canvas);
}

/** Shared unit box with a small roundover and smooth edge normals. */
export function beveledBoxGeometry(radius = .06) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const point = new THREE.Vector3(), inner = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index); inner.copy(point).clampScalar(-.5 + radius, .5 - radius);
    normal.subVectors(point, inner).normalize(); point.copy(inner).addScaledVector(normal, radius);
    positions.setXYZ(index, point.x, point.y, point.z); normals.setXYZ(index, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

function archShell(length, start = 0, end = Math.PI) {
  const positions = [], uv = [], indices = [];
  for (let i = 0; i <= 40; i++) {
    const angle = start + (end - start) * i / 40;
    positions.push(Math.cos(angle) * RADIUS, SPRING + Math.sin(angle) * RADIUS, 0,
      Math.cos(angle) * RADIUS, SPRING + Math.sin(angle) * RADIUS, -length);
    uv.push(angle * RADIUS / 3.6, 0, angle * RADIUS / 3.6, length / 3.6);
    if (i < 40) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function archRibGeometry(start = 0, end = Math.PI) {
  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(start) * 4.44, SPRING + Math.sin(start) * 4.44);
  shape.absarc(0, SPRING, 4.44, start, end, false);
  shape.lineTo(Math.cos(end) * 4.72, SPRING + Math.sin(end) * 4.72);
  shape.absarc(0, SPRING, 4.72, end, start, true); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .38, steps: 1, curveSegments: 36, bevelEnabled: true, bevelThickness: .035, bevelSize: .025, bevelSegments: 2 });
  geometry.translate(0, 0, -.19); return geometry;
}

// Merge small static meshes sharing a material within one cullable section.
// Instanced props stay instanced; this folds walls, arch ribs and cables into
// three draws without expanding the large repeated prop pools.
function mergeStaticSurfaces(parent) {
  const groups = new Map();
  for (const child of parent.children) {
    if (!child.isMesh || child.isInstancedMesh || Array.isArray(child.material)) continue;
    if (!groups.has(child.material)) groups.set(child.material, []);
    groups.get(child.material).push(child);
  }
  for (const [material, children] of groups) {
    if (children.length < 2) continue;
    const positions = [], normals = [], uvs = [], point = new THREE.Vector3(), normal = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    let receiveShadow = false;
    for (const child of children) {
      child.updateMatrix(); normalMatrix.getNormalMatrix(child.matrix);
      const geometry = child.geometry, index = geometry.index;
      for (let i = 0; i < (index?.count ?? geometry.attributes.position.count); i++) {
        const vertex = index ? index.getX(i) : i;
        point.fromBufferAttribute(geometry.attributes.position, vertex).applyMatrix4(child.matrix);
        normal.fromBufferAttribute(geometry.attributes.normal, vertex).applyNormalMatrix(normalMatrix);
        positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z);
        uvs.push(geometry.attributes.uv?.getX(vertex) ?? 0, geometry.attributes.uv?.getY(vertex) ?? 0);
      }
      receiveShadow ||= child.receiveShadow; parent.remove(child);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const merged = new THREE.Mesh(geometry, material); merged.receiveShadow = receiveShadow; parent.add(merged);
  }
}

// Architecture is chunked and instanced. Offscreen sections never submit draws,
// and decorative rubble/cables stay outside all three traversable lanes.
export function createTunnel(scene, courseLength) {
  const root = new THREE.Group(); root.name = 'Weathered railway / open-air station'; scene.add(root);
  const length = courseLength * DISTANCE_SCALE;
  const masonry = masonrySurface(), paving = masonrySurface(true);
  const stone = new THREE.MeshStandardMaterial({ color: '#b4bfba', ...masonry, bumpScale: .105, roughness: .94, side: THREE.DoubleSide });
  const floor = new THREE.MeshStandardMaterial({ color: '#a0b1ad', ...paving, bumpScale: .055, roughness: .89 });
  const trim = new THREE.MeshStandardMaterial({ color: '#9ca99f', ...masonry, bumpScale: .05, roughness: .87 });
  const worn = new THREE.MeshStandardMaterial({ color: '#7c928e', ...masonry, bumpScale: .06, roughness: .98 });
  const iron = new THREE.MeshStandardMaterial({ color: '#304c59', roughness: .5, metalness: .7 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b38f5c', roughness: .47, metalness: .72 });
  const rail = new THREE.MeshStandardMaterial({ color: '#a1b9bd', roughness: .29, metalness: .84 });
  const timber = new THREE.MeshStandardMaterial({ color: '#3a3c39', roughness: .97 });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffd69b', toneMapped: false });
  const dark = new THREE.MeshStandardMaterial({ color: '#162e3a', roughness: .82 });
  const sectionGeometry = archShell(SECTION_LENGTH), ribGeometry = archRibGeometry();
  const brokenShells = [archShell(SECTION_LENGTH, 0, 1.06), archShell(SECTION_LENGTH, 2.02, Math.PI)];
  const brokenRibs = [archRibGeometry(0, 1.09), archRibGeometry(2.08, Math.PI)];
  const boxGeometry = beveledBoxGeometry(.055), flatBox = new THREE.BoxGeometry(1, 1, 1);
  const rubbleGeometry = new THREE.IcosahedronGeometry(1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const object = new THREE.Object3D(), sections = [], rng = random(19);
  const cableMaterial = new THREE.MeshStandardMaterial({ color: '#283b42', roughness: .55, metalness: .45 });
  const shaftMaterial = new THREE.MeshBasicMaterial({ color: '#ffe2ae', transparent: true, opacity: .028, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  function mesh(parent, geometry, material, x, y, z) {
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); parent.add(item); return item;
  }
  function curve(parent, points, material, radius = .035) {
    return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 18, radius, 5, false), material, 0, 0, 0);
  }
  for (let index = 0; index < Math.ceil((length + 18) / SECTION_LENGTH); index++) {
    const section = new THREE.Group(); section.position.z = 12 - index * SECTION_LENGTH;
    section.name = `Tunnel section ${index}`; root.add(section); sections.push(section);
    const metres = index * SECTION_LENGTH / DISTANCE_SCALE;
    const open = metres > courseLength - 230 || (index > 2 && index % 6 === 4);
    const damaged = open || index % 4 === 2;
    const batches = new Map();
    function instance(geometry, material, x, y, z, sx, sy, sz, rz = 0, ry = 0) {
      const key = `${geometry.uuid}:${material.uuid}`;
      if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [], colors: [] });
      const batch = batches.get(key);
      object.position.set(x, y, z); object.rotation.set(0, ry, rz); object.scale.set(sx, sy, sz); object.updateMatrix();
      batch.matrices.push(object.matrix.clone());
      batch.colors.push(new THREE.Color().setScalar(material === trim || material === worn ? .82 + rng() * .28 : 1));
    }
    const box = (material, x, y, z, sx, sy, sz, rz = 0, ry = 0) => instance(boxGeometry, material, x, y, z, sx, sy, sz, rz, ry);
    if (open) for (const geometry of brokenShells) mesh(section, geometry, stone, 0, 0, 0);
    else mesh(section, sectionGeometry, stone, 0, 0, 0);
    const pavementGeometry = new THREE.PlaneGeometry(9.6, SECTION_LENGTH);
    const pavementUV = pavementGeometry.attributes.uv;
    for (let i = 0; i < pavementUV.count; i++) pavementUV.setXY(i, pavementUV.getX(i) * 2, pavementUV.getY(i) * 4);
    const pavement = mesh(section, pavementGeometry, floor, 0, -.065, -SECTION_LENGTH / 2);
    pavement.rotation.x = -Math.PI / 2; pavement.receiveShadow = true;
    for (const side of [-1, 1]) {
      const wallGeometry = new THREE.PlaneGeometry(SECTION_LENGTH, SPRING);
      const wallUV = wallGeometry.attributes.uv;
      for (let i = 0; i < wallUV.count; i++) wallUV.setXY(i, wallUV.getX(i) * 4, wallUV.getY(i));
      const wall = mesh(section, wallGeometry, stone, side * RADIUS, SPRING / 2, -SECTION_LENGTH / 2);
      wall.rotation.y = -side * Math.PI / 2;
      // A broken raised service edge has individual bevels and exposed foundations.
      box(dark, side * 4.55, .16, -9, .36, .38, 18);
      for (let p = 0; p < 12; p++) {
        if (damaged && p % 5 === 2) continue;
        box(p % 3 ? trim : worn, side * 4.42, .29 + rng() * .025, -p * 1.5 - .7, .55, .35, 1.43, damaged ? (rng() - .5) * .035 : 0);
      }
      // Long brass/iron pipes use cylinder profiles, with separate collars.
      for (const [y, radius, material] of [[2.99, .055, iron], [3.18, .027, brass]]) {
        instance(cylinder, material, side * 4.51, y, -9, radius, 18, radius, Math.PI / 2, Math.PI / 2);
        for (const z of [-1, -7, -13]) box(iron, side * 4.47, y, z, .15, radius * 2.8, .11);
      }
      for (const z of [-.4, -9.4]) {
        // Broad, softened piers support continuous arches, with small stone joints.
        box(trim, side * 4.54, 1.75, z, .32, 3.5, .51);
        box(worn, side * 4.48, .36, z, .49, .72, .73);
        box(trim, side * 4.47, 3.46, z, .5, .22, .68);
        for (let y = .85; y < 3.2; y += .6) box(dark, side * 4.367, y, z, .015, .018, .44);
        // Industrial wall lamps remain small pools in the cool shadow.
        box(iron, side * 4.32, 2.54, z + .22, .23, .62, .27);
        box(amber, side * 4.19, 2.55, z + .22, .055, .38, .18);
        box(brass, side * 4.18, 2.79, z + .22, .23, .06, .29);
        box(brass, side * 4.18, 2.31, z + .22, .23, .06, .29);
        box(iron, side * 4.15, 2.55, z + .22, .04, .4, .035);
      }
      // Occasional recessed grille, sealed doors and electrical cabinets.
      if ((index + (side > 0 ? 1 : 0)) % 3 === 0) {
        box(dark, side * 4.64, 1.52, -4.8, .04, 2.4, 1.9);
        for (let n = 0; n < 7; n++) box(iron, side * 4.58, 1.52, -5.58 + n * .25, .06, 2.21, .035);
        box(brass, side * 4.53, 2.83, -4.8, .04, .12, 1.5);
      }
      if (index % 4 === 1) {
        box(iron, side * 4.45, 1.65, -13.5, .4, 1.1, .7);
        box(brass, side * 4.22, 1.64, -13.25, .025, .16, .055);
      }
      // Sagging cable silhouette is visible against lit masonry; stays above the platform.
      curve(section, [[side * 4.23, 3.55, -.3], [side * 4.12, damaged ? 2.55 : 3.1, -4.8], [side * 4.26, 3.48, -9.4], [side * 4.07, 3.05, -14], [side * 4.2, 3.52, -18]], cableMaterial, .025);
      for (let n = 0; n < (damaged ? 14 : 5); n++) {
        const s = .08 + rng() * .17;
        instance(rubbleGeometry, n % 2 ? worn : trim, side * (4.08 + rng() * .5), s * .4, -rng() * 18, s * 1.5, s, s, rng(), rng() * 3);
      }
    }
    for (const z of [-.4, -9.4]) {
      if (open) for (const geometry of brokenRibs) mesh(section, geometry, trim, 0, 0, z);
      else mesh(section, ribGeometry, trim, 0, 0, z);
      // Voussoir joints are narrow inlays instead of large repeated cuboids.
      for (let j = 0; j < 23; j++) {
        const angle = (j + .5) / 23 * Math.PI;
        if (open && angle > 1.03 && angle < 2.14) continue;
        box(dark, Math.cos(angle) * 4.59, SPRING + Math.sin(angle) * 4.59, z + .232, .016, .24, .012, angle - Math.PI / 2);
      }
    }
    for (const x of [-3.85, -1.2, 1.2, 3.85]) {
      // Slim rails guide the three lanes while leaving paving visually dominant.
      box(timber, x, -.045, -9, .18, .035, 18);
      instance(flatBox, rail, x, .012, -9, .055, .04, 18);
      for (let z = -.7; z > -18; z -= 2.5) box(iron, x, -.015, z, .27, .055, .11);
    }
    if (open) {
      for (const side of [-1, 1]) {
        for (let n = 0; n < 8; n++) {
          const angle = side < 0 ? 2.02 + rng() * .12 : .94 + rng() * .13;
          box(worn, Math.cos(angle) * 4.68, SPRING + Math.sin(angle) * 4.68, -n * 2.35, .5 + rng() * .25, .23, .75, angle, rng() * .2);
        }
        curve(section, [[side * 2.3, 7.4, -1], [side * 1.8, 6.6, -5], [side * 2.4, 7.5, -10]], iron, .035);
      }
      const shaft = mesh(section, new THREE.CylinderGeometry(.1, 2.3, 9.1, 12, 1, true), shaftMaterial, 1, 4.2, -6.5);
      shaft.rotation.z = -.34;
      const pool = mesh(section, new THREE.PlaneGeometry(4.5, 6), new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#ffe5b4', transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending }), -.35, -.045, -6.5);
      pool.rotation.x = -Math.PI / 2;
    }
    for (const { geometry, material, matrices, colors } of batches.values()) {
      const instances = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, i) => { instances.setMatrixAt(i, matrix); instances.setColorAt(i, colors[i]); });
      instances.receiveShadow = material === trim || material === worn; instances.computeBoundingSphere(); section.add(instances);
    }
    mergeStaticSurfaces(section);
  }

  // The open final station frames a physical clocktower and a warm city skyline.
  // Tower is centred in the vanishing point and the last 230m have no crown roof.
  const city = new THREE.Group(); city.name = 'Exit clocktower'; city.position.z = -length; root.add(city);
  const cityStone = new THREE.MeshStandardMaterial({ color: '#e5cc9f', roughness: .83, fog: false });
  const cityShade = new THREE.MeshStandardMaterial({ color: '#9d947b', roughness: .89, fog: false });
  const cityRoof = new THREE.MeshStandardMaterial({ color: '#4b797b', roughness: .48, metalness: .3, fog: false });
  const windowMat = new THREE.MeshStandardMaterial({ color: '#385968', roughness: .32, metalness: .3, fog: false });
  const cityBatches = new Map();
  function cityBox(material, x, y, z, sx, sy, sz) {
    if (!cityBatches.has(material)) cityBatches.set(material, []);
    object.position.set(x, y, z); object.rotation.set(0, 0, 0); object.scale.set(sx, sy, sz); object.updateMatrix(); cityBatches.get(material).push(object.matrix.clone());
  }
  const towerX = 0, towerZ = -46;
  cityBox(cityStone, towerX, 10, towerZ, 6.3, 20, 6.3);
  cityBox(cityShade, towerX, .7, towerZ, 7.1, 1.4, 7.1);
  cityBox(cityStone, towerX, 20.4, towerZ, 7.3, 4.1, 7.3);
  cityBox(cityRoof, towerX, 22.7, towerZ, 7.9, .45, 7.9);
  for (const x of [-2.9, 2.9]) {
    cityBox(cityStone, x, 11.5, -42.75, .43, 18.9, .38);
    for (const z of [-42.7, -49.3]) {
      cityBox(cityStone, x, 23.4, z, .64, 2.5, .64);
      const pinnacle = mesh(city, new THREE.ConeGeometry(.53, 2.25, 6), cityRoof, x, 25.65, z); pinnacle.rotation.y = Math.PI / 6;
    }
  }
  const spire = mesh(city, new THREE.ConeGeometry(4.5, 8.5, 4), cityRoof, 0, 27.1, towerZ); spire.rotation.y = Math.PI / 4;
  cityBox(brass, 0, 32.1, towerZ, .1, 1.7, .1);
  for (let y = 3.8; y < 19; y += 3.1) {
    cityBox(cityShade, 0, y - 1.25, -42.77, 6.5, .2, .28);
    for (const x of [-1.6, 0, 1.6]) {
      cityBox(windowMat, x, y, -42.8, .65, 1.8, .08);
      const top = mesh(city, new THREE.CircleGeometry(.325, 12, 0, Math.PI), windowMat, x, y + .9, -42.73);
      cityBox(cityStone, x, y - .97, -42.61, .85, .15, .28);
    }
  }
  const clockCanvas = document.createElement('canvas'); clockCanvas.width = clockCanvas.height = 256;
  const cc = clockCanvas.getContext('2d');
  cc.fillStyle = '#f6e7c1'; cc.beginPath(); cc.arc(128, 128, 119, 0, Math.PI * 2); cc.fill();
  cc.strokeStyle = '#59625b'; cc.lineWidth = 7; cc.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    cc.lineWidth = i % 5 ? 2 : 5; cc.beginPath(); cc.moveTo(128 + Math.sin(a) * (i % 5 ? 104 : 92), 128 - Math.cos(a) * (i % 5 ? 104 : 92));
    cc.lineTo(128 + Math.sin(a) * 111, 128 - Math.cos(a) * 111); cc.stroke();
  }
  cc.lineWidth = 7; cc.lineCap = 'round'; cc.beginPath(); cc.moveTo(89, 96); cc.lineTo(128, 128); cc.lineTo(170, 57); cc.stroke();
  const clockMap = new THREE.CanvasTexture(clockCanvas); clockMap.colorSpace = THREE.SRGBColorSpace;
  const clock = mesh(city, new THREE.CircleGeometry(1.64, 48), new THREE.MeshBasicMaterial({ map: clockMap, fog: false }), 0, 20.4, -42.3);
  const clockRim = mesh(city, new THREE.TorusGeometry(1.68, .11, 8, 48), brass, 0, 20.4, -42.28);
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, x = side * (9 + Math.floor(i / 2) * 7.5), h = 6 + rng() * 7, z = -38 - rng() * 14;
    cityBox(i % 3 ? cityStone : cityShade, x, h / 2, z, 6.1, h, 7.2);
    const roof = mesh(city, new THREE.ConeGeometry(4.7, 3.6, 4), cityRoof, x, h + 1.8, z); roof.rotation.y = Math.PI / 4;
    cityBox(cityShade, x + 1.7, h + 2.2, z - 1.7, .6, 3.8, .8);
    for (let y = 2; y < h; y += 2.7) for (const dx of [-1.8, 0, 1.8]) cityBox(windowMat, x + dx, y, z + 3.63, .66, 1.3, .07);
  }
  for (const [material, matrices] of cityBatches) {
    const batch = new THREE.InstancedMesh(boxGeometry, material, matrices.length);
    matrices.forEach((matrix, i) => batch.setMatrixAt(i, matrix)); city.add(batch);
  }
  const plazaMap = paving.map.clone(); plazaMap.repeat.set(6, 12); plazaMap.needsUpdate = true;
  const plaza = mesh(city, new THREE.PlaneGeometry(90, 110), new THREE.MeshStandardMaterial({ map: plazaMap, color: '#c9c3a7', roughness: .86 }), 0, -.075, -48);
  plaza.rotation.x = -Math.PI / 2;
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 16; skyCanvas.height = 128;
  const sc = skyCanvas.getContext('2d'), skyGradient = sc.createLinearGradient(0, 0, 0, 128);
  skyGradient.addColorStop(0, '#75a9c6'); skyGradient.addColorStop(.55, '#c7e0df'); skyGradient.addColorStop(1, '#f7ddb1');
  sc.fillStyle = skyGradient; sc.fillRect(0, 0, 16, 128);
  const skyMap = new THREE.CanvasTexture(skyCanvas); skyMap.colorSpace = THREE.SRGBColorSpace;
  mesh(city, new THREE.PlaneGeometry(360, 160), new THREE.MeshBasicMaterial({ map: skyMap, fog: false }), 0, 35, -100);
  const haloMaterial = new THREE.SpriteMaterial({ map: radialTexture(), color: '#ffe2a5', transparent: true, opacity: .19, depthWrite: false, fog: false, toneMapped: false });
  const halo = new THREE.Sprite(haloMaterial); halo.position.set(-9, 9, -length - 12); halo.scale.set(28, 25, 1); root.add(halo);

  mergeStaticSurfaces(city);

  const dustPositions = new Float32Array(72 * 3);
  for (let i = 0; i < 72; i++) { dustPositions[i * 3] = (rng() - .5) * 8; dustPositions[i * 3 + 1] = .3 + rng() * 6; dustPositions[i * 3 + 2] = -rng() * 68; }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#dcd2ac', size: .025, map: radialTexture(), transparent: true, opacity: .3, depthWrite: false }));
  dust.name = 'Local dust / bounded 72 particles'; scene.add(dust);

  return {
    update(distance, elapsed, reducedMotion) {
      root.position.z = distance * DISTANCE_SCALE;
      for (const section of sections) {
        const relative = section.position.z + root.position.z;
        section.visible = relative > -155 && relative < SECTION_LENGTH + 14;
      }
      haloMaterial.opacity = .19 * (1 - THREE.MathUtils.smoothstep(distance, courseLength - 80, courseLength));
      dust.visible = !reducedMotion; dust.position.z = reducedMotion ? 0 : (distance * DISTANCE_SCALE) % 12;
      dust.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * .07) * .025;
    },
    root,
  };
}
