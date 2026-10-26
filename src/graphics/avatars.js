import * as THREE from 'three';

// Original, texture-free character meshes. All dimensions are cosmetic: the
// simulation owns collisions, and the renderer owns world position / jump height.
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function sectionGeometry(rings, segments = 20) {
  const positions = [];
  const indices = [];
  const ascending = rings.at(-1)[0] > rings[0][0];
  for (const [y, width, depth, centerZ = 0] of rings) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * TAU;
      positions.push(Math.cos(angle) * width, y, Math.sin(angle) * depth + centerZ);
    }
  }
  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + segments + 1;
      if (ascending) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let row = 0; row < rings.length; row += 1) {
    const first = row * (segments + 1);
    const last = first + segments;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return geometry;
}

function roundedPanel(width, height, depth, radius = 0.025) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelSize: 0.005,
    bevelThickness: 0.004, bevelSegments: 2, curveSegments: 4,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// Build into temporary material buckets, then merge each rigid piece. Fine hair,
// stitching and buckles do not each cost a draw call, even for four players.
function createBuilder(ghost, color) {
  const buckets = new Map();
  const geometries = new Set();
  const materials = new Set();
  const identity = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const accentColor = new THREE.Color(color ?? '#61d9d2');

  function material(hex, { metal = 0, roughness = 0.78, accent = false } = {}) {
    const tint = new THREE.Color(hex);
    if (accent) tint.copy(accentColor);
    else if (ghost) tint.lerp(accentColor, 0.18);
    const result = new THREE.MeshStandardMaterial({
      color: tint, roughness, metalness: ghost ? metal * 0.25 : metal,
      transparent: ghost, opacity: ghost ? 0.42 : 1,
      depthWrite: !ghost, depthTest: true,
    });
    if (ghost) {
      result.emissive.copy(tint).multiplyScalar(0.13);
      result.roughness = 0.75;
    }
    materials.add(result);
    return result;
  }

  function add(parent, geometry, material, at = [0, 0, 0], size = [1, 1, 1], rotation = [0, 0, 0]) {
    position.fromArray(at);
    scale.fromArray(size);
    quaternion.setFromEuler(new THREE.Euler(...rotation));
    matrix.compose(position, quaternion, scale);
    geometry.applyMatrix4(matrix);
    if (!buckets.has(parent)) buckets.set(parent, new Map());
    const byMaterial = buckets.get(parent);
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(geometry);
  }

  function ellipsoid(parent, material, at, size, rotation) {
    add(parent, new THREE.SphereGeometry(1, 16, 12), material, at, size, rotation);
  }

  function tube(parent, material, points, radius = 0.006, segments = 12) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    add(parent, new THREE.TubeGeometry(curve, segments, radius, 5, false), material);
  }

  function band(parent, material, start, end, width, depth = 0.012) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const delta = b.clone().sub(a);
    const geometry = roundedPanel(width, delta.length(), depth, Math.min(width / 4, 0.009));
    quaternion.setFromUnitVectors(UP, delta.normalize());
    matrix.compose(a.add(b).multiplyScalar(0.5), quaternion, identity);
    geometry.applyMatrix4(matrix);
    add(parent, geometry, material);
  }

  function finish() {
    for (const [parent, byMaterial] of buckets) {
      for (const [material, pieces] of byMaterial) {
        const flat = pieces.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry);
        const length = flat.reduce((sum, geometry) => sum + geometry.attributes.position.array.length, 0);
        const vertices = new Float32Array(length);
        const normals = new Float32Array(length);
        let offset = 0;
        for (const geometry of flat) {
          vertices.set(geometry.attributes.position.array, offset);
          normals.set(geometry.attributes.normal.array, offset);
          offset += geometry.attributes.position.array.length;
          geometry.dispose();
        }
        for (const geometry of pieces) geometry.dispose();
        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = !ghost;
        mesh.receiveShadow = !ghost;
        mesh.name = `${parent.name || 'avatar'}-detail`;
        parent.add(mesh);
        geometries.add(merged);
      }
    }
    buckets.clear();
  }

  return {
    material, add, ellipsoid, tube, band, finish,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear();
      materials.clear();
    },
  };
}

