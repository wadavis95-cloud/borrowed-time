// Observes confirmed game/room state. Never advances a race or spends time.
import { ESCAPE_DESTINATIONS } from './finish-destinations.js';
import { ABILITIES } from './game.js';
const finite=value=>Number.isFinite(value)?value:0;
export function createRacePresentation() {
  let previous=null,spend=null,serial=0,goUntil=0,pendingSolo=false;
  function reset(){previous=null;spend=null;serial=0;goUntil=0;pendingSolo=false;}
  function update(game,context={},now=0) {
    const room=context.room;
    const next={phase:game.phase,spent:finite(game.timeSpent),boost:finite(game.boostRemaining),jump:finite(game.jumpRemaining),kind:game.jumpKind,
      roundId:room?.roundId,roomPhase:room?.phase,mode:context.mode||'solo'};
    let before=previous;
    if(before&&(next.spent<before.spent||next.mode!==before.mode||(before.roundId!==undefined&&next.roundId!==before.roundId))) {
      spend=null;goUntil=0;pendingSolo=false;before=null;
    }
    const countdown=room?.phase==='countdown'?Math.max(1,Math.min(3,Math.ceil(finite(room.countdown)))):null;
    let cue=null;
    if(countdown!==null&&before?.countdown!==countdown)cue={kind:'countdown',value:countdown};
    if((pendingSolo||before?.roomPhase==='countdown'&&room?.phase==='racing')&&game.phase==='running') {
      goUntil=now+700;pendingSolo=false;cue={kind:'go'};
    }
    if(game.phase==='paused'){spend=null;goUntil=0;}
    const delta=before?next.spent-before.spent:0;
    if(delta>0&&before.phase==='running'&&game.phase==='running') {
      const abilities=[];
      if(next.boost>before.boost+.1||delta===ABILITIES.boost.cost)abilities.push('boost');
      if(next.kind==='long'&&(before.kind!=='long'||next.jump>before.jump+.1)||delta===ABILITIES.longJump.cost)abilities.push('longJump');
      const aggregate=spend&&now-spend.at<=650;
      spend={id:++serial,amount:delta+(aggregate?spend.amount:0),abilities:[...new Set([...(aggregate?spend.abilities:[]),...abilities])],
        balance:finite(game.timeLeft),at:now,expiresAt:now+1100};
    }
    previous={...next,countdown};
    return {spend:spend&&now<spend.expiresAt&&game.phase==='running'?spend:null,countdown,
      go:game.phase==='running'&&now<goUntil,cue};
  }
  return {update,reset,startSolo(){pendingSolo=true;}};
}

export function finishPresentation(game,snapshot,mode='solo') {
  if(!['won','lost'].includes(game.phase))return null;
  const escaped=game.phase==='won',room=snapshot?.room,finished=room?.phase==='finished';
  const winner=snapshot?.players.find(player=>player.id===room?.winnerId);
  const own=snapshot?.standings?.find(player=>player.id===snapshot.you.id);
  const waiting=Boolean(snapshot&&!finished);
  const position=escaped&&own?.position?` · #${own.position} OF ${snapshot.standings.length}`:'';
  let kind=escaped?'escaped':'dnf',title=escaped?'You escaped.':'Time ran out.';
  if(mode==='demo') {
    kind=finished&&winner?'winner':escaped?'escaped':'dnf';
    title=waiting?'The others are still racing.':winner?`${winner.name} wins.`:'Nobody escaped this round.';
  } else if(finished&&escaped&&winner) {
    kind=winner.id===snapshot.you.id?'winner':'escaped';
    title=kind==='winner'?'You won the race.':`${winner.name} wins.`;
  }
  return {kind,title,waiting,mark:kind==='winner'?'1':escaped?'✓':'×',
    badge:mode==='demo'?(finished?'RACE COMPLETE':'RUN COMPLETE'):(escaped?'ESCAPED'+position:'DID NOT ESCAPE'),
    detail:waiting?'Waiting for the remaining racers.':!escaped&&winner&&mode!=='demo'?`${winner.name} won the race.`:escaped?(ESCAPE_DESTINATIONS[game.mapId]||ESCAPE_DESTINATIONS.tunnel).arrival:''};
}
