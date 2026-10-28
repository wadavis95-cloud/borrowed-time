// Generate four still portraits on demand with one temporary WebGL context.
import * as THREE from 'three';
import {createAvatar} from './avatars.js';
const cache=new Map();
export function characterPortraits(ids){
  const missing=ids.filter(id=>!cache.has(id));
  if(missing.length){
    const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
    renderer.setSize(180,220,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const scene=new THREE.Scene(),ambient=new THREE.HemisphereLight('#fff4df','#557282',2.6),sun=new THREE.DirectionalLight('#ffe0b0',2.4);sun.position.set(-3,5,-4);scene.add(ambient,sun);
    const camera=new THREE.PerspectiveCamera(34,180/220,.1,100);
    try{
      for(const id of missing){
        const avatar=createAvatar(id);
        try{
          scene.add(avatar.group);avatar.update({phase:'ready',distance:0,lane:1},0);avatar.group.updateMatrixWorld(true);
          const box=new THREE.Box3().setFromObject(avatar.group),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
          const distance=Math.max(size.y,size.x/camera.aspect)/2/Math.tan(THREE.MathUtils.degToRad(17))*1.15;
          camera.position.set(center.x,center.y+.05,center.z-distance);camera.lookAt(center);renderer.render(scene,camera);
          cache.set(id,canvas.toDataURL('image/png'));
        }finally{avatar.dispose();}
      }
    }finally{renderer.dispose();renderer.forceContextLoss();scene.clear();}
  }
  return Object.fromEntries(ids.map(id=>[id,cache.get(id)]));
}