function joint(parent, name, at) {
  const group = new THREE.Group();
  group.name = name;
  group.position.fromArray(at);
  parent.add(group);
  return group;
}

function makeFace(builder, head, palette, engineer) {
  const { add, ellipsoid, tube } = builder;
  ellipsoid(head, palette.skin, [0, 0.18, 0], [engineer ? 0.108 : 0.1, 0.139, 0.096]);
  ellipsoid(head, palette.skin, [0, 0.105, -0.009], [engineer ? 0.086 : 0.069, 0.065, 0.074]);
  ellipsoid(head, palette.skin, [0, 0.04, 0.009], [0.055, 0.069, 0.052]);
  for (const side of [-1, 1]) {
    ellipsoid(head, palette.skin, [side * 0.102, 0.175, 0.001], [0.021, 0.034, 0.018]);
    ellipsoid(head, palette.skinShade, [side * 0.111, 0.175, -0.009], [0.009, 0.019, 0.005]);
    ellipsoid(head, palette.ivory, [side * 0.043, 0.204, -0.083], [0.029, 0.015, 0.011]);
    ellipsoid(head, palette.eye, [side * 0.042, 0.204, -0.094], [0.009, 0.011, 0.003]);
    ellipsoid(head, palette.ivory, [side * 0.044 - 0.003, 0.209, -0.097], [0.0028, 0.003, 0.001]);
    tube(head, palette.hair, [[side * 0.019, 0.229, -0.083], [side * 0.043, 0.235, -0.09], [side * 0.07, 0.225, -0.077]], 0.005, 8);
    if (!engineer) {
      tube(head, palette.hair, [[side * 0.021, 0.211, -0.091], [side * 0.047, 0.219, -0.095], [side * 0.073, 0.212, -0.083]], 0.003, 8);
      add(head, new THREE.TorusGeometry(0.014, 0.003, 5, 14), palette.brass, [side * 0.108, 0.143, -0.002], [1, 1, 1], [0, Math.PI / 2, 0]);
    }
  }
  ellipsoid(head, palette.skin, [0, 0.178, -0.095], [0.016, 0.029, 0.021]);
  tube(head, palette.skinShade, [[-0.024, 0.131, -0.078], [0, 0.128, -0.086], [0.023, 0.133, -0.079]], 0.0035, 10);
  if (engineer) {
    // Close-cropped stubble frames the jaw, leaving the mouth and cheeks visible.
    for (let index = 0; index < 17; index += 1) {
      const angle = Math.PI * (0.13 + index / 16 * 0.74);
      ellipsoid(head, palette.stubble, [Math.cos(angle) * 0.079, 0.114 - Math.sin(angle) * 0.023, -0.045 - Math.sin(angle) * 0.027], [0.014, 0.018, 0.006]);
    }
    for (const side of [-1, 1]) {
      for (let index = 0; index < 5; index += 1) {
        ellipsoid(head, palette.freckle, [side * (0.038 + index * 0.009), 0.174 + Math.sin(index * 2.4) * 0.008, -0.083 + index * 0.004], [0.002, 0.002, 0.0015]);
      }
    }
  }
}

