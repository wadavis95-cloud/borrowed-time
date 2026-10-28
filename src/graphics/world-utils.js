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


// Small deterministic height textures: shared per map, disposed with its materials.
// Surface color stays authored; lighting supplies the relief, without baked shadows.
export function surfaceRelief(kind='stone') {
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const grain=Math.sin(x*12.9898+y*78.233)*43758.5453;
    const noise=(grain-Math.floor(grain))-.5;
    let height=.5+noise*.18;
    if(kind==='wood')height+=Math.sin(x*.7+Math.sin(y*.13)*1.8)*.14+Math.sin(x*2.2+y*.03)*.06;
    else if(kind==='metal')height+=Math.sin(y*2.1)*.025;
    else if(kind==='snow')height+=Math.sin(x*.17)*Math.sin(y*.2)*.08;
    else height+=Math.sin(x*.24+y*.13)*Math.cos(y*.31)*.10;
    const value=Math.round(THREE.MathUtils.clamp(height,0,1)*255),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.repeat.set(kind==='wood'?4:6,kind==='wood'?8:6);texture.needsUpdate=true;
  return {bumpMap:texture,bumpScale:kind==='metal'?.008:kind==='wood'?.018:kind==='snow'?.025:.045};
}
