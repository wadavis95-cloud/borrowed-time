import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {createGameServer} from '../../src/server/app.js';
const explore=process.env.PERF_EXPLORE==='1';
const app=createGameServer(explore?{maxConnections:1024,roomOptions:{maxRooms:256}}:{});
const lag=monitorEventLoopDelay({resolution:10});lag.enable();
let samples=[],cpu=process.cpuUsage(),at=performance.now();
let timer;
function sample(){
 const now=performance.now(),usage=process.cpuUsage(cpu),memory=process.memoryUsage();
 const rooms=[...app.rooms.rooms.values()];
 const backlog=Math.max(0,...rooms.filter(r=>r.phase==='racing').map(r=>Date.now()-r.lastStepAt));
 samples.push({cpuOneCorePct:(usage.user+usage.system)/((now-at)*1000)*100,rssMB:memory.rss/1e6,heapMB:memory.heapUsed/1e6,backlogMs:backlog,rooms:rooms.length,racingRooms:rooms.filter(r=>r.phase==='racing').length});
 if(samples.length>1200)samples.shift();cpu=process.cpuUsage();at=now;
}
async function close(){clearInterval(timer);lag.disable();await app.close();process.disconnect?.();}
process.on('message',async message=>{
 if(message.type==='reset'){samples=[];lag.reset();cpu=process.cpuUsage();at=performance.now();process.send({type:'reset'});}
 if(message.type==='report'){sample();process.send({type:'report',samples,eventLoopMs:{p95:lag.percentile(95)/1e6,p99:lag.percentile(99)/1e6,max:lag.max/1e6},remainingRooms:app.rooms.rooms.size});}
 if(message.type==='close')await close();
});
app.server.on('error',error=>{process.send?.({type:'fatal',message:error.message});process.exitCode=1;void close();});
process.on('disconnect',()=>{if(app.server.listening)void close();});
process.on('SIGTERM',()=>void close());
app.server.listen(0,'127.0.0.1',()=>{timer=setInterval(sample,500);process.send({type:'ready',origin:`http://127.0.0.1:${app.server.address().port}`,limits:{rooms:explore?256:25,sockets:explore?1024:128}});});
