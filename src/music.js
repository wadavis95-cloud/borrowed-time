// The selected CC0 recordings are served locally. No third-party requests at play time.
export const MUSIC_TRACKS=Object.freeze({
 tunnel:Object.freeze({title:'Outrunners',artist:'OOG37 / Two Litre Falls Music',src:'/assets/music/tunnel.mp3',source:'https://opengameart.org/content/outrunners'}),
 pirate:Object.freeze({title:'Pirate Indenture',artist:'Eldritch Grim',src:'/assets/music/pirate.mp3',source:'https://opengameart.org/content/pirate-indenture'}),
 jungle:Object.freeze({title:'Bamboo Blitz',artist:'Tsorthan Grove',src:'/assets/music/jungle.mp3',source:'https://opengameart.org/content/bamboo-blitz'}),
 frozen:Object.freeze({title:'Black Diamond',artist:'Joth',src:'/assets/music/frozen.mp3',source:'https://opengameart.org/content/black-diamond'}),
 orbital:Object.freeze({title:'Singularity — action',artist:'vitalezzz',src:'/assets/music/orbital.mp3',source:'https://opengameart.org/content/singularity-0'}),
 desert:Object.freeze({title:'Desert Loop',artist:'iamoneabe',src:'/assets/music/desert.mp3',source:'https://opengameart.org/content/desert-loop'}),
});
export function createMusicPlayer(context,{fetchAudio=(...args)=>fetch(...args)}={}){
 const gain=context.createGain();gain.connect(context.destination);
 let desired={playing:false},mapId=null,buffer=null,source=null,pending=null,controller=null;
 let generation=0,disposed=false,failed=false,level=-1;
 function stop(){if(!source)return;source.onended=null;try{source.stop();}catch{}source.disconnect();source=null;}
 function volume(){
  // Steady mix: clock urgency, pickups and abilities must never pump the music.
  const next=.075;
  if(Math.abs(next-level)>.001){level=next;gain.gain.setTargetAtTime(next,context.currentTime,.12);}
 }
 function start(){
  if(disposed||!desired.playing||context.state!=='running'||!buffer||source)return;
  source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(gain);
  level=-1;gain.gain.setValueAtTime(0,context.currentTime);volume();
  source.start(0,Math.max(0,desired.elapsed||0)%buffer.duration);
 }
 function reset(){generation++;controller?.abort();controller=null;pending=null;stop();desired={playing:false};failed=false;}
 function update(state){
  if(disposed)return Promise.resolve();
  desired=state;
  const nextMap=Object.hasOwn(MUSIC_TRACKS,state.mapId)?state.mapId:'tunnel';
  if(nextMap!==mapId){generation++;controller?.abort();controller=null;pending=null;stop();mapId=nextMap;buffer=null;failed=false;}
  if(!state.playing){stop();return Promise.resolve();}
  if(buffer){volume();start();return Promise.resolve();}
  if(pending||failed)return pending||Promise.resolve();
  const token=generation;controller=new AbortController();
  pending=(async()=>{
   try{
    const response=await fetchAudio(MUSIC_TRACKS[nextMap].src,{signal:controller.signal});
    if(!response.ok)throw new Error(`Music download failed (${response.status}).`);
    const bytes=await response.arrayBuffer();
    if(disposed||token!==generation)return;
    const decoded=await context.decodeAudioData(bytes);
    if(disposed||token!==generation)return;
    buffer=decoded;start();
   }catch(error){if(token===generation&&error.name!=='AbortError')failed=true;}
   finally{if(token===generation){pending=null;controller=null;}}
  })();
  return pending;
 }
 return {update,reset,dispose(){if(disposed)return;reset();disposed=true;buffer=null;gain.disconnect();},
  get track(){return source?MUSIC_TRACKS[mapId]:null;},
  get status(){return failed?'error':source?'playing':pending?'loading':buffer?'paused':'idle';}};
}
