import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalPresentation} from '../src/local-presentation.js';

const snapshot=(seq=0,lane=1,overrides={})=>({serverTime:10000+seq*50,room:{roundId:'one',mapId:'tunnel',seed:42,phase:'racing',raceElapsed:10+seq*.05},you:{id:'me',inputSeq:seq,game:{phase:'running',lane,distance:300+seq*1.5,speed:30,elapsed:10+seq*.05,timeLeft:50,timeSpent:0,jumpRemaining:0,jumpDuration:.65,jumpKind:null,boostRemaining:0,boostCooldown:0,...overrides}}});
const intent=(action,seq=1,sentAt=100,roundId='one')=>({action,seq,sentAt,roundId});
function setup(options={}){const counts={};const p=createLocalPresentation({onCount:key=>counts[key]=(counts[key]||0)+1,...options});p.reconcile(snapshot(),100);return {p,counts};}

test('a successful lane enqueue changes only the local render target before confirmation',()=>{
 const {p}=setup(),authority=snapshot();Object.freeze(authority.you.game);p.reconcile(authority,100);
 assert.equal(p.enqueue(intent('right')),true);
 const shown=p.sample(116);
 assert.equal(shown.game.lane,2);assert.equal(shown.provenance.inputSeq,0);
 assert.deepEqual(shown.provenance.anticipatedLane,{seq:1,roundId:'one',targetLane:2});
 assert.equal(authority.you.game.lane,1);assert.equal(authority.you.game.timeLeft,50);
 assert.equal(shown.game.timeLeft,50);assert.equal(shown.game.timeSpent,0);
});

test('failed sends, other actions, wrong rounds and unavailable phases cannot anticipate',()=>{
 const {p}=setup();
 for(const value of [null,{action:'left'},intent('jump'),intent('longJump'),intent('boost'),intent('left',1,100,'old')])assert.equal(p.enqueue(value),false);
 assert.equal(p.sample(116).game.lane,1);
 const waiting=snapshot();waiting.room.phase='countdown';waiting.you.game.phase='ready';p.reconcile(waiting,120);
 assert.equal(p.enqueue(intent('left',1,125)),false);
});

test('ordered opposing inputs survive partial acknowledgments without double application',()=>{
 const {p}=setup();p.enqueue(intent('left',1,101));p.enqueue(intent('right',2,102));p.enqueue(intent('left',3,103));
 assert.equal(p.sample(116).game.lane,0);
 p.reconcile(snapshot(1,0),150);assert.equal(p.sample(151).game.lane,0);assert.equal(p.diagnostics().pending,2);
 p.reconcile(snapshot(2,1),200);assert.equal(p.sample(201).game.lane,0);assert.equal(p.diagnostics().pending,1);
 p.reconcile(snapshot(3,0),250);assert.equal(p.sample(251).game.lane,0);assert.equal(p.diagnostics().pending,0);
 assert.equal(p.sample(251).provenance.anticipatedLane,null);
});

test('coalesced acknowledgments and duplicate results leave the authoritative lane stable',()=>{
 const {p}=setup();p.enqueue(intent('right',1,101));p.enqueue(intent('left',2,102));
 p.reconcile(snapshot(2,1),150);
 p.result({seq:1,roundId:'one',accepted:false});p.result({seq:2,roundId:'one',accepted:true});
 assert.equal(p.sample(151).game.lane,1);assert.equal(p.diagnostics().pending,0);
 assert.equal(p.reconcile(snapshot(1,2),160),false,'older ack must not rewind authority');
 assert.equal(p.sample(161).game.lane,1);
});

test('explicit rejection removes only its matching intent and replays remaining moves',()=>{
 const {p,counts}=setup();p.enqueue(intent('right',1,101));p.sample(110);
 p.result({seq:1,roundId:'old',accepted:false});assert.equal(p.sample(111).game.lane,2);
 p.result({seq:1,roundId:'one',accepted:false,code:'ACTION_UNAVAILABLE'});
 assert.equal(p.sample(112).game.lane,1);assert.equal(counts.laneCorrections,1);
 p.enqueue(intent('left',2,120));p.enqueue(intent('right',3,121));
 p.result({seq:2,roundId:'one',accepted:false});assert.equal(p.sample(130).game.lane,2);
});

