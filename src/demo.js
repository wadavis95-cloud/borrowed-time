// Frame-driven browser showcase. No server room, socket or background timer.
import {freshCourseSeed} from './game.js';
import {createSoloRace} from './solo-race.js';
import {createSessionScores} from './session-scores.js';
import {getMap} from './maps.js';
export {chooseDemoAction} from './racer-ai.js';
const STEP=1/60;
export function createDemoRace({mapId='tunnel',seed=42,onSnapshot=()=>{},onStatus=()=>{},nextSeed=freshCourseSeed}={}) {
  const map=getMap(mapId),scores=createSessionScores();
  let closed=false,race,countdown=3,accumulator=0,sinceSnapshot=0;
  function reset(){race=createSoloRace({seed,mapId:map.id,avatarId:map.avatars[0],scores,showcase:true});countdown=3;accumulator=0;sinceSnapshot=0;}
  function snapshot(){
    const value=race.snapshot();
    return {...value,type:'snapshot',local:true,room:{...value.room,hostId:value.you.id,phase:countdown>0?'countdown':value.room.phase,countdown:Math.max(1,Math.ceil(countdown))},
      you:{...value.you,game:{...value.you.game}}};
  }
  function emit(){if(!closed)onSnapshot(snapshot());}
  function update(dt,{visible=true}={}){
    if(closed||!visible||race.finished||!Number.isFinite(dt)||dt<=0)return;
    accumulator+=Math.min(dt,.1);
    while(!closed&&accumulator+1e-9>=STEP){
      accumulator=Math.max(0,accumulator-STEP);
      if(countdown>0){countdown=Math.max(0,countdown-STEP);if(countdown<1e-9){countdown=0;race.start();}}
      else race.update(STEP);
      sinceSnapshot+=STEP;
      if(sinceSnapshot+1e-9>=.05||race.finished){sinceSnapshot=0;emit();}
      if(race.finished)break;
    }
  }
  reset();queueMicrotask(()=>{if(!closed){onStatus('open');emit();}});
  return {update,snapshot,view:()=>race.view(),opponents:()=>race.opponents(),
    close(){closed=true;accumulator=0;},
    send(message){
      if(closed)return false;
      if(message?.type==='leave'){closed=true;return true;}
      if(message?.type==='rematch'&&race.finished){seed=nextSeed(seed);reset();emit();return true;}
      return false;
    },
  };
}
