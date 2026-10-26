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
    ['woven cloth', .84, 0], ['skin', .64, 0], ['hair', .66, 0], ['leather', .6, 0], ['metal', .35, .62], ['rubber', .92, 0], ['glass', .25, .5], ['identity mark', .54, .1],
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
      const variation = type === 0 ? 1 + .032 * Math.sin(vec.y * 72 + vec.x * 31) + .02 * Math.sin(vec.z * 87) : 1 + .018 * Math.sin(vec.y * 46 + vec.z * 34);
      colors.push(base.r * variation, base.g * variation, base.b * variation);
      const w = typeof binding === 'function' ? binding(vec) : weights(binding);
      for (let k = 0; k < 4; k++) { skinIndices.push(w[k]?.[0] ?? 0); skinWeights.push(w[k]?.[1] ?? 0); }
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    buckets[type].push(geometry);
  }
  function ellipsoid(hex, type, bind, at, scale, rotation) { add(new THREE.SphereGeometry(1, 20, 14), hex, type, bind, at, scale, rotation); }
  function tube(hex, type, bind, points, radius = .004, segments = 18, radial = 6) {
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), segments, radius, radial, false), hex, type, bind);
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
  return { add, ellipsoid, tube, loft, ribbon, finish, blendY, weights };
}

function bodyAndLegs(id, p, r, b) {
  const h = r.hipY, cy = r.chestY; const engineer = id === 'engineer', runner = id === 'runner', guard = id === 'guard';
  const bodyBinding = b.blendY('pelvis', 'chest', h + .05, cy - .06);
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const x = r.points[`thigh${side}`].x, kneeY = r.points[`shin${side}`].y;
    const kneeBind = b.blendY(`shin${side}`, `thigh${side}`, kneeY - .12, kneeY + .13);
    const legBind = (v) => v.y > h - .22 ? b.weights('pelvis', THREE.MathUtils.smoothstep(v.y, h - .22, h - .035), `thigh${side}`) : kneeBind(v);
    const width = engineer ? .115 : runner ? .098 : .084;
    b.loft(p.trousers, 0, legBind, [[.17, .042, .05, x], [.29, .048, .053, x], [kneeY - .1, width * .77, .08, x], [kneeY, width * .75, .079, x, -.005], [kneeY + .12, width, .105, x], [h - .09, width * 1.12, .119, x], [h + .065, width, .12, x]], {
      steps: 34, folds: engineer ? .035 : .018,
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
      b.ellipsoid('#252e32', 0, `shin${side}`, [x, kneeY - .045, -.077], [.083, .115, .025]);
      b.ribbon(p.coat, 0, `thigh${side}`, [[x + sign * .102, h - .16, -.025], [x + sign * .112, h - .24, -.03], [x + sign * .096, h - .31, -.01]], .08, .013);
    }
    if (runner) b.loft(p.trim, 0, `shin${side}`, [[.17, .055, .063, x], [.28, .061, .072, x]], { steps: 3 });
    const foot = `foot${side}`;
    b.ellipsoid('#202b31', 5, foot, [x, .038, -.061], [runner ? .098 : .085, .038, .176]);
    b.ellipsoid(p.shoes, 3, foot, [x, .09, -.063], [runner ? .095 : .08, .075, .166]);
    b.loft(p.shoes, 3, foot, [[.07, .072, .08, x], [.17, .064, .07, x], [runner ? .195 : .31, .061, .071, x]], { steps: 9 });
    b.ribbon(p.trim, 0, foot, [[x - .055, .065, .07], [x, .073, .098], [x + .055, .065, .07]], .016, .004);
    for (let i = 0; i < 4; i++) b.tube(runner ? p.accent : '#c1ae96', 0, foot, [[x - .033, .19 - i * .025, -.063 - i * .023], [x + .033, .183 - i * .025, -.064 - i * .023]], .003, 3);
  }
  const hemY = runner ? h + .08 : h - .045;
  const coatColor = new THREE.Color(p.coat), yokeColor = new THREE.Color(id === 'courier' ? p.trim : p.coatLight);
  const torsoColor = id === 'courier' || runner ? (v) => coatColor.clone().lerp(yokeColor,
    THREE.MathUtils.smoothstep(v.y, cy - .115, cy - .095) * THREE.MathUtils.smoothstep(v.z, .018, .045)) : p.coat;
  b.loft(torsoColor, 0, bodyBinding, [[hemY, p.waist * 1.16, .134], [h + .11, p.waist, .124], [cy - .17, p.shoulder * .8, .15], [cy - .035, p.shoulder * 1.02, .139], [cy + .025, p.shoulder * .83, .119], [cy + .08, .078, .065]], { steps: 29, segments: 32, folds: .018 });
  // Shoulder and collar tailoring follows the torso, with piping that remains visible from behind.
  b.loft(p.trim, 0, 'chest', [[cy + .02, .083, .075], [cy + .105, .071, .064]], { steps: 7 });
  if (id === 'courier' || runner) {
    b.ribbon(p.trim, 0, bodyBinding, [[-.18, cy - .1, .102], [0, cy - .13, .156], [.18, cy - .1, .102]], .012, .003);
  }
  b.ribbon(p.trim, 0, bodyBinding, [[0, hemY + .035, -.136], [0, cy - .18, -.154], [0, cy + .035, -.105]], .012, .003);
  if (engineer) {
    // Broad canvas bib and crossed suspender straps are an entirely different outfit.
    b.loft(p.trousers, 0, bodyBinding, [[h - .035, p.hip * 1.04, .139], [h + .17, .207, .139], [cy - .15, .182, .159]], { start: Math.PI, end: TAU, steps: 12 });
    for (const sign of [-1, 1]) {
      b.ribbon('#4b4440', 3, bodyBinding, [[sign * .165, cy + .015, -.11], [sign * .125, cy - .17, -.17], [sign * .16, h + .05, -.145]], .043, .008);
      b.ribbon('#4b4440', 3, bodyBinding, [[sign * .17, cy + .018, .10], [sign * .1, cy - .16, .16], [-sign * .14, h + .07, .135]], .047, .008);
      b.ellipsoid(p.metal, 4, bodyBinding, [sign * .125, cy - .17, -.181], [.018, .023, .005]);
    }
    b.ribbon(p.coatLight, 0, bodyBinding, [[-.08, cy - .23, -.163], [0, cy - .25, -.172], [.08, cy - .23, -.163]], .06, .009);
  }
  if (guard) {
    for (const sign of [-1, 1]) {
      b.ribbon(p.coatLight, 0, 'chest', [[sign * .06, cy + .06, -.11], [sign * .12, cy - .04, -.145], [sign * .065, cy - .23, -.155]], .047, .009);
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
    const bind = b.blendY(`foreArm${side}`, `upperArm${side}`, elbow.y - .11, elbow.y + .11);
    const width = engineer ? .112 : runner ? .088 : .08;
    const cuff = engineer ? elbow.y - .035 : hand.y + .045;
    b.loft(p.coat, 0, bind, [[cuff, width * .65, width * .67, elbow.x], [elbow.y, width * .79, width * .79, elbow.x], [upper.y - .13, width, width, upper.x + sign * .014], [upper.y + .022, width * .94, width * .93, upper.x], [upper.y + .064, .025, .029, upper.x - sign * .022], [upper.y + .07, 0, 0, upper.x - sign * .025]], { steps: 24, folds: .025 });
    if (engineer) b.loft(p.skin, 1, `foreArm${side}`, [[hand.y - .02, .042, .043, hand.x], [hand.y + .12, .064, .064, hand.x], [elbow.y + .02, .066, .064, elbow.x]], { steps: 14 });
    b.loft(p.trim, 0, bind, [[cuff, width * .67, width * .69, elbow.x], [cuff + (engineer ? .07 : .045), width * .77, width * .79, elbow.x]], { steps: 4 });
    b.loft(guard ? p.shoes : p.skin, guard ? 3 : 1, b.blendY(`hand${side}`, `foreArm${side}`, hand.y - .015, hand.y + .04), [[hand.y - .035, .035, .03, hand.x], [hand.y + .075, .034, .032, hand.x]], { steps: 6, segments: 16 });
    b.ellipsoid(guard ? p.shoes : p.skin, guard ? 3 : 1, `hand${side}`, [hand.x, hand.y - .039, -.01], [.047, .076, .036]);
    b.ellipsoid(guard ? p.shoes : p.skin, guard ? 3 : 1, `hand${side}`, [hand.x - sign * .039, hand.y - .018, -.025], [.018, .042, .021], [0, 0, -sign * .38]);
    for (let i = 0; i < 3; i++) b.tube(p.shadow, 1, `hand${side}`, [[hand.x - .025 + i * .018, hand.y - .08, -.033], [hand.x - .024 + i * .018, hand.y - .055, -.039]], .0014, 3, 4);
    if (runner) b.ribbon(p.trim, 0, `upperArm${side}`, [[upper.x + sign * width * .8, upper.y - .04, .03], [elbow.x + sign * width * .77, elbow.y + .03, .04]], .019, .004);
    if (guard) b.ribbon(p.metal, 4, `foreArm${side}`, [[hand.x - .045, hand.y + .09, -.04], [hand.x, hand.y + .08, -.06], [hand.x + .045, hand.y + .09, -.04]], .01, .003);
  }
}

function faceAndHair(id, p, r, b) {
  const head = r.points.head; const y = head.y, h = p.head; const engineer = id === 'engineer', guard = id === 'guard', runner = id === 'runner';
  b.loft(p.skin, 1, 'neck', [[y - .11, .057, .058], [y + .05, .067, .065]], { steps: 9, segments: 20 });
  // Contoured head profile: narrow chin, cheeks, temples, brow, then the cranium.
  b.loft(p.skin, 1, 'head', [[y - .005, .047 * h, .066], [y + .035, (engineer ? .105 : .078) * h, .084, 0, -.008], [y + .102, .12 * h, .101], [y + .177, .115 * h, .11], [y + .242, .102 * h, .094], [y + .277, .058, .053], [y + .286, 0, 0]], { steps: 23, segments: 28 });
  for (const sign of [-1, 1]) {
    b.ellipsoid(p.skin, 1, 'head', [sign * .12 * h, y + .131, .009], [.025, .042, .023]);
    b.ellipsoid(p.shadow, 1, 'head', [sign * .132 * h, y + .132, -.003], [.008, .025, .01]);
    b.ellipsoid(p.trim, 1, 'head', [sign * .048, y + .165, -.103], [guard ? .027 : .03, guard ? .011 : .014, .013]);
    b.ellipsoid('#253438', 1, 'head', [sign * .048, y + .165, -.115], [guard ? .009 : .012, guard ? .011 : .013, .004]);
    b.ellipsoid('#f2e8ca', 1, 'head', [sign * .045, y + .17, -.118], [.003, .003, .0015]);
    b.tube(p.hair, 2, 'head', [[sign * .023, y + .19, -.102], [sign * .048, y + .199, -.109], [sign * .079, y + .186, -.094]], guard ? .004 : .006, 10);
    if (guard) {
      b.tube('#a58170', 1, 'head', [[sign * .075, y + .15, -.091], [sign * .094, y + .141, -.078]], .0018, 5);
      b.tube('#a58170', 1, 'head', [[sign * .032, y + .108, -.104], [sign * .039, y + .083, -.093]], .0015, 5);
    }
  }
  b.ellipsoid(p.skin, 1, 'head', [0, y + .126, -.107], [guard ? .019 : .022, .036, .03]);
  b.tube(p.shadow, 1, 'head', [[-.027, y + .075, -.087], [0, y + .071, -.099], [.026, y + .077, -.087]], .003, 10);
  b.ellipsoid(p.skin, 1, 'head', [0, y + .054, -.083], [.033, .013, .013]);
  if (engineer) {
    b.loft('#875744', 2, 'head', [[y + .018, .061, .074], [y + .04, .102, .09], [y + .072, .114, .096]], { start: Math.PI * .91, end: TAU * 1.045, steps: 6, segments: 20 });
    for (let i = 0; i < 7; i++) b.tube(p.highlight, 2, 'head', [[-.075 + i * .025, y + .257, -.082], [-.06 + i * .024, y + .311 + Math.sin(i) * .008, -.024], [-.04 + i * .02, y + .277, .071]], .021, 14, 7);
    b.ellipsoid(p.hair, 2, 'head', [0, y + .245, .038], [.115, .064, .087]);
    const strap = Array.from({ length: 33 }, (_, i) => [Math.cos(i / 32 * TAU) * .122, y + .239, Math.sin(i / 32 * TAU) * .111]);
    b.tube('#3e3832', 3, 'head', strap, .01, 36);
    for (const sign of [-1, 1]) {
      b.add(new THREE.TorusGeometry(.037, .008, 8, 20), p.metal, 4, 'head', [sign * .051, y + .256, -.114]);
      b.ellipsoid('#497b87', 6, 'head', [sign * .051, y + .256, -.115], [.03, .03, .009]);
      b.tube('#c9e3dc', 6, 'head', [[sign * .051 - .012, y + .258, -.125], [sign * .051 - .004, y + .273, -.125]], .0023, 4);
    }
  } else if (id === 'courier') {
    b.ellipsoid(p.hair, 2, 'head', [0, y + .247, .025], [.124, .08, .113]);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      b.ellipsoid(i % 4 ? p.hair : p.highlight, 2, 'head', [Math.cos(a) * .092, y + .263 + Math.sin(a * 3) * .018, Math.sin(a) * .081 + .016], [.037, .044, .035]);
    }
    const hy = r.points.hair.y;
    b.ellipsoid(p.hair, 2, 'hair', [0, hy - .04, .19], [.105, .126, .087]);
    for (let strand = 0; strand < 15; strand++) {
      const angle = strand / 15 * TAU;
      const points = Array.from({ length: 27 }, (_, step) => {
        const t = step / 26, phase = t * TAU * 2.4 + angle;
        return [Math.cos(angle) * (.065 + .02 * Math.sin(t * Math.PI)) + Math.sin(phase) * .013, hy + .025 - t * (.29 + strand % 3 * .03), .13 + Math.sin(angle) * .055 + t * .14 + Math.cos(phase) * .013];
      });
      b.tube(strand % 4 ? p.hair : p.highlight, 2, b.blendY('hairTip', 'hair', hy - .23, hy - .08), points, .014, 28, 6);
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
    for (let i = 0; i < 7; i++) b.ellipsoid(i % 3 ? p.hair : p.highlight, 2, 'head', [-.063 + i * .024, y + .27 + i * .006, -.004], [.035, .066 - i * .003, .098], [.02, .1, -.42]);
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
    b.ellipsoid('#67463a', 3, 'bag', [.258, h - .075, .075], [.115, .16, .087], [.05, -.15, -.15]);
    b.ellipsoid('#94674d', 3, 'bag', [.26, h - .02, .13], [.12, .073, .053], [-.2, 0, -.15]);
    b.ribbon('#d3af78', 4, 'bag', [[.255, h + .005, .182], [.261, h - .075, .174]], .026, .008);
    b.tube(p.trim, 0, 'bag', [[.17, h - .11, .126], [.25, h - .19, .14], [.34, h - .11, .12]], .0025, 16);
    b.loft(p.accent, 0, 'neck', [[cy + .075, .078, .073], [cy + .117, .077, .074]], { steps: 5 });
    b.ribbon(p.accent, 0, 'chest', [[.035, cy + .095, -.075], [.06, cy + .01, -.14], [.09, cy - .08, -.156]], .05, .006);
  } else if (id === 'engineer') {
    b.loft('#554638', 3, 'pelvis', [[h - .035, .229, .143], [h + .018, .23, .142]], { steps: 4 });
    for (const sign of [-1, 1]) {
      b.ellipsoid('#6e5140', 3, 'pelvis', [sign * .207, h - .09, .08], [.078, .116, .073]);
      b.ellipsoid('#957253', 3, 'pelvis', [sign * .21, h - .02, .1], [.082, .045, .069]);
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
    b.ellipsoid('#c99e55', 0, 'pelvis', [0, h + .015, .15], [.103, .065, .04]);
    b.ribbon('#303a39', 3, 'pelvis', [[-.16, h + .055, .06], [0, h + .052, .151], [.16, h + .055, .06]], .026, .006);
    b.tube(p.accent, 0, 'pelvis', [[-.025, h + .047, -.14], [-.018, h - .07, -.145]], .005, 8);
    b.tube(p.accent, 0, 'pelvis', [[.02, h + .047, -.14], [.04, h - .045, -.154]], .005, 8);
  }
}

function clipsFor(rig, id) {
  const p = profiles[id], clips = [];
  for (const [name, duration, frames] of [['idle', 3.4, 32], ['run', .72, 36], ['jump', 1, 30], ['stumble', .65, 20]]) {
    const tracks = [], times = Array.from({ length: frames + 1 }, (_, i) => i / frames * duration);
    const rotations = Object.fromEntries(rig.bones.map((b) => [b.name, []])); const positions = [];
    for (let i = 0; i <= frames; i++) {
      const t = i / frames, phase = t * TAU, run = name === 'run', jump = name === 'jump', stumble = name === 'stumble';
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
          // 40% planted stance, 60% lifted recovery, with alternating aerial phases.
          // This is baked into the clip, not per-frame terrain or physics IK.
          const cycle = (t + (side === 'L' ? 0 : .5)) % 1;
          const stance = cycle < .4;
          const u = stance ? cycle / .4 : (cycle - .4) / .6;
          const eased = u * u * (3 - 2 * u);
          const stride = p.leg * .34;
          const z = stance ? -stride + stride * 2 * u : stride - stride * 2 * eased;
          const lift = stance ? 0 : Math.sin(Math.PI * u) * (id === 'runner' ? .43 : id === 'engineer' ? .34 : .39);
          const l1 = (p.leg - .18) * .52, l2 = (p.leg - .18) * .48;
          const dy = .14 + lift - (p.leg - .04 + bodyHeight);
          const cosine = THREE.MathUtils.clamp((dy * dy + z * z - l1 * l1 - l2 * l2) / (2 * l1 * l2), -.99, .999);
          const knee = -Math.acos(cosine);
          const hip = Math.atan2(-z, -dy) - Math.atan2(l2 * Math.sin(knee), l1 + l2 * Math.cos(knee));
          pose[`thigh${side}`][0] = hip;
          pose[`shin${side}`][0] = knee;
          pose[`foot${side}`][0] = -(hip + knee) + (stance ? -.08 * Math.sin(u * Math.PI) : .32 * Math.sin(u * Math.PI));
        }
        const armSwing = Math.cos(phase + (side === 'L' ? 0 : Math.PI));
        pose[`upperArm${side}`] = [run ? -armSwing * .7 - .08 : jump ? -.15 + tuck * .72 : stumble ? wave * .6 : -.04, 0, sign * (stumble ? .42 : .08)];
        pose[`foreArm${side}`] = [run ? 1.05 + armSwing * .22 : jump ? .9 + tuck * .5 : stumble ? .9 : .1, 0, 0];
        pose[`hand${side}`] = [.035, 0, sign * .06];
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

export function authorAvatar(id) {
  const p = profiles[id]; if (!p) throw new Error(`Unknown avatar: ${id}`);
  const rig = makeSkeleton(p), builder = createBuilder(rig);
  bodyAndLegs(id, p, rig, builder); arms(id, p, rig, builder); faceAndHair(id, p, rig, builder); equipment(id, p, rig, builder);
  const mesh = builder.finish(); rig.root.name = `${id}_original_v3`;
  rig.root.userData = { id, authoring: 'Original procedural Three.js contoured profiles and skinned meshes', license: 'Project original asset', height: p.height, version: 3 };
  return { scene: rig.root, animations: clipsFor(rig, id), triangles: mesh.geometry.index.count / 3, vertices: mesh.geometry.attributes.position.count };
}

async function main() {
  const directory = new URL('../assets/characters/', import.meta.url); await mkdir(directory, { recursive: true }); const manifest = {};
  for (const id of Object.keys(profiles)) {
    const asset = authorAvatar(id);
    const result = await new GLTFExporter().parseAsync(asset.scene, { binary: true, animations: asset.animations, onlyVisible: true });
    await writeFile(new URL(`${id}.glb`, directory), Buffer.from(result));
    manifest[id] = { bytes: result.byteLength, triangles: asset.triangles, vertices: asset.vertices, animations: asset.animations.map((a) => a.name), height: profiles[id].height };
    console.log(`${id}: ${result.byteLength.toLocaleString()} bytes; ${asset.triangles.toLocaleString()} triangles`);
  }
  await writeFile(new URL('manifest.json', directory), JSON.stringify({ generator: 'node scripts/build-avatars.mjs', original: true, version: 3, avatars: manifest }, null, 2) + '\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
