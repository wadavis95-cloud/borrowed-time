// Original Borrowed Time character source. Authoring uses Three.js, not Blender.
// Run: node scripts/build-avatars.mjs. No downloads, image services, or randomness.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// GLTFExporter only needs the browser FileReader Blob adapter for binary output.
globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((value) => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};

const TAU = Math.PI * 2;
const profiles = {
  courier: { height: 1.91, hip: .17, shoulder: .245, waist: .15, leg: .98, head: .98, skin: '#a66b4c', shadow: '#6c3e32', hair: '#231c20', highlight: '#4b3232', coat: '#78384d', coatLight: '#a65568', trim: '#e8d6b6', trousers: '#283c4a', shoes: '#4c3030', metal: '#d8b777', accent: '#45c5bc' },
  engineer: { height: 1.99, hip: .218, shoulder: .31, waist: .226, leg: .98, head: 1.03, skin: '#dca27b', shadow: '#a36850', hair: '#934c2c', highlight: '#cb7841', coat: '#c49539', coatLight: '#e5b95b', trim: '#ded4b5', trousers: '#363d43', shoes: '#503e35', metal: '#cbaa73', accent: '#5fbdd4' },
  guard: { height: 2.12, hip: .176, shoulder: .242, waist: .153, leg: 1.11, head: .96, skin: '#cc9f85', shadow: '#8d6657', hair: '#b9c4cb', highlight: '#e6e5d9', coat: '#263e57', coatLight: '#405b76', trim: '#b6c6cb', trousers: '#232e3a', shoes: '#25333c', metal: '#c5b085', accent: '#db945a' },
  runner: { height: 1.72, hip: .168, shoulder: .24, waist: .155, leg: .875, head: 1.01, skin: '#bc8064', shadow: '#794a3d', hair: '#272e32', highlight: '#566463', coat: '#3a886e', coatLight: '#64b58d', trim: '#e0e2bb', trousers: '#263a42', shoes: '#e0d8ba', metal: '#a5b3ad', accent: '#e9bb63' },
};

// New casts reuse the proven skeleton and fluent run clips, with their own
// proportions, palettes, headwear, packs and garment silhouettes.
const themedProfiles = {
  captain: { style: 'guard', height: 2.08, hip: .185, shoulder: .28, coat: '#243d67', coatLight: '#456393', trim: '#e9bf64', hair: '#30292b', accent: '#e34040' },
  navigator: { style: 'courier', height: 1.88, shoulder: .235, coat: '#278b8e', coatLight: '#4cbab0', trim: '#efe0bb', hair: '#dad3c2', accent: '#f4bc55' },
  shipwright: { style: 'engineer', height: 2.01, shoulder: .33, coat: '#f1d1a0', coatLight: '#fff0ce', trousers: '#65503a', hair: '#48312a', accent: '#d54c3c' },
  deckhand: { style: 'runner', height: 1.75, hip: .16, shoulder: .23, coat: '#e5ddc8', coatLight: '#faf2de', trousers: '#294b65', hair: '#342a22', accent: '#db4f43' },
  scout: { style: 'courier', height: 1.84, hip: .155, shoulder: .22, coat: '#df765a', coatLight: '#f3aa7e', trousers: '#414e44', hair: '#242d24', accent: '#f4d158' },
  botanist: { style: 'runner', height: 1.78, shoulder: .235, coat: '#8eaa6b', coatLight: '#b3ca86', trousers: '#58605b', hair: '#68432d', accent: '#f3c666' },
  ranger: { style: 'guard', height: 2.05, hip: .18, coat: '#d7b45b', coatLight: '#f1d089', trousers: '#476858', hair: '#31302a', accent: '#dd754c' },
  volcanologist: { style: 'engineer', height: 1.96, hip: .21, shoulder: .30, coat: '#e76e35', coatLight: '#ff9b55', trousers: '#414e62', hair: '#4d3432', accent: '#7ad2d3' },
};
for (const [id, changes] of Object.entries(themedProfiles)) profiles[id] = { ...profiles[changes.style], ...changes };

function bone(parent, name, position, bones) {
  const value = new THREE.Bone(); value.name = name; value.position.fromArray(position); parent.add(value); bones.push(value); return value;
}

function makeSkeleton(p) {
  const root = new THREE.Group(); root.name = 'character';
  const bones = []; const hipY = p.leg;
  const pelvis = bone(root, 'pelvis', [0, hipY, 0], bones);
  const spine = bone(pelvis, 'spine', [0, .14, 0], bones);
  const chestY = p.height - hipY - .46;
  const chest = bone(spine, 'chest', [0, chestY - .14, 0], bones);
  const neck = bone(chest, 'neck', [0, .08, 0], bones);
  bone(neck, 'head', [0, .04, 0], bones);
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const upperArm = bone(chest, `upperArm${side}`, [sign * p.shoulder, -.035, 0], bones);
    const foreArm = bone(upperArm, `foreArm${side}`, [sign * .024, -.285 * p.height / 1.9, 0], bones);
    bone(foreArm, `hand${side}`, [0, -.235 * p.height / 1.9, 0], bones);
    const thigh = bone(pelvis, `thigh${side}`, [sign * p.hip * .65, -.04, 0], bones);
    const shin = bone(thigh, `shin${side}`, [0, -(hipY - .18) * .52, 0], bones);
    bone(shin, `foot${side}`, [0, -(hipY - .18) * .48, 0], bones);
    const coat = bone(pelvis, `coat${side}`, [sign * .12, .04, .075], bones);
    bone(coat, `hem${side}`, [0, -.25, .015], bones);
  }
  const hair = bone(neck, 'hair', [0, .23, .12], bones);
  bone(hair, 'hairTip', [0, -.22, .12], bones);
  bone(pelvis, 'bag', [.235, .02, .06], bones);
  root.updateMatrixWorld(true);
  const byName = Object.fromEntries(bones.map((value) => [value.name, value]));
  const indices = Object.fromEntries(bones.map((value, i) => [value.name, i]));
  const points = Object.fromEntries(bones.map((value) => [value.name, value.getWorldPosition(new THREE.Vector3())]));
  return { root, bones, byName, indices, points, hipY, chestY: hipY + chestY };
}

