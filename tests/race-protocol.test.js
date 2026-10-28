import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotEncoder, createSnapshotDecoder} from '../src/race-protocol.js';
import {createRoomManager} from '../src/server/rooms.js';
import {MAP_IDS} from '../src/maps.js';

for (const mapId of MAP_IDS) test(`compact snapshots preserve ${mapId} state and hazard changes`,()=>{
 const rooms=createRoomManager({now:()=>1000});rooms.connect('a');rooms.handle('a',{type:'create',mapId});
 const encode=createSnapshotEncoder(),decode=createSnapshotDecoder();
 const initial=rooms.snapshot('a');
 const baseline=encode(initial);assert.deepEqual(decode(baseline),initial);
 const next=structuredClone(initial);next.serverTime++;next.you.game.distance=20;
 const compact=encode(next);assert.ok(JSON.stringify(compact).length<JSON.stringify(next).length*.6);
 assert.deepEqual(decode(compact),next);assert.deepEqual(decode(encode(next)),next);
 const changed=structuredClone(next);changed.debris[0].impactAt+=2;changed.players[0].name='Captain';changed.you.game.recentEvent={id:1,text:'test',kind:'info'};
 assert.deepEqual(decode(encode(changed)),changed);assert.deepEqual(initial,rooms.snapshot('a'), 'decoder never mutates earlier state');
 const round=structuredClone(changed);round.room.roundId='new';assert.deepEqual(decode(encode(round)),round);
});
test('missing baseline and skipped updates fail instead of using stale hazards',()=>{
 const rooms=createRoomManager({now:()=>1000});rooms.connect('a');rooms.handle('a',{type:'create'});
 const encode=createSnapshotEncoder(),decode=createSnapshotDecoder(),s=rooms.snapshot('a');
 const first=encode(s);decode(first);const skipped=structuredClone(s);skipped.debris[0].impactAt++;
 encode(skipped);const packet=encode(skipped);
 assert.throws(()=>decode(packet),/snapshot/i);
 assert.throws(()=>createSnapshotDecoder()(packet),/snapshot/i);
});

test('actual serialized packets preserve changing standings, roster and private events',()=>{
 const rooms=createRoomManager({now:()=>1000});rooms.connect('a');rooms.handle('a',{type:'create'});
 const encode=createSnapshotEncoder(),decode=createSnapshotDecoder();
 const wire=s=>decode(JSON.parse(JSON.stringify(encode(s))));
 const before=rooms.snapshot('a');assert.deepEqual(wire(before),before);
 rooms.connect('b');rooms.handle('b',{type:'join',code:before.room.code});
 const joined=rooms.snapshot('a');assert.deepEqual(wire(joined),joined);
 const modified=structuredClone(joined);modified.players[1].connected=false;modified.players[0].wins=2;
 modified.standings.reverse();modified.standings[0].status='escaped';modified.you.game.recentEvent={id:1,kind:'boost',text:'Boost'};
 assert.deepEqual(wire(modified),modified);
 const repeated=encode(modified);assert.equal(Object.hasOwn(repeated.updates,'debris'),false);decode(repeated);
 rooms.disconnect('b');assert.deepEqual(wire(rooms.snapshot('a')),rooms.snapshot('a'));
});