function makeCourierHair(builder, head, palette) {
  const { add, ellipsoid, tube } = builder;
  ellipsoid(head, palette.hair, [0, 0.251, 0.022], [0.11, 0.092, 0.098]);
  ellipsoid(head, palette.hair, [0, 0.195, 0.061], [0.103, 0.09, 0.06]);
  for (let index = 0; index < 14; index += 1) {
    const angle = index / 14 * TAU;
    ellipsoid(head, index % 3 ? palette.hair : palette.hairLight,
      [Math.cos(angle) * 0.086, 0.263 + Math.sin(angle * 3) * 0.014, Math.sin(angle) * 0.073 + 0.018],
      [0.036, 0.05, 0.03], [Math.sin(angle) * 0.5, angle, Math.cos(angle) * 0.5]);
  }
  const pony = joint(head, 'courier-high-curly-ponytail', [0, 0.286, 0.092]);
  ellipsoid(pony, palette.hair, [0, -0.05, 0.052], [0.087, 0.115, 0.076]);
  add(pony, new THREE.TorusGeometry(0.042, 0.008, 6, 16), palette.teal, [0, 0, 0], [1, 1, 1], [Math.PI / 2.3, 0, 0]);
  for (let strand = 0; strand < 18; strand += 1) {
    const angle = strand / 18 * TAU;
    const radius = 0.042 + (strand % 3) * 0.018;
    const length = 0.16 + (strand % 5) * 0.024;
    const points = [];
    for (let step = 0; step <= 38; step += 1) {
      const t = step / 38;
      const curl = t * TAU * 3.2 + angle;
      points.push([
        Math.cos(angle) * radius * (0.6 + 0.55 * Math.sin(t * Math.PI)) + Math.cos(curl) * 0.014,
        0.025 - t * length + Math.sin(curl) * 0.012,
        0.02 + Math.sin(angle) * radius * 0.6 + t * 0.12 + Math.sin(curl + 0.7) * 0.014,
      ]);
    }
    tube(pony, strand % 4 ? palette.hair : palette.hairLight, points, 0.011, 42);
  }
  for (const side of [-1, 1]) {
    const points = [];
    for (let index = 0; index <= 16; index += 1) {
      const t = index / 16;
      points.push([side * (0.084 + Math.sin(t * TAU * 1.8) * 0.011), 0.276 - t * 0.145, -0.038 - Math.cos(t * TAU * 1.8) * 0.013]);
    }
    tube(head, palette.hair, points, 0.008, 24);
  }
  return pony;
}

function makeEngineerHair(builder, head, palette) {
  const { add, ellipsoid, tube } = builder;
  ellipsoid(head, palette.hair, [0, 0.269, 0.012], [0.112, 0.065, 0.103]);
  ellipsoid(head, palette.hair, [0, 0.215, 0.071], [0.1, 0.057, 0.038]);
  for (let tuft = 0; tuft < 15; tuft += 1) {
    const angle = tuft / 15 * TAU;
    ellipsoid(head, tuft % 3 ? palette.hair : palette.hairLight,
      [Math.cos(angle) * 0.077, 0.289 + (tuft % 3) * 0.009, Math.sin(angle) * 0.065],
      [0.027, 0.052, 0.022], [0.23, angle * 0.5, -0.5]);
  }
  for (const side of [-1, 1]) {
    ellipsoid(head, palette.hair, [side * 0.1, 0.218, -0.006], [0.014, 0.034, 0.028]);
  }
  const strapPoints = [];
  for (let index = 0; index <= 32; index += 1) {
    const a = index / 32 * TAU;
    strapPoints.push([Math.cos(a) * 0.113, 0.267, Math.sin(a) * 0.102]);
  }
  tube(head, palette.leather, strapPoints, 0.009, 40);
  for (const side of [-1, 1]) {
    add(head, new THREE.TorusGeometry(0.035, 0.008, 7, 18), palette.brass, [side * 0.047, 0.274, -0.103]);
    add(head, new THREE.CylinderGeometry(0.029, 0.029, 0.009, 16), palette.lens, [side * 0.047, 0.274, -0.105], [1, 1, 1], [Math.PI / 2, 0, 0]);
    tube(head, palette.ivory, [[side * 0.047 - 0.01, 0.279, -0.112], [side * 0.047 - 0.005, 0.287, -0.112]], 0.002, 4);
  }
  builder.band(head, palette.brass, [-0.012, 0.275, -0.11], [0.012, 0.275, -0.11], 0.011);
}

