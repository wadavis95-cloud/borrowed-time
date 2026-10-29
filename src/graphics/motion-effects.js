// One bounded local effect pool. Rivals never enter this module.
import * as THREE from 'three';
import { createMovementFeedback, SURFACE_FEEDBACK } from '../movement-feedback.js';
import { DISTANCE_SCALE, LANE_WIDTH } from './tunnel.js';

export function createMotionEffects(scene) {
  const tracker=createMovementFeedback(),capacity=48;
  const material=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.6,depthWrite:false,toneMapped:false});
  const geometry=new THREE.BoxGeometry(1,1,1);
  const particles=new THREE.InstancedMesh(geometry,material,capacity);particles.frustumCulled=false;particles.visible=false;particles.name='local-contact-particles';scene.add(particles);
  // Fix the shader layout before warmup: setColorAt would otherwise allocate
  // instanceColor and introduce USE_INSTANCING_COLOR on the first footstep.
  const initialColor=new THREE.Color('#ffffff');
  for(let i=0;i<capacity;i++)particles.setColorAt(i,initialColor);
  particles.instanceColor.needsUpdate=true;
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#d4e6d5',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const ringGeometry=new THREE.RingGeometry(.25,.29,32);
  const ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.rotation.x=-Math.PI/2;ring.visible=false;ring.name='local-contact-ripple';scene.add(ring);
  const pool=Array.from({length:capacity},()=>({age:1,life:0}));
  const object=new THREE.Object3D(),color=new THREE.Color();
  let cursor=0,sequence=0,ripple=null,disposed=false;
  function reset() {tracker.reset();for(const p of pool)p.life=0;cursor=sequence=0;ripple=null;particles.visible=ring.visible=false;}
  function update(state,view,dt,reducedMotion) {
    if(disposed||state.phase==='paused')return 0;
    const step=Math.min(.1,Math.max(0,dt||0)),surface=SURFACE_FEEDBACK[state.mapId]||SURFACE_FEEDBACK.tunnel;
    for(const p of pool)p.age+=step;
    if(ripple)ripple.age+=step;
    const events=tracker.update(state,step,reducedMotion);
    if(reducedMotion){for(const p of pool)p.life=0;ripple=null;particles.visible=ring.visible=false;return 0;}
    for(const event of events) {
      const foot=event.kind==='footstep',hit=event.kind==='hit',land=event.kind==='landing';
      const count=foot?2:hit?10:land?8:5;
      sequence++;
      for(let i=0;i<count;i++) {
        const p=pool[cursor++%capacity],angle=i*2.399+sequence*.7;
        Object.assign(p,{age:event.age,life:foot?.22:land?.38:.30,x:(view.lane-1)*LANE_WIDTH+(foot?event.side*.12:0),distance:state.distance,
          y:hit?view.jumpHeight+.8:.045,vx:Math.sin(angle)*(foot?.32:1),vz:Math.cos(angle)*.6,
          vy:hit?.8:surface.lift*(land?4:3),size:foot?.045:hit?.065:.075,color:hit?'#ffcc8c':surface.color});
      }
      if(land||hit)ripple={age:event.age,life:land?.36:.24,x:(view.lane-1)*LANE_WIDTH,distance:state.distance,kind:event.kind,color:hit?'#ffcf86':surface.color};
    }
    let active=false;
    for(let i=0;i<capacity;i++) {
      const p=pool[i],alive=p.age<p.life,t=alive?p.age/p.life:1;
      if(alive) {
        active=true;
        object.position.set(p.x+p.vx*p.age,Math.max(.035,p.y+p.vy*p.age-1.9*p.age*p.age),(state.distance-p.distance)*DISTANCE_SCALE+p.vz*p.age);
        object.rotation.set(p.age*4,i*.8,p.age*3);object.scale.setScalar(p.size*(1-t));
        color.set(p.color);particles.setColorAt(i,color);
      } else object.scale.setScalar(0);
      object.updateMatrix();particles.setMatrixAt(i,object.matrix);
    }
    particles.visible=active;particles.instanceMatrix.needsUpdate=true;
    if(particles.instanceColor)particles.instanceColor.needsUpdate=true;
    ring.visible=Boolean(ripple&&ripple.age<ripple.life);
    if(ring.visible){const t=ripple.age/ripple.life;ring.position.set(ripple.x,.047,(state.distance-ripple.distance)*DISTANCE_SCALE);ring.scale.setScalar(1+t*2.3);ringMaterial.color.set(ripple.color);ringMaterial.opacity=(1-t)*.36;}
    return ripple?.kind==='landing'&&ripple.age<.25?Math.sin(Math.PI*ripple.age/.25):0;
  }
  function dispose(){if(disposed)return;disposed=true;reset();scene.remove(particles,ring);particles.dispose();geometry.dispose();material.dispose();ringGeometry.dispose();ringMaterial.dispose();}
  reset();
  return {update,reset,dispose};
}
