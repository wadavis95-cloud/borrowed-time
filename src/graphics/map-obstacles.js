import * as THREE from 'three';
import { DISTANCE_SCALE } from './tunnel.js';

// Presentation only: rubble/barrier/gap retain their tested collision meanings.
export function createMapObstacle(mapId, obstacle) {
  const ship = mapId === 'pirate', group = new THREE.Group();
  const mat = (color, extras={}) => new THREE.MeshStandardMaterial({color,roughness:.84,...extras});
  const timber=mat(ship?'#a77742':'#795537'), ends=mat(ship?'#d0a061':'#c1a574'), iron=mat('#384b50',{metalness:.5});
  function mesh(geometry,material,x,y,z) { const item=new THREE.Mesh(geometry,material);item.position.set(x,y,z);item.castShadow=item.receiveShadow=true;group.add(item);return item; }
  const box=(m,x,y,z,a,b,c)=>mesh(new THREE.BoxGeometry(a,b,c),m,x,y,z);
  const log=(x,y,z,r,length)=>{ const value=mesh(new THREE.CylinderGeometry(r,r,length,12),timber,x,y,z);value.rotation.z=Math.PI/2;return value; };
  if(obstacle.type==='gap') {
    const length=obstacle.length*DISTANCE_SCALE;
    const hole=new THREE.MeshBasicMaterial({color:ship?'#154b63':'#ff681b',toneMapped:false});
    const plane=mesh(new THREE.BoxGeometry(2.14,.08,length),hole,0,.025,-length/2);plane.renderOrder=2;
    for(const side of [-1,1])box(ends,side*1.08,.08,-length/2,.12,.14,length+.1);
    for(const z of [.1,-length-.1]) {
      const edge=box(ship?timber:iron,0,.13,z,2.2,.19,.25);edge.rotation.y=.045;
      if(ship)for(let j=0;j<5;j++)box(ends,-.9+j*.43,.08,z-.13,.17,.12,.45+(j%2)*.2);
    }
    if(!ship) {
      const hot=mat('#ffb126',{emissive:'#ff850e',emissiveIntensity:2,toneMapped:false});
      for(let j=0;j<4;j++){const stone=mesh(new THREE.DodecahedronGeometry(.18),iron,Math.sin(j*3)*.65,.18,-length*(j+.5)/4);stone.scale.y=.5;}
      box(hot,0,.072,-length*.5,.10,.015,length*.9);
    }
  } else if(ship && obstacle.type==='barrier') {
    for(let row=0;row<2;row++)for(let col=0;col<2;col++) {
      const x=(col-.5)*.96,y=.5+row*.97,z=-.16;
      box(timber,x,y,z,.91,.94,.85);
      for(const yy of [y-.36,y+.36])box(ends,x,yy,z+.44,.91,.09,.05);
      for(const xx of [x-.35,x+.35])box(ends,xx,y,z+.44,.09,.94,.05);
      const brace=box(ends,x,y,z+.48,.08,1.1,.05);brace.rotation.z=.7;
    }
  } else if(ship) {
    const barrel=new THREE.Group(); group.add(barrel);barrel.position.y=.45;
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,1.6,14),timber);body.rotation.z=Math.PI/2;barrel.add(body);body.castShadow=true;
    for(const x of [-.6,.6]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.39,.045,5,16),iron);ring.rotation.y=Math.PI/2;ring.position.x=x;barrel.add(ring);}
    for(const x of [-.8,.8]){const cap=new THREE.Mesh(new THREE.CircleGeometry(.37,14),ends);cap.rotation.y=x<0?-Math.PI/2:Math.PI/2;cap.position.x=x;barrel.add(cap);}
    group.userData.barrel=barrel;
  } else {
    const tall=obstacle.type==='barrier';
    const trunk=log(0,tall?1.05:.36,-.12,tall?.95:.3,1.95);
    trunk.rotation.y=.08;
    for(const x of [-.99,.99]) {const cap=mesh(new THREE.CircleGeometry(tall?.88:.27,12),ends,x,tall?1.05:.36,-.12);cap.rotation.y=x<0?-Math.PI/2:Math.PI/2;}
    if(tall) {const root=log(.6,1.6,-.1,.16,.8);root.rotation.z=.7;}
  }
  return group;
}