function createBuilder(rig) {
  const materials = [
    ['woven cloth', .88, 0], ['skin', .76, 0], ['hair', .82, 0], ['worn leather', .61, 0], ['brushed metal', .32, .68], ['rubber', .94, 0], ['glass', .23, .5], ['identity mark', .58, .1], ['heavy canvas', .98, 0],
  ].map(([name, roughness, metalness]) => new THREE.MeshStandardMaterial({ name, color: '#ffffff', vertexColors: true, roughness, metalness, side: THREE.DoubleSide }));
  const buckets = materials.map(() => []);
  const vec = new THREE.Vector3();
  const smooth = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function weights(name, amount = 1, other = name) { return [[rig.indices[name], amount], [rig.indices[other], 1 - amount]]; }
  function blendY(a, b, low, high) { return (v) => weights(b, smooth(low, high, v.y), a); }
  function add(geometry, hex, type = 0, binding = 'chest', at = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    const positions = geometry.attributes.position;
    const colors = [], skinIndices = [], skinWeights = [];
    const base = new THREE.Color(typeof hex === 'function' ? '#ffffff' : hex);
    for (let i = 0; i < positions.count; i++) {
      vec.fromBufferAttribute(positions, i);
      if (typeof hex === 'function') base.copy(hex(vec));
      // Deterministic color variation gives cloth folds and leather visible surfaces
      // without a large texture set. This is intentionally not photorealistic skin.
      const variation = type === 0 || type === 8 ? 1 + .025 * Math.sin(vec.y * 29 + vec.x * 17) + .012 * Math.sin(vec.z * 61) : 1 + .012 * Math.sin(vec.y * 23 + vec.z * 34);
      colors.push(base.r * variation, base.g * variation, base.b * variation);
      const w = typeof binding === 'function' ? binding(vec) : weights(binding);
      for (let k = 0; k < 4; k++) { skinIndices.push(w[k]?.[0] ?? 0); skinWeights.push(w[k]?.[1] ?? 0); }
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    buckets[type].push(geometry);
  }
  function ellipsoid(hex, type, bind, at, scale, rotation) { add(new THREE.SphereGeometry(1, 16, 10), hex, type, bind, at, scale, rotation); }
  function tube(hex, type, bind, points, radius = .004, segments = 18, radial = 6) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geometry = new THREE.TubeGeometry(curve, segments, typeof radius === 'function' ? 1 : radius, radial, false);
    if (typeof radius === 'function') {
      const pos = geometry.attributes.position;
      for (let i = 0; i <= segments; i++) {
        const center = curve.getPointAt(i / segments), size = radius(i / segments);
        for (let j = 0; j <= radial; j++) {
          const index = i * (radial + 1) + j;
          const point = new THREE.Vector3().fromBufferAttribute(pos, index).sub(center).multiplyScalar(size).add(center);
          pos.setXYZ(index, point.x, point.y, point.z);
        }
      }
      geometry.computeVertexNormals();
    }
    add(geometry, hex, type, bind);
  }
  // Flat garment panels and bevelled accessories give silhouette changes more
  // value than stacking small spheres. Panels carry actual edge thickness.
  function panel(hex, type, bind, points, thickness = .005) {
    const positions = [], indices = [], count = points.length;
    for (const dz of [0, thickness]) for (const [x, y, z] of points) positions.push(x, y, z + dz);
    const faces = THREE.ShapeUtils.triangulateShape(points.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const [a, c, d] of faces) indices.push(a, c, d, a + count, d + count, c + count);
    for (let i = 0; i < count; i++) { const j = (i + 1) % count; indices.push(i, j, i + count, j, j + count, i + count); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    add(geometry, hex, type, bind);
  }
  function bevelBox(hex, type, bind, at, size, radius = .015, rotation = [0, 0, 0]) {
    const geometry = new THREE.BoxGeometry(...size, 4, 4, 4), pos = geometry.attributes.position;
    const inner = new THREE.Vector3(...size).multiplyScalar(.5).addScalar(-radius);
    for (let i = 0; i < pos.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(pos, i), nearest = point.clone().clamp(inner.clone().negate(), inner);
      point.sub(nearest).normalize().multiplyScalar(radius).add(nearest); pos.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals(); add(geometry, hex, type, bind, at, [1, 1, 1], rotation);
  }
  function loft(hex, type, bind, rings, { segments = 24, steps = 20, start = 0, end = TAU, folds = 0, modify } = {}) {
    const profile = new THREE.CatmullRomCurve3(rings.map(([y, rx, rz]) => new THREE.Vector3(rx, y, rz)), false, 'centripetal');
    const centers = new THREE.CatmullRomCurve3(rings.map(([y, rx, rz, cx = 0, cz = 0]) => new THREE.Vector3(cx, y, cz)), false, 'centripetal');
    const positions = [], indices = [];
    for (let row = 0; row <= steps; row++) {
      const t = row / steps, size = profile.getPoint(t), center = centers.getPoint(t);
      for (let j = 0; j <= segments; j++) {
        const angle = start + (end - start) * j / segments;
        const ripple = 1 + folds * Math.sin(angle * 7 + t * 5) * Math.sin(t * Math.PI);
        const point = new THREE.Vector3(center.x + Math.cos(angle) * Math.max(0, size.x) * ripple, size.y, center.z + Math.sin(angle) * Math.max(0, size.z) * ripple);
        if (modify) modify(point, angle);
        positions.push(point.x, point.y, point.z);
      }
    }
    for (let row = 0; row < steps; row++) for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j, b = a + segments + 1;
      if (rings.at(-1)[0] > rings[0][0]) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    // Closed full-circumference garments: no exposed dark shoulder/cuff holes.
    if (end - start > TAU - .01) {
      for (const row of [0, steps]) {
        const centerIndex = positions.length / 3;
        const center = new THREE.Vector3();
        for (let j = 0; j < segments; j++) center.add(new THREE.Vector3().fromArray(positions, (row * (segments + 1) + j) * 3));
        center.multiplyScalar(1 / segments); positions.push(center.x, center.y, center.z);
        for (let j = 0; j < segments; j++) {
          const a = row * (segments + 1) + j;
          if ((row === 0) === (rings.at(-1)[0] > rings[0][0])) indices.push(centerIndex, a, a + 1);
          else indices.push(centerIndex, a + 1, a);
        }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    // Weld normals along the periodic seam without sacrificing authored vertex colors.
    if (end - start > TAU - .01) for (let row = 0; row <= steps; row++) {
      const a = row * (segments + 1), b = a + segments, n = geometry.attributes.normal;
      const v = new THREE.Vector3().fromBufferAttribute(n, a).add(new THREE.Vector3().fromBufferAttribute(n, b)).normalize(); n.setXYZ(a, ...v.toArray()); n.setXYZ(b, ...v.toArray());
    }
    add(geometry, hex, type, bind);
  }
  function ribbon(hex, type, bind, points, width = .03, thickness = .007) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geometry = new THREE.TubeGeometry(curve, 24, 1, 8, false);
    // An elliptical ribbon is rounded at its edges, following a draped curve.
    const frames = curve.computeFrenetFrames(24, false), pos = geometry.attributes.position;
    for (let i = 0; i <= 24; i++) {
      const center = curve.getPointAt(i / 24);
      for (let j = 0; j <= 8; j++) {
        const angle = j / 8 * TAU;
        const point = center.clone().addScaledVector(frames.normals[i], Math.cos(angle) * width / 2).addScaledVector(frames.binormals[i], Math.sin(angle) * thickness);
        pos.setXYZ(i * 9 + j, point.x, point.y, point.z);
      }
    }
    geometry.computeVertexNormals(); add(geometry, hex, type, bind);
  }
  function finish() {
    // Indexed geometry and a single skeleton; at most eight material draws/avatar.
    const keys = ['position', 'normal', 'color', 'skinIndex', 'skinWeight'];
    const arrays = Object.fromEntries(keys.map((key) => [key, []])); const indices = []; let vertices = 0;
    const geometry = new THREE.BufferGeometry(); const usedMaterials = [];
    for (let type = 0; type < buckets.length; type++) {
      if (!buckets[type].length) continue;
      const first = indices.length;
      for (const piece of buckets[type]) {
        for (const key of keys) arrays[key].push(...piece.attributes[key].array);
        for (const index of piece.index.array) indices.push(index + vertices);
        vertices += piece.attributes.position.count; piece.dispose();
      }
      geometry.addGroup(first, indices.length - first, usedMaterials.length); usedMaterials.push(materials[type]);
    }
    for (const key of keys) {
      if (key === 'skinIndex') geometry.setAttribute(key, new THREE.Uint8BufferAttribute(arrays[key], 4));
      else if (key === 'color') geometry.setAttribute(key, new THREE.Uint8BufferAttribute(arrays[key].map((v) => Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255)), 3, true));
      else if (key === 'skinWeight') {
        // Two influences per vertex, normalized exactly after 8-bit packing.
        const packed = new Uint8Array(arrays[key].length);
        for (let i = 0; i < packed.length; i += 4) { packed[i] = Math.round(arrays[key][i] * 255); packed[i + 1] = 255 - packed[i]; }
        geometry.setAttribute(key, new THREE.BufferAttribute(packed, 4, true));
      } else geometry.setAttribute(key, new THREE.Float32BufferAttribute(arrays[key], 3));
    }
    const normals = geometry.attributes.normal;
    for (let i = 0; i < normals.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(normals, i);
      if (n.lengthSq() < .00001) n.set(0, 1, 0); else n.normalize();
      normals.setXYZ(i, n.x, n.y, n.z);
    }
    geometry.setIndex(indices); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const mesh = new THREE.SkinnedMesh(geometry, usedMaterials); mesh.name = 'authored_character'; rig.root.add(mesh); rig.root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(rig.bones));
    return mesh;
  }
  return { add, ellipsoid, tube, panel, bevelBox, loft, ribbon, finish, blendY, weights };
}

function bodyAndLegs(id, p, r, b) {
  const h = r.hipY, cy = r.chestY; const engineer = id === 'engineer', runner = id === 'runner', guard = id === 'guard';
  const bodyBinding = b.blendY('pelvis', 'chest', h + .05, cy - .06);
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const x = r.points[`thigh${side}`].x, kneeY = r.points[`shin${side}`].y;
    const kneeBind = b.blendY(`shin${side}`, `thigh${side}`, kneeY - .12, kneeY + .13);
    const legBind = (v) => v.y > h - .22 ? b.weights('pelvis', THREE.MathUtils.smoothstep(v.y, h - .22, h - .035), `thigh${side}`) : kneeBind(v);
    const width = engineer ? .115 : runner ? .098 : .084;
    b.loft(p.trousers, 0, legBind, [[.17, .038, .045, x], [.29, .044, .05, x, .006], [kneeY - .15, width * .77, .077, x, .012], [kneeY - .03, width * .66, .067, x, -.006], [kneeY + .025, width * .74, .078, x, -.013], [kneeY + .17, width * .99, .099, x, .002], [h - .09, width * 1.08, .114, x], [h + .065, width, .12, x]], {
      steps: 30, folds: engineer ? .026 : .012,
      modify(point, angle) {
        const blend = THREE.MathUtils.smoothstep(point.y, h - .23, h - .035);
        // At the waist, each leg becomes one half of the same outer oval.
        // The inner seam collapses inside, so the visible pants surface flows
        // from hip to knee instead of overlapping a separate pelvic sphere.
        const waistWidth = THREE.MathUtils.lerp(p.hip, Math.min(p.hip, p.waist * .96), THREE.MathUtils.smoothstep(point.y, h - .04, h + .065));
        const waistX = sign * Math.max(0, Math.cos(angle) * sign) * waistWidth;
        point.x = THREE.MathUtils.lerp(point.x, waistX, blend);
        point.z = THREE.MathUtils.lerp(point.z, Math.sin(angle) * (engineer ? .13 : .119), blend);
      },
    });
    const seam = [[x + sign * width * .9, h - .09, .02], [x + sign * width, h - .3, .035], [x + sign * width * .71, kneeY, .027], [x + sign * width * .63, .23, .022]];
    b.tube(guard ? p.coatLight : p.trim, 0, legBind, seam, runner ? .009 : .0023, 26);
    if (engineer) {
      b.bevelBox('#252e32', 8, `shin${side}`, [x, kneeY - .035, -.075], [.139, .164, .044], .018);
      b.ribbon(p.coat, 0, `thigh${side}`, [[x + sign * .102, h - .16, -.025], [x + sign * .112, h - .24, -.03], [x + sign * .096, h - .31, -.01]], .08, .013);
    }
    if (runner) b.loft(p.trim, 0, `shin${side}`, [[.17, .055, .063, x], [.28, .061, .072, x]], { steps: 3 });
    const foot = `foot${side}`;
    const bootWidth = engineer ? .074 : runner ? .072 : .064;
    const shapedToe = (point, angle) => {
      const center = x, length = Math.abs(point.z + .045) / .14;
      point.x = center + (point.x - center) * (1 - .16 * length * length);
    };
    b.loft('#202b31', runner ? 5 : 3, foot, [[0, bootWidth, .133, x, -.045], [.018, bootWidth + .002, .136, x, -.045], [.037, bootWidth, .132, x, -.045]], { steps: 3, segments: 24, modify: shapedToe });
    b.loft(p.shoes, 3, foot, [[.033, bootWidth * .97, .13, x, -.045], [.072, bootWidth * .94, .124, x, -.043], [.113, bootWidth * .83, .102, x, -.025], [.158, .047, .062, x], [runner ? .18 : .287, .048, .059, x, .005]], { steps: 16, segments: 24, modify: shapedToe });
    b.loft(runner ? p.trim : p.shoes, runner ? 0 : 3, foot, [[runner ? .156 : .268, .051, .064, x, .005], [runner ? .184 : .294, .052, .065, x, .005]], { steps: 3, segments: 20 });
    // Flat heel, a readable welt and a boot tongue replace the old round toe ball.
    b.bevelBox('#253036', runner ? 5 : 3, foot, [x, .025, .048], [bootWidth * 1.55, .048, .069], .009);
    b.ribbon(runner ? p.accent : '#8b6950', 3, foot, [[x - bootWidth * .75, .044, -.14], [x, .044, -.179], [x + bootWidth * .75, .044, -.14]], .009, .002);
    b.panel(runner ? p.trim : '#6b4c3c', runner ? 0 : 3, foot, [[x - .026, .162, -.059], [x + .026, .162, -.059], [x + .031, .088, -.132], [x - .031, .088, -.132]], .004);
    for (let i = 0; i < 3; i++) b.tube(runner ? p.accent : '#b29b7c', 0, foot, [[x - .028, .149 - i * .022, -.074 - i * .023], [x + .028, .149 - i * .022, -.074 - i * .023]], .0028, 3);
    b.ribbon(runner ? p.accent : '#94785b', 3, foot, [[x, .19, .059], [x, runner ? .198 : .306, .068], [x, runner ? .181 : .269, .072]], .017, .004);
  }
  const hemY = runner ? h + .08 : h - .045;
  const coatColor = new THREE.Color(p.coat), yokeColor = new THREE.Color(id === 'courier' ? p.trim : p.coatLight);
  const torsoColor = id === 'courier' || runner ? (v) => coatColor.clone().lerp(yokeColor,
    THREE.MathUtils.smoothstep(v.y, cy - .115, cy - .095) * THREE.MathUtils.smoothstep(v.z, .018, .045)) : p.coat;
  b.loft(torsoColor, 0, bodyBinding, [[hemY, p.waist * 1.13, .13], [h + .11, p.waist, .119], [cy - .19, p.shoulder * .79, .144], [cy - .067, p.shoulder * .96, .13], [cy + .006, p.shoulder * .79, .105], [cy + .075, .072, .06]], { steps: 26, segments: 28, folds: .009 });
  // Shoulder and collar tailoring follows the torso, with piping that remains visible from behind.
  b.loft(p.trim, 0, 'chest', [[cy + .038, .076, .068], [cy + .106, .066, .059]], { steps: 5, segments: 20 });
  if (id === 'courier' || runner) {
    b.ribbon(p.trim, 0, bodyBinding, [[-.18, cy - .102, .097], [0, cy - .145, .15], [.18, cy - .102, .097]], .012, .004);
    for (const sign of [-1, 1]) {
      b.panel(runner ? p.coatLight : p.trim, 0, 'chest', [[sign * .015, cy + .085, -.073], [sign * .079, cy + .07, -.073], [sign * .135, cy - .005, -.116], [sign * .066, cy - .075, -.145]], .007);
      b.ribbon(p.coatLight, 0, bodyBinding, [[sign * .11, h + .11, -.1], [sign * .16, h + .155, -.092], [sign * .169, h + .17, -.08]], .017, .003);
      b.tube(p.coatLight, 0, bodyBinding, [[sign * .084, h + .14, .12], [sign * .125, cy - .23, .129], [sign * .14, cy - .13, .103]], .003, 10);
    }
  }
  b.ribbon(p.trim, 0, bodyBinding, [[0, hemY + .015, -.135], [0, cy - .18, -.15], [0, cy + .035, -.106]], .009, .003);
  b.loft(p.coatLight, 0, bodyBinding, [[hemY, p.waist * 1.145, .133], [hemY + .025, p.waist * 1.13, .133]], { steps: 2, segments: 24 });
  if (engineer) {
    // Broad canvas bib and crossed suspender straps are an entirely different outfit.
    b.loft(p.trousers, 8, bodyBinding, [[h - .035, p.hip * 1.04, .139], [h + .17, .207, .139], [cy - .15, .182, .159]], { start: Math.PI, end: TAU, steps: 12, segments: 22, folds: .018 });
    for (const sign of [-1, 1]) {
      b.ribbon('#4b4440', 3, bodyBinding, [[sign * .165, cy + .015, -.11], [sign * .125, cy - .17, -.17], [sign * .16, h + .05, -.145]], .043, .008);
      b.ribbon('#4b4440', 3, bodyBinding, [[sign * .17, cy + .018, .10], [sign * .1, cy - .16, .16], [-sign * .14, h + .07, .135]], .047, .008);
      b.ellipsoid(p.metal, 4, bodyBinding, [sign * .125, cy - .17, -.181], [.018, .023, .005]);
    }
    b.panel('#4a514d', 8, bodyBinding, [[-.083, cy - .208, -.169], [.083, cy - .208, -.169], [.078, cy - .335, -.158], [-.078, cy - .335, -.158]], .007);
    b.tube(p.trim, 8, bodyBinding, [[-.079, cy - .216, -.174], [.079, cy - .216, -.174]], .003, 5);
    for (const sign of [-1, 1]) b.panel(p.coatLight, 0, 'chest', [[sign * .012, cy + .085, -.07], [sign * .076, cy + .065, -.077], [sign * .127, cy - .025, -.124], [sign * .056, cy - .048, -.144]], .006);
  }
  if (guard) {
    for (const sign of [-1, 1]) {
      b.panel(p.coatLight, 0, 'chest', [[sign * .018, cy + .083, -.073], [sign * .075, cy + .077, -.075], [sign * .139, cy - .043, -.133], [sign * .075, cy - .118, -.152], [sign * .032, cy - .19, -.154]], .008);
      b.ribbon(p.metal, 4, 'chest', [[sign * .15, cy + .012, -.04], [sign * .22, cy + .005, .008], [sign * .23, cy - .005, .063]], .029, .007);
      for (let i = 0; i < 4; i++) b.ellipsoid(p.metal, 4, bodyBinding, [sign * .072, h + .06 + i * .075, -.142], [.008, .008, .005]);
    }
  }
  // An inset identity stripe uses the player's color in the runtime material clone.
  b.ribbon('#69ddcc', 7, 'chest', [[-.048, cy - .07, .151], [0, cy - .079, .16], [.048, cy - .07, .151]], .016, .005);
}

