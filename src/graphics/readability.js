// Shared visual vocabulary, never a collision/ability rule.
import * as THREE from 'three';
import { DISTANCE_SCALE } from './tunnel.js';

const clamp=THREE.MathUtils.clamp;
function chevronGeometry() {
  const shape=new THREE.Shape();
  shape.moveTo(-.24,-.025);shape.lineTo(0,.19);shape.lineTo(.24,-.025);
  shape.lineTo(.16,-.115);shape.lineTo(0,.035);shape.lineTo(-.16,-.115);shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function addObstacleReadability(group,obstacle,mapId='tunnel') {
  if(group.userData.readability) return group;
  const low=obstacle.type==='rubble', gap=obstacle.type==='gap';
  group.userData.readability=low?'hop':'long-jump';
  if(group.getObjectByName('hop-cue')||group.getObjectByName('long-jump-cue'))return group;
  const light=new THREE.MeshBasicMaterial({color:low?'#f0f8f5':'#ffe09a',toneMapped:false,side:THREE.DoubleSide});
  const dark=new THREE.MeshBasicMaterial({color:mapId==='orbital'?'#07101d':'#142a32',toneMapped:false,side:THREE.DoubleSide});
  const add=(parent,geometry,material,x,y,z,name)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.name=name||'';parent.add(mesh);return mesh;};
  const cue=new THREE.Group();cue.name=low?'hop-cue':'long-jump-cue';group.add(cue);
  const count=low?1:2;
  if(gap) {
    const length=(obstacle.length||8)*DISTANCE_SCALE;
    const artTop=new THREE.Box3().setFromObject(group).max.y;
    const edgeY=Math.max(.19,(Number.isFinite(artTop)?artTop:.12)+.035);
    // Opaque depth silhouette and both ends prevent water/ice/sand from reading
    // like a safe, differently colored patch of trail.
    const pit=add(group,new THREE.PlaneGeometry(2.08,length),dark,0,.085,-length/2,'gap-depth');pit.rotation.x=-Math.PI/2;
    const depths={tunnel:'#07151b',pirate:'#173f50',jungle:'#e94e12',frozen:'#20546d',orbital:'#030716',desert:'#62402d'};
    const wellMaterial=new THREE.MeshBasicMaterial({color:depths[mapId]||depths.tunnel,toneMapped:false,side:THREE.DoubleSide});
    const well=add(group,new THREE.PlaneGeometry(1.72,Math.max(.1,length-.28)),wellMaterial,0,.088,-length/2,'gap-interior');well.rotation.x=-Math.PI/2;
    for(const [name,z] of [['near',.10],['far',-length-.1]]) {
      add(group,new THREE.BoxGeometry(2.18,.035,.10),dark,0,edgeY-.01,z);
      add(group,new THREE.BoxGeometry(1.98,.035,.05),light,0,edgeY,z,'gap-edge-'+name);
    }
    for(const x of [-1.04,1.04])add(group,new THREE.BoxGeometry(.065,.025,length),light,x,edgeY,-length/2);
    cue.position.set(0,.065,.56);cue.rotation.x=-Math.PI/2;
  } else {
    const padMaterial=new THREE.MeshBasicMaterial({color:'#102631',transparent:true,opacity:mapId==='frozen'?.43:.28,depthWrite:false,side:THREE.DoubleSide});
    const pad=add(group,new THREE.PlaneGeometry(2.16,1.18),padMaterial,0,.025,-.1,'hazard-contrast-pad');pad.rotation.x=-Math.PI/2;
    // Face cues sit just in front of the themed silhouette, not inside a trunk.
    const bounds=new THREE.Box3().setFromObject(group);
    cue.position.set(0,low?.38:1.17,Math.max(.48,bounds.max.z+.025));
  }
  add(cue,new THREE.PlaneGeometry(.64,low?.43:.68),dark,0,low?.03:.01,-.008);
  for(let i=0;i<count;i++)add(cue,chevronGeometry(),light,0,low?0:(i-.5)*.25,0);
  return group;
}

export function warningPresentation(event,elapsed,reducedMotion=false) {
  const span=Math.max(.001,event.impactAt-event.warnAt);
  const remaining=clamp((event.impactAt-elapsed)/span,0,1);
  const visible=elapsed>=event.warnAt&&elapsed<event.impactAt;
  return {visible,remaining,urgent:visible&&elapsed>=event.fallAt,
    pulse:reducedMotion?1:.5+.5*Math.sin((elapsed-event.warnAt)*(elapsed>=event.fallAt?14:8))};
}
