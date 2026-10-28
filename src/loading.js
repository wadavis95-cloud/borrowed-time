import {getMap} from './maps.js';
// A stalled download must leave the user a recovery action, not an endless spinner.
export function withDeadline(work,milliseconds=45000) {
  let timer;
  return Promise.race([work,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Loading is taking too long. Check your connection, then reload.')),milliseconds);
  })]).finally(()=>clearTimeout(timer));
}

// Import and asset loading share one deadline. Return the factory, never create
// a renderer here: late module completion after a timeout cannot start drawing.
export async function loadClassicGraphics(loadModules,onProgress=()=>{},milliseconds=45000,avatarIds) {
  let active=true;
  try {
    return await withDeadline((async()=>{
      const [graphics,avatars]=await loadModules();
      if(!active)return;
      await avatars.preloadAvatars(value=>{if(active)onProgress(value);},avatarIds);
      return graphics.createRenderer;
    })(),milliseconds);
  } finally {active=false;}
}

// Selection generation protects the active view from late completions. Cached
// assets remain reusable, but only the latest requested map can become drawable.
export function createMapLoader({load,isLoaded,now=()=>performance.now(),onChange=()=>{}}){
 let target=null,generation=0,pending=null,loading=false,error=null,measurement=null,cancelledGeneration=null;
 function prepare(mapId,{measure=true}={}){
  if(target===mapId&&!error)return pending||Promise.resolve(true);
  const ids=getMap(mapId).avatars,token=++generation,started=now(),reused=ids.every(isLoaded);
  target=mapId;loading=true;error=null;measurement=null;onChange({loading:true,progress:0,mapId});
  pending=(async()=>{
   try{
    await (reused?Promise.resolve():withDeadline(Promise.resolve().then(()=>load(value=>{if(token===generation)onChange({loading:true,progress:value,mapId});},ids))));
    if(token!==generation)return false;
    loading=false;measurement=measure&&cancelledGeneration!==token?{mapId,reused,started}:null;pending=null;onChange({loading:false,mapId});return true;
   }catch(cause){if(token!==generation)return false;loading=false;error=cause;pending=null;onChange({loading:false,error:cause,mapId});return false;}
  })();return pending;
 }
 return {prepare,ready:mapId=>target===mapId&&!loading&&!error,
  drawn(mapId){if(target!==mapId||loading||error||!measurement)return null;const value={mapId,reused:measurement.reused,ms:Math.max(0,now()-measurement.started)};measurement=null;return value;},
  cancelMeasurement(){measurement=null;cancelledGeneration=generation;},
 };
}
