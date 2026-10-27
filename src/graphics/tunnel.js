import * as THREE from 'three';

// Only longitudinal presentation is compressed; rules continue to use metres.
export const DISTANCE_SCALE = .34;
export const LANE_WIDTH = 2.4;
const SECTION_LENGTH = 18;
const SPRING = 3.5;
const RADIUS = 4.7;
const COLLAPSE_DEPTH = 3.4;
function roofAngles(lane) {
  const x = (lane - 1) * LANE_WIDTH;
  return [Math.acos((x + 1.05) / RADIUS), Math.acos((x - 1.05) / RADIUS)];
}
export function roofHeight(lane) {
  return SPRING + Math.sqrt(RADIUS * RADIUS - ((lane - 1) * LANE_WIDTH) ** 2);
}
export function roofSlabGeometry(lane) {
  const geometry = archShell(COLLAPSE_DEPTH, ...roofAngles(lane));
  geometry.translate(-(lane - 1) * LANE_WIDTH, -roofHeight(lane), COLLAPSE_DEPTH / 2);
  return geometry;
}

function random(seed) {
  let value = seed;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Each set is created once and shared by every cullable section. No downloaded art.
function surfaceTextures(canvases) {
  const textures = canvases.map((canvas, index) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
    if (index === 0) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  return { map: textures[0], bumpMap: textures[1], roughnessMap: textures[2] };
}

function surfaceCanvases(size = 512) {
  return Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; return canvas;
  });
}

/** Original ashlar and paving: thin recessed joints, chipped edges and mineral grain. */
export function masonrySurface(floor = false) {
  const canvases = surfaceCanvases(), [ctx, relief, rough] = canvases.map(canvas => canvas.getContext('2d'));
  const rng = random(floor ? 711 : 428);
  ctx.fillStyle = floor ? '#535957' : '#6a6c61'; ctx.fillRect(0, 0, 512, 512);
  relief.fillStyle = '#545454'; relief.fillRect(0, 0, 512, 512);
  rough.fillStyle = '#ededed'; rough.fillRect(0, 0, 512, 512);
  const rows = floor ? 5 : 6, columns = 4, h = 512 / rows;
  for (let row = 0; row < rows; row++) {
    // Variable block lengths stop the masonry reading as a mechanical brick grid.
    const widths = Array.from({ length: columns }, () => .78 + rng() * .46);
    const total = widths.reduce((sum, width) => sum + width, 0);
    let left = row % 2 ? -61 : -9;
    for (const weight of widths) {
      const w = weight / total * 512, y = row * h;
      const margin = .85 + rng() * .7, shade = Math.floor(rng() * 25) - 10;
      const corners = Array.from({ length: 8 }, () => 1.5 + rng() * 3.5);
      const grainSeed = Math.floor(rng() * 65536);
      // Wrapped copies retain identical grain and chipped edges at the tile seam.
      for (const x of [left - 512, left, left + 512]) {
        if (x + w < 0 || x > 512) continue;
        const grain = random(grainSeed);
        const path = context => {
          context.beginPath(); context.moveTo(x + margin + corners[0], y + margin);
          context.lineTo(x + w - margin - corners[1], y + margin);
          context.lineTo(x + w - margin, y + margin + corners[2]);
          context.lineTo(x + w - margin, y + h - margin - corners[3]);
          context.lineTo(x + w - margin - corners[4], y + h - margin);
          context.lineTo(x + margin + corners[5], y + h - margin);
          context.lineTo(x + margin, y + h - margin - corners[6]);
          context.lineTo(x + margin, y + margin + corners[7]); context.closePath();
        };
        path(ctx);
        const gradient = ctx.createLinearGradient(x, y, x + w * .18, y + h);
        const base = (floor ? 112 : 150) + shade, warmth = floor ? -3 : 8;
        gradient.addColorStop(0, `rgb(${base + warmth + 7},${base + 8},${base - 2})`);
        gradient.addColorStop(.2, `rgb(${base + warmth},${base},${base - 9})`);
        gradient.addColorStop(1, `rgb(${base + warmth - 10},${base - 8},${base - 15})`);
        ctx.fillStyle = gradient; ctx.fill();
        path(relief); relief.fillStyle = `rgb(${190 + shade},${190 + shade},${190 + shade})`; relief.fill();
        relief.strokeStyle = '#8f8f8f'; relief.lineWidth = 2.5; relief.stroke();
        path(rough); rough.fillStyle = floor && grain() < .22 ? '#929292' : '#d8d8d8'; rough.fill();
        ctx.save(); path(ctx); ctx.clip();
        for (let n = 0; n < 150; n++) {
          const gx = x + grain() * w, gy = y + grain() * h, gw = .5 + grain() * 3.2;
          ctx.fillStyle = n % 3 ? '#263d4315' : '#fff2c521'; ctx.fillRect(gx, gy, gw, .4 + grain() * 1.1);
          if (n % 4 === 0) { relief.fillStyle = '#7a7a7a28'; relief.fillRect(gx, gy, gw, .7); }
        }
        if (grain() < .18) {
          const cx = x + w * (.2 + grain() * .55);
          for (const context of [ctx, relief]) {
            context.strokeStyle = context === ctx ? '#434c425c' : '#878787'; context.lineWidth = .75;
            context.beginPath(); context.moveTo(cx, y + margin); context.lineTo(cx - 4, y + h * .23);
            context.lineTo(cx + 2, y + h * .38); context.lineTo(cx - 6, y + h * .62); context.stroke();
          }
        }
        ctx.restore();
      }
      left += w;
    }
  }
  // Low-frequency mineral blooms and damp runs cross joints as well as block faces.
  for (let i = 0; i < 30; i++) {
    const x = rng() * 512, y = rng() * 512, radius = 22 + rng() * 90;
    const stain = ctx.createRadialGradient(x, y, 1, x, y, radius);
    stain.addColorStop(0, i % 3 ? '#233c3c1b' : '#ae87452a'); stain.addColorStop(1, '#17313a00');
    ctx.fillStyle = stain; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return surfaceTextures(canvases);
}

// Dressed arch stone has its own scale: no miniature brickwork on a narrow coping.
function dressedStoneSurface() {
  const canvases = surfaceCanvases(256), [ctx, relief, rough] = canvases.map(canvas => canvas.getContext('2d'));
  const rng = random(921);
  ctx.fillStyle = '#c2bdab'; ctx.fillRect(0, 0, 256, 256);
  relief.fillStyle = '#b9b9b9'; relief.fillRect(0, 0, 256, 256);
  rough.fillStyle = '#d5d5d5'; rough.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2800; i++) {
    const x = rng() * 256, y = rng() * 256, w = .5 + rng() * 2.5;
    ctx.fillStyle = i % 4 ? '#4b564819' : '#fff1c52b'; ctx.fillRect(x, y, w, .5 + rng() * 1.6);
    relief.fillStyle = i % 4 ? '#77777722' : '#eeeeee33'; relief.fillRect(x, y, w, 1);
  }
  for (let i = 0; i < 24; i++) {
    const x = rng() * 256, y = rng() * 256, r = 20 + rng() * 60;
    const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, '#536b5526'); stain.addColorStop(1, '#536b5500');
    ctx.fillStyle = stain; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return surfaceTextures(canvases);
}