function arms(id, p, r, b) {
  const engineer = id === 'engineer', runner = id === 'runner', guard = id === 'guard';
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const upper = r.points[`upperArm${side}`], elbow = r.points[`foreArm${side}`], hand = r.points[`hand${side}`];
    const bind = b.blendY(`foreArm${side}`, `upperArm${side}`, elbow.y - .09, elbow.y + .09);
    const width = engineer ? .092 : runner ? .072 : .066;
    const cuff = engineer ? elbow.y + .012 : hand.y + .045;
    // A sloping sleeve head grows out of the shoulder; the elbow is narrower
    // than the upper arm, and the forearm has its own subtle outer contour.
    const rings = engineer ? [
      [cuff, width * .71, width * .74, elbow.x, .002],
      [elbow.y + .095, width * .91, width * .83, upper.x + sign * .012, .005],
    ] : [
      [cuff, .037, .04, hand.x], [hand.y + .135, width * .69, width * .70, hand.x + sign * .004, .006],
      [elbow.y - .04, width * .79, width * .76, elbow.x, .008], [elbow.y + .02, width * .72, width * .71, elbow.x, -.005],
    ];
    rings.push([upper.y - .10, width, width * .88, upper.x + sign * .008], [upper.y - .019, width * .91, width * .85, upper.x - sign * .012], [upper.y + .037, .035, .043, upper.x - sign * .046]);
    b.loft(p.coat, 0, bind, rings, { steps: 22, segments: 20, folds: .012 });
    if (engineer) b.loft(p.skin, 1, `foreArm${side}`, [[hand.y - .015, .029, .033, hand.x], [hand.y + .09, .041, .041, hand.x + sign * .005], [elbow.y - .09, .057, .05, elbow.x + sign * .006], [elbow.y + .048, .06, .055, elbow.x]], { steps: 13, segments: 20 });
    const cuffWidth = engineer ? width * .74 : .039;
    b.loft(p.trim, 0, bind, [[cuff - .004, cuffWidth, cuffWidth * 1.04, elbow.x], [cuff + (engineer ? .052 : .027), cuffWidth + .003, cuffWidth * 1.08, elbow.x]], { steps: 3, segments: 20 });
    // Broad compression folds, kept on the sleeve rather than many tiny rings.
    for (const [offset, extent] of [[.05, .8], [.085, .64]]) if (!engineer) {
      b.tube(p.coatLight, 0, bind, [[elbow.x - width * extent, elbow.y - offset + .01, .018], [elbow.x, elbow.y - offset, width * .77], [elbow.x + width * extent, elbow.y - offset - .014, .018]], .0037, 8);
    }
    b.tube(p.coatLight, 0, bind, [[upper.x - sign * .048, upper.y + .023, -.04], [upper.x + sign * .055, upper.y - .034, -.041], [upper.x + sign * .065, upper.y - .08, .025]], .0033, 9);
    const handColor = guard ? p.shoes : p.skin, handType = guard ? 3 : 1;
    b.loft(handColor, handType, b.blendY(`hand${side}`, `foreArm${side}`, hand.y - .02, hand.y + .035), [[hand.y - .031, .028, .022, hand.x], [hand.y + .06, .028, .03, hand.x]], { steps: 5, segments: 16 });
    // Flattened palm, independent thumb and four tapered fingertips. Fingers
    // stay softly curled and skin to the existing hand bone (no extra rig cost).
    b.bevelBox(handColor, handType, `hand${side}`, [hand.x, hand.y - .032, -.006], [.068, .079, .043], .014, [0, 0, sign * .045]);
    for (let finger = 0; finger < 4; finger++) {
      const fx = hand.x - .024 + finger * .016;
      const length = [.036, .047, .045, .034][sign < 0 ? finger : 3 - finger];
      b.tube(handColor, handType, `hand${side}`, [[fx, hand.y - .052, -.003], [fx + sign * .002, hand.y - .079, -.012], [fx + sign * .003, hand.y - .065 - length * .4, -.037]], (t) => .0095 * (1 - t * .34) * Math.sqrt(1 - t ** 12), 7, 6);
    }
    b.tube(handColor, handType, `hand${side}`, [[hand.x - sign * .025, hand.y - .015, -.008], [hand.x - sign * .044, hand.y - .039, -.02], [hand.x - sign * .041, hand.y - .064, -.029]], (t) => .013 * (1 - t * .3) * Math.sqrt(1 - t ** 12), 8, 7);
    if (runner) b.ribbon(p.trim, 0, `upperArm${side}`, [[upper.x + sign * width * .8, upper.y - .04, .03], [elbow.x + sign * width * .77, elbow.y + .03, .04]], .017, .003);
    if (guard) b.ribbon(p.metal, 4, `foreArm${side}`, [[hand.x - .035, hand.y + .08, -.035], [hand.x, hand.y + .075, -.044], [hand.x + .035, hand.y + .08, -.035]], .009, .003);
  }
}

