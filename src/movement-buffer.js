// Bounded playback of received snapshots. Never predicts beyond real server state.
export function createMovementBuffer({minDelayMs=75,initialDelayMs=100,maxDelayMs=150,onMetric=()=>{},onUnderrun=()=>{}}={}) {
  if(![minDelayMs,initialDelayMs,maxDelayMs].every(Number.isFinite)||minDelayMs<0||minDelayMs>initialDelayMs||initialDelayMs>maxDelayMs||maxDelayMs>500)throw new Error('Invalid movement buffer delay');
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  let queue=[],arrivals=[],lateness=[],lastArrival=null,offset=0,targetDelay=initialDelayMs;
  let cursor=null,lastSample=null,warmed=false,holdStart=null,underruns=0,worstHold=0,suspended=false;
  function finishHold(now){if(holdStart!==null){const ms=Math.max(0,now-holdStart);worstHold=Math.max(worstHold,ms);onMetric('bufferHold',ms);holdStart=null;}}
  function reset(){queue=[];arrivals=[];lateness=[];lastArrival=null;offset=0;targetDelay=initialDelayMs;cursor=null;lastSample=null;warmed=false;holdStart=null;underruns=0;worstHold=0;suspended=false;}
  function push(snapshot,receivedAt){
    if(!Number.isFinite(receivedAt))throw new Error('Invalid snapshot arrival time');
    const time=Number.isFinite(snapshot.serverTime)?snapshot.serverTime:receivedAt;
    if(queue.length&&time<queue.at(-1).time)reset(); // Server clock discontinuity.
    if(lastArrival!==null){lateness.push(Math.max(0,receivedAt-lastArrival-50));if(lateness.length>40)lateness.shift();targetDelay=clamp(minDelayMs+Math.max(0,...lateness),minDelayMs,maxDelayMs);}
    lastArrival=receivedAt;arrivals.push(receivedAt-time);if(arrivals.length>40)arrivals.shift();offset=Math.min(...arrivals);
    const item={snapshot,time,receivedAt};
    if(queue.at(-1)?.time===time)queue[queue.length-1]=item;else queue.push(item);
    if(queue.length>32)queue.shift();
    onMetric('bufferDelay',targetDelay);
  }
  function sample(now){
    if(!queue.length)return null;
    const oldest=queue[0],newest=queue.at(-1),desired=now-offset-targetDelay;
    if(!warmed){
      warmed=newest.time-oldest.time>=Math.min(initialDelayMs,targetDelay);
      cursor=clamp(desired,oldest.time,newest.time);lastSample=now;
    }else{
      const dt=Math.max(0,now-lastSample);lastSample=now;
      // Resume after a hidden tab/long rendering stall on the current timeline.
      // Normal adjustment is deliberately slow: growing the delay must not rewind.
      if(suspended||dt>250){holdStart=null;cursor=clamp(Math.max(cursor,desired),oldest.time,newest.time);suspended=false;}
      else{
        const speed=clamp(1+(desired-(cursor+dt))/500,.85,1.1);
        cursor=clamp(cursor+dt*speed,oldest.time,newest.time);
      }
    }
    const active=newest.snapshot.you.game.phase==='running'||newest.snapshot.players.some(p=>p.connected&&p.phase==='running');
    if(warmed&&active&&cursor>=newest.time&&now-offset>newest.time+1){
      if(holdStart===null){holdStart=now;underruns++;onUnderrun();}
      worstHold=Math.max(worstHold,now-holdStart);
    }else finishHold(now);
    let right=queue.findIndex(item=>item.time>=cursor);if(right<0)right=queue.length-1;
    const after=queue[right],before=queue[Math.max(0,right-1)],duration=after.time-before.time;
    return {before:before.snapshot,after:after.snapshot,latest:newest.snapshot,intervalMs:duration,t:duration>0?clamp((cursor-before.time)/duration,0,1):1};
  }
  return {push,sample,reset,suspend(){holdStart=null;suspended=true;},diagnostics:()=>({bufferedSnapshots:queue.length,targetDelayMs:targetDelay,underruns,worstHoldMs:worstHold})};
}
