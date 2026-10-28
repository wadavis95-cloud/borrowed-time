// A stalled download must leave the user a recovery action, not an endless spinner.
export function withDeadline(work,milliseconds=45000) {
  let timer;
  return Promise.race([work,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('Loading is taking too long. Check your connection, then reload.')),milliseconds);
  })]).finally(()=>clearTimeout(timer));
}

// Import and asset loading share one deadline. Return the factory, never create
// a renderer here: late module completion after a timeout cannot start drawing.
export async function loadClassicGraphics(loadModules,onProgress=()=>{},milliseconds=45000) {
  let active=true;
  try {
    return await withDeadline((async()=>{
      const [graphics,avatars]=await loadModules();
      if(!active)return;
      await avatars.preloadAvatars(value=>{if(active)onProgress(value);});
      return graphics.createRenderer;
    })(),milliseconds);
  } finally {active=false;}
}