function faceAndHair(id, p, r, b) {
  const head = r.points.head; const y = head.y, h = p.head; const engineer = id === 'engineer', guard = id === 'guard', runner = id === 'runner';
  b.loft(p.skin, 1, 'neck', [[y - .11, .05, .05], [y + .044, engineer ? .065 : .056, .055]], { steps: 7, segments: 18 });
  // Role-specific jaw, cheek and brow planes; the smaller eyes sit within the
  // face rather than being oversized white globes attached to a shared head.
  const face = engineer ? { chin: .074, jaw: .107, cheek: .116, temple: .114, eyeX: .051, eyeY: .17, eyeH: .009, brow: .006, nose: .023 }
    : guard ? { chin: .037, jaw: .073, cheek: .108, temple: .103, eyeX: .046, eyeY: .177, eyeH: .0075, brow: .0038, nose: .016 }
      : runner ? { chin: .05, jaw: .09, cheek: .114, temple: .112, eyeX: .049, eyeY: .171, eyeH: .009, brow: .0055, nose: .019 }
        : { chin: .046, jaw: .077, cheek: .119, temple: .108, eyeX: .049, eyeY: .167, eyeH: .010, brow: .005, nose: .021 };
  b.loft(p.skin, 1, 'head', [[y - .005, face.chin * h, .057, 0, -.004], [y + .038, face.jaw * h, .077, 0, -.005], [y + .108, face.cheek * h, .096], [y + .184, face.temple * h, .105], [y + .241, .099 * h, .09], [y + .276, .055, .049], [y + .282, 0, 0]], { steps: 23, segments: 28,
    modify(point, angle) { if (Math.sin(angle) < 0) point.z *= 1 + .045 * Math.abs(Math.cos(angle)); },
  });
  for (const sign of [-1, 1]) {
    b.ellipsoid(p.skin, 1, 'head', [sign * .116 * h, y + .134, .009], [.018, .034, .02]);
    b.ellipsoid(p.shadow, 1, 'head', [sign * .126 * h, y + .135, -.002], [.004, .019, .008]);
    const ex = sign * face.eyeX, ey = y + face.eyeY;
    b.ellipsoid('#e2d7bd', 1, 'head', [ex, ey, -.098], [.025, face.eyeH, .010]);
    b.ellipsoid(engineer ? '#3b5550' : '#293735', 1, 'head', [ex, ey, -.107], [.007, face.eyeH * .82, .0028]);
    b.tube(p.shadow, 1, 'head', [[ex - .022, ey + .001, -.101], [ex, ey + face.eyeH + .001, -.108], [ex + .022, ey + .002, -.101]], .0023, 8);
    b.tube(p.hair, 2, 'head', [[ex - .023, ey + .027 - (sign < 0 ? .004 : 0), -.098], [ex, ey + .031, -.103], [ex + .023, ey + .025, -.095]], face.brow, 9);
    if (guard) {
      b.tube('#a58170', 1, 'head', [[sign * .074, y + .157, -.087], [sign * .09, y + .147, -.077]], .0018, 5);
      b.tube('#a58170', 1, 'head', [[sign * .03, y + .105, -.103], [sign * .036, y + .083, -.093]], .0015, 5);
    }
  }
  b.bevelBox(p.skin, 1, 'head', [0, y + .144, -.107], [face.nose * 1.3, guard ? .067 : .051, .035], .008, [guard ? -.13 : -.08, 0, 0]);
  b.ellipsoid(p.skin, 1, 'head', [0, y + .122, -.126], [face.nose, .012, .018]);
  b.tube(p.shadow, 1, 'head', [[-.025, y + .075, -.088], [0, y + .072, -.098], [.025, y + .077, -.088]], .0027, 10);
  b.ellipsoid(p.skin, 1, 'head', [0, y + .058, -.081], [engineer ? .039 : .029, .009, .01]);
  if (engineer || runner) {
    // Close-cropped back and temples join the swept crown. The lower edge
    // follows the occiput and leaves a visible nape instead of a floating cap.
    b.loft(p.hair, 2, 'head', [[y + .086, .101, .091], [y + .139, .119 * h, .106], [y + .218, .111 * h, .104], [y + .265, .086, .077]], {
      start: -.07, end: Math.PI + .07, steps: 13, segments: 22,
      modify(point, angle) {
        const lower = 1 - THREE.MathUtils.smoothstep(point.y, y + .09, y + .22);
        point.y += lower * Math.abs(Math.cos(angle)) * (runner && point.x > 0 ? .045 : .022);
      },
    });
  }
  if (engineer) {
    b.loft('#875744', 2, 'head', [[y + .018, .061, .074], [y + .04, .102, .09], [y + .072, .114, .096]], { start: Math.PI * .91, end: TAU * 1.045, steps: 6, segments: 20 });
    for (let i = 0; i < 5; i++) b.tube(i % 2 ? p.hair : p.highlight, 2, 'head', [[-.088 + i * .036, y + .235, -.076], [-.065 + i * .033, y + .306 + Math.sin(i) * .009, -.02], [-.035 + i * .025, y + .264, .082]], (t) => .027 * Math.sin(Math.PI * (.08 + t * .87)), 14, 7);
    b.ellipsoid(p.hair, 2, 'head', [0, y + .245, .038], [.115, .064, .087]);
    const strap = Array.from({ length: 33 }, (_, i) => [Math.cos(i / 32 * TAU) * .122, y + .239, Math.sin(i / 32 * TAU) * .111]);
    b.tube('#3e3832', 3, 'head', strap, .01, 36);
    for (const sign of [-1, 1]) {
      b.add(new THREE.TorusGeometry(.037, .008, 8, 20), p.metal, 4, 'head', [sign * .051, y + .256, -.114]);
      b.ellipsoid('#497b87', 6, 'head', [sign * .051, y + .256, -.115], [.03, .03, .009]);
      b.tube('#c9e3dc', 6, 'head', [[sign * .051 - .012, y + .258, -.125], [sign * .051 - .004, y + .273, -.125]], .0023, 4);
    }
  } else if (id === 'courier') {
    b.ellipsoid(p.hair, 2, 'head', [0, y + .241, .027], [.119, .072, .103]);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU;
      const x = Math.cos(a) * .09, z = Math.sin(a) * .078 + .016;
      b.tube(i % 4 ? p.hair : p.highlight, 2, 'head', [[x * .7, y + .281, z * .7], [x, y + .272, z], [x * 1.07, y + .234 + Math.sin(a * 3) * .01, z * 1.04]], (t) => .026 * Math.sin(Math.PI * (.13 + t * .76)), 12, 7);
    }
    const hy = r.points.hair.y;
    b.ellipsoid(p.hair, 2, 'hair', [0, hy - .055, .183], [.079, .105, .074]);
    for (let strand = 0; strand < 9; strand++) {
      const angle = strand / 9 * TAU;
      const points = Array.from({ length: 23 }, (_, step) => {
        const t = step / 22, phase = t * TAU * 1.6 + angle;
        return [Math.cos(angle) * (.052 + .012 * Math.sin(t * Math.PI)) * (1 - t * .32) + Math.sin(phase) * .014, hy + .025 - t * (.29 + strand % 3 * .025), .135 + Math.sin(angle) * .047 + t * .13 + Math.cos(phase) * .012];
      });
      b.tube(strand % 4 ? p.hair : p.highlight, 2, b.blendY('hairTip', 'hair', hy - .23, hy - .08), points, (t) => .021 * (1 - t * .55), 23, 6);
    }
    b.add(new THREE.TorusGeometry(.047, .011, 7, 20), p.accent, 0, 'hair', [0, hy - .005, .122], [1, 1, 1], [Math.PI / 2, 0, 0]);
    for (const sign of [-1, 1]) b.add(new THREE.TorusGeometry(.018, .0035, 6, 16), p.metal, 4, 'head', [sign * .13, y + .092, .002], [1, 1, 1], [0, Math.PI / 2, 0]);
  } else if (guard) {
    b.ellipsoid(p.hair, 2, 'head', [0, y + .25, .024], [.119, .041, .104]);
    b.ellipsoid(p.hair, 2, 'head', [0, y + .169, .079], [.111, .092, .052]);
    for (let i = 0; i < 8; i++) b.tube(i % 3 ? p.hair : p.highlight, 2, 'head', [[-.106 + i * .018, y + .22 + i * .004, -.055], [-.078 + i * .02, y + .286, .012], [-.035 + i * .017, y + .239, .091]], .007, 14);
    for (let i = 0; i < 10; i++) {
      const t = i / 9, by = y + .14 - t * .43;
      for (const sign of [-1, 1]) b.ellipsoid(i % 3 ? p.hair : p.highlight, 2, b.blendY('hairTip', 'hair', y - .18, y + .06), [sign * .018 * (1 - t * .6), by, .135 + t * .105], [.032 * (1 - t * .48), .04, .029], [0, 0, sign * .5]);
    }
    b.ellipsoid(p.metal, 4, 'hairTip', [0, y - .275, .239], [.023, .018, .02]);
  } else {
    b.ellipsoid(p.hair, 2, 'head', [0, y + .24, .027], [.122, .061, .105]);
    // Asymmetrically swept crop with a shaved temple and distinct high side profile.
    for (let i = 0; i < 5; i++) b.tube(i % 3 ? p.hair : p.highlight, 2, 'head', [[-.088 + i * .035, y + .247, .072], [-.074 + i * .033, y + .30 + i * .003, -.011], [-.108 + i * .032, y + .257 + i * .005, -.078]], (t) => .029 * Math.sin(Math.PI * (.09 + t * .87)), 15, 8);
    b.ribbon(p.trim, 0, 'head', [[-.118, y + .219, -.025], [-.122, y + .212, .04], [-.08, y + .202, .094]], .013, .003);
  }
}

