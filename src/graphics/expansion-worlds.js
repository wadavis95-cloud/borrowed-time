// Frozen, orbital and desert presentation. Gameplay is the same seeded race.
import * as THREE from 'three';
import { DISTANCE_SCALE, radialTexture } from './tunnel.js';
import { batchWorldGeometry, release, surfaceRelief } from './world-utils.js';
import { getMap } from '../maps.js';

export function createExpansionWorld(scene, mapId, courseLength) {
  const frozen=mapId==='frozen', orbital=mapId==='orbital', map=getMap(mapId);
  const root=new THREE.Group();root.name=`world-${mapId}`;scene.add(root);
  const track=new THREE.Group(), backdrop=new THREE.Group();root.add(track,backdrop);
  const sections=[], moving=[], length=courseLength*DISTANCE_SCALE;
  const terrainRelief=surfaceRelief(orbital?'metal':frozen?'snow':'stone');
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.82,...terrainRelief,...extra});
  const ground=material(frozen?'#d7e9ed':orbital?'#35465e':'#d4a56c');
  const edge=material(frozen?'#80bbd0':orbital?'#bac8d5':'#a5633e');
  const dark=material(frozen?'#4d7185':orbital?'#202c42':'#8c543c');
  const light=material(frozen?'#f0f6ed':orbital?'#d2dce2':'#edc18a');
  const green=material(frozen?'#3d7778':orbital?'#557383':'#648566');
  const rock=material(frozen?'#9cbdcc':orbital?'#64748c':'#b77850');
  const glow=material(orbital?'#8ae3f5':'#e6c67c',{emissive:orbital?'#39b9e8':'#7c562b',emissiveIntensity:orbital?1.4:.2,toneMapped:false});
  const mesh=(group,geometry,mat,x,y,z,sx=1,sy=1,sz=1)=>{const v=new THREE.Mesh(geometry,mat);v.position.set(x,y,z);v.scale.set(sx,sy,sz);group.add(v);return v;};
  const box=(g,m,x,y,z,w,h,d)=>mesh(g,new THREE.BoxGeometry(w,h,d),m,x,y,z);
  const rockMesh=(g,m,x,y,z,w,h,d)=>{
    const geometry=new THREE.DodecahedronGeometry(1,1);
    if(!(frozen&&m===light)) {
      const p=geometry.attributes.position;
      for(let i=0;i<p.count;i++) {
        const a=p.getX(i),b=p.getY(i),c=p.getZ(i);
        const fracture=1+.065*Math.sin(a*13+b*9+c*7)+.035*Math.cos(c*17-a*11);
        p.setXYZ(i,a*fracture,b*fracture,c*fracture);
      }
      geometry.computeVertexNormals();
    }
    const v=mesh(g,geometry,m,x,y,z,w,h,d);v.rotation.y=x*.27+z*.11;return v;
  };
  const cylinder=(g,m,x,y,z,r,h)=>mesh(g,new THREE.CylinderGeometry(r*.8,r,h,8),m,x,y,z);

  // A painted gradient remains behind the landmark and doesn't scroll with play.
  const skyCanvas=document.createElement('canvas');skyCanvas.width=512;skyCanvas.height=256;
  const ctx=skyCanvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,orbital?'#080c23':frozen?'#75b1d4':'#c98563');
  gradient.addColorStop(.7,map.sky);gradient.addColorStop(1,orbital?'#273c5b':frozen?'#ebf2e9':'#efd5a2');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
  if(orbital)for(let j=0;j<220;j++){ctx.fillStyle=j%5?'#bed5e7':'#ffffff';ctx.fillRect((j*97.1)%512,(j*61.7)%256,j%8?1:2,1);}
  const skyMap=new THREE.CanvasTexture(skyCanvas);skyMap.colorSpace=THREE.SRGBColorSpace;
  mesh(backdrop,new THREE.PlaneGeometry(1500,800),new THREE.MeshBasicMaterial({map:skyMap,fog:false,depthWrite:false}),0,100,-490);

  for(let i=0;i<=Math.ceil(length/20);i++) {
    const g=new THREE.Group(),z=-i*20;
    if(orbital) {
      if(i===0)box(g,ground,0,-.19,7,8.9,.36,10);
      for(let j=0;j<5;j++) {
        box(g,ground,0,-.19,z-j*4,8.9,.36,3.94);
        for(const x of [-3.7,3.7])box(g,light,x,.015,z-j*4,.55,.035,3.65);
        for(const x of [-1.2,1.2])box(g,glow,x,.018,z-j*4,.045,.025,3.3);
      }
      for(const side of [-1,1]) {
        box(g,dark,side*4.65,-.4,z-10,.65,1.2,20);
        for(let j=0;j<3;j++) {
          const zz=z-3-j*6;
          box(g,light,side*4.65,1,zz,.16,2.2,.16);
          box(g,glow,side*4.65,1.75,zz,.22,.2,.25);
          if(i%2===0) {
            box(g,ground,side*8,1.8,zz,4,3.8,4.7);
            box(g,dark,side*6.4,2,zz,.06,1.6,2.8);
            box(g,glow,side*6.34,2,zz,.08,.08,2.6);
          }
        }
        box(g,light,side*4.65,1.9,z-10,.12,.12,20);
        if(i%3===0){box(g,light,side*5,4,z-9,.42,8,.65);box(g,glow,side*4.74,4,z-8.6,.06,5,.06);}
      }
      if(i%3===0)box(g,dark,0,8,z-9,10.4,.4,.65);
      if(i%4===0)for(const side of [-1,1]) {
        box(g,dark,side*15,-1,z-10,12,.3,10);
        for(let j=0;j<5;j++)box(g,green,side*(10+j*2),-.8,z-10,1.8,.08,9.5);
      }
    } else {
      box(g,ground,0,-.24,z-10,8.9,.46,20);
      if(i===0)box(g,ground,0,-.24,6,8.9,.46,12);
      // Thin paths leave all three lanes readable without road markings.
      for(const x of [-1.2,1.2])box(g,edge,x,-.002,z-10,.025,.012,20);
      for(const side of [-1,1]) {
        if(frozen) {
          rockMesh(g,light,side*11,-1,z-10,9,2.1,14);
          rockMesh(g,rock,side*(8+(i%3)),2,z-7,3,3.4,4);
          rockMesh(g,light,side*8,4.1,z-7,3.2,.6,4.1);
          for(let j=0;j<3;j++) {
            const x=side*(6.3+(j%2)*3.2),zz=z-j*7,h=4.4+(i+j)%3;
            cylinder(g,dark,x,h/2,zz,.16,h);
            for(let level=0;level<3;level++) {
              mesh(g,new THREE.ConeGeometry(1.4-level*.25,2.7,8),green,x,2+level*1.3,zz);
              mesh(g,new THREE.ConeGeometry(1.25-level*.25,2,8),light,x,2.5+level*1.3,zz);
            }
          }
          // Guide poles and rope hug the edges, outside collision lanes.
          cylinder(g,dark,side*4.7,.65,z-5,.07,1.3);
          box(g,glow,side*4.7,1.15,z-5,.2,.22,.15);
        } else {
          // Layered sandstone walls vary in height and setback along the route.
          for(let j=0;j<3;j++) {
            const zz=z-j*7,x=side*(7+(i+j)%3),h=5+(i*3+j)%7;
            rockMesh(g,rock,x,h/2-.6,zz,3.3,h/2,4.5);
            rockMesh(g,edge,x,h*.32,zz,3.6,.4,4.7);
            rockMesh(g,light,x,h*.7,zz,3,.3,4.1);
          }
          for(let j=0;j<2;j++) {
            const x=side*(5.1+j*.4),zz=z-4-j*9;
            cylinder(g,green,x,.8,zz,.14,1.6);
            box(g,green,x+side*.27,1,zz,.5,.17,.2);
            cylinder(g,green,x+side*.48,1.25,zz,.09,.55);
          }
          rockMesh(g,light,side*14,-1,z-10,10,1.7,13);
          if(i%5===2){cylinder(g,dark,side*4.9,2,z-8,.12,4);box(g,glow,side*4.9,3.3,z-8,.15,.22,.15);}
        }
      }
    }
    for(const side of [-1,1])for(let j=0;j<3;j++) {
      const zz=z-3-j*6;
      if(orbital) {
        // Layered equipment casings, fasteners and vents, beyond the race deck.
        box(g,dark,side*5.2,.38,zz,.85,.74,2.4);
        box(g,edge,side*4.72,.4,zz,.06,.58,2.16);
        box(g,dark,side*4.675,.4,zz,.025,.34,1.48);
        for(let slat=0;slat<7;slat++)box(g,light,side*4.65,.4,zz-.62+slat*.2,.02,.28,.045);
        for(const y of [.16,.64])for(const dz of [-.92,.92])mesh(g,new THREE.SphereGeometry(.026,6,4),light,side*4.67,y,zz+dz);
        box(g,glow,side*4.64,.63,zz-.55,.022,.035,.16);
        // Triangular rail supports show thickness and reinforce the structure.
        const brace=box(g,edge,side*4.65,.46,zz,.10,1.2,.10);brace.rotation.x=.55;
      } else if(frozen) {
        // Irregular snow drifts and translucent-looking solid ice ridges.
        const snow=rockMesh(g,light,side*5.25,.1,zz,1.25,.26,2.0);snow.rotation.y=i*.2+j*.7;
        for(let shard=0;shard<3;shard++) {
          const ice=mesh(g,new THREE.ConeGeometry(.13,.75+shard*.15,5),edge,side*(5.1+shard*.19),.46,zz-1.0+shard*.18);ice.rotation.z=side*(.13+shard*.09);
        }
        // Layered exposed fractures break up the smooth rock silhouette.
        for(let ledge=0;ledge<3;ledge++)rockMesh(g,ledge%2?light:rock,side*(6.0+ledge*.12),.3+ledge*.31,zz+.5,.8-ledge*.14,.16,1.2);
        for(let bough=0;bough<3;bough++) {
          const a=bough*2.1+i*.3,xx=side*6.3;
          const branch=mesh(g,new THREE.ConeGeometry(.34,1.35,7),green,xx+Math.cos(a)*.65,1.6,zz+Math.sin(a)*.65);branch.rotation.z=Math.cos(a)*.7;branch.rotation.x=Math.sin(a)*.7;
          rockMesh(g,light,xx+Math.cos(a)*.58,1.85,zz+Math.sin(a)*.58,.42,.11,.55);
        }
      } else {
        // Thin sediment shelves, eroded pockets and broken talus at the wall base.
        for(let layer=0;layer<4;layer++) {
          const shelf=rockMesh(g,layer%2?light:edge,side*(5.5+layer*.18),.35+layer*.38,zz,1.05-layer*.08,.11,1.65);shelf.rotation.y=.12*Math.sin(i+j+layer);
        }
        for(let pebble=0;pebble<4;pebble++) {
          const d=.08+(pebble%3)*.035;
          rockMesh(g,pebble%2?edge:rock,side*(4.55+pebble*.16),d*.4,zz+pebble*.48,d*1.4,d*.6,d);
        }
        // Ribbing and a small bud give the cactus a less geometric surface.
        for(let rib=0;rib<5;rib++) {
          const a=rib*Math.PI*2/5;
          cylinder(g,green,side*5.1+Math.cos(a)*.143,.80,z-4+Math.sin(a)*.143,.018,1.45);
        }
        mesh(g,new THREE.SphereGeometry(.09,7,5),glow,side*5.1,1.64,z-4);
      }
    }
    batchWorldGeometry(g);track.add(g);sections.push({group:g,z});
  }
  const landmark=new THREE.Group();backdrop.add(landmark);
  if(frozen) {
    for(let i=0;i<7;i++) {
      const x=(i-3)*26,height=35+(i%3)*17,z=-180-(i%2)*30;
      mesh(landmark,new THREE.ConeGeometry(28,height,7),rock,x,height/2-5,z);
      mesh(landmark,new THREE.ConeGeometry(16,height*.58,7),light,x,height*.71-5,z);
    }
    const cloudMat=new THREE.SpriteMaterial({map:radialTexture(),color:'#f2f8ff',transparent:true,opacity:.35,depthWrite:false,fog:false});
    for(let i=0;i<18;i++) {
      const cloud=new THREE.Sprite(cloudMat);landmark.add(cloud);moving.push(cloud);
    }
  } else if(orbital) {
    const planetCanvas=document.createElement('canvas');planetCanvas.width=512;planetCanvas.height=256;
    const planetContext=planetCanvas.getContext('2d');planetContext.fillStyle='#5d8fb1';planetContext.fillRect(0,0,512,256);
    for(let j=0;j<28;j++) {
      planetContext.fillStyle=j%3?'#90ae9b':'#b3c6b1';planetContext.beginPath();
      const x=(j*137)%512,y=(j*71)%256;planetContext.ellipse(x,y,13+(j%4)*9,7+(j%3)*5,j*.7,0,Math.PI*2);planetContext.fill();
    }
    planetContext.strokeStyle='#ecf3e9aa';planetContext.lineWidth=4;
    for(let j=0;j<9;j++){planetContext.beginPath();planetContext.moveTo(0,j*32);planetContext.bezierCurveTo(170,j*32+35,310,j*32-22,512,j*32+18);planetContext.stroke();}
    const planetMap=new THREE.CanvasTexture(planetCanvas);planetMap.colorSpace=THREE.SRGBColorSpace;
    const planetMat=material('#b4d8e9',{map:planetMap,emissive:'#183954',emissiveIntensity:.4,fog:false});
    const planet=mesh(landmark,new THREE.SphereGeometry(32,32,20),planetMat,25,31,-180);
    // Pale bands and a bright rim give a large, readable planetary silhouette.
    const ring=mesh(landmark,new THREE.TorusGeometry(33,.6,5,64),new THREE.MeshBasicMaterial({color:'#8ed7ef',fog:false}),25,31,-180);ring.rotation.x=.12;
    const orbit=mesh(landmark,new THREE.TorusGeometry(45,.22,5,80),new THREE.MeshBasicMaterial({color:'#a0b8d9',fog:false}),25,31,-180);orbit.rotation.x=1.15;orbit.rotation.z=.3;
    for(let i=0;i<12;i++)moving.push(rockMesh(landmark,rock,Math.sin(i*2.4)*32,5+i*3,-80-i*7,.7,.3,1.1));
    planet.rotation.z=.25;
  } else {
    for(let i=0;i<7;i++) {
      const h=25+(i%3)*13,x=(i-3)*30;
      mesh(landmark,new THREE.CylinderGeometry(9,17,h,6),rock,x,h/2-4,-180-(i%2)*30);
      mesh(landmark,new THREE.CylinderGeometry(9.3,10,2,6),light,x,h-5,-180-(i%2)*30);
    }
    const dustMat=new THREE.SpriteMaterial({map:radialTexture(),color:'#c99361',transparent:true,opacity:.42,depthWrite:false,fog:false});
    for(let i=0;i<32;i++){const cloud=new THREE.Sprite(dustMat);landmark.add(cloud);moving.push(cloud);}
  }
  const exit=new THREE.Group();track.add(exit);
  for(const side of [-1,1])box(exit,edge,side*3.7,2.5,-length,.4,5,.6);
  box(exit,glow,0,5,-length,7.8,.25,.6);
  const exitLight=new THREE.MeshBasicMaterial({color:orbital?'#a8eaf4':'#e8edc7',transparent:true,opacity:.23,side:THREE.DoubleSide});
  mesh(exit,new THREE.PlaneGeometry(7,4.8),exitLight,0,2.4,-length-.2);
  batchWorldGeometry(exit);
  return {
    update(distance,elapsed,reducedMotion) {
      track.position.z=distance*DISTANCE_SCALE;
      for(const section of sections){const relative=section.z+track.position.z;section.group.visible=relative>-175&&relative<45;}
      const time=reducedMotion?0:elapsed;
      for(let i=0;i<moving.length;i++) {
        const item=moving[i];
        if(frozen) {const t=(i/18+time*.035)%1;item.position.set(-32+t*29+Math.sin(i)*4,32-t*24,-165+t*35);item.scale.set(10+t*14,7+t*9,1);}
        else if(orbital){item.rotation.set(time*.1+i,time*.08+i*.7,0);item.position.y=5+i*3+Math.sin(time*.3+i)*.6;}
        else {const t=(i/32+time*.025)%1;item.position.set(-80+t*160,8+(i%7)*4,-200+Math.sin(i)*12);item.scale.set(30+(i%3)*10,30+(i%5)*5,1);}
      }
    },
    dispose:()=>release(root),
  };
}
