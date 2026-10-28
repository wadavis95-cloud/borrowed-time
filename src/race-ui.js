// Owns only transient DOM presentation; actions and clock values stay in main/game.
import { createRacePresentation } from './race-presentation.js';
import { CONFIG } from './game.js';
export function createRaceUI({elements:el,reducedMotion=false,onCue=()=>{}}) {
  const controller=createRacePresentation(),animations=new Map();
  let debitId=0,goVisible=false,resultKey='',screenKey='';
  function animate(node,keyframes,duration) {
    animations.get(node)?.cancel();animations.delete(node);
    if(reducedMotion||!node.animate)return;
    const animation=node.animate(keyframes,{duration,easing:'cubic-bezier(.2,.7,.2,1)'});
    animations.set(node,animation);
    animation.onfinish=()=>{if(animations.get(node)===animation)animations.delete(node);};
  }
  function update(game,context,now) {
    const view=controller.update(game,context,now),spend=view.spend;
    el.clock.classList.toggle('spent',Boolean(spend));
    el.debit.hidden=!spend;el.status.hidden=Boolean(spend);el.trail.hidden=!spend;
    if(spend) {
      const names=spend.abilities.map(id=>id==='boost'?'Boost':'Long jump');
      const label=names.length?names.join(' + '):'Abilities';
      el.debit.textContent=`−${spend.amount}s`;
      const announcement=`${label} · −${spend.amount} seconds`;
      if(el.note.textContent!==announcement)el.note.textContent=announcement;
      const color=spend.abilities.length!==1?'#ffe0a0':spend.abilities[0]==='boost'?'#ff9eac':'#a8ceff';
      el.clock.style.setProperty('--purchase-color',color);
      if(debitId!==spend.id) {
        debitId=spend.id;
        el.trail.style.left=`${Math.max(0,Math.min(100,spend.balance/CONFIG.initialTime*100))}%`;
        el.trail.style.width=`${Math.min(100,spend.amount/CONFIG.initialTime*100)}%`;
        animate(el.debit,[{opacity:.4,transform:'translateY(3px)'},{opacity:1,transform:'translateY(-2px)',offset:.4},{opacity:1,transform:'translateY(0)'}],520);
        animate(el.trail,[{opacity:1},{opacity:.2}],1000);
        for(const id of spend.abilities)animate(id==='boost'?el.boost:el.jump,[{boxShadow:'0 0 0 3px #fff0c5'},{boxShadow:'0 0 0 0px #fff0c500'}],650);
      }
    } else if(el.note.textContent)el.note.textContent='';
    el.go.hidden=!view.go;
    if(view.go&&!goVisible)animate(el.go,[{opacity:0,transform:'translate(-50%,8px) scale(.95)'},{opacity:1,transform:'translate(-50%,0) scale(1)',offset:.25},{opacity:0,transform:'translate(-50%,-6px) scale(1)'}],700);
    goVisible=view.go;
    if(view.cue) {
      if(view.cue.kind==='countdown')animate(el.title,[{opacity:.5,transform:'scale(.92)'},{opacity:1,transform:'scale(1)'}],250);
      onCue(view.cue);
    }
    return view;
  }
  function result(outcome) {
    el.finishMark.hidden=el.finishBadge.hidden=!outcome;
    if(!outcome){resultKey='';delete el.overlay.dataset.result;return;}
    el.overlay.dataset.result=outcome.kind;
    el.finishMark.textContent=outcome.mark;el.finishBadge.textContent=outcome.badge;
    const key=[outcome.kind,outcome.mark,outcome.waiting].join(':');
    if(resultKey!==key)animate(el.finishMark,[{opacity:0,transform:'translateY(7px) scale(.88)'},{opacity:1,transform:'translateY(0) scale(1)'}],320);
    resultKey=key;
  }
  function screen(key) {
    if(key===screenKey)return;
    screenKey=key;
    if(el.card)animate(el.card,[{opacity:.45,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],180);
  }
  function reset() {
    controller.reset();for(const animation of animations.values())animation.cancel();animations.clear();
    debitId=0;goVisible=false;resultKey='';screenKey='';
    el.clock.classList.remove('spent');el.debit.hidden=el.trail.hidden=el.go.hidden=true;el.status.hidden=false;el.note.textContent='';
    result(null);
  }
  reset();
  return {update,result,screen,reset,startSolo:()=>controller.startSolo()};
}