// Shared desaturated wear map lets iron and bronze retain distinct base colours.
function agedMetalSurface() {
  const canvases = surfaceCanvases(128), [ctx, relief, rough] = canvases.map(canvas => canvas.getContext('2d'));
  const rng = random(1847);
  ctx.fillStyle = '#b7b6a5'; ctx.fillRect(0, 0, 128, 128);
  relief.fillStyle = '#aaaaaa'; relief.fillRect(0, 0, 128, 128);
  rough.fillStyle = '#a4a4a4'; rough.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 430; i++) {
    const x = rng() * 128, y = rng() * 128, w = .3 + rng() * 2.3, h = 1 + rng() * 19;
    ctx.fillStyle = i % 3 ? '#3f625b2c' : '#7b4e323d'; ctx.fillRect(x, y, w, h);
    relief.fillStyle = '#77777744'; relief.fillRect(x, y, w, h);
    rough.fillStyle = '#ededed66'; rough.fillRect(x, y, w, h);
  }
  return surfaceTextures(canvases);
}

function railwayPlaqueTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#193c44'; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#d0c7a4'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, 492, 140);
  ctx.fillStyle = '#f0dfb4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 39px Georgia, serif'; ctx.fillText('KING’S REACH', 256, 63);
  ctx.font = '18px sans-serif'; ctx.fillText('LONDON  ·  SERVICE RAILWAY  ·  1894', 256, 111);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
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
  const root = new THREE.Group(); root.name = 'Weathered railway / covered escape tunnel'; scene.add(root);
  const length = courseLength * DISTANCE_SCALE;
  const masonry = masonrySurface(), paving = masonrySurface(true), dressed = dressedStoneSurface(), metal = agedMetalSurface();
  const stone = new THREE.MeshStandardMaterial({ color: '#c2c6b9', ...masonry, bumpScale: .072, roughness: .95, side: THREE.DoubleSide });
  const floor = new THREE.MeshStandardMaterial({ color: '#a8b5b2', ...paving, bumpScale: .035, roughness: .91 });
  const trim = new THREE.MeshStandardMaterial({ color: '#c8c5ac', ...dressed, bumpScale: .028, roughness: .9 });
  const worn = new THREE.MeshStandardMaterial({ color: '#8e9c8b', ...dressed, bumpScale: .045, roughness: .98 });
  const iron = new THREE.MeshStandardMaterial({ color: '#516663', ...metal, bumpScale: .012, roughness: .72, metalness: .64 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c4a66c', ...metal, bumpScale: .009, roughness: .6, metalness: .72 });
  const rail = new THREE.MeshStandardMaterial({ color: '#adc2c0', roughness: .31, metalness: .86 });
  const timber = new THREE.MeshStandardMaterial({ color: '#484338', roughness: .98 });
  const amber = new THREE.MeshBasicMaterial({ color: '#ffd69b', toneMapped: false });
  const dark = new THREE.MeshStandardMaterial({ color: '#162e3a', roughness: .82 });
  const boxGeometry = beveledBoxGeometry(.055), flatBox = new THREE.BoxGeometry(1, 1, 1);
  const rubbleGeometry = new THREE.IcosahedronGeometry(1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const valveGeometry = new THREE.TorusGeometry(.18, .025, 6, 16), plaqueGeometry = new THREE.PlaneGeometry(1.9, .59);
  const plaqueMaterial = new THREE.MeshStandardMaterial({ map: railwayPlaqueTexture(), roughness: .52, metalness: .2 });
  const object = new THREE.Object3D(), sections = [], rng = random(19);
  const cableMaterial = new THREE.MeshStandardMaterial({ color: '#283b42', roughness: .55, metalness: .45 });
  function mesh(parent, geometry, material, x, y, z) {
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); parent.add(item); return item;
  }
  function curve(parent, points, material, radius = .035) {
    return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 18, radius, 5, false), material, 0, 0, 0);
  }
  for (let index = 0; index < Math.ceil((length + 18) / SECTION_LENGTH); index++) {
    const section = new THREE.Group(); section.position.z = 12 - index * SECTION_LENGTH;
    section.name = `Tunnel section ${index}`; root.add(section); sections.push(section);
    const damaged = index % 4 === 2 || (index > 2 && index % 6 === 4);
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
      // One horizontal course ties the piers together, above the service walkway.
      box(worn, side * 4.66, .74, -9, .12, .15, 18);
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
        instance(cylinder, iron, side * 4.48, 2.1, -12.35, .055, 1.8, .055);
        const valve = mesh(section, valveGeometry, brass, side * 4.26, 1.7, -12.35);
        valve.rotation.y = side * Math.PI / 2;
        box(brass, side * 4.26, 1.7, -12.35, .045, .32, .035);
        box(brass, side * 4.26, 1.7, -12.35, .045, .035, .32);
      }
      if (index % 5 === 0 && side === (index % 2 ? 1 : -1)) {
        box(brass, side * 4.62, 2.15, -6.55, .07, .66, 1.97);
        const plaque = mesh(section, plaqueGeometry, plaqueMaterial, side * 4.565, 2.15, -6.55);
        plaque.rotation.y = -side * Math.PI / 2;
        // Fasteners and a shallow projecting frame sell enamel fixed to masonry.
        for (const dz of [-.86, .86]) for (const y of [1.94, 2.36]) box(brass, side * 4.54, y, -6.55 + dz, .035, .035, .035);
      }
      // Sagging cable silhouette is visible against lit masonry; stays above the platform.
      curve(section, [[side * 4.23, 3.55, -.3], [side * 4.12, damaged ? 2.55 : 3.1, -4.8], [side * 4.26, 3.48, -9.4], [side * 4.07, 3.05, -14], [side * 4.2, 3.52, -18]], cableMaterial, .025);
      for (let n = 0; n < (damaged ? 14 : 5); n++) {
        const s = .08 + rng() * .17;
        instance(rubbleGeometry, n % 2 ? worn : trim, side * (4.08 + rng() * .5), s * .4, -rng() * 18, s * 1.5, s, s, rng(), rng() * 3);
      }
    }
    for (const x of [-3.85, -1.2, 1.2, 3.85]) {
      // Slim rails guide the three lanes while leaving paving visually dominant.
      box(timber, x, -.045, -9, .18, .035, 18);
      instance(flatBox, iron, x, -.015, -9, .09, .055, 18);
      instance(flatBox, rail, x, .012, -9, .055, .04, 18);
      for (let z = -.7; z > -18; z -= 2.5) box(iron, x, -.015, z, .27, .055, .11);
    }
    for (const { geometry, material, matrices, colors } of batches.values()) {
      const instances = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, i) => { instances.setMatrixAt(i, matrix); instances.setColorAt(i, colors[i]); });
      instances.receiveShadow = material === trim || material === worn; instances.computeBoundingSphere(); section.add(instances);
    }
    mergeStaticSurfaces(section);
  }

  // Split only the roof panels that can collapse. The rest stays intact.
  // Dynamic pieces are added after static merging so they can actually leave
  // holes rather than drawing a falling rock beneath an unbroken ceiling.
  let roofKey = '', roofGroups = [], collapsePanels = new Map();
  function prepareRoof(events) {
    const key = events.map(event => `${event.id}:${event.lane}:${event.z}`).join('|');
    if (roofGroups.length && key === roofKey) return;
    roofKey = key;
    for (const group of roofGroups) {
      group.traverse(item => item.geometry?.dispose());
      group.removeFromParent();
    }
    roofGroups = []; collapsePanels = new Map();
    const holes = events.map(event => ({ ...event, worldZ: -event.z * DISTANCE_SCALE, angles: roofAngles(event.lane) }));
    function piece(group, geometry, material, z, hole) {
      const item = mesh(group, geometry, material, 0, 0, z);
      if (hole) {
        if (!collapsePanels.has(hole.id)) collapsePanels.set(hole.id, []);
        collapsePanels.get(hole.id).push(item);
      }
    }
    function arcs(hole) {
      return hole ? [[0, hole.angles[0]], hole.angles, [hole.angles[1], Math.PI]] : [[0, Math.PI]];
    }
    for (const section of sections) {
      const group = new THREE.Group(); section.add(group); roofGroups.push(group);
      const start = section.position.z, end = start - SECTION_LENGTH;
      const nearby = holes.filter(h => h.worldZ + COLLAPSE_DEPTH / 2 > end && h.worldZ - COLLAPSE_DEPTH / 2 < start);
      const cuts = [start, end, ...nearby.flatMap(h => [Math.min(start, h.worldZ + COLLAPSE_DEPTH / 2), Math.max(end, h.worldZ - COLLAPSE_DEPTH / 2)])].sort((a, b) => b - a);
      for (let i = 0; i < cuts.length - 1; i++) {
        const depth = cuts[i] - cuts[i + 1];
        if (depth < .0001) continue;
        const mid = (cuts[i] + cuts[i + 1]) / 2;
        const hole = nearby.find(h => Math.abs(h.worldZ - mid) < COLLAPSE_DEPTH / 2);
        for (const [a, b] of arcs(hole)) {
          piece(group, archShell(depth, a, b), stone, cuts[i] - start, hole && a === hole.angles[0] ? hole : null);
        }
      }
      for (const z of [-.4, -9.4]) {
        const hole = nearby.find(h => Math.abs(h.worldZ - (start + z)) < COLLAPSE_DEPTH / 2 + .23);
        for (const [a, b] of arcs(hole)) piece(group, archRibGeometry(a, b), trim, z, hole && a === hole.angles[0] ? hole : null);
      }
    }
  }

  // Daylight and the clocktower remain ahead through the tunnel mouth.
  // The crown stays intact above the runner all the way to the finish.
  const city = new THREE.Group(); city.name = 'Exit clocktower'; city.position.z = -length; root.add(city);
  const cityStone = new THREE.MeshStandardMaterial({ color: '#f0dfb9', ...dressed, bumpScale: .022, roughness: .83, fog: false });
  const cityShade = new THREE.MeshStandardMaterial({ color: '#a99b7c', ...dressed, bumpScale: .025, roughness: .89, fog: false });
  const cityRoof = new THREE.MeshStandardMaterial({ color: '#527878', ...metal, bumpScale: .008, roughness: .58, metalness: .3, fog: false });
  const cityMetal = brass.clone(); cityMetal.fog = false;
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
  cityBox(cityShade, towerX, 18.35, towerZ, 7.55, .22, 7.55);
  cityBox(cityStone, towerX, 22.4, towerZ, 7.65, .3, 7.65);
  cityBox(cityRoof, towerX, 22.7, towerZ, 7.9, .45, 7.9);
  for (const x of [-2.9, 2.9]) {
    cityBox(cityStone, x, 11.5, -42.75, .43, 18.9, .38);
    for (const z of [-42.7, -49.3]) {
      cityBox(cityStone, x, 23.4, z, .64, 2.5, .64);
      const pinnacle = mesh(city, new THREE.ConeGeometry(.53, 2.25, 6), cityRoof, x, 25.65, z); pinnacle.rotation.y = Math.PI / 6;
    }
  }
  const spire = mesh(city, new THREE.ConeGeometry(4.5, 8.5, 4), cityRoof, 0, 27.1, towerZ); spire.rotation.y = Math.PI / 4;
  cityBox(cityMetal, 0, 32.1, towerZ, .1, 1.7, .1);
  for (const x of [-2.55, 2.55]) {
    cityBox(cityShade, x, 20.4, -42.27, .15, 3.3, .2);
    cityBox(cityStone, x, 18.85, -42.17, .4, .24, .36);
    cityBox(cityStone, x, 21.95, -42.17, .4, .24, .36);
  }
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
  cc.fillStyle = '#465653'; cc.font = 'bold 19px Georgia, serif'; cc.textAlign = 'center'; cc.textBaseline = 'middle';
  for (const [label, x, y] of [['XII', 128, 52], ['III', 204, 129], ['VI', 128, 206], ['IX', 51, 129]]) cc.fillText(label, x, y);
  cc.lineWidth = 7; cc.lineCap = 'round'; cc.beginPath(); cc.moveTo(89, 96); cc.lineTo(128, 128); cc.lineTo(170, 57); cc.stroke();
  cc.beginPath(); cc.arc(128, 128, 6, 0, Math.PI * 2); cc.fill();
  const clockMap = new THREE.CanvasTexture(clockCanvas); clockMap.colorSpace = THREE.SRGBColorSpace;
  const clock = mesh(city, new THREE.CircleGeometry(1.64, 48), new THREE.MeshBasicMaterial({ map: clockMap, fog: false }), 0, 20.4, -42.3);
  const clockRim = mesh(city, new THREE.TorusGeometry(1.68, .11, 8, 48), cityMetal, 0, 20.4, -42.28);
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, x = side * (9 + Math.floor(i / 2) * 7.5), h = 6 + rng() * 7, z = -38 - rng() * 14;
    cityBox(i % 3 ? cityStone : cityShade, x, h / 2, z, 6.1, h, 7.2);
    cityBox(cityStone, x, h - .14, z, 6.35, .27, 7.45);
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
  const overheadSky = mesh(root, new THREE.PlaneGeometry(400, length + 400), new THREE.MeshBasicMaterial({ color: '#91cde9', fog: false }), 0, 24, -length / 2);
  overheadSky.rotation.x = Math.PI / 2;
  const haloMaterial = new THREE.SpriteMaterial({ map: radialTexture(), color: '#ffe2a5', transparent: true, opacity: .19, depthWrite: false, fog: false, toneMapped: false });
  const halo = new THREE.Sprite(haloMaterial); halo.position.set(-9, 9, -length - 12); halo.scale.set(28, 25, 1); root.add(halo);

  mergeStaticSurfaces(city);

  const dustPositions = new Float32Array(72 * 3);
  for (let i = 0; i < 72; i++) { dustPositions[i * 3] = (rng() - .5) * 8; dustPositions[i * 3 + 1] = .3 + rng() * 6; dustPositions[i * 3 + 2] = -rng() * 68; }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#dcd2ac', size: .025, map: radialTexture(), transparent: true, opacity: .3, depthWrite: false }));
  dust.name = 'Local dust / bounded 72 particles'; scene.add(dust);

  return {
    update(distance, elapsed, reducedMotion, events = []) {
      prepareRoof(events);
      for (const event of events) {
        for (const panel of collapsePanels.get(event.id) || []) {
          panel.visible = elapsed < event.fallAt;
          const cracking = elapsed >= event.warnAt && panel.visible;
          const crack = cracking ? THREE.MathUtils.clamp((elapsed - event.warnAt) / Math.max(.01, event.fallAt - event.warnAt), 0, 1) : 0;
          panel.scale.x = 1 - crack * .12;
          panel.position.x = (event.lane - 1) * LANE_WIDTH * crack * .12;
          panel.position.y = !reducedMotion && cracking
            ? Math.sin((elapsed - event.warnAt) * 35) * .025 : 0;
        }
      }
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
