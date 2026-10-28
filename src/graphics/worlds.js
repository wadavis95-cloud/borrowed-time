// Original, map-specific set dressing. Simulation still owns metres and hazards.
import * as THREE from 'three';
import { batchWorldGeometry, release } from './world-utils.js';
import { createExpansionWorld } from './expansion-worlds.js';
export { batchWorldGeometry } from './world-utils.js';
import { createTunnel, DISTANCE_SCALE } from './tunnel.js';

export function createWorld(scene, mapId, courseLength) {
  if (['frozen','orbital','desert'].includes(mapId)) return createExpansionWorld(scene, mapId, courseLength);
  const holder = new THREE.Group(); holder.name = `world-${mapId}`; scene.add(holder);
  if (mapId === 'tunnel') {
    const tunnel = createTunnel(holder, courseLength);
    return { update: (...args) => tunnel.update(...args), dispose: () => release(holder) };
  }
  const ship = mapId === 'pirate', length = courseLength * DISTANCE_SCALE;
  const track = new THREE.Group(); holder.add(track);
  const background = new THREE.Group(); holder.add(background);
  const skyCanvas=document.createElement('canvas');skyCanvas.width=512;skyCanvas.height=256;
  const skyContext=skyCanvas.getContext('2d'), skyGradient=skyContext.createLinearGradient(0,0,0,256);
  skyGradient.addColorStop(0,ship?'#528da9':'#6caeb8');skyGradient.addColorStop(.7,ship?'#b1d3d8':'#bbd9b0');skyGradient.addColorStop(1,ship?'#f3dbb0':'#d9dba4');
  skyContext.fillStyle=skyGradient;skyContext.fillRect(0,0,512,256);
  skyContext.fillStyle='#ffffff18';
  for(let c=0;c<12;c++){skyContext.beginPath();skyContext.ellipse((c*143)%512,35+(c*47)%100,45+(c%3)*20,6+(c%2)*7,0,0,Math.PI*2);skyContext.fill();}
  const skyMap=new THREE.CanvasTexture(skyCanvas);skyMap.colorSpace=THREE.SRGBColorSpace;
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(1600,800),new THREE.MeshBasicMaterial({map:skyMap,fog:false,depthWrite:false}));
  sky.position.set(0,120,-490);background.add(sky);

  const sections = [], smoke = [], lava = [], waves = [], windItems = [];
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .88, ...extra });
  function surface(kind) {
    const image=document.createElement('canvas');image.width=image.height=256;
    const ctx=image.getContext('2d');
    ctx.fillStyle=kind==='wood'?'#ba966e':'#b5aa7a';ctx.fillRect(0,0,256,256);
    for(let j=0;j<1500;j++) {
      const x=(j*97.13)%256,y=(j*51.73)%256;
      ctx.fillStyle=j%3?'#252e2814':'#fff2c71c';
      ctx.fillRect(x,y,kind==='wood'?1:1.5,kind==='wood'?8+(j%13):1.5);
    }
    if(kind==='wood') {
      ctx.strokeStyle='#48392a66';ctx.lineWidth=2;
      for(let x=0;x<=256;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.stroke();}
      for(let j=0;j<8;j++){const x=(j%4)*64+8,y=(j*71)%256;ctx.fillStyle='#403b32';ctx.fillRect(x,y,2,3);ctx.fillRect(x+46,y,2,3);}
    }
    const texture=new THREE.CanvasTexture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
  }
  const woodMap=surface('wood'), soilMap=surface('soil');
  const wood = material('#b28a5a', {map:woodMap}), woodLight = material('#b9834c'), woodDark = material('#4d352a');
  const iron = material('#34434a', { metalness: .55, roughness: .48 });
  const canvas = material('#e1d5b3', { side: THREE.DoubleSide });
  const leaves = material('#237d4e'), leavesLight = material('#63a551'), bark = material('#70513a');
  const soil = material('#c1b184', {map:soilMap}), rock = material('#41484b'), distantRock = material('#626d6b');
  const glow = material('#ff692b', { fog:false, emissive: '#ff4d0c', emissiveIntensity: 2, toneMapped: false });
  if(ship) soilMap.dispose(); else woodMap.dispose();
  const ocean = material('#247f98', { metalness: .35, roughness: .35 });
  function mesh(group, geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const value = new THREE.Mesh(geometry, mat); value.position.set(x,y,z); value.scale.set(sx,sy,sz); group.add(value); return value;
  }
  const box = (g,m,x,y,z,a,b,c) => mesh(g,new THREE.BoxGeometry(a,b,c),m,x,y,z);
  const cylinder = (g,m,x,y,z,r,h) => mesh(g,new THREE.CylinderGeometry(r*.8,r,h,9),m,x,y,z);
  const cable = (g,m,a,b,r = .035) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const item = mesh(g,new THREE.CylinderGeometry(r,r,delta.length(),6),m,...start.add(end).multiplyScalar(.5).toArray());
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return item;
  };
  function palm(g,x,z,h,seed) {
    const trunk = cylinder(g,bark,x,h/2,z,.25,h); trunk.rotation.z = Math.sin(seed)*.09;
    for (let j=0;j<6;j++) {
      const angle = j*Math.PI/3+seed, points = [];
      // Broad tapered curved fronds, not stacked spheres.
      for (let k=0;k<7;k++) {
        const t=k/6, d=t*3.5, width=Math.sin(t*Math.PI)*.55;
        for (const side of [-1,1]) points.push(x+Math.cos(angle)*d+Math.sin(angle)*width*side,h+.7*Math.sin(t*Math.PI)-t*.9,z+Math.sin(angle)*d-Math.cos(angle)*width*side);
      }
      const indices=[]; for(let k=0;k<6;k++){const a=k*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setIndex(indices);geo.computeVertexNormals();
      const mat=j%2?leaves:leavesLight; mat.side=THREE.DoubleSide; mesh(g,geo,mat,0,0,0);
    }
  }
  for (let i=0;i<Math.ceil(length/20)+1;i++) {
    const g=new THREE.Group(); // geometry is baked in course coordinates for scrolling/culling
    const z=-i*20;
    if (ship) {
      for(let p=0;p<10;p++) box(g,p%3?wood:woodLight,0,-.19,z-p*2,8.9,.36,1.96);
      if(i===0)for(let p=1;p<=6;p++)box(g,p%3?wood:woodLight,0,-.19,p*2,8.9,.36,1.96);
      for(const side of [-1,1]) {
        box(g,woodDark,side*4.65,.6,z-10,.4,1.5,20);
        box(g,woodLight,side*4.65,1.4,z-10,.52,.15,20);
        for(let post=0;post<5;post++) box(g,woodDark,side*4.65,.9,z-post*4,.19,1.8,.2);
        // Hull ribs and working cannons sit outside the playable lanes.
        for(let k=0;k<2;k++) {
          const zz=z-4-k*10;
          box(g,woodDark,side*4.15,.22,zz,.65,.35,1.3);
          const gun=cylinder(g,iron,side*4.35,.65,zz,.24,1.65);gun.rotation.z=Math.PI/2;
          for(const dz of [-.4,.4]) { const wheel=cylinder(g,woodDark,side*3.93,.27,zz+dz,.27,.13);wheel.rotation.x=Math.PI/2; }
        }
      }
      if(i%3===0) {
        for(const side of [-1,1]) {
          cylinder(g,woodDark,side*5.1,6.5,z-7,.32,13);
          cable(g,woodDark,[side*5.1,12,z-7],[side*4.7,1.4,z+9]);
          cable(g,woodDark,[side*5.1,12,z-7],[side*4.7,1.4,z-23]);
          const sailGeo=new THREE.PlaneGeometry(3.8,4.5,8,8), positions=sailGeo.attributes.position;
          for(let v=0;v<positions.count;v++) {
            const xx=positions.getX(v), yy=positions.getY(v);
            positions.setZ(v,Math.cos(xx/3.8*Math.PI)*Math.cos(yy/4.5*Math.PI)*.7);
            if(yy< -2)positions.setY(v,yy+Math.max(0,Math.sin(xx*8+i))*.25);
          }
          sailGeo.computeVertexNormals();const sail=mesh(g,sailGeo,canvas,side*6.8,9.5,z-7);sail.rotation.y=side*.2;windItems.push({item:sail,base:side*.2,z,kind:"sail",rest:Float32Array.from(positions.array)});
          for(let rung=0;rung<10;rung++) cable(g,woodDark,[side*5.1-.3,2+rung*.8,z-6.9],[side*5.1+.3,2+rung*.8,z-6.9],.018);
        }
      }
      // Deck lane seams retain a broad, readable central running space.
      for(const x of [-1.2,1.2]) box(g,woodDark,x,.005,z-10,.025,.012,20);
    } else {
      box(g,soil,0,-.23,z-10,8.8,.45,20);
      if(i===0)box(g,soil,0,-.23,6,8.8,.45,12);
      for(const x of [-1.2,1.2]) box(g,woodDark,x,-.005,z-10,.035,.014,20);
      for(const side of [-1,1]) {
        box(g,leaves,side*13,-.9,z-10,18,1.7,20);
        const hill=mesh(g,new THREE.IcosahedronGeometry(1,1),leaves,side*(15+(i%3)*4),1.5,z-9,9,3+(i%4),12);hill.rotation.y=i*.6;
        for(let t=0;t<3;t++) {
          const xx=side*(9+(t*3+i%3)), zz=z-3-t*6;
          cylinder(g,bark,xx,4,zz,.38,8);
          const crown=mesh(g,new THREE.IcosahedronGeometry(1,1),t%2?leaves:leavesLight,xx,8.5+(i%3),zz,2.8,2.2,3.6);crown.rotation.y=i+t;windItems.push({item:crown,base:i+t,z,kind:"crown"});
        }
        for(let k=0;k<3;k++) {
          const x=side*(5.7+((i+k)%3)*1.8), zz=z-k*6;
          palm(g,x+side*Math.sin(i*2+k)*.65,zz+Math.sin(i+k)*1.3,6.2+((i+k)%4)*1.1,i+k*.7);
          // Low ferns and dark basalt frame, rather than conceal, the route.
          for(let j=0;j<4;j++) {
            const fern=mesh(g,new THREE.ConeGeometry(.7,1.5,5),j%2?leaves:leavesLight,side*(4.9+j*.47),.55,zz+j*.6);fern.rotation.z=side*.4;
          }
          const stone=mesh(g,new THREE.DodecahedronGeometry(1,0),rock,side*5.1,.25,zz-2,.8,.55,1.2);stone.rotation.y=i;
        }
      }
    }
    const moving=windItems.filter(v=>v.item.parent===g);
    for(const v of moving)v.item.removeFromParent();
    batchWorldGeometry(g);track.add(g);
    for(const v of moving)track.add(v.item);
    sections.push({group:g,z});
  }
  const finish = new THREE.Group();track.add(finish);
  if(ship) {
    box(finish,woodDark,0,2.7,-length-6,9,5.4,8);
    box(finish,woodLight,0,.25,-length-1,8,.5,8);
    for(const side of [-1,1])box(finish,iron,side*1.7,1.65,-length+1,.2,3.3,.3);
    box(finish,canvas,0,3.3,-length+1,3.6,.35,.2);
    box(finish,new THREE.MeshBasicMaterial({color:'#d0f4df'}),0,1.5,-length+.7,3,2.8,.1);
    const sea=mesh(background,new THREE.PlaneGeometry(1200,1600),ocean,0,-2.5,-300);sea.rotation.x=-Math.PI/2;sea.name='rising-sea';
    const foam=new THREE.MeshBasicMaterial({color:'#b3dfdc',transparent:true,opacity:.4});
    for(let j=0;j<20;j++) {const wave=box(background,foam,(j%2?1:-1)*(12+(j%4)*10),-2.3,-j*13,8,.02,.25);waves.push(wave);}
    // A distant opposing ship gives the cannon fire a visible source.
    for(const side of [-1,1]) {
      box(background,woodDark,side*46,-.5,-100,11,3,34);
      cylinder(background,woodDark,side*46,10,-100,.45,23);
      box(background,canvas,side*46,13,-100,15,11,.08);
      box(background,woodDark,side*46,19,-100,16,.25,.4);
    }
  } else {
    // Fixed distant landmark: stays ahead throughout the course, never scrolls past.
    const volcanoGeometry=new THREE.CylinderGeometry(6,54,60,40,10,true), vp=volcanoGeometry.attributes.position;
    for(let v=0;v<vp.count;v++){
      const angle=Math.atan2(vp.getZ(v),vp.getX(v)),height=vp.getY(v);
      const ridge=1+.055*Math.sin(angle*9)+.035*Math.sin(angle*17+height*.04);
      vp.setXYZ(v,vp.getX(v)*ridge,height,vp.getZ(v)*ridge);
    }
    volcanoGeometry.computeVertexNormals();
    mesh(background,volcanoGeometry,distantRock,0,22,-210);
    const crater=mesh(background,new THREE.TorusGeometry(6,.8,8,32),rock,0,52,-210);crater.rotation.x=Math.PI/2;
    const lavaPool=mesh(background,new THREE.CircleGeometry(5.8,32),glow,0,52.1,-210);lavaPool.rotation.x=-Math.PI/2;
    for(let j=0;j<6;j++) {
      const angle=j*Math.PI/3+.4;
      const start=new THREE.Vector3(Math.cos(angle)*7,52,-210+Math.sin(angle)*7),end=new THREE.Vector3(Math.cos(angle)*55,-7,-210+Math.sin(angle)*55);
      cable(background,glow,start.toArray(),end.toArray(),1.0+(j%2)*.5);
    }
    const cloudMat=material('#616265',{transparent:true,opacity:.82,depthWrite:false});
    for(let j=0;j<15;j++) {
      const cloud=mesh(background,new THREE.IcosahedronGeometry(1,1),cloudMat,0,56+j*2,-210,4,3,4);smoke.push(cloud);
    }
    for(let j=0;j<28;j++)lava.push(mesh(background,new THREE.SphereGeometry(.8,7,5),glow,0,54,-210));
    for(const side of [-1,1])cylinder(finish,bark,side*3.8,3,-length,.35,6);
    box(finish,leavesLight,0,6,-length,8,.5,.8);
    const exitMat=new THREE.MeshBasicMaterial({color:'#d5efd0',transparent:true,opacity:.24,side:THREE.DoubleSide});
    mesh(finish,new THREE.PlaneGeometry(7,5.5),exitMat,0,2.75,-length-.3);
  }
  batchWorldGeometry(finish);
  return {
    update(distance,elapsed,reducedMotion) {
      track.position.z=distance*DISTANCE_SCALE;
      for(const section of sections) { const relative=section.z+track.position.z;section.group.visible=relative>-170&&relative<45; }
      for(let i=0;i<windItems.length;i++) {
        const {item,base,z,kind,rest}=windItems[i];
        const relative=z+track.position.z;item.visible=relative> -170&&relative<45;
        const sway=reducedMotion?0:Math.sin(elapsed*(kind==='sail'?1.15:.75)+i*.9);
        item.rotation.y=base+sway*(kind==='sail'?.055:.025);
        item.rotation.z=kind==='crown'?sway*.018:0;
        if(kind==='sail'&&item.visible) {
          const positions=item.geometry.attributes.position;
          for(let v=0;v<positions.count;v++) {
            const x=rest[v*3],y=rest[v*3+1];
            const ripple=reducedMotion?0:Math.sin(elapsed*1.6+x*1.8+i)*.12*Math.max(0,1-Math.abs(y)/2.25);
            positions.setZ(v,rest[v*3+2]+ripple);
          }
          positions.needsUpdate=true;item.geometry.computeVertexNormals();
        }
      }
      // Background never follows lane changes, matching the existing camera.
      for(let j=0;j<smoke.length;j++) {
        const t=(j/15+(reducedMotion?0:elapsed*.025))%1, cloud=smoke[j];
        cloud.position.set(Math.sin(j*2.4)*t*9+t*15,55+t*35,-210-Math.cos(j)*t*7);cloud.scale.setScalar(3+t*8);
      }
      for(let j=0;j<lava.length;j++) {
        const t=(j/28+(reducedMotion?0:elapsed*.33))%1,angle=j*2.399;
        lava[j].position.set(Math.cos(angle)*t*17,53+Math.sin(t*Math.PI)*17-t*5,-210+Math.sin(angle)*t*17);
        lava[j].scale.setScalar(.6+Math.sin(t*Math.PI)*.7);
      }
      const rising = ship ? Math.min(1,distance/courseLength)*1.3 : 0;
      if(ship)background.getObjectByName('rising-sea').position.y=-2.5+rising;
      for(let j=0;j<waves.length;j++) waves[j].position.y=-2.3+rising+(reducedMotion?0:Math.sin(elapsed*1.2+j)*.13);
    },
    dispose: () => release(holder),
  };
}
