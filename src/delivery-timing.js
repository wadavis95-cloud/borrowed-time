// Interval differences need no shared clock. Excess includes transport/browser scheduling.
export function createDeliveryTiming(observe){
 let previous=null;
 return {reset(){previous=null;},sample(timing,arrival){
  if(!timing?.periodic||![timing.scheduledAt,timing.sentAt,arrival].every(Number.isFinite)||timing.sentAt<timing.scheduledAt)return;
  observe('scheduleLag',timing.sentAt-timing.scheduledAt);
  if(previous&&timing.sentAt>previous.sentAt&&arrival>=previous.arrival){
   const sentGap=timing.sentAt-previous.sentAt;
   observe('sendGap',sentGap);observe('arrivalExcess',Math.max(0,arrival-previous.arrival-sentGap));
  }
  previous={sentAt:timing.sentAt,arrival};
 }};
}
