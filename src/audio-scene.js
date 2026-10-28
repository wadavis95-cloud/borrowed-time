// Read-only sound direction. Shared hazard times are never derived from the time budget.
export const AUDIO_SURFACES = Object.freeze({
  tunnel: Object.freeze({frequency:720,body:105,decay:.085,air:420}),
  pirate: Object.freeze({frequency:390,body:145,decay:.12,air:760}),
  jungle: Object.freeze({frequency:1350,body:70,decay:.065,air:260}),
  frozen: Object.freeze({frequency:2300,body:125,decay:.11,air:1250}),
  orbital: Object.freeze({frequency:950,body:190,decay:.09,air:180}),
  desert: Object.freeze({frequency:1700,body:62,decay:.10,air:950}),
});
// Original small musical palettes with quiet environmental beds. No audio downloads.
const palette=value=>Object.freeze({...value,notes:Object.freeze(value.notes)});
export const MAP_AUDIO_THEMES=Object.freeze({
 tunnel:palette({air:260,filter:'lowpass',hum:73.42,notes:[196,293.66,246.94,392,293.66,220],wave:'sine',noteEvery:2.1,noteLength:.55}),
 pirate:palette({air:450,filter:'lowpass',hum:0,notes:[233.08,293.66,349.23,293.66,440,349.23],wave:'triangle',noteEvery:1.15,noteLength:.22}),
 jungle:palette({air:170,filter:'lowpass',hum:49,notes:[196,261.63,293.66,392,261.63,293.66],wave:'sine',noteEvery:.9,noteLength:.13}),
 frozen:palette({air:1350,filter:'highpass',hum:0,notes:[783.99,1046.5,1174.66,880,1046.5,783.99],wave:'sine',noteEvery:2.6,noteLength:.65}),
 orbital:palette({air:190,filter:'lowpass',hum:65.41,notes:[130.81,196,261.63,293.66,196,261.63],wave:'triangle',noteEvery:1.45,noteLength:.38}),
 desert:palette({air:650,filter:'bandpass',hum:0,notes:[220,233.08,329.63,293.66,233.08,220],wave:'triangle',noteEvery:1.7,noteLength:.23}),
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
    const result={active,mapId,background:MAP_AUDIO_THEMES[mapId],surface:AUDIO_SURFACES[mapId],urgency,beatSeconds:1-.78*Math.pow(Math.max(0,Math.min(1,(30-(state.timeLeft??60))/30)),1.35),warning:null,impact:null};
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