function equipment(id, p, r, b) {
  const h = r.hipY, cy = r.chestY;
  if (id === 'guard' || id === 'courier') {
    const guard = id === 'guard', length = guard ? .59 : .235;
    for (const [side, sign] of [['L', -1], ['R', 1]]) {
      const start = sign < 0 ? Math.PI / 2 + .08 : -.18, end = sign < 0 ? Math.PI + .2 : Math.PI / 2 - .08;
      const bind = b.blendY(`hem${side}`, `coat${side}`, h - .37, h - .14);
      b.loft(p.coat, 0, bind, [[h - length, p.hip * 1.48, .23, 0, .045], [h - length * .6, p.hip * 1.32, .19, 0, .025], [h - .065, p.hip * 1.07, .145], [h - .025, p.waist * 1.17, .14]], { start, end, steps: 16, segments: 14, folds: .05 });
      const edge = Array.from({ length: 10 }, (_, i) => { const a = start + (end - start) * i / 9; return [Math.cos(a) * p.hip * 1.48, h - length + .008, Math.sin(a) * .233 + .045]; });
      b.tube(guard ? p.coatLight : p.trim, 0, bind, edge, guard ? .004 : .006, 18);
    }
  }
  if (id === 'courier') {
    const bind = b.blendY('pelvis', 'chest', h + .1, cy - .05);
    b.ribbon('#654b3d', 3, bind, [[-.18, cy + .025, .1], [-.13, cy - .08, .154], [.045, h + .22, .154], [.23, h + .02, .09]], .055, .01);
    b.ribbon('#654b3d', 3, bind, [[-.18, cy + .025, -.08], [-.13, cy - .08, -.15], [.045, h + .22, -.145], [.23, h + .02, -.08]], .055, .01);
    b.bevelBox('#67463a', 3, 'bag', [.258, h - .075, .075], [.205, .254, .132], .025, [.05, -.15, -.15]);
    b.bevelBox('#94674d', 3, 'bag', [.26, h - .015, .139], [.21, .112, .032], .013, [-.12, 0, -.15]);
    b.ribbon('#d3af78', 4, 'bag', [[.255, h + .005, .182], [.261, h - .075, .174]], .026, .008);
    b.tube(p.trim, 0, 'bag', [[.17, h - .11, .126], [.25, h - .19, .14], [.34, h - .11, .12]], .0025, 16);
    b.loft(p.accent, 0, 'neck', [[cy + .075, .078, .073], [cy + .117, .077, .074]], { steps: 5 });
    b.ribbon(p.accent, 0, 'chest', [[.035, cy + .095, -.075], [.06, cy + .01, -.14], [.09, cy - .08, -.156]], .05, .006);
  } else if (id === 'engineer') {
    b.loft('#554638', 3, 'pelvis', [[h - .035, .229, .143], [h + .018, .23, .142]], { steps: 4 });
    for (const sign of [-1, 1]) {
      b.bevelBox('#6e5140', 3, 'pelvis', [sign * .207, h - .09, .08], [.137, .198, .108], .018, [0, 0, sign * .04]);
      b.bevelBox('#957253', 3, 'pelvis', [sign * .21, h - .018, .123], [.141, .065, .035], .012);
      b.ellipsoid(p.metal, 4, 'pelvis', [sign * .21, h - .055, .17], [.012, .017, .007]);
    }
    b.ribbon(p.metal, 4, 'pelvis', [[.26, h + .025, .044], [.27, h - .2, .043]], .019, .011);
    b.add(new THREE.TorusGeometry(.027, .009, 7, 16), p.metal, 4, 'pelvis', [.26, h + .025, .044]);
  } else if (id === 'guard') {
    b.loft('#37404a', 3, 'pelvis', [[h + .02, .185, .138], [h + .069, .182, .137]], { steps: 3 });
    b.ellipsoid(p.metal, 4, 'pelvis', [0, h + .045, -.14], [.031, .024, .008]);
    b.ellipsoid(p.metal, 4, 'chest', [-.12, cy - .1, -.143], [.018, .027, .005]);
    b.ribbon(p.metal, 4, 'chest', [[-.15, cy - .08, -.14], [-.18, cy - .16, -.143], [-.1, cy - .16, -.159]], .007, .004);
  } else {
    b.loft('#d9d9b5', 0, 'pelvis', [[h - .03, .165, .126], [h + .075, .164, .129]], { steps: 7 });
    b.bevelBox('#c99e55', 0, 'pelvis', [0, h + .015, .15], [.185, .096, .055], .016);
    b.ribbon('#303a39', 3, 'pelvis', [[-.16, h + .055, .06], [0, h + .052, .151], [.16, h + .055, .06]], .026, .006);
    b.tube(p.accent, 0, 'pelvis', [[-.025, h + .047, -.14], [-.018, h - .07, -.145]], .005, 8);
    b.tube(p.accent, 0, 'pelvis', [[.02, h + .047, -.14], [.04, h - .045, -.154]], .005, 8);
  }
}