test('accepted result alone does not replace the baseline or remove a pending move',()=>{
 const {p}=setup();p.enqueue(intent('left'));p.result({seq:1,roundId:'one',accepted:true});
 assert.equal(p.diagnostics().pending,1);assert.equal(p.sample(116).game.lane,0);
 p.reconcile(snapshot(1,0),150);assert.equal(p.diagnostics().pending,0);
});

test('lane boundaries are clamped before drawing and repeated boundary inputs cannot leave the course',()=>{
 const {p}=setup();p.reconcile(snapshot(0,0),100);p.enqueue(intent('left',1,101));p.enqueue(intent('right',2,102));
 assert.equal(p.sample(116).game.lane,1);
 p.reconcile(snapshot(2,1),150);p.enqueue(intent('right',3,151));p.enqueue(intent('right',4,152));
 assert.equal(p.sample(166).game.lane,2);
});

test('unconfirmed presentation expires without resending and late authority still wins',()=>{
 const {p,counts}=setup();p.enqueue(intent('right'));p.sample(116);
 assert.equal(p.sample(350).game.lane,2);assert.equal(p.sample(351).game.lane,1);
 assert.equal(counts.laneExpired,1);assert.equal(counts.laneCorrections,1);assert.equal(p.diagnostics().pending,0);
 p.reconcile(snapshot(1,2),400);assert.equal(p.sample(401).game.lane,2);
});

test('pending capacity is bounded and invalid or duplicate enqueue metadata is ignored',()=>{
 const {p,counts}=setup({maxPending:2});
 p.enqueue(intent('left',1,101));p.enqueue(intent('right',2,102));p.enqueue(intent('left',3,103));
 assert.equal(p.diagnostics().pending,2);assert.equal(counts.laneExpired,1);
 assert.equal(p.enqueue(intent('left',3,104)),false);assert.equal(p.enqueue(intent('left',4,NaN)),false);
});

test('round and player changes, disconnect reset and visibility suspension cancel anticipation',()=>{
 const {p}=setup();p.enqueue(intent('left'));p.sample(116);p.suspend();
 assert.equal(p.sample(130).game.lane,1);assert.equal(p.sample(130).game.distance,300.48,'suspension holds the last displayed world point');
 assert.equal(p.enqueue(intent('left',2,135)),false,'resume waits for a fresh snapshot');
 const next=snapshot();next.room.roundId='two';p.reconcile(next,150);
 p.result({seq:1,roundId:'one',accepted:false});assert.equal(p.reconcile(snapshot(1,0),160),false);
 assert.equal(p.sample(161).game.lane,1);p.enqueue(intent('left',1,162,'two'));
 const replacement={...next,you:{...next.you,id:'new-player'}};p.reconcile(replacement,170);
 assert.equal(p.sample(171).game.lane,1);p.reset();assert.equal(p.sample(180),null);
});

test('a long render stall drops stale projection and pending movement',()=>{
 const {p}=setup();p.enqueue(intent('right'));p.sample(110);
 assert.equal(p.sample(500).game.lane,1);assert.equal(p.sample(500).game.distance,300.3,'a stalled frame cannot extrapolate new travel');
});

test('own distance, confirmed jump and hazard clock use one bounded forward timeline',()=>{
 const {p}=setup();p.reconcile(snapshot(0,1,{jumpRemaining:.5,jumpDuration:.65,jumpKind:'normal'}),100);
 const shown=p.sample(200);
 assert.equal(shown.game.distance,303);assert.ok(Math.abs(shown.game.jumpRemaining-.4)<1e-9);
 assert.equal(shown.game.elapsed,10.1);assert.equal(shown.game.raceElapsed,10.1);
 assert.equal(shown.provenance.renderedServerTime,10100);assert.equal(shown.provenance.forwardPredictionMs,100);
 p.sample(220);const capped=p.sample(230);assert.equal(capped.provenance.forwardPredictionMs,120);assert.equal(capped.game.distance,303.6);
 assert.equal(capped.game.timeLeft,50,'rendering cannot spend or grant countdown time');
});

