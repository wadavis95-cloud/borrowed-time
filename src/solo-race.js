// Local race authority: one human plus three ordinary-rule computer drivers.
// No socket, opponent teleporting, hidden speed multiplier or shared ability budget.
import {CONFIG,ABILITIES,createGame,startGame,updateGame,moveLane,jump,buyAbility} from './game.js';
import {createSessionScores} from './session-scores.js';
import {chooseDemoAction} from './demo.js';
import {getMap} from './maps.js';
import {AVATARS} from './avatars.js';
import {scheduleApproachingDebris} from './hazards.js';
const COLORS=['#65ead3','#d4b3ff','#ffc482','#9ac9ff'];
const LANES=[1,0,2,1];
let nextRound=0;
export function createSoloRace({seed=42,mapId='tunnel',avatarId,scores=createSessionScores()}={}) {
  const map=getMap(mapId),roundId=`solo-${++nextRound}`;
  if(avatarId&&!map.avatars.includes(avatarId))avatarId=undefined;
  const player=createGame({seed,mapId:map.id,avatarId});
  const cast=[player.avatarId,...map.avatars.filter(id=>id!==player.avatarId)];
  const racers=cast.map((id,index)=>{
    const game=index===0?player:createGame({seed,mapId:map.id,avatarId:id,playerColor:COLORS[index]});
    game.lane=LANES[index];game.debris=player.debris;
    return {id:index===0?'you':`cpu-${index}`,name:AVATARS[id].name,color:COLORS[index],avatarId:id,isComputer:index>0,game};
  });
  let elapsed=0,nextDecision=0,started=false;
  const finished=()=>started&&racers.every(r=>['won','lost'].includes(r.game.phase));
  function apply(game,action){
    if(action==='left'||action==='right')return moveLane(game,action==='left'?-1:1);
    if(action==='jump')return jump(game);
    if(action==='boost'||action==='longJump')return buyAbility(game,action).ok;
    return false;
  }
  function update(dt){
    if(!started||finished()||player.phase==='paused'||!Number.isFinite(dt)||dt<=0)return;
    let remaining=Math.min(dt,.1);
    while(remaining>1e-9&&!finished()){
      const step=Math.min(1/60,remaining);
      if(elapsed+1e-9>=nextDecision){
        for(let index=1;index<racers.length;index++){
          const game=racers[index].game,action=chooseDemoAction(game,index);
          if(action)apply(game,action);
        }
        nextDecision=elapsed+.15;
      }
      scheduleApproachingDebris(player.debris,racers.map(r=>r.game),CONFIG,ABILITIES.boost.multiplier);
      for(const racer of racers)updateGame(racer.game,step,true);
      elapsed+=step;remaining-=step;
      const first=[...racers].filter(r=>r.game.phase==='won').sort((a,b)=>a.game.finishTime-b.game.finishTime)[0];
      if(first)scores.record(roundId,first.id);
    }
  }
  function opponents(){return racers.slice(1).filter(r=>!['won','lost'].includes(r.game.phase)).map(r=>({
    id:r.id,name:r.name,color:r.color,avatarId:r.avatarId,connected:true,
    phase:player.phase==='paused'&&r.game.phase==='running'?'paused':r.game.phase,
    lane:r.game.lane,distance:r.game.distance,jumpRemaining:r.game.jumpRemaining,jumpDuration:r.game.jumpDuration,
  }));}
  function snapshot(){
    const ordered=[...racers].sort((a,b)=>{
      const group=r=>r.game.phase==='won'?0:r.game.phase==='lost'?2:1;
      return group(a)-group(b)||(a.game.phase==='won'?a.game.finishTime-b.game.finishTime:b.game.distance-a.game.distance);
    });
    const winner=ordered.find(r=>r.game.phase==='won');
    return {room:{phase:finished()?'finished':started?'racing':'lobby',roundId,winnerId:winner?.id??null,mapId:map.id,raceElapsed:elapsed},
      you:{id:'you',name:racers[0].name,game:player},
      players:racers.map(r=>({id:r.id,name:r.name,color:r.color,avatarId:r.avatarId,isComputer:r.isComputer,wins:scores.wins(r.id),connected:true,phase:r.game.phase,lane:r.game.lane,distance:r.game.distance})),
      standings:ordered.map((r,i)=>({id:r.id,position:r.game.phase==='lost'?null:i+1,status:r.game.phase==='won'?'escaped':r.game.phase==='lost'?'dnf':started?'racing':'ready'})),
    };
  }
  return {player,racers,start(){if(started)return false;started=true;racers.forEach(r=>startGame(r.game));return true;},
    input:action=>apply(player,action),update,opponents,snapshot,view:()=>({...player,raceElapsed:elapsed}),get finished(){return finished();}};
}