function clipsFor(rig, id) {
  const p = profiles[id], clips = [];
  for (const [name, duration, frames] of [['idle', 3.4, 32], ['run', .72, 36], ['jump', 1, 30], ['stumble', .65, 20]]) {
    const samples = Array.from({ length: frames + 1 }, (_, i) => i / frames);
    if (name === 'run') {
      const contactEnd = 2 * p.leg * .34 * .058 / (.34 * duration);
      // Exact toe-off keys prevent uniform sampling from blending recovery lift
      // into the preceding planted stance. The cadence is still exactly .72 s.
      samples.push(contactEnd, .5 + contactEnd); samples.sort((a, b) => a - b);
    }
    const tracks = [], times = samples.map((t) => t * duration);
    const rotations = Object.fromEntries(rig.bones.map((b) => [b.name, []])); const positions = [];
    for (const t of samples) {
      const phase = t * TAU, run = name === 'run', jump = name === 'jump', stumble = name === 'stumble';
      const tuck = jump ? Math.sin(Math.PI * t) ** .75 : 0;
      const bodyHeight = run ? -.10 + Math.cos(phase * 2) * .015 : jump ? -.045 * Math.sin(Math.PI * t) : Math.sin(phase) * .004;
      const pose = {};
      pose.pelvis = [0, run ? Math.sin(phase) * .04 : 0, run ? Math.sin(phase) * .018 : 0];
      pose.spine = [run ? -.09 : jump ? -.1 + tuck * .04 : stumble ? -.18 * Math.sin(Math.PI * t) : Math.sin(phase) * .008, 0, 0];
      pose.chest = [0, run ? -Math.sin(phase) * .11 : 0, 0];
      pose.head = [run ? .06 : stumble ? -.12 : 0, run ? Math.sin(phase) * .045 : 0, 0];
      for (const [side, sign] of [['L', -1], ['R', 1]]) {
        const wave = Math.sin(phase) * sign;
        pose[`thigh${side}`] = [run ? wave * (id === 'runner' ? .84 : .74) + .12 : jump ? .22 + tuck * (side === 'L' ? .75 : .43) : stumble ? wave * .45 : 0, 0, sign * (id === 'engineer' ? .045 : .016)];
        pose[`shin${side}`] = [run ? -.12 - Math.max(0, -wave) * 1.32 : jump ? -.35 - tuck * 1.18 : stumble ? -.22 - Math.max(0, -wave) * .5 : -.025, 0, 0];
        pose[`foot${side}`] = [run ? .12 + Math.max(0, wave) * .22 : jump ? .18 + tuck * .23 : 0, 0, 0];
        if (run) {
          // Solve the continuous leg mesh against an authored ankle trajectory.
          // Match planted foot travel to distance*.34 tunnel scrolling while
          // retaining the .72 s cadence sampled at distance*.058. The faster
          // race uses a brief contact and a long airborne recovery, not a slow
          // planted foot that slides over the paving. This is baked, not terrain IK.
          const cycle = (t + (side === 'L' ? 0 : .5)) % 1;
          const stride = p.leg * .34;
          const stanceFraction = 2 * stride * .058 / (.34 * duration);
          const stance = cycle < stanceFraction;
          const u = stance ? cycle / stanceFraction : (cycle - stanceFraction) / (1 - stanceFraction);
          const eased = u * u * (3 - 2 * u);
          const z = stance ? -stride + stride * 2 * u : stride - stride * 2 * eased;
          const lift = stance ? 0 : Math.sin(Math.PI * u) * (id === 'runner' ? .43 : id === 'engineer' ? .34 : .39);
          const l1 = (p.leg - .18) * .52, l2 = (p.leg - .18) * .48;
          const dy = .146 + lift - (p.leg - .04 + bodyHeight);
          const cosine = THREE.MathUtils.clamp((dy * dy + z * z - l1 * l1 - l2 * l2) / (2 * l1 * l2), -.99, .999);
          const knee = -Math.acos(cosine);
          const hip = Math.atan2(-z, -dy) - Math.atan2(l2 * Math.sin(knee), l1 + l2 * Math.cos(knee));
          pose[`thigh${side}`][0] = hip;
          pose[`shin${side}`][0] = knee;
          pose[`foot${side}`][0] = -(hip + knee) + (stance ? 0 : .32 * Math.sin(u * Math.PI));
        }
        const armSwing = Math.cos(phase + (side === 'L' ? 0 : Math.PI));
        pose[`upperArm${side}`] = [run ? -armSwing * .7 - .08 : jump ? -.15 + tuck * .72 : stumble ? wave * .6 : -.04, 0, sign * (stumble ? .42 : .08)];
        pose[`foreArm${side}`] = [run ? 1.05 + armSwing * .22 : jump ? .9 + tuck * .5 : stumble ? .9 : .1, 0, 0];
        pose[`hand${side}`] = [run ? .055 : .035, run || jump ? sign * 1.08 : sign * .12, sign * .045];
        pose[`coat${side}`] = [run ? -.12 - Math.sin(phase + sign * 1.2) * .14 : jump ? -.13 - tuck * .32 : 0, 0, 0];
        pose[`hem${side}`] = [run ? Math.cos(phase + sign * 1.2) * .12 : jump ? -.15 * tuck : 0, 0, 0];
      }
      pose.hair = [run ? -.03 + Math.cos(phase * 2 - .6) * .12 : jump ? -.2 * tuck : Math.sin(phase) * .025, 0, run ? Math.sin(phase - .6) * .12 : 0];
      pose.hairTip = [run ? Math.cos(phase * 2 - 1) * .14 : jump ? -.16 * tuck : 0, 0, run ? Math.sin(phase - 1.1) * .09 : 0];
      pose.bag = [run ? Math.sin(phase - .6) * .08 : 0, 0, run ? Math.sin(phase - .3) * .065 : 0];
      for (const name of Object.keys(rotations)) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pose[name] || [0, 0, 0]))); rotations[name].push(q.x, q.y, q.z, q.w); }
      positions.push(0, rig.hipY + bodyHeight, 0);
    }
    for (const [bone, values] of Object.entries(rotations)) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, positions)); clips.push(new THREE.AnimationClip(name, duration, tracks));
  }
  return clips;
}