test('authoritative collision and finish state always override local presentation',()=>{
 const {p}=setup();p.enqueue(intent('right'));p.sample(116);
 const hit=snapshot(1,1,{distance:298,speed:0,hitFlash:.3,stunRemaining:.5,timeLeft:43});p.reconcile(hit,150);
 const shown=p.sample(166);assert.equal(shown.game.lane,1);assert.equal(shown.game.distance,298);
 assert.equal(shown.game.hitFlash,.3);assert.equal(shown.game.timeLeft,43);
 p.enqueue(intent('left',2,170));const end=snapshot(2,1,{phase:'lost',distance:299,timeLeft:0});end.room.phase='finished';p.reconcile(end,180);
 assert.equal(p.sample(200).game.phase,'lost');assert.equal(p.sample(200).game.lane,1);assert.equal(p.diagnostics().pending,0);
});

test('large authority corrections snap and ordinary prediction never fabricates a finish',()=>{
 const {p}=setup();p.sample(110);const corrected=snapshot(1,1,{distance:1000});p.reconcile(corrected,150);
 assert.equal(p.sample(150).game.distance,1000);
 const almost=snapshot(2,1,{distance:1349});p.reconcile(almost,200);
 assert.equal(p.sample(320).game.phase,'running');assert.ok(p.sample(320).game.distance<1350);
});

test('late confirmation of the displayed target does not manufacture expiry rollback corrections',()=>{
 const {p,counts}=setup();p.enqueue(intent('right'));p.sample(116);
 p.reconcile(snapshot(1,2),400);assert.equal(p.sample(400).game.lane,2);
 assert.equal(counts.laneCorrections||0,0);assert.equal(counts.laneExpired||0,0);
});

test('delayed snapshots cannot rewind confirmed jump progress or the shared hazard clock',()=>{
 const p=createLocalPresentation();
 const first=snapshot(0,1,{distance:30,elapsed:1,jumpRemaining:.5,jumpDuration:.65,jumpKind:'normal'});first.serverTime=1000;first.room.raceElapsed=1;
 const next=snapshot(0,1,{distance:31.5,elapsed:1.05,jumpRemaining:.45,jumpDuration:.65,jumpKind:'normal'});next.serverTime=1050;next.room.raceElapsed=1.05;
 p.reconcile(first,2000);const before=p.sample(2090);p.reconcile(next,2100);const after=p.sample(2100);
 assert.ok(after.game.raceElapsed>=before.game.raceElapsed);
 assert.ok(after.game.jumpRemaining<=before.game.jumpRemaining);
 assert.ok(after.provenance.renderedServerTime>=before.provenance.renderedServerTime);
 assert.ok(Math.abs(after.game.distance-33)<1e-8,'distance follows the same unrewound timeline');
});

test('late packets cannot resurrect a landed arc or replay a passed debris-impact time',()=>{
 const p=createLocalPresentation();
 const first=snapshot(0,1,{distance:30,elapsed:1,jumpRemaining:.1,jumpDuration:.65,jumpKind:'normal'});first.serverTime=1000;first.room.raceElapsed=1;
 const next=snapshot(0,1,{distance:31.5,elapsed:1.05,jumpRemaining:.05,jumpDuration:.65,jumpKind:'normal'});next.serverTime=1050;next.room.raceElapsed=1.05;
 p.reconcile(first,2000);const landed=p.sample(2120);assert.equal(landed.game.jumpRemaining,0);assert.ok(landed.game.raceElapsed>1.1);
 p.reconcile(next,2150);const shown=p.sample(2150);
 assert.equal(shown.game.jumpRemaining,0);assert.equal(shown.game.jumpKind,null);assert.ok(shown.game.raceElapsed>=landed.game.raceElapsed);
 p.suspend();assert.equal(p.sample(2160).game.jumpRemaining,0,'visibility suspension cannot replay an old arc');
});

test('simulation step variance does not rewind the world clock even with regular wall timestamps',()=>{
 const p=createLocalPresentation(),first=snapshot(0,1,{distance:30,elapsed:1});first.serverTime=1000;first.room.raceElapsed=1;
 const next=snapshot(0,1,{distance:31,elapsed:1+1/30});next.serverTime=1050;next.room.raceElapsed=1+1/30;
 p.reconcile(first,2000);const before=p.sample(2090);p.reconcile(next,2100);const after=p.sample(2100);
 assert.ok(after.game.raceElapsed>=before.game.raceElapsed);assert.ok(after.game.elapsed>=before.game.elapsed);
 assert.ok(after.provenance.forwardPredictionMs<=120);
});