function makeLeg(builder, rig, palette, side, engineer) {
  const { add, ellipsoid, tube } = builder;
  const hip = joint(rig, `${side < 0 ? 'left' : 'right'}-hip`, [side * (engineer ? 0.125 : 0.102), 0.88, 0]);
  const width = engineer ? 0.09 : 0.075;
  add(hip, sectionGeometry([
    [0.035, 0, 0], [0.025, width * 0.85, 0.077], [-0.06, width * 1.13, 0.087],
    [-0.23, width * 0.91, 0.073], [-0.36, width * 0.76, 0.066], [-0.39, 0, 0],
  ]), palette.trousers);
  tube(hip, palette.seam, [[side * width, -0.055, 0.016], [side * width * 0.94, -0.22, 0.01], [side * width * 0.74, -0.35, 0.012]], 0.0025);
  if (engineer) {
    add(hip, roundedPanel(0.095, 0.11, 0.025, 0.012), palette.vest, [side * 0.052, -0.19, 0.071], [1, 1, 1], [0, side * 0.25, 0]);
    add(hip, roundedPanel(0.099, 0.035, 0.028, 0.008), palette.leather, [side * 0.052, -0.143, 0.073]);
    ellipsoid(hip, palette.brass, [side * 0.052, -0.146, 0.091], [0.008, 0.008, 0.003]);
  }
  const knee = joint(hip, 'knee', [0, -0.37, 0]);
  add(knee, sectionGeometry([
    [0.025, 0, 0], [0.012, width * 0.78, 0.064], [-0.1, width * 0.88, 0.068],
    [-0.23, width * 0.66, 0.055], [-0.31, width * 0.62, 0.052], [-0.33, 0, 0],
  ]), palette.trousers);
  const ankle = joint(knee, 'boot', [0, -0.36, 0]);
  add(ankle, sectionGeometry([
    [-0.1, 0, 0], [-0.09, 0.065, 0.067], [0.01, 0.062, 0.062],
    [0.13, 0.071, 0.07], [0.155, 0.072, 0.07], [0.158, 0, 0],
  ]), palette.leather);
  ellipsoid(ankle, palette.leather, [0, -0.074, -0.053], [engineer ? 0.086 : 0.077, 0.065, 0.143]);
  ellipsoid(ankle, palette.sole, [0, -0.124, -0.049], [engineer ? 0.089 : 0.08, 0.026, 0.147]);
  add(ankle, sectionGeometry([[0.111, 0.074, 0.074], [0.152, 0.075, 0.074]]), palette.leatherLight);
  for (let lace = 0; lace < 4; lace += 1) {
    const y = 0.085 - lace * 0.045;
    tube(ankle, palette.seam, [[-0.025, y + 0.014, -0.063], [0.025, y - 0.006, -0.068]], 0.0025, 4);
    tube(ankle, palette.seam, [[0.025, y + 0.014, -0.063], [-0.025, y - 0.006, -0.068]], 0.0025, 4);
  }
  return { hip, knee, ankle };
}

function makeArm(builder, body, palette, side, engineer) {
  const { add, ellipsoid } = builder;
  const shoulder = joint(body, `${side < 0 ? 'left' : 'right'}-shoulder`, [side * (engineer ? 0.258 : 0.22), 0.414, 0]);
  const width = engineer ? 0.092 : 0.072;
  add(shoulder, sectionGeometry([
    [0.025, 0, 0], [0.012, width * 0.8, width * 0.9], [-0.04, width, width],
    [-0.18, width * 0.79, width * 0.8], [-0.245, width * 0.72, width * 0.72], [-0.25, 0, 0],
  ]), palette.shirt);
  const elbow = joint(shoulder, 'elbow', [0, -0.245, 0]);
  add(elbow, sectionGeometry([
    [0.015, 0, 0], [0.01, width * 0.69, width * 0.68], [-0.045, width * 0.75, width * 0.74],
    [-0.19, width * 0.48, width * 0.5], [-0.225, width * 0.45, width * 0.48], [-0.235, 0, 0],
  ]), palette.skin);
  add(elbow, sectionGeometry([[0.006, width * 0.81, width * 0.82], [-0.05, width * 0.86, width * 0.84]]), engineer ? palette.goldLight : palette.ivory);
  ellipsoid(elbow, palette.skin, [0, -0.262, -0.009], [0.041, 0.062, 0.028]);
  ellipsoid(elbow, palette.skin, [-side * 0.033, -0.247, -0.022], [0.016, 0.035, 0.016], [0.1, 0, -side * 0.45]);
  if (engineer) {
    add(elbow, sectionGeometry([[-0.19, width * 0.54, width * 0.56], [-0.221, width * 0.54, width * 0.56]]), palette.burgundy);
  } else {
    ellipsoid(elbow, palette.vest, [0, -0.245, -0.004], [0.043, 0.042, 0.029]);
    if (side > 0) {
      add(elbow, new THREE.CylinderGeometry(0.024, 0.024, 0.01, 16), palette.brass, [0, -0.2, 0.034], [1, 1, 1], [Math.PI / 2, 0, 0]);
      add(elbow, new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), palette.ivory, [0, -0.2, 0.038], [1, 1, 1], [Math.PI / 2, 0, 0]);
    }
  }
  return { shoulder, elbow };
}

