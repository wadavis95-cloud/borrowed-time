// Version 2 keeps canonical gameplay snapshots behind an ordered wire cache.
// No numeric quantization or movement-rate change. WebSockets deliver in order.
const rosterKeys = ['id','name','color','avatarId','wins','connected'];
const select = (value, keys) => Object.fromEntries(keys.map(key=>[key,value[key]]));
export function createSnapshotEncoder() {
  let context=null, sequence=0, fingerprints={};
  return snapshot => {
    const {room,you,players,debris,standings,serverTime}=snapshot;
    const key=JSON.stringify([room.code,room.roundId,room.mapId,you.id]);
    const reset=key!==context;
    if(reset){context=key;sequence=0;fingerprints={};}
    const {code,hostId,seed,votes,...roomMotion}=room;
    const {id,name,avatarChoices,inputSeq,game}=you;
    const {recentEvent,...gameMotion}=game;
    const sections={room:{code,hostId,seed,votes},you:{id,name,avatarChoices},
      roster:players.map(p=>select(p,rosterKeys)),debris,standings,recentEvent};
    const updates={};
    for(const [section,value]of Object.entries(sections)){
      const fingerprint=JSON.stringify(value);
      if(reset||fingerprints[section]!==fingerprint){updates[section]=value;fingerprints[section]=fingerprint;}
    }
    return {type:'snapshot',wire:2,seq:++sequence,reset,serverTime,
      room:roomMotion,you:{inputSeq,game:gameMotion},
      players:players.map(({id,phase,lane,distance,jumpRemaining,jumpDuration})=>({id,phase,lane,distance,jumpRemaining,jumpDuration})),
      updates};
  };
}
export function createSnapshotDecoder() {
  let sequence=0,cache=null;
  return packet=>{
    if(packet.wire!==2)return packet; // Old servers remain usable during rollout.
    if(packet.reset){cache=null;sequence=0;}
    if(packet.seq!==sequence+1||(!cache&&!packet.reset))throw new Error('Race snapshot cache is out of sync. Please reconnect.');
    const next={...cache,...packet.updates};
    if(!['room','you','roster','debris','standings','recentEvent'].every(key=>Object.hasOwn(next,key)))throw new Error('Incomplete race snapshot baseline.');
    const roster=new Map(next.roster.map(p=>[p.id,p]));
    const players=packet.players.map(p=>{
      if(!roster.has(p.id))throw new Error('Unknown player in race snapshot.');
      return {...roster.get(p.id),...p};
    });
    cache=next;sequence=packet.seq;
    return {type:'snapshot',serverTime:packet.serverTime,room:{...next.room,...packet.room},
      you:{...next.you,...packet.you,game:{...packet.you.game,recentEvent:next.recentEvent}},
      players,debris:next.debris,standings:next.standings};
  };
}
