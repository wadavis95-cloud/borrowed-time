// Read-only sound direction. Shared hazard times are never derived from the time budget.
export const AUDIO_SURFACES = Object.freeze({
  tunnel: Object.freeze({frequency:720,body:105,decay:.085,air:420}),
  pirate: Object.freeze({frequency:390,body:145,decay:.12,air:760}),
  jungle: Object.freeze({frequency:1350,body:70,decay:.065,air:260}),
  frozen: Object.freeze({frequency:2300,body:125,decay:.11,air:1250}),
  orbital: Object.freeze({frequency:950,body:190,decay:.09,air:180}),
  desert: Object.freeze({frequency:1700,body:62,decay:.10,air:950}),
});
export function createAudioScene() {
  let previous=null;
  const warned=new Set(),impacted=new Set();
  function reset(){previous=null;warned.clear();impacted.clear();}
  function update(state) {
    const elapsed=state.raceElapsed??state.elapsed??0;
    const mapId=Object.hasOwn(AUDIO_SURFACES,state.mapId)?state.mapId:'tunnel';
    const before=previous;
    const restart=!before||before.mapId!==mapId||elapsed<before.elapsed||state.distance<before.distance-.01;
    if(restart){warned.clear();impacted.clear();}
    previous={mapId,elapsed,distance:state.distance,phase:state.phase};
    const active=state.phase==='running';
    const urgency=Math.max(0,Math.min(1,(30-(state.timeLeft??60))/25));
    const result={active,mapId,surface:AUDIO_SURFACES[mapId],urgency,beatSeconds:1-.78*Math.pow(Math.max(0,Math.min(1,(30-(state.timeLeft??60))/30)),1.35),warning:null,impact:null};
    if(!active)return result;
    const baseline=restart||before.phase!=='running'||elapsed-before.elapsed>.5;
    for(const event of state.debris||[]) {
      const delta=event.z-state.distance;
      if(elapsed>=event.impactAt) {
        if(!impacted.has(event.id)&&!baseline&&delta>=-25&&delta<110&&elapsed-event.impactAt<.35)result.impact=event;
        impacted.add(event.id);warned.add(event.id);
      } else if(elapsed>=event.warnAt&&delta> -8&&delta<110) {
        if(!warned.has(event.id)&&!baseline)result.warning=event;
        // A fresh audio enable may establish its baseline without suppressing
        // a still-visible warning. A resume must not replay an existing warning.
        if(!restart)warned.add(event.id);
      }
    }
    return result;
  }
  return {update,reset};
}