function themedEquipment(id, p, r, b) {
  const y = r.points.head.y, cy = r.chestY, h = r.hipY;
  if (id === 'captain') {
    b.ellipsoid('#202e42', 0, 'head', [0, y + .18, .005], [.27, .075, .22]);
    b.panel('#23364f', 0, 'head', [[-.30,y+.12,.08],[0,y+.39,.08],[.30,y+.12,.08]], .06);
    b.ribbon(p.trim, 4, 'head', [[-.28,y+.14,.15],[0,y+.35,.15],[.28,y+.14,.15]], .025, .008);
    for (const sign of [-1,1]) b.bevelBox(p.trim, 0, 'chest', [sign*.26,cy+.015,.01], [.15,.055,.19]);
  } else if (['navigator','shipwright','deckhand'].includes(id)) {
    b.loft(id === 'navigator' ? '#d7b35e' : '#ce453c', 0, 'head', [[y+.12,.157,.151],[y+.20,.145,.144]], {steps:4});
    b.panel('#ce453c', 0, 'hair', [[-.08,y+.15,.14],[.06,y+.17,.14],[.14,y-.16,.19],[-.02,y-.10,.18]], .008);
    if (id === 'deckhand') {
      for (let i=0;i<4;i++) b.loft('#264e71', 0, b.blendY('pelvis','chest',h,cy), [[h+.07+i*.064,.17+i*.012,.137],[h+.098+i*.064,.175+i*.012,.138]], {steps:2});
      b.loft('#d94438',0,'pelvis',[[h+.01,.185,.145],[h+.095,.18,.145]],{steps:3});
    }
    if (id === 'shipwright') {
      b.panel('#765034',3,'pelvis',[[-.19,h+.11,-.15],[.19,h+.11,-.15],[.22,h-.32,-.15],[-.22,h-.32,-.15]], .018);
      b.bevelBox('#544334',3,'bag',[.25,h,.1],[.17,.22,.13]);
      b.bevelBox('#b5b8b5',4,'bag',[.29,h+.15,.12],[.07,.28,.05]);
    }
  }
  if (['botanist','ranger'].includes(id)) {
    b.ellipsoid(id==='ranger'?'#7f6a3e':'#cbb276',0,'head',[0,y+.15,0],[.29,.035,.25]);
    b.loft(id==='ranger'?'#9c8549':'#dbc68b',0,'head',[[y+.15,.15,.15],[y+.31,.13,.125]],{steps:5});
    b.loft('#534c34',3,'head',[[y+.155,.154,.154],[y+.19,.15,.15]],{steps:2});
  }
  if (id === 'volcanologist') {
    b.ellipsoid('#e9e5d7',5,'head',[0,y+.18,0],[.18,.16,.175]);
    b.bevelBox('#faf2da',5,'head',[0,y+.13,-.14],[.39,.035,.14]);
    b.bevelBox('#3d5f68',6,'head',[0,y+.08,-.16],[.24,.075,.025]);
  }
  if (['scout','botanist','ranger','volcanologist'].includes(id)) {
    const pack = id==='volcanologist'?'#c7c8b3':id==='botanist'?'#526b3a':'#b58c50';
    b.bevelBox(pack,8,'chest',[0,cy-.19,.22],[id==='volcanologist'?.37:.29,.37,.17],.035);
    b.bevelBox(p.trim,0,'chest',[0,cy-.27,.32],[.23,.12,.05]);
    for (const sign of [-1,1]) b.ribbon('#4a4d3a',3,'chest',[[sign*.14,cy+.015,.1],[sign*.17,cy-.12,.14],[sign*.14,cy-.36,.16]],.035,.012);
    if (id==='botanist') b.bevelBox('#c6d5a2',0,'chest',[.20,cy-.19,.23],[.07,.28,.09]);
    if (id==='volcanologist') b.bevelBox('#75cbd0',6,'chest',[0,cy-.17,.315],[.16,.10,.02]);
  }
}

