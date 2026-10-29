// Fixed diagnostic labels only; no room/player identifiers leave the browser.
export const RACE_WINDOWS=Object.freeze(['outside','unknown','0-2s','2-5s','5-10s','10-30s','30s+']);
export const STARTUP_METRICS=Object.freeze(['snapshotWork','frameWork','drawWork','ownHold','forwardExcess']);
export function raceWindow(phase,elapsed){
  if(phase!=='racing')return 'outside';
  if(!Number.isFinite(elapsed)||elapsed<0)return 'unknown';
  return elapsed<2?'0-2s':elapsed<5?'2-5s':elapsed<10?'5-10s':elapsed<30?'10-30s':'30s+';
}

// Observe the displayed course, never change it. A catch-up candidate is forward
// distance beyond one physical frame at the larger of the two reported speeds.
// These are presentation symptoms, not proof that the server or network failed.
export function createMotionDiagnostics(observe){
  let previous=null,holdMs=0;
  return {
    reset(){previous=null;holdMs=0;},
    sample(state,round,at){
      if(state?.phase!=='running'||!Number.isFinite(state.distance)||!Number.isFinite(state.speed)||!Number.isFinite(at)){
        this.reset();return;
      }
      const current={distance:state.distance,speed:state.speed,round,at};
      const old=previous;previous=current;
      if(!old||old.round!==round||at<=old.at||at-old.at>250){holdMs=0;return;}
      const dt=at-old.at,delta=current.distance-old.distance,speed=Math.max(old.speed,current.speed);
      if(current.speed<=.5||old.speed<=.5||delta<0){holdMs=0;return;}
      if(delta<=.00001){holdMs+=dt;return;}
      if(holdMs>0){observe('ownHold',holdMs);holdMs=0;}
      const excess=delta/speed*1000-dt;
      if(excess>1)observe('forwardExcess',excess);
    },
  };
}
