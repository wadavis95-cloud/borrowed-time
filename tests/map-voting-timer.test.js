import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomManager} from '../src/server/rooms.js';
import {createGameServer} from '../src/server/app.js';
import {once} from 'node:events';
import {client,measurements} from '../scripts/perf/client.mjs';

function setup(){
 let time=1000;const m=createRoomManager({now:()=>time,random:()=>0});
 m.connect('host');m.handle('host',{type:'create',mapId:'tunnel'});
 const code=m.snapshot('host').room.code;
 m.connect('guest');m.handle('guest',{type:'join',code});
 return {m,code,advance(ms){time+=ms;m.tick(time);},snapshot:()=>m.snapshot('host')};
}
test('joining never starts voting; host opens exactly seven seconds then auto countdown',()=>{
 const {m,advance,snapshot}=setup();advance(20000);assert.equal(snapshot().room.phase,'lobby');
 assert.equal(m.handle('guest',{type:'start'}).code,'HOST_ONLY');
 assert.equal(m.handle('host',{type:'start'}).ok,true);assert.equal(snapshot().room.phase,'voting');
 assert.equal(snapshot().room.voteCountdown,7);assert.equal(m.handle('host',{type:'start'}).code,'ROUND_ACTIVE');
 assert.equal(m.handle('guest',{type:'vote',mapId:'pirate'}).ok,true);
 advance(6999);assert.equal(snapshot().room.phase,'voting');assert.equal(snapshot().room.voteCountdown,1);
 advance(1);assert.equal(snapshot().room.phase,'countdown');assert.equal(snapshot().room.mapId,'pirate');
 assert.equal(m.handle('guest',{type:'vote',mapId:'jungle'}).code,'VOTING_CLOSED');
 advance(3000);assert.equal(snapshot().room.phase,'racing');
});
test('voting cancels if fewer than two racers remain and can be restarted by the host',()=>{
 const {m,advance,snapshot,code}=setup();m.handle('host',{type:'start'});advance(3000);
 m.handle('guest',{type:'leave'});assert.equal(snapshot().room.phase,'lobby');assert.equal(snapshot().room.voteCountdown,0);
 advance(10000);assert.equal(snapshot().room.phase,'lobby');
 m.connect('new');m.handle('new',{type:'join',code});assert.equal(snapshot().room.phase,'lobby');
 m.handle('host',{type:'start'});assert.equal(snapshot().room.voteCountdown,7);
});
test('host migration retains voting deadline; rematch waits for host before new voting',()=>{
 const {m,advance,code}=setup();m.connect('third');m.handle('third',{type:'join',code});
 m.handle('host',{type:'start'});advance(2000);m.handle('host',{type:'leave'});
 assert.equal(m.snapshot('guest').room.voteCountdown,5);advance(5000);advance(3000);
 for(const p of m.rooms.get(code).players.values()){p.game.phase='lost';p.game.timeLeft=0;}
 advance(20);assert.equal(m.snapshot('guest').room.phase,'finished');
 assert.equal(m.handle('guest',{type:'rematch'}).ok,true);assert.equal(m.snapshot('guest').room.phase,'lobby');
 advance(10000);assert.equal(m.snapshot('guest').room.phase,'lobby');
 m.handle('guest',{type:'start'});assert.equal(m.snapshot('guest').room.voteCountdown,7);
});
const networkTest=process.env.RUN_NETWORK_TESTS==='1'?test:test.skip;
networkTest('production voting flow reaches both real compact clients and resolves their map',async t=>{
 let time=1000;const app=createGameServer({now:()=>time});t.after(()=>app.close());
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 const host=client(origin,measurements(),0,2),guest=client(origin,measurements(),1,2);t.after(()=>{host.close();guest.close();});
 await Promise.all([host,guest].map(p=>p.wait(m=>m.type==='connected')));
 host.send({type:'create'});const initial=await host.wait(m=>m.type==='snapshot');guest.send({type:'join',code:initial.room.code});
 const joined=await guest.wait(m=>m.type==='snapshot');assert.equal(joined.room.phase,'lobby');
 host.send({type:'start'});
 for(const p of [host,guest]){const vote=await p.wait(m=>m.type==='snapshot'&&m.room.phase==='voting');assert.equal(vote.room.voteCountdown,7);p.send({type:'vote',mapId:'jungle'});}
 await host.wait(m=>m.type==='snapshot'&&Object.values(m.room.votes).filter(v=>v==='jungle').length===2);
 time+=7000;app.rooms.tick(time);
 for(const p of [host,guest]){const locked=await p.wait(m=>m.type==='snapshot'&&m.room.phase==='countdown');assert.equal(locked.room.mapId,'jungle');}
 time+=3000;app.rooms.tick(time);
 for(const p of [host,guest])await p.wait(m=>m.type==='snapshot'&&m.room.phase==='racing');
});
