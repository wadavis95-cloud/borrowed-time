// Read-only local presentation events. No movement, timers or purchases occur here.
export const STEP_DISTANCE=.36/.058;
export const SURFACE_FEEDBACK=Object.freeze({
  tunnel:Object.freeze({color:'#c4bea2',lift:.12}),
  pirate:Object.freeze({color:'#d9af76',lift:.11}),
  jungle:Object.freeze({color:'#ccbc77',lift:.15}),
  frozen:Object.freeze({color:'#a9ddec',lift:.20}),
  orbital:Object.freeze({color:'#9bdce9',lift:.14}),
  desert:Object.freeze({color:'#ebc494',lift:.18}),
});
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
export function createMovementFeedback() {
  let previous=null;
  function update(state,dt=0,reducedMotion=false) {
    if(state.phase==='paused') return [];
    const next={phase:state.phase,distance:finite(state.distance),elapsed:finite(state.elapsed),jump:finite(state.jumpRemaining),hits:finite(state.hits),stun:finite(state.stunRemaining),mapId:state.mapId};
    const before=previous;previous=next;
    if(!before||next.phase!=='running'||before.phase!=='running'||reducedMotion) return [];
    if(next.mapId!==before.mapId||next.elapsed<before.elapsed||next.distance<before.distance||next.hits<before.hits||next.elapsed-before.elapsed>.5||next.distance-before.distance>40) return [];
    const event=kind=>({kind,age:kind==='landing'?Math.max(0,Math.min(.1,finite(dt))-before.jump):0});
    if(next.hits>before.hits) return [event('hit')];
    if(next.jump>0&&before.jump<=0) return [event('takeoff')];
    if(next.jump<=0&&before.jump>0) return [event('landing')];
    if(next.jump<=0&&next.stun<=0) {
      const step=Math.floor(next.distance/STEP_DISTANCE);
      if(step>Math.floor(before.distance/STEP_DISTANCE)) return [{...event('footstep'),side:step%2?1:-1}];
    }
    return [];
  }
  return {update,reset(){previous=null;}};
}