function makeCourierClothes(builder, body, palette) {
  const { add, ellipsoid, tube, band } = builder;
  add(body, sectionGeometry([
    [-0.035, 0, 0], [-0.025, 0.17, 0.106], [0.09, 0.142, 0.092],
    [0.25, 0.16, 0.103], [0.4, 0.212, 0.114], [0.455, 0.194, 0.104], [0.49, 0.1, 0.073], [0.491, 0, 0],
  ]), palette.shirt);
  add(body, sectionGeometry([[0.392, 0.215, 0.117], [0.451, 0.199, 0.111], [0.485, 0.111, 0.08]]), palette.ivory);
  band(body, palette.pale, [0, 0.17, -0.106], [0, 0.428, -0.113], 0.101);
  for (const side of [-1, 1]) {
    band(body, palette.burgundy, [side * 0.04, 0.34, -0.12], [side * 0.094, 0.45, -0.118], 0.042);
    tube(body, palette.seam, [[side * 0.092, 0.374, 0.107], [side * 0.079, 0.19, 0.092], [side * 0.101, -0.014, 0.105]], 0.0025);
    for (let button = 0; button < 3; button += 1) {
      ellipsoid(body, palette.brass, [side * 0.066, 0.11 + button * 0.095, -0.109], [0.009, 0.009, 0.004]);
    }
  }
  const tails = [];
  for (const side of [-1, 1]) {
    const tail = joint(body, 'split-jacket-tail', [side * 0.078, 0.015, 0.079]);
    const shape = new THREE.Shape();
    shape.moveTo(side * -0.075, 0);
    shape.lineTo(side * 0.075, 0);
    shape.lineTo(side * 0.105, -0.183);
    shape.quadraticCurveTo(side * 0.025, -0.17, side * -0.035, -0.13);
    shape.closePath();
    const cloth = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, steps: 1 });
    add(tail, cloth, palette.burgundy, [0, 0, 0], [1, 1, 1], [0.12, side * -0.2, 0]);
    tube(tail, palette.ivory, [[side * -0.035, -0.13, 0.015], [side * 0.025, -0.163, 0.025], [side * 0.103, -0.18, 0.033]], 0.004);
    tails.push(tail);
  }
  add(body, new THREE.TorusGeometry(0.064, 0.018, 8, 20), palette.teal, [0, 0.499, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  ellipsoid(body, palette.teal, [0.025, 0.481, -0.07], [0.031, 0.026, 0.023]);
  band(body, palette.teal, [0.026, 0.481, -0.076], [0.06, 0.362, -0.127], 0.041);
  band(body, palette.teal, [0.022, 0.476, -0.079], [-0.023, 0.399, -0.132], 0.034);
  band(body, palette.leather, [-0.164, 0.453, 0.107], [0.177, -0.05, 0.12], 0.048);
  band(body, palette.leather, [-0.164, 0.453, -0.12], [0.177, -0.05, -0.12], 0.048);
  band(body, palette.brass, [-0.091, 0.366, 0.123], [-0.061, 0.323, 0.125], 0.062);
  band(body, palette.leather, [-0.09, 0.361, 0.132], [-0.064, 0.327, 0.134], 0.04);
  const bag = joint(body, 'courier-satchel', [0.22, -0.075, 0.07]);
  add(bag, roundedPanel(0.158, 0.203, 0.095, 0.028), palette.leather, [0, -0.036, 0]);
  add(bag, roundedPanel(0.166, 0.085, 0.013, 0.022), palette.leatherLight, [0, 0.018, 0.054]);
  band(bag, palette.leather, [0, 0.043, 0.066], [0, -0.095, 0.058], 0.025);
  add(bag, roundedPanel(0.038, 0.041, 0.009, 0.005), palette.brass, [0, -0.043, 0.067]);
  add(bag, roundedPanel(0.021, 0.026, 0.01, 0.003), palette.leather, [0, -0.043, 0.073]);
  tube(bag, palette.seam, [[-0.065, -0.105, 0.052], [0, -0.125, 0.052], [0.065, -0.105, 0.052]], 0.0025);
  return { tails, bag };
}

function makeEngineerClothes(builder, body, palette) {
  const { add, ellipsoid, tube, band } = builder;
  add(body, sectionGeometry([
    [-0.035, 0, 0], [-0.025, 0.183, 0.121], [0.12, 0.18, 0.116],
    [0.29, 0.214, 0.13], [0.42, 0.248, 0.134], [0.469, 0.202, 0.115], [0.495, 0.075, 0.07], [0.496, 0, 0],
  ]), palette.shirt);
  add(body, sectionGeometry([[0.016, 0.192, 0.128], [0.19, 0.195, 0.13], [0.36, 0.234, 0.139], [0.415, 0.242, 0.137]]), palette.vest);
  add(body, sectionGeometry([[0.369, 0.238, 0.141], [0.433, 0.241, 0.137], [0.468, 0.198, 0.119]]), palette.ivory);
  add(body, roundedPanel(0.231, 0.25, 0.02, 0.025), palette.trousers, [0, 0.225, -0.133]);
  add(body, roundedPanel(0.118, 0.09, 0.012, 0.012), palette.vest, [0, 0.235, -0.15]);
  tube(body, palette.seam, [[-0.052, 0.265, -0.159], [-0.052, 0.199, -0.159], [0.052, 0.199, -0.159], [0.052, 0.265, -0.159]], 0.0025);
  for (const side of [-1, 1]) {
    band(body, palette.leather, [side * 0.146, 0.447, 0.133], [side * 0.093, 0.032, 0.143], 0.039);
    band(body, palette.leather, [side * 0.153, 0.448, -0.128], [side * 0.101, 0.296, -0.15], 0.039);
    for (const [y, x, z] of [[0.359, 0.135, 0.15], [0.072, 0.098, 0.152], [0.312, 0.108, -0.17]]) {
      ellipsoid(body, palette.brass, [side * x, y, z], [0.016, 0.016, 0.004]);
    }
    tube(body, palette.seam, [[side * 0.053, 0.355, 0.142], [side * 0.05, 0.19, 0.134], [side * 0.049, 0.04, 0.131]], 0.0023);
    band(body, palette.goldLight, [side * 0.028, 0.438, -0.13], [side * 0.084, 0.475, -0.101], 0.046);
  }
  add(body, sectionGeometry([[-0.047, 0.189, 0.127], [0.004, 0.19, 0.129]]), palette.leather);
  add(body, roundedPanel(0.068, 0.053, 0.015, 0.009), palette.brass, [0, -0.021, -0.134]);
  add(body, roundedPanel(0.044, 0.031, 0.016, 0.005), palette.leather, [0, -0.021, -0.142]);
  const bag = joint(body, 'engineer-tool-pouch', [0, -0.066, 0.157]);
  add(bag, roundedPanel(0.209, 0.135, 0.063, 0.023), palette.leather, [0, -0.018, 0]);
  add(bag, roundedPanel(0.22, 0.054, 0.015, 0.011), palette.leatherLight, [0, 0.025, 0.037]);
  for (const side of [-1, 1]) {
    band(bag, palette.leather, [side * 0.068, 0.034, 0.049], [side * 0.068, -0.069, 0.042], 0.025);
    add(bag, roundedPanel(0.037, 0.031, 0.009, 0.005), palette.brass, [side * 0.068, -0.014, 0.05]);
  }
  band(body, palette.leatherLight, [0.2, -0.04, 0.012], [0.223, -0.15, 0.018], 0.046, 0.024);
  band(body, palette.brass, [0.226, -0.013, 0.026], [0.247, -0.203, 0.032], 0.018, 0.019);
  add(body, new THREE.TorusGeometry(0.026, 0.007, 6, 14), palette.brass, [0.224, -0.015, 0.03]);
  return { tails: [], bag };
}

/** Feet at y=0, front toward -Z. update() never changes group world transforms. */
export function createAvatar(avatarId, { ghost = false, color } = {}) {
  const engineer = avatarId === 'engineer';
  const builder = createBuilder(ghost, color);
  const palette = {
    skin: builder.material(engineer ? '#e2ad87' : '#a76444', { roughness: 0.8 }),
    skinShade: builder.material(engineer ? '#9b6450' : '#673d31'),
    eye: builder.material('#302c24', { roughness: 0.4 }),
    hair: builder.material(engineer ? '#8c3e23' : '#251c1b'),
    hairLight: builder.material(engineer ? '#b86131' : '#47302a'),
    stubble: builder.material('#9b6549'),
    freckle: builder.material('#9c6646'),
    shirt: builder.material(engineer ? '#bd8530' : '#752b3c'),
    burgundy: builder.material('#752b3c'),
    ivory: builder.material('#eadfc6'),
    pale: builder.material('#d1c6ab'),
    goldLight: builder.material('#d4a54c'),
    vest: builder.material('#34373b'),
    trousers: builder.material('#30333c'),
    leather: builder.material('#503529'),
    leatherLight: builder.material('#795038'),
    sole: builder.material('#282725'),
    brass: builder.material('#c99b4c', { metal: 0.65, roughness: 0.36 }),
    seam: builder.material('#987b56'),
    teal: builder.material('#2a878b'),
    lens: builder.material('#406874', { metal: 0.45, roughness: 0.24 }),
    accent: builder.material(color ?? '#71e6cf', { accent: true, roughness: 0.55 }),
  };
  const group = new THREE.Group();
  group.name = `${engineer ? 'engineer' : 'courier'}${ghost ? '-ghost' : ''}`;
  const rig = joint(group, 'animated-rig', [0, 0, 0]);
  const body = joint(rig, 'torso', [0, 0.95, 0]);
  const head = joint(body, 'head', [0, 0.54, 0]);
  builder.ellipsoid(rig, palette.trousers, [0, 0.886, 0.006], [engineer ? 0.185 : 0.153, 0.112, 0.112]);
  const legs = [-1, 1].map((side) => makeLeg(builder, rig, palette, side, engineer));
  const arms = [-1, 1].map((side) => makeArm(builder, body, palette, side, engineer));
  const clothes = engineer ? makeEngineerClothes(builder, body, palette) : makeCourierClothes(builder, body, palette);
  makeFace(builder, head, palette, engineer);
  const ponytail = engineer ? null : makeCourierHair(builder, head, palette);
  if (engineer) makeEngineerHair(builder, head, palette);
  // The same small team mark is readable from behind without replacing either outfit.
  builder.add(body, roundedPanel(0.057, 0.027, 0.008, 0.006), palette.accent, [engineer ? 0 : -0.134, 0.418, engineer ? 0.143 : 0.119]);
  builder.finish();

  let idleTime = 0;
  let previousLane = null;
  let lean = 0;
  let activity = 0;
  let initialized = false;
  let disposed = false;

  function update(state = {}, dt = 0) {
    if (disposed || (state.phase === 'paused' && initialized)) return;
    const step = clamp(finite(dt), 0, 0.1);
    idleTime += step;
    const running = state.phase === 'running';
    const reduced = state.reducedMotion === true;
    const response = initialized ? 1 - Math.exp(-step * 12) : 1;
    activity += ((running ? 1 : 0) - activity) * response;
    const distance = finite(state.distance);
    const cycle = distance * 0.95;
    const stride = Math.sin(cycle);
    const boost = !ghost && finite(state.boostRemaining) > 0 ? 1 : 0;
    const stumble = !ghost && finite(state.stunRemaining) > 0 ? 1 : 0;
    const jumping = finite(state.jumpRemaining) > 0;
    const jumpProgress = jumping ? clamp(1 - state.jumpRemaining / Math.max(0.001, finite(state.jumpDuration, 0.65)), 0, 1) : 0;
    const jumpPose = jumping ? Math.sin(Math.PI * jumpProgress) : 0;
    const lane = finite(state.visualLane, finite(state.lane, 1));
    const laneDelta = previousLane === null ? 0 : lane - previousLane;
    previousLane = lane;
    lean += (clamp(-laneDelta * 0.85 / Math.max(step, 0.016), -0.2, 0.2) - lean) * response;
    const motion = reduced ? 0.35 : 1;
    const run = activity * (jumping ? 0.15 : 1);
    rig.position.y = (Math.abs(Math.sin(cycle)) * 0.032 * run + Math.sin(idleTime * 1.9) * 0.003 * (1 - activity)) * motion;
    rig.rotation.z = lean * motion + Math.sin(cycle) * 0.017 * run * motion;
    body.rotation.x = -0.04 - activity * 0.055 - boost * 0.095 - stumble * 0.17 + jumpPose * 0.035;
    body.rotation.y = Math.sin(cycle) * 0.045 * run * motion;
    head.rotation.x = -body.rotation.x * 0.55;
    head.rotation.y = -body.rotation.y * 0.65;
    head.rotation.z = stumble ? Math.sin(cycle * 1.6) * 0.09 * motion : 0;

    for (let index = 0; index < 2; index += 1) {
      const side = index === 0 ? -1 : 1;
      const swing = stride * side;
      const leg = legs[index];
      leg.hip.rotation.x = swing * (0.66 + boost * 0.13) * run;
      leg.hip.rotation.z = side * (engineer ? 0.037 : 0.018) * activity;
      leg.knee.rotation.x = -0.1 * activity - Math.max(0, -swing) * 1.08 * run;
      leg.ankle.rotation.x = Math.max(0, swing) * 0.16 * run;
      if (jumping) {
        leg.hip.rotation.x = 0.26 + jumpPose * (index === 0 ? 0.58 : 0.28);
        leg.knee.rotation.x = -0.4 - jumpPose * (state.jumpKind === 'long' ? 1.05 : 0.77);
      }
      const arm = arms[index];
      arm.shoulder.rotation.x = -swing * 0.66 * run - 0.06 + jumpPose * 0.5;
      arm.shoulder.rotation.z = side * (0.065 + (engineer ? 0.025 : 0) + stumble * 0.12);
      arm.elbow.rotation.x = 0.12 + activity * 0.78 + Math.max(0, swing) * 0.22 * run + jumpPose * 0.3;
      if (state.phase === 'won') {
        arm.shoulder.rotation.x = 2.2;
        arm.shoulder.rotation.z = side * -0.32;
        arm.elbow.rotation.x = 0.6;
      }
    }
    if (state.phase === 'lost') {
      body.rotation.x = -0.2;
      head.rotation.x = -0.23;
    }
    if (ponytail) {
      ponytail.rotation.x = (0.13 + Math.cos(cycle * 2) * 0.15 * activity + boost * 0.25 + jumpPose * 0.2) * motion;
      ponytail.rotation.z = Math.sin(cycle + 0.5) * 0.18 * activity * motion - lean * 0.7;
    }
    clothes.bag.rotation.x = Math.sin(cycle + 0.65) * 0.1 * run * motion;
    clothes.bag.rotation.z = Math.sin(cycle + 0.9) * (engineer ? 0.035 : 0.09) * run * motion;
    clothes.tails.forEach((tail, index) => {
      tail.rotation.x = (-0.14 - Math.sin(cycle + index * Math.PI) * 0.11 * run - boost * 0.15) * motion;
    });
    initialized = true;
  }

  update({ phase: 'ready', distance: 0, lane: 1 }, 0);
  return {
    group, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      builder.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
