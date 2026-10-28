// Disposable loopback server only. Never load-tests the public game.
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {cpus,totalmem,platform,arch} from 'node:os';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {ALL_AVATAR_IDS} from '../src/avatars.js';
import {client,measurements,populate} from './perf/client.mjs';
import {stats,Samples} from './perf/metrics.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function ipc(child,type,timeout=10000){return new Promise((resolve,reject)=>{
 const cleanup=()=>{clearTimeout(timer);child.off('message',listen);child.off('exit',exited);child.off('error',failed);};
 const failed=error=>{cleanup();reject(error);};
 const exited=()=>failed(new Error(`Worker exited before ${type}`));
 function listen(message){
  if(message.type==='fatal'){failed(new Error(message.message));return;}
  if(message.type!==type)return;cleanup();resolve(message);
 }
 const timer=setTimeout(()=>failed(new Error(`Worker ${type} timed out`)),timeout);
 child.on('message',listen);child.once('exit',exited);child.once('error',failed);
});}
async function server(explore=false){
 const worker=fork(new URL('./perf/server-worker.mjs',import.meta.url),[],{execArgv:[],env:{...process.env,PERF_EXPLORE:explore?'1':'0'},stdio:['ignore','ignore','inherit','ipc']});
 const ready=await ipc(worker,'ready');
 return {...ready,worker,async command(type){const reply=ipc(worker,type);worker.send({type});return reply;},async close(){
  if(worker.exitCode!==null)return;const exited=once(worker,'exit');worker.send({type:'close'});const timeout=setTimeout(()=>worker.kill('SIGTERM'),3000);await exited;clearTimeout(timeout);
 }};
}
async function coldVisitors(origin,count,summary){
 let next=0;
 const paths=['/','/src/main.js','/vendor/three.module.js','/vendor/three.core.js','/assets/music/tunnel.mp3',...ALL_AVATAR_IDS.map(id=>`/assets/characters/${id}.glb`)];
 async function visit(){
  const start=performance.now();let p=0;
  await Promise.all(Array.from({length:6},async()=>{
   while(p<paths.length){const path=paths[p++];try{
    const response=await fetch(new URL(path,origin),{headers:{'Accept-Encoding':'gzip'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    summary.transferBytes+=Number(response.headers.get('content-length'))||0;
    await response.arrayBuffer();summary.requests++;
   }catch(error){summary.failures++;summary.lastError=error.message;}}
  }));summary.visitorMs.add(performance.now()-start);
 }
 await Promise.all(Array.from({length:Math.min(4,count)},async()=>{while(next<count){next++;await visit();}}));
}
async function scenario({rooms,seconds,burst=false,downloads=0,explore=false,snapshotVersion=2}){
 const service=await server(explore),metrics=measurements(),clients=[];
 let drive,pings,downloadsTask;const driverLag=monitorEventLoopDelay({resolution:10});
 try{
  const start=performance.now();await populate(service.origin,rooms,{burst,metrics,clients,snapshotVersion});
  const arrivalMs=performance.now()-start;
  drive=setInterval(()=>{for(const c of clients)c.drive();},150);
  await sleep(3300); // Countdown is actual production timing, not bypassed.
  await service.command('reset');driverLag.enable();const cpu=process.cpuUsage(),at=performance.now();
  for(const c of clients)c.measure();
  pings=setInterval(()=>{for(const c of clients)c.ping();},1000);
  const http={requests:0,transferBytes:0,failures:0,visitorMs:new Samples()};
  downloadsTask=coldVisitors(service.origin,downloads,http);
  console.log(`Measuring ${rooms} rooms / ${rooms*4} racers for ${seconds}s${burst?' (burst arrivals)':''}${downloads?` + ${downloads} cold asset visitors`:''}…`);
  await sleep(seconds*1000);for(const c of clients)c.stop();clearInterval(drive);clearInterval(pings);
  const durationMs=performance.now()-at,usage=process.cpuUsage(cpu);
  const report=await service.command('report');await downloadsTask;driverLag.disable();
  const active=clients.filter(c=>c.snapshot?.room.phase==='racing'&&c.snapshot.you.game.phase==='running').length;
  const result={snapshotVersion,rooms,racers:rooms*4,burst,downloads,explore,arrivalMs,durationMs,limits:service.limits,activeRacersAtEnd:active,
   metrics:Object.fromEntries(Object.entries(metrics).map(([key,value])=>[key,value instanceof Samples?value.summary():value])),
   perClientSnapshotsPerSecond:metrics.snapshots/clients.length/(durationMs/1000),outboundBytesPerSecond:metrics.bytes/(durationMs/1000),
   http:{...http,visitorMs:http.visitorMs.summary()},
   server:{cpuOneCorePct:stats(report.samples.map(s=>s.cpuOneCorePct)),rssMB:stats(report.samples.map(s=>s.rssMB)),heapMB:stats(report.samples.map(s=>s.heapMB)),simulationBacklogMs:stats(report.samples.map(s=>s.backlogMs)),eventLoopMs:report.eventLoopMs},
   driver:{cpuOneCorePct:(usage.user+usage.system)/(durationMs*1000)*100,eventLoopP95Ms:driverLag.percentile(95)/1e6},
  };
  console.log(`  updates ${result.perClientSnapshotsPerSecond.toFixed(1)}/s/client; p95 gap ${result.metrics.gaps.p95?.toFixed(1)}ms; lane confirmation ${result.metrics.laneConfirmation.p95?.toFixed(1)}ms; server CPU p95 ${result.server.cpuOneCorePct.p95?.toFixed(1)}%; disconnects ${metrics.unexpectedCloses}`);
  return result;
 }finally{
  clearInterval(drive);clearInterval(pings);driverLag.disable();for(const c of clients)c.close();
  if(downloadsTask)await downloadsTask.catch(()=>{});await service.close();
 }
}
async function limits(){
 const service=await server(),metrics=measurements(),clients=[];
 try{
  await populate(service.origin,25,{metrics,clients});
  const extra=client(service.origin,metrics);clients.push(extra);await extra.wait(m=>m.type==='connected');extra.send({type:'create'});
  const roomError=await extra.wait(m=>m.type==='error');
  while(clients.length<128){const c=client(service.origin,metrics);clients.push(c);await c.wait(m=>m.type==='connected');}
  const rejected=client(service.origin,metrics);clients.push(rejected);let connectionError;
  try{await rejected.wait(m=>m.type==='connected');connectionError='Unexpected admission';}catch(error){connectionError=error.message;}
  if(roomError.code!=='SERVER_FULL'||!connectionError.includes('503'))throw new Error('Configured capacity guard did not reject correctly.');
  for(const c of clients)c.close();await sleep(200);
  const report=await service.command('report');
  if(report.remainingRooms!==0)throw new Error('Disconnected load clients left rooms behind.');
  console.log('Capacity guards: lobby 26 rejected; socket 129 rejected; test rooms cleaned up.');
  return {room26:roomError.code,socket129:connectionError,remainingRooms:report.remainingRooms};
 }finally{for(const c of clients)c.close();await service.close();}
}
export function parseOptions(args){
 const options={seconds:20,profile:'baseline'};
 for(const arg of args){
  if(arg.startsWith('--seconds='))options.seconds=Number(arg.split('=')[1]);
  else if(arg.startsWith('--profile='))options.profile=arg.split('=')[1];
  else throw new Error('Use --profile=smoke|baseline|explore|soak|compare and --seconds=5..120. No remote targets accepted.');
 }
 if(!['smoke','baseline','explore','soak','compare'].includes(options.profile)||!Number.isInteger(options.seconds)||options.seconds<5||options.seconds>120)throw new Error('Invalid bounded capacity-test options.');
 return options;
}
export async function run(options){
 const scenarios=options.profile==='compare'?[{rooms:25,snapshotVersion:1},{rooms:25,snapshotVersion:2}]:options.profile==='smoke'?[{rooms:1}]:options.profile==='explore'?[{rooms:50,explore:true},{rooms:100,explore:true}]:options.profile==='soak'?[{rooms:25}]:[{rooms:1},{rooms:5},{rooms:15},{rooms:25},{rooms:25,burst:true},{rooms:25,downloads:20}];
 const result={at:new Date().toISOString(),commit:process.env.PERF_COMMIT||null,options,host:{cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryGB:totalmem()/1e9,platform:platform(),arch:arch(),node:process.version},limitations:['Loopback only; not Render capacity, geographic latency, browser rendering or phone loading.','Driver and isolated server share this computer; driver pressure is measured separately.','Protocol ping RTT and lane confirmation do not include rendered-frame delay.','Cold downloads consume real bodies but have no WAN bandwidth shaping or browser decoding.'],scenarios:[]};
 for(const spec of scenarios)result.scenarios.push(await scenario({...spec,seconds:options.seconds}));
 if(options.profile==='baseline'||options.profile==='smoke')result.limits=await limits();
 const directory=new URL('../artifacts/performance/',import.meta.url);await mkdir(directory,{recursive:true});
 const path=new URL(`capacity-${options.profile}-${Date.now()}.json`,directory);await writeFile(path,JSON.stringify(result,null,2)+'\n');console.log(`Results: ${fileURLToPath(path)}`);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{await run(parseOptions(process.argv.slice(2)));}catch(error){console.error(error);process.exitCode=1;}
}
