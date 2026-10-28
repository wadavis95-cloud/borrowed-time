import test from 'node:test';
import assert from 'node:assert/strict';
import {MUSIC_TRACKS,createMusicPlayer} from '../src/music.js';
const flush=()=>new Promise(r=>setImmediate(r));
function setup(fetchAudio=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})){
 const sources=[],levels=[],requests=[];
 const ctx={state:'running',currentTime:0,destination:{},
  createGain:()=>({gain:{setValueAtTime:v=>levels.push(v),linearRampToValueAtTime:v=>levels.push(v),setTargetAtTime:v=>levels.push(v)},connect(){},disconnect(){}}),
  decodeAudioData:async()=>({duration:60}),
  createBufferSource(){const s={connect(){},disconnect(){},start:(...args)=>s.started=args,stop(){s.stopped=true;}};sources.push(s);return s;}};
 const music=createMusicPlayer(ctx,{fetchAudio:(url,args)=>{requests.push(url);return fetchAudio(url,args);}});
 return {music,ctx,sources,levels,requests};
}
test('six selected tracks load only for the playing map, loop, prioritize the urgent clock, pause and restart',async()=>{
 assert.deepEqual(Object.keys(MUSIC_TRACKS),['tunnel','pirate','jungle','frozen','orbital','desert']);
 const {music,ctx,sources,levels,requests}=setup();
 await music.update({mapId:'pirate',playing:false,elapsed:0});assert.equal(requests.length,0);
 await music.update({mapId:'pirate',playing:true,elapsed:3,duck:false,urgency:0});
 assert.equal(requests.length,1);assert.equal(sources[0].loop,true);assert.deepEqual(sources[0].started,[0,3]);
 const base=levels.at(-1);await music.update({mapId:'pirate',playing:true,elapsed:4,duck:true,urgency:0});assert.equal(levels.at(-1),base,'silent abilities do not dip the music');
 await music.update({mapId:'pirate',playing:true,elapsed:4,urgency:1});assert.ok(levels.at(-1)<base);
 await music.update({mapId:'pirate',playing:false,elapsed:4});assert.equal(sources[0].stopped,true);
 ctx.currentTime=5;await music.update({mapId:'pirate',playing:true,elapsed:4});assert.equal(requests.length,1);assert.deepEqual(sources[1].started,[0,4]);
 music.reset();assert.equal(sources[1].stopped,true);
 await music.update({mapId:'frozen',playing:true,elapsed:0});assert.equal(requests.length,2);assert.match(requests[1],/frozen/);
 music.dispose();music.dispose();assert.equal(sources.at(-1).stopped,true);
});
test('a late music download cannot start after mute, reset or a map change',async()=>{
 const waits=[];const {music,sources}=setup(()=>new Promise(resolve=>waits.push(resolve)));
 const old=music.update({mapId:'tunnel',playing:true,elapsed:1});
 music.reset();const current=music.update({mapId:'jungle',playing:true,elapsed:2});
 waits[0]({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await old;assert.equal(sources.length,0);
 await music.update({mapId:'jungle',playing:false,elapsed:2});
 waits[1]({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await current;await flush();assert.equal(sources.length,0);
 music.dispose();
});
test('failed music is optional and does not retry every frame',async()=>{
 const {music,requests}=setup(async()=>({ok:false,status:404}));
 await music.update({mapId:'orbital',playing:true,elapsed:0});assert.equal(music.status,'error');
 await music.update({mapId:'orbital',playing:true,elapsed:1});assert.equal(requests.length,1);music.dispose();
});

test('all six local music clips match their credited source manifest',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {createHash}=await import('node:crypto');
 const manifest=JSON.parse(await readFile(new URL('../assets/music/manifest.json',import.meta.url),'utf8'));
 const credits=await readFile(new URL('../assets/music/CREDITS.txt',import.meta.url),'utf8');
 assert.equal(manifest.length,6);
 for(const item of manifest){
  const track=MUSIC_TRACKS[item.mapId];assert.equal(track.src,'/'+item.local);assert.equal(item.license,'CC0');
  const bytes=await readFile(new URL('../'+item.local,import.meta.url));assert.ok(bytes.length>10000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  assert.ok(credits.includes(item.title)&&credits.includes(item.source)&&credits.includes(item.artist));
 }
});
