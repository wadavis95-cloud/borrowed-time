// Graphics ownership only. Preparing a course does not advance its simulation.
export const obstacleVisualKey=o=>`${o.id}:${o.type}:${o.length||0}`;
export const debrisVisualKey=e=>`${e.id}:${e.lane}`;
export const opponentVisualKey=p=>p.id||`${p.avatarId}:${p.color}`;
const ghostKey=opponentVisualKey;
export function createRaceObjects({makeObstacle,makeDebris,makeGhost,dispose}){
 const obstacles=new Map(),debris=new Map(),ghosts=new Map(),ghostStyles=new Map();
 function reconcile(cache,items,keyOf,create){
  const wanted=new Set();
  for(const item of items){const key=keyOf(item);wanted.add(key);if(!cache.has(key))cache.set(key,create(item));}
  for(const [key,value]of cache)if(!wanted.has(key)){dispose(value);cache.delete(key);}
 }
 function prepare(state,opponents=[]){
  reconcile(obstacles,state.obstacles||[],obstacleVisualKey,makeObstacle);
  reconcile(debris,state.debris||[],debrisVisualKey,makeDebris);
  const roster=opponents.slice(0,3),wanted=new Set(roster.map(ghostKey));
  for(const [key,value]of ghosts)if(!wanted.has(key)){dispose(value);ghosts.delete(key);ghostStyles.delete(key);}
  for(const opponent of roster){
   const key=ghostKey(opponent),style=JSON.stringify([opponent.avatarId,opponent.color]);
   if(ghosts.has(key)&&ghostStyles.get(key)!==style){dispose(ghosts.get(key));ghosts.delete(key);}
   if(!ghosts.has(key)){ghosts.set(key,makeGhost(opponent));ghostStyles.set(key,style);}
  }
 }
 function clear(){for(const cache of [obstacles,debris,ghosts]){for(const value of cache.values())dispose(value);cache.clear();}ghostStyles.clear();}
 return {obstacles,debris,ghosts,prepare,clear};
}
