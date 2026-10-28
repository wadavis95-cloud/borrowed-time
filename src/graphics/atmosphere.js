// Fixed-size cosmetic edge effects: no collision objects or lane-crossing dust.
import * as THREE from 'three';
import {release} from './world-utils.js';
const COLORS={tunnel:'#d5d6bb',pirate:'#c1eeef',jungle:'#a7aa8d',frozen:'#eef9ff',orbital:'#9ab9d1',desert:'#e5b47b'};
export function createAtmosphere(scene,mapId) {
  const root=new THREE.Group();root.name=`atmosphere-${mapId}`;scene.add(root);
  const positions=new Float32Array(72*3);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:COLORS[mapId]||COLORS.tunnel,size:mapId==='frozen'?.085:.055,transparent:true,opacity:mapId==='tunnel'?.22:.38,depthWrite:false});
  const particles=new THREE.Points(geometry,material);particles.name='ambient-edge-particles';particles.frustumCulled=false;root.add(particles);
  let lights=null;
  const transform=new THREE.Object3D();
  if(mapId==='orbital') {
    lights=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.32,.35),new THREE.MeshBasicMaterial({color:'#ffa97b',transparent:true,opacity:.65}),30);
    lights.name='station-warning-lights';lights.frustumCulled=false;root.add(lights);
  }
  let disposed=false;
  function update(distance,elapsed,reducedMotion) {
    if(disposed)return;
    const time=reducedMotion?0:elapsed;
    particles.visible=!reducedMotion;
    for(let i=0;i<72;i++) {
      const side=i%2?1:-1,seed=i*2.399;
      // Sparse silhouettes remain beyond all three lanes and low-obstacle cues.
      const drift=mapId==='desert'?time*.6:mapId==='frozen'?time*.22:time*.08;
      positions[i*3]=side*(5.3+(i%7)*.68+Math.sin(time*.4+seed)*.12);
      const falling=mapId==='frozen'||mapId==='jungle';
      positions[i*3+1]=mapId==='pirate'?.35+((i*.71+time*.2)%2):1.5+((i*.73+(falling?-time*.35:time*.1))%6+6)%6;
      positions[i*3+2]=8-((i*1.31-distance*.058+drift)%90+90)%90;
    }
    geometry.attributes.position.needsUpdate=true;
    if(lights) {
      lights.material.opacity=reducedMotion?.65:.55+Math.sin(time*1.5)*.15;
      for(let i=0;i<30;i++) {
        const pair=i>>1,z=-Math.floor(pair/3)*20-3-(pair%3)*6;
        transform.position.set(i%2?4.8:-4.8,1.8,z+distance*.058);
        transform.updateMatrix();lights.setMatrixAt(i,transform.matrix);
      }
      lights.instanceMatrix.needsUpdate=true;
    }
  }
  update(0,0,true);
  return {update,dispose(){if(disposed)return;disposed=true;release(root);}};
}
