// Canvas is a drawing surface. This file draws the game, but never changes its rules.
// The corridor is made of 2D polygons that shrink into the distance (a 3D illusion).
import { CONFIG } from './game.js';

const palette = { orange: '#ffad65', mint: '#a4e4cd', blue: '#9ccbe6' };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 1, height = 1, visualLane = 1;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // x=-1 and x=1 are the corridor's outer edges. z is meters ahead of the runner.
  function project(x, z, lift = 0, near = -8) {
    const scale = 1 / (1 + Math.max(near, z) / 44);
    return {
      x: width / 2 + x * width * .47 * scale,
      y: height * .22 + height * .64 * scale - lift * scale,
      scale,
    };
  }

  function polygon(points, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function line(a, b, color, thickness = 1) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.stroke();
  }

  function roundedRect(x, y, w, h, radius, fill) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill();
  }

  function floorStrip(left, right, near, far, fill) {
    polygon([project(left, near), project(right, near), project(right, far), project(left, far)], fill);
  }

  function background(state, animationTime) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0b1b22'); sky.addColorStop(.48, '#274344'); sky.addColorStop(1, '#15282c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    // A distant emergency exit anchors the direction of travel.
    const glow = ctx.createRadialGradient(width / 2, height * .26, 1, width / 2, height * .26, width * .33);
    glow.addColorStop(0, '#add8b148'); glow.addColorStop(.4, '#679c8522'); glow.addColorStop(1, '#679c8500');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    roundedRect(width * .474, height * .216, width * .052, height * .09, 1, '#acd3b1');
    roundedRect(width * .476, height * .207, width * .048, height * .016, 1, '#4c8c6e');
    ctx.fillStyle = '#d0ead4'; ctx.font = `600 ${Math.max(5, width * .007)}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText('EXIT', width / 2, height * .219);

    const farL = project(-1, 300), farR = project(1, 300);
    polygon([{ x: 0, y: height }, { x: width, y: height }, farR, farL], '#243537');
    polygon([{ x: 0, y: 0 }, { x: width * .41, y: height * .18 }, farL, project(-1, 0), { x: 0, y: height }], '#10242b');
    polygon([{ x: width, y: 0 }, { x: width * .59, y: height * .18 }, farR, project(1, 0), { x: width, y: height }], '#10232a');

    const distance = state.phase === 'ready' ? animationTime * 2 : state.distance;
    const offset = distance % 12;
    for (let z = 300 - offset; z >= -12; z -= 12) {
      const index = Math.floor((z + distance) / 12);
      floorStrip(-1, 1, z, z + 11.6, index % 2 ? '#25383a' : '#293d3d');
      line(project(-1, z), project(1, z), '#60736a24');
      for (const x of [-1 / 3, 1 / 3]) floorStrip(x - .004, x + .004, z, z + 7, '#b5c3a64a');
      floorStrip(-.97, -.947, z, z + 10, '#c09c535b');
      floorStrip(.947, .97, z, z + 10, '#c09c535b');
    }

    // Structural columns, overhead beams, pipes and emergency light strips.
    const archOffset = distance % 30;
    for (let z = 270 - archOffset; z > -10; z -= 30) {
      const baseL = project(-1.05, z), baseR = project(1.05, z);
      const topL = project(-1.05, z, height * .91), topR = project(1.05, z, height * .91);
      const s = baseL.scale;
      line(baseL, topL, '#09181d', 18 * s);
      line(baseR, topR, '#09181d', 18 * s);
      line(topL, topR, '#11242b', 21 * s);
      line(project(-1.02, z, height * .18), project(-1.02, z, height * .64), '#bfd6b665', 3 * s);
      line(project(1.02, z, height * .18), project(1.02, z, height * .64), '#bfd6b665', 3 * s);
      for (const side of [-1, 1]) {
        const p = project(side * 1.04, z, height * .34);
        roundedRect(p.x - 4 * s, p.y - 4 * s, 8 * s, 8 * s, 2 * s, '#ef9a57');
      }
    }
    for (const x of [-.82, .82]) line(project(x, 0, height * .92), project(x, 300, height * .92), '#42636370', 3);

    // Decorative cracks and embers are seeded by their index so they don't jitter.
    for (let i = 0; i < 24; i++) {
      const z = ((i * 37 + 800 - distance * .9) % 230 + 230) % 230;
      const x = Math.sin(i * 7.3) * 1.3;
      const p = project(x, z, (Math.sin(i * 3.1 + animationTime * .7) + 1) * height * .23);
      ctx.globalAlpha = .25 + (Math.sin(i + animationTime) + 1) * .17;
      ctx.fillStyle = i % 3 ? '#e3bb7d' : '#b6d0bb';
      ctx.fillRect(p.x, p.y, Math.max(1, p.scale * 3), Math.max(1, p.scale * 3));
    }
    ctx.globalAlpha = 1;
  }

  function block(obstacle, z) {
    const laneX = (obstacle.lane - 1) * .65;
    const w = obstacle.type === 'barrier' ? .265 : .24;
    const h = height * (obstacle.type === 'barrier' ? .24 : .085);
    const depth = obstacle.type === 'barrier' ? 4 : 5;
    const a = project(laneX - w, z), b = project(laneX + w, z);
    const c = project(laneX + w, z + depth), d = project(laneX - w, z + depth);
    const at = project(laneX - w, z, h), bt = project(laneX + w, z, h);
    const ct = project(laneX + w, z + depth, h), dt = project(laneX - w, z + depth, h);
    polygon([{ x:a.x-7*a.scale,y:a.y+4*a.scale }, { x:b.x+12*b.scale,y:b.y+4*b.scale }, c, d], '#07131888');
    polygon([at, bt, ct, dt], obstacle.type === 'barrier' ? '#71847c' : '#849086', '#a0a99466');
    polygon([b, c, ct, bt], '#3a504d');
    polygon([a, b, bt, at], '#4e645d', '#99a58b55');
    const stripeY = at.y + h * at.scale * .28;
    const stripeH = h * at.scale * .23;
    ctx.save();
    ctx.beginPath(); ctx.rect(at.x + 1, stripeY, bt.x-at.x-2, stripeH); ctx.clip();
    ctx.fillStyle = '#d9a458'; ctx.fillRect(at.x, stripeY, bt.x-at.x, stripeH);
    ctx.strokeStyle = '#324039'; ctx.lineWidth = Math.max(2, 11 * a.scale);
    for (let x = at.x - 30; x < bt.x + 30; x += Math.max(8, 25 * a.scale)) line({x,y:stripeY + stripeH},{x:x+stripeH,y:stripeY},'#324039',Math.max(2,11*a.scale));
    ctx.restore();
    // A crack makes tall barriers read as broken concrete instead of collectible boxes.
    if (obstacle.type === 'barrier') {
      const cx = (at.x + bt.x) / 2;
      line({x:cx,y:at.y},{x:cx-8*a.scale,y:stripeY},'#253e38',2*a.scale);
    }
  }

  function gap(obstacle, z) {
    const x = (obstacle.lane - 1) * .65, half = .3;
    const length = obstacle.length || 8;
    polygon([project(x-half,z),project(x+half,z),project(x+half,z+length),project(x-half,z+length)],'#030c12','#b5744c',2);
    line(project(x-half,z),project(x+half,z),'#f3ad69',3);
    const p = project(x,z+length/2);
    ctx.fillStyle='#da9f6a';ctx.font=`600 ${Math.max(5,12*p.scale)}px system-ui`;ctx.textAlign='center';
    ctx.fillText('GAP',p.x,p.y);
  }

  function checkpoint(z, showReward = true) {
    const l = project(-1,z), r = project(1,z), t = project(0,z,height*.32);
    line(l,r,'#a4e4cd',Math.max(2,l.scale*5));
    const s=l.scale;
    ctx.save();ctx.shadowColor='#a4e4cd';ctx.shadowBlur=14;
    line(l,project(-1,z,height*.6),'#80b79c80',3*s);
    line(r,project(1,z,height*.6),'#80b79c80',3*s);
    ctx.restore();
    ctx.font=`600 ${Math.max(7,18*s)}px system-ui`;ctx.textAlign='center';ctx.fillStyle='#c1f1d6';
    if (showReward) ctx.fillText(`+${CONFIG.checkpointBonus} SEC`,t.x,t.y);
  }

  function runner(state, animationTime, dt) {
    visualLane += (state.lane - visualLane) * Math.min(1, dt * 19);
    character(state, animationTime, visualLane);
  }

  function character(state, animationTime, lane, z = 0, ghost = false) {
    // Ghosts may pass behind the local runner and leave the bottom of the view.
    // Keep the existing scenery's near plane while extending theirs toward the camera.
    const p = project((lane-1)*.65,z,0,ghost ? -36 : -8);
    const unit = Math.min(width / 800, height / 580) * 1.04 * p.scale;
    const airborne = state.jumpRemaining > 0 && state.jumpDuration > 0;
    const jumpPhase = airborne ? Math.max(0, Math.min(1, 1 - state.jumpRemaining / state.jumpDuration)) : 0;
    const altitude = Math.sin(jumpPhase*Math.PI) * (!ghost && state.jumpKind === 'long' ? 115 : 64) * unit;
    const active = state.phase === 'running' || (ghost && state.phase === 'racing');
    const step = active && !airborne ? Math.sin(state.distance*.75) : 0;
    const y=p.y-altitude;
    if (ghost && y - 90 * unit > height) return;
    const color = ghost ? state.color || palette.blue : null;
    ctx.save();
    if (ghost) ctx.globalAlpha = .4;
    ctx.save();
    ctx.translate(p.x,p.y+6*unit);
    ctx.scale(1, .26);
    ctx.beginPath();ctx.ellipse(0,0,(23-altitude*.045)*unit,23*unit,0,0,Math.PI*2);ctx.fillStyle='#06131999';ctx.fill();
    ctx.restore();
    ctx.save();ctx.translate(p.x,y);ctx.scale(unit,unit);
    if (!ghost && state.boostRemaining > 0) {
      const trail=ctx.createLinearGradient(0,-60,0,60);trail.addColorStop(0,'#b9edc055');trail.addColorStop(1,'#b9edc000');
      polygon([{x:-20,y:-60},{x:20,y:-60},{x:34,y:70},{x:-34,y:70}],trail);
      for(let i=0;i<4;i++)line({x:-27+i*18,y:8},{x:-30+i*20,y:40+(Math.sin(animationTime*25+i)+1)*10},'#a7e0bd77',2);
    }
    if(airborne && !ghost){ctx.strokeStyle=palette.blue;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-4,26,0,Math.PI);ctx.stroke();}
    // Legs, boots, arms, jacket, backpack and helmet, drawn from behind.
    roundedRect(-15,-35,12,29+step*9,4,'#26383c');
    roundedRect(3,-35,12,29-step*9,4,'#314549');
    roundedRect(-17,-8+step*9,16,9,3,'#0d1b22');
    roundedRect(2,-8-step*9,16,9,3,'#0d1b22');
    roundedRect(-27,-62-step*4,11,31,5,color || '#d58b50');
    roundedRect(16,-62+step*4,11,31,5,color || '#e3a162');
    roundedRect(-20,-67,40,39,9,color || '#f0ad68');
    roundedRect(-20,-42,40,6,1,'#e6dcb0');
    roundedRect(-12,-64,24,27,5,'#304f51');
    roundedRect(-8,-59,16,15,3,'#446362');
    roundedRect(-5,-42,10,3,1,!ghost && state.boostRemaining>0?'#caffc0':'#b4dbc2');
    roundedRect(-14,-88,28,25,10,color || '#edb46e');
    roundedRect(-12,-83,24,12,5,'#2b4246');
    roundedRect(-8,-82,16,3,2,'#688c86');
    line({x:-11,y:-68},{x:11,y:-68},color || '#dc9a54',3);
    ctx.restore();
    ctx.restore();
  }

  function draw(state, animationTime, dt = 1/60, opponents = []) {
    ctx.save();
    if (!reducedMotion && state.hitFlash > 0) ctx.translate(Math.sin(animationTime*65)*state.hitFlash*4,Math.cos(animationTime*49)*state.hitFlash*3);
    background(state,animationTime);
    const items = state.obstacles.filter(o=>o.z-state.distance>-8 && o.z-state.distance<270).map(o=>({z:o.z,type:'obstacle',value:o}));
    for (const opponent of opponents) {
      const z = opponent.distance - state.distance;
      if (opponent.connected !== false && opponent.phase !== 'disconnected'
        && Number.isFinite(opponent.lane) && Number.isFinite(z) && z > -36 && z < 270) {
        items.push({ z: opponent.distance, type: 'opponent', value: opponent });
      }
    }
    for(const c of state.checkpoints) if(!c.passed && c.z-state.distance<270) items.push({z:c.z,type:'checkpoint'});
    if(CONFIG.courseLength-state.distance<270) items.push({z:CONFIG.courseLength,type:'exit'});
    items.sort((a,b)=>b.z-a.z);
    for(const item of items){
      const z=item.z-state.distance;
      if(item.type==='opponent')character(item.value,animationTime,item.value.lane,z,true);
      else if(item.type==='checkpoint')checkpoint(z);
      else if(item.type==='exit'){
        checkpoint(z, false);
        const p=project(0,z,height*.6);ctx.fillStyle='#dcf8db';ctx.textAlign='center';ctx.font=`700 ${Math.max(10,40*p.scale)}px system-ui`;ctx.fillText('EXIT →',p.x,p.y);
      }else if(item.value.type==='gap')gap(item.value,z);
      else block(item.value,z);
    }
    // The local silhouette stays readable even when a translucent runner overlaps it.
    runner(state,animationTime,dt);
    const vignette=ctx.createRadialGradient(width/2,height*.5,width*.15,width/2,height*.5,width*.7);
    vignette.addColorStop(0,'#04111800');vignette.addColorStop(1,'#04111888');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
    if(state.timeLeft<15 && state.phase==='running'){
      const warning=ctx.createLinearGradient(0,height*.6,0,height);warning.addColorStop(0,'#e5643000');warning.addColorStop(1,`rgba(215,77,35,${.1+(15-state.timeLeft)/70})`);ctx.fillStyle=warning;ctx.fillRect(0,0,width,height);
    }
    if(state.hitFlash>0){ctx.fillStyle=`rgba(255,115,70,${Math.min(.22,state.hitFlash*.22)})`;ctx.fillRect(0,0,width,height);}
    ctx.restore();
  }
  return { draw, reset:()=>{visualLane=1;} };
}
