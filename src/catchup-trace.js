// A fixed, short diagnostic context, never a player identity or full replay.
export const CATCHUP_REASONS=Object.freeze(['collision','discontinuity','long-gap','resume','recovery','unclassified']);
export const CATCHUP_TRACE_LIMIT=4;
const number=value=>Number.isFinite(value)&&value>=0&&value<=10000;
const bounded=value=>Math.round(Math.max(0,Math.min(10000,Number.isFinite(value)?value:0)));
export function validCatchupTrace(event){
 return !!event&&typeof event==='object'&&!Array.isArray(event)
  &&Object.keys(event).length===5&&['at','reason','frameMs','excessMs','samples'].every(key=>Object.hasOwn(event,key))
  &&Number.isSafeInteger(event.at)&&event.at>=0&&CATCHUP_REASONS.includes(event.reason)
  &&number(event.frameMs)&&number(event.excessMs)&&Array.isArray(event.samples)&&event.samples.length>0&&event.samples.length<=6
  &&event.samples.every(row=>Array.isArray(row)&&row.length===6&&row.every(number)&&Number.isInteger(row[5])&&row[5]<=63);
}
export function createCatchupTrace({emit=()=>{},wallNow=Date.now}={}){
 let previous=null,ring=[],round=null,emitted=0,lastEvent=-Infinity;
 function reset(){previous=null;ring=[];round=null;emitted=0;lastEvent=-Infinity;}
 return {reset,suspend(){previous=null;ring=[];},sample(state,identity,at,source={}){
  if(identity!==round){reset();round=identity;}
  if(state?.phase!=='running'||!Number.isFinite(at)||!Number.isFinite(state.distance)||!Number.isFinite(state.speed)){previous=null;ring=[];return;}
  const old=previous;previous={at,distance:state.distance,speed:state.speed};
  if(!old)return;
  const dt=at-old.at,delta=state.distance-old.distance,speed=Math.max(old.speed,state.speed);
  if(dt<=0||dt>250||delta<0||speed<=.5||old.speed<=.5||state.speed<=.5){ring=[];return;}
  const advance=delta/speed*1000,reason=CATCHUP_REASONS.includes(source.forwardClockReason)?source.forwardClockReason:'unclassified';
  const flags=(state.stunRemaining>0||state.hitFlash>0?1:0)|(reason==='collision'?2:0)|(reason==='discontinuity'?4:0)|(reason==='long-gap'?8:0)|(reason==='resume'?16:0)|(reason==='recovery'?32:0);
  ring.push([bounded(dt),bounded(advance),bounded(at-source.latestReceivedAt),bounded(source.forwardPredictionMs),bounded(source.recoveryLagMs),flags]);if(ring.length>6)ring.shift();
  const excess=advance-dt;
  if(excess>50&&emitted<CATCHUP_TRACE_LIMIT&&at-lastEvent>=200){
   emitted++;lastEvent=at;
   emit({at:Math.round(wallNow()/100)*100,reason,frameMs:bounded(dt),excessMs:bounded(excess),samples:ring.map(row=>[...row])});
  }
 }};
}
