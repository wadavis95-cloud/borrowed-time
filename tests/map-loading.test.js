import test from 'node:test';
import assert from 'node:assert/strict';
import * as loading from '../src/loading.js';
test('map preparation gates drawing, ignores stale completions and times the first draw',async()=>{
 assert.equal(typeof loading.createMapLoader,'function');
 let now=0;const waits={},loaded=new Set();const loader=loading.createMapLoader({now:()=>now,isLoaded:id=>loaded.has(id),load:(_progress,ids)=>new Promise(resolve=>{waits[ids[0]]=()=>{ids.forEach(id=>loaded.add(id));resolve();};})});
 const first=loader.prepare('tunnel');assert.equal(loader.ready('tunnel'),false);assert.equal(loader.drawn('tunnel'),null);
 const second=loader.prepare('pirate');await new Promise(r=>setImmediate(r));waits.courier();await first;assert.equal(loader.ready('tunnel'),false);assert.equal(loader.ready('pirate'),false);
 waits.captain();now=125;await second;assert.equal(loader.ready('pirate'),true);now=175;
 assert.deepEqual(loader.drawn('pirate'),{mapId:'pirate',reused:false,ms:175});assert.equal(loader.drawn('pirate'),null);
 now=200;await loader.prepare('tunnel');now=240;assert.deepEqual(loader.drawn('tunnel'),{mapId:'tunnel',reused:true,ms:40});
});
test('hidden or failed preparations do not emit a misleading successful timing',async()=>{
 assert.equal(typeof loading.createMapLoader,'function');
 const loader=loading.createMapLoader({load:async()=>{throw Error('offline');},isLoaded:()=>false});
 assert.equal(await loader.prepare('tunnel'),false);assert.equal(loader.ready('tunnel'),false);assert.equal(loader.drawn('tunnel'),null);
 const hidden=loading.createMapLoader({load:async()=>{},isLoaded:()=>true});await hidden.prepare('tunnel');hidden.cancelMeasurement();assert.equal(hidden.drawn('tunnel'),null);
});
test('hiding during an outstanding download discards its eventual timing',async()=>{
 let finish,now=0;const loader=loading.createMapLoader({now:()=>now,isLoaded:()=>false,load:()=>new Promise(resolve=>{finish=resolve;})});
 const work=loader.prepare('pirate');await new Promise(r=>setImmediate(r));loader.cancelMeasurement();now=10000;finish();await work;now=11000;assert.equal(loader.drawn('pirate'),null);assert.equal(loader.ready('pirate'),true);
});