export function authorAvatar(id) {
  const p = profiles[id]; if (!p) throw new Error(`Unknown avatar: ${id}`);
  const rig = makeSkeleton(p), builder = createBuilder(rig);
  const style = p.style || id;
  bodyAndLegs(style, p, rig, builder); arms(style, p, rig, builder); faceAndHair(style, p, rig, builder);
  if (p.style) themedEquipment(id, p, rig, builder); else equipment(id, p, rig, builder);
  const mesh = builder.finish(); rig.root.name = `${id}_original_v3_1`;
  rig.root.userData = { id, authoring: 'Original procedural Three.js contoured profiles, tailored panels and skinned meshes; not Blender-authored', license: 'Project original asset', height: p.height, version: '3.1.0-preview.1' };
  return { scene: rig.root, animations: clipsFor(rig, id), triangles: mesh.geometry.index.count / 3, vertices: mesh.geometry.attributes.position.count, materialDraws: mesh.material.length };
}

async function main() {
  const directory = new URL('../assets/characters/', import.meta.url); await mkdir(directory, { recursive: true }); const manifest = {};
  for (const id of Object.keys(profiles)) {
    if (process.argv.includes('--new-only') && !themedProfiles[id]) continue;
    const asset = authorAvatar(id);
    const result = await new GLTFExporter().parseAsync(asset.scene, { binary: true, animations: asset.animations, onlyVisible: true });
    await writeFile(new URL(`${id}.glb`, directory), Buffer.from(result));
    manifest[id] = { bytes: result.byteLength, triangles: asset.triangles, vertices: asset.vertices, materialDraws: asset.materialDraws, animations: asset.animations.map((a) => a.name), height: profiles[id].height };
    console.log(`${id}: ${result.byteLength.toLocaleString()} bytes; ${asset.triangles.toLocaleString()} triangles`);
  }
  if (process.argv.includes('--new-only')) {
    await writeFile(new URL('maps-manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n');
    return;
  }
  await writeFile(new URL('manifest.json', directory), JSON.stringify({ generator: 'node scripts/build-avatars.mjs', original: true, version: '3.1.0-preview.1', provenance: 'Original code-authored geometry and animation; no external models, textures or Blender authoring', rigBones: 24, avatars: manifest }, null, 2) + '\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
