import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function release(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(item => {
    if (item.isInstancedMesh) item.dispose();
    if (item.geometry) geometries.add(item.geometry);
    for (const material of [item.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  root.removeFromParent(); root.clear();
}
// Bake static sections by material: detailed scenery without thousands of draws.
export function batchWorldGeometry(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), meshes = [];
  root.traverse(item => {
    if (!item.isMesh || Array.isArray(item.material)) return;
    const geometry = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
    // Textured deck/trail surfaces retain their authored coordinates. Leaves
    // have no texture, but need a matching attribute layout for the merge.
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
    geometry.applyMatrix4(item.matrixWorld);
    const bucket = buckets.get(item.material) || [];
    bucket.push(geometry); buckets.set(item.material, bucket); meshes.push(item);
  });
  const oldGeometry = new Set(meshes.map(mesh => mesh.geometry));
  for (const mesh of meshes) mesh.removeFromParent();
  for (const geometry of oldGeometry) geometry.dispose();
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries);
    for (const value of geometries) value.dispose();
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  }
}

