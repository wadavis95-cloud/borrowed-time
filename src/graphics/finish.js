import * as THREE from 'three';
import {batchWorldGeometry,release} from './world-utils.js';
import {DISTANCE_SCALE,LANE_WIDTH} from './tunnel.js';
import {ESCAPE_DESTINATIONS} from '../finish-destinations.js';
export {ESCAPE_DESTINATIONS} from '../finish-destinations.js';

// Small rescue landmarks sit beyond the finish, never in the collision course.
export function createFinish(scene,mapId,courseLength) {
  const theme=ESCAPE_DESTINATIONS[mapId]||ESCAPE_DESTINATIONS.tunnel;
  const root=new THREE.Group(),landmark=new THREE.Group();root.name=`escape-destination-${mapId}`;root.add(landmark);scene.add(root);
  const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.8});
  const frame=mat(mapId==='orbital'?'#b7cbd2':mapId==='jungle'?'#826a41':'#81664f');
  const trim=mat(theme.color),dark=mat('#30464c'),white=mat('#e0e4cf');
  const mesh=(geo,m,x,y,z)=>{const item=new THREE.Mesh(geo,m);item.position.set(x,y,z);landmark.add(item);return item;};
  const box=(m,x,y,z,w,h,d)=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  const post=(x,z,height)=>mesh(new THREE.CylinderGeometry(.14,.18,height,8),frame,x,height/2,z);
  // A floor extension leads the eye beyond the finish while inputs/rules end normally.
  if(mapId!=='tunnel')box(frame,0,-.16,-3,8.7,.28,7);
  if(mapId==='pirate') {
    // Broad rescue vessel alongside the exit, with cabin, mast and life ring.
    box(dark,9,.45,-7,6,1.7,15);box(frame,9,1.4,-7,6.3,.22,15);
    box(white,9,3,-10,4.8,3,4);box(trim,9,4.6,-10,5,.25,4.2);
    post(9,-4,8);box(trim,10.2,7,-4,2.2,1,.08);
    const ring=mesh(new THREE.TorusGeometry(.65,.14,8,24),trim,6,2.1,-5);ring.rotation.y=Math.PI/2;
    box(frame,3.9,.04,-2,3.7,.16,2.5);
  } else if(mapId==='jungle'||mapId==='frozen') {
    const x=mapId==='jungle'?6:-6;
    const tent=mesh(new THREE.ConeGeometry(3.3,4,4),mapId==='frozen'?mat('#da8052'):trim,x,2,-6);tent.rotation.y=Math.PI/4;
    box(dark,x,1.1,-3.64,1.7,2.2,.06);
    post(-3.6,-1,5);post(3.6,-1,5);box(trim,0,4.7,-1,7.4,.5,.18);
    post(-5,-3,6);box(mapId==='frozen'?mat('#efad71'):white,-4.1,5.4,-3,1.8,.8,.06);
  } else if(mapId==='orbital') {
    const hull=mesh(new THREE.CapsuleGeometry(1.7,5,4,12),white,6,2.6,-7);hull.rotation.x=Math.PI/2;
    box(dark,6,3.2,-3.5,2.5,1.3,.8);box(trim,6,1,-3.5,2.6,.2,.6);
    for(const side of [-1,1])box(dark,6+side*2.3,1.4,-7,2,.3,5);
    box(frame,2,.2,-2,4,.3,3);post(-3.6,-1,5);post(3.6,-1,5);box(trim,0,5,-1,7.4,.3,.3);
  } else if(mapId==='desert') {
    for(const side of [-1,1]){box(frame,side*3.6,2.5,-2,1.1,5,2);box(trim,side*3.6,5,-2,1.5,.3,2.4);}
    box(frame,0,5.3,-2,8.4,.6,2.6);box(trim,0,4.9,-4,7,.12,5);
    for(const side of [-1,1]){post(side*5,-2,5);box(trim,side*5.5,4.4,-2,1,.8,.07);}
  } else {
    for(const side of [-1,1])box(trim,side*4.7,2,-3,.8,4,1);
    box(trim,0,4.3,-3,10,.35,1);
  }
  batchWorldGeometry(landmark);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.7,.85,48),new THREE.MeshBasicMaterial({color:theme.color,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
  halo.name='local-escape-halo';halo.rotation.x=-Math.PI/2;halo.visible=false;scene.add(halo);
  let before=null,age=2,disposed=false;
  function reset(){before=null;age=2;halo.visible=false;}
  function update(state,dt,reducedMotion) {
    if(disposed)return;
    root.position.z=(state.distance-courseLength)*DISTANCE_SCALE;
    if(before==='running'&&state.phase==='won')age=0;
    before=state.phase;
    if(state.phase!=='paused')age+=Math.min(.1,Math.max(0,dt||0));
    halo.visible=!reducedMotion&&state.phase==='won'&&age<.9;
    if(halo.visible){halo.position.set(((state.lane??1)-1)*LANE_WIDTH,.06,0);halo.scale.setScalar(1+age*6);halo.material.opacity=(1-age/.9)*.65;}
  }
  return {update,reset,dispose(){if(disposed)return;disposed=true;release(root);release(halo);}};
}
