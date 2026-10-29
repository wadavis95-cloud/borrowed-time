import {validCatchupTrace,CATCHUP_TRACE_LIMIT} from '../catchup-trace.js';
import {timingSafeEqual} from 'node:crypto';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {METRIC_BINS as BINS,PEAK_METRICS,SPIKE_THRESHOLDS,CONTROL_METRICS,CLIENT_COUNTERS,CLIENT_PHASES,RACE_WINDOWS,STARTUP_METRICS,SHADER_METRICS} from '../metric-schema.js';
export {BINS};
const RETENTION_MS=30*60*1000,MAX_HISTORY=1800,MAX_REPORTS=6000;
const META_KEYS=['map','inputMode','mode','device','phase','raceWindow'];
const CLIENT_KEYS=new Set(['catchupTraces',...META_KEYS,...Object.keys(BINS),'peaks',...CLIENT_COUNTERS]);
const COUNTERS=['connections','connectionRejects','roomRejects','disconnects','slowClients','invalidMessages','rateLimits','messagesIn','bytesIn','messagesOut','bytesOut','snapshots','httpRequests','httpErrors','http4xx','http5xx','monitorBytes','telemetryBytesIn','assetBytes','pageBytes','otherBytes','httpAborts','telemetryAccepted','telemetryRejected'];
export function validReport(report){
 if(!report||typeof report!=='object'||Array.isArray(report))return false;
 for(const [key,value]of Object.entries(report)){
  if(!CLIENT_KEYS.has(key))return false;
  if(key==='catchupTraces'){if(!Array.isArray(value)||value.length>CATCHUP_TRACE_LIMIT||!value.every(validCatchupTrace))return false;continue;}
  if(key==='peaks'){
   if(!value||typeof value!=='object'||Array.isArray(value))return false;
   for(const [metric,peak]of Object.entries(value)){
    if(!PEAK_METRICS.includes(metric)||!peak||typeof peak!=='object'||Array.isArray(peak)||Object.keys(peak).length!==2||!Object.hasOwn(peak,'ms')||!Object.hasOwn(peak,'at')||!Number.isFinite(peak.ms)||peak.ms<0||peak.ms>1e9||!Number.isSafeInteger(peak.at)||peak.at<0)return false;
   }
   continue;
  }
  if(META_KEYS.includes(key)){const allowed=key==='map'?['tunnel','pirate','jungle','frozen','orbital','desert']:key==='inputMode'?['touch','keyboard','unknown']:key==='device'?['mobile','desktop','unknown']:key==='phase'?CLIENT_PHASES:key==='raceWindow'?RACE_WINDOWS:['solo','online','demo'];if(!allowed.includes(value))return false;continue;}
  if(BINS[key]){if(!Array.isArray(value)||value.length!==8||!value.every(v=>Number.isInteger(v)&&v>=0&&v<=100000))return false;}
  else if(!Number.isInteger(value)||value<0||value>100000)return false;
 }
 return Object.keys(report).length>0;
}
function quantile(hist,p=.95){const count=hist.reduce((a,b)=>a+b,0);if(!count)return null;let total=0;for(let i=0;i<hist.length;i++){total+=hist[i];if(total>=Math.ceil(count*p))return i;}return hist.length-1;}
export function createMonitoring({token='',state=()=>({}),now=Date.now,autoStart=true,allowedOrigins=[]}={}){
 const enabled=typeof token==='string'&&token.length>=32;
 const started=now(),totals=Object.fromEntries(COUNTERS.map(k=>[k,0])),history=[],reports=[];
 const httpLatency=[];let previous={...totals},last=now(),cpu=process.cpuUsage(),cpuAt=performance.now(),timer,lag,lastCapAt=null;
 let rateStart=now(),ingressCount=0,adminCount=0;
 if(enabled){lag=monitorEventLoopDelay({resolution:10});lag.enable();if(autoStart){timer=setInterval(sample,1000);timer.unref();}}
 function count(name,value=1){if(enabled&&Object.hasOwn(totals,name)&&Number.isFinite(value))totals[name]+=value;}
 function sample(){
  const time=now(),elapsed=Math.max(1,time-last)/1000,at=performance.now(),usage=process.cpuUsage(cpu),memory=process.memoryUsage();
  const point={at:time,intervalSeconds:elapsed,...state(),cpuPct:(usage.user+usage.system)/Math.max(1,(at-cpuAt)*1000)*100,rssMB:memory.rss/1e6,heapMB:memory.heapUsed/1e6,eventLoopP95Ms:lag?lag.percentile(95)/1e6:0,eventLoopMaxMs:lag?lag.max/1e6:0};
  for(const key of ['bytesOut','bytesIn','monitorBytes','assetBytes','pageBytes','otherBytes','snapshots','httpRequests','httpErrors','connectionRejects','roomRejects','disconnects','slowClients'])point[key+'PerSec']=(totals[key]-previous[key])/elapsed;
  point.httpP95Ms=httpLatency.length?[...httpLatency].sort((a,b)=>a-b)[Math.ceil(httpLatency.length*.95)-1]:null;
  httpLatency.length=0;history.push(point);while(history.length>MAX_HISTORY||history.length&&history[0].at<time-RETENTION_MS)history.shift();
  previous={...totals};last=time;cpu=process.cpuUsage();cpuAt=at;lag?.reset();return point;
 }
 function prune(){while(reports.length&&reports[0].at<now()-RETENTION_MS)reports.shift();}
 // Preserve the latest minute at one-second detail for rates/pressure. Older
 // charts use ten-sample buckets: rate averages and peak CPU/memory/delay.
 function chartHistory(){
  const cutoff=now()-60000,older=history.filter(p=>p.at<cutoff),recent=history.filter(p=>p.at>=cutoff),result=[];
  for(let i=0;i<older.length;i+=10){
   const bucket=older.slice(i,i+10),last=bucket.at(-1),duration=bucket.reduce((n,p)=>n+p.intervalSeconds,0),point={...last,intervalSeconds:duration};
   for(const key of Object.keys(last).filter(k=>k.endsWith('PerSec')))point[key]=bucket.reduce((n,p)=>n+(p[key]||0)*p.intervalSeconds,0)/duration;
   for(const key of ['cpuPct','rssMB','heapMB','eventLoopP95Ms','eventLoopMaxMs','simulationBacklogMs','bufferedBytes','httpP95Ms','updateScheduleLagMs','updateBroadcastWorkMs']){
    const values=bucket.map(p=>p[key]).filter(v=>typeof v==='number');point[key]=values.length?Math.max(...values):null;
   }
   result.push(point);
  }
  return [...result,...recent];
 }
 function snapshot(){
  prune();const client={reports:reports.length,windowSeconds:RETENTION_MS/1000,retainedReportLimit:MAX_REPORTS,reportLimitReached:lastCapAt!==null&&lastCapAt>=now()-RETENTION_MS};
  function summary(selected,key){
   const hist=Array(8).fill(0);let peak=null,peakReports=0;
   for(const r of selected){r.report[key]?.forEach((v,i)=>hist[i]+=v);const p=r.report.peaks?.[key];if(p){peakReports++;if(!peak||p.ms>peak.ms)peak=p;}}
   const bound=p=>{const i=quantile(hist,p);return {upper:i===null||i===7?null:BINS[key][i],over:i===7?BINS[key][6]:null};};
   const p95=bound(.95),p99=bound(.99),threshold=SPIKE_THRESHOLDS[key];
   const thresholdIndex=threshold===undefined?-1:BINS[key].indexOf(threshold);
   return {count:hist.reduce((a,b)=>a+b,0),p95UpperMs:p95.upper,p95OverMs:p95.over,p99UpperMs:p99.upper,p99OverMs:p99.over,
    maxMs:peak?.ms??null,maxAt:peak?.at??null,peakReports,overThreshold:thresholdIndex<0?null:hist.slice(thresholdIndex+1).reduce((a,b)=>a+b,0)};
  }
  for(const key of Object.keys(BINS))client[key]=summary(reports,key);
  for(const key of [...CLIENT_KEYS].filter(k=>k!=='peaks'&&k!=='catchupTraces'&&!BINS[k]&&!META_KEYS.includes(k)))client[key]=reports.reduce((sum,r)=>sum+(r.report[key]||0),0);
  client.catchupTraces=[];
  for(let i=reports.length-1;i>=0&&client.catchupTraces.length<24;i--){
   const r=reports[i];for(const event of [...(r.report.catchupTraces||[])].reverse()){
    if(client.catchupTraces.length>=24)break;
    client.catchupTraces.push({...event,receivedAt:r.at,map:r.report.map??'unknown',device:r.report.device??'unknown',phase:r.report.phase??'unknown',raceWindow:r.report.raceWindow??'unknown'});
   }
  }
  client.recentSpikes=[];
  for(let i=reports.length-1;i>=0&&client.recentSpikes.length<24;i--){
   const r=reports[i];
   for(const [metric,threshold]of Object.entries(SPIKE_THRESHOLDS)){
    const peak=r.report.peaks?.[metric];if(peak&&peak.ms>threshold&&client.recentSpikes.length<24)client.recentSpikes.push({metric,ms:peak.ms,at:peak.at,receivedAt:r.at,map:r.report.map??'unknown',device:r.report.device??'unknown',mode:r.report.mode??'unknown',phase:r.report.phase??'unknown',raceWindow:r.report.raceWindow??'unknown'});
   }
  }
  const group=(field,key=r=>r.report[field]??(['phase','raceWindow','deviceWindow'].includes(field)?'unknown':null))=>[...new Set(reports.map(key).filter(Boolean))].map(value=>{
   const selected=reports.filter(r=>key(r)===value),frame=summary(selected,'frame');
   return {name:value,reports:selected.length,frames:frame.count,frameP95UpperMs:frame.p95UpperMs,frameP95OverMs:frame.p95OverMs,load:summary(selected,'load'),mapFirst:summary(selected,'mapFirst'),mapRepeat:summary(selected,'mapRepeat'),gap:summary(selected,'gap'),rtt:summary(selected,'rtt'),input:summary(selected,'input'),bufferHold:summary(selected,'bufferHold'),bufferDelay:summary(selected,'bufferDelay'),scheduleLag:summary(selected,'scheduleLag'),sendGap:summary(selected,'sendGap'),arrivalExcess:summary(selected,'arrivalExcess'),...Object.fromEntries([...CONTROL_METRICS,...STARTUP_METRICS,...SHADER_METRICS].map(key=>[key,summary(selected,key)])),...Object.fromEntries(CLIENT_COUNTERS.filter(key=>key.startsWith('control')||key.startsWith('lane')||(key.startsWith('shader')||key.startsWith('renderObject'))||key==='telemetryDropped').map(key=>[key,selected.reduce((sum,r)=>sum+(r.report[key]||0),0)]))};
  });
  client.byMap=group('map');client.byInput=group('inputMode');client.byMode=group('mode');client.byDevice=group('device');client.byPhase=group('phase');client.byRaceWindow=group('raceWindow');client.byDeviceWindow=group('deviceWindow',r=>`${r.report.device??'unknown'} / ${r.report.raceWindow??'unknown'}`);
  return {enabled,startedAt:started,uptimeSeconds:(now()-started)/1000,totals:{...totals},current:history.at(-1)||null,history:chartHistory(),serverSpikes:history.filter(p=>p.eventLoopMaxMs>50||p.simulationBacklogMs>100).slice(-24).map(({at,eventLoopMaxMs,simulationBacklogMs,cpuPct})=>({at,eventLoopMaxMs,simulationBacklogMs,cpuPct})),client,notes:['Application JSON and declared completed HTTP body bytes; excludes TLS/WS/HTTP headers, aborted partial bodies and provider accounting.','Browser metrics are untrusted aggregate samples from up to the last thirty minutes (report-count cap can shorten coverage), not unique people. Histogram p95 values are bucket upper bounds; the last bucket includes overflow.','History and totals reset on process restart. No persistence, external alerts, billing integration or cold-start measurement.']};
 }
 function response(res,status,body){const text=body===undefined?'':JSON.stringify(body);count('monitorBytes',Buffer.byteLength(text));res.writeHead(status,{'Content-Length':Buffer.byteLength(text),'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(text);}
 function handle(req,res){
  let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{return false;}
  if(!['/ops/config','/ops/metrics','/ops/client'].includes(path))return false;
  if(path==='/ops/config'){if(req.method!=='GET')response(res,405);else response(res,200,{enabled});return true;}
  if(!enabled){response(res,503,{error:'Monitoring is disabled.'});return true;}
  if(now()-rateStart>=60000){rateStart=now();ingressCount=0;adminCount=0;}
  if(path==='/ops/metrics'){
   if(req.method!=='GET'){response(res,405);return true;}
   const supplied=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from('Bearer '+token);
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){response(res,401,{error:'A valid monitoring key is required.'});return true;}
   if(++adminCount>120){response(res,429,{error:'Polling limit reached.'});return true;}
   response(res,200,snapshot());return true;
  }
  if(req.method!=='POST'){response(res,405);return true;}
  let origin;try{origin=new URL(req.headers.origin);}catch{}
  if(!origin||!['http:','https:'].includes(origin.protocol)||(origin.host!==req.headers.host&&!allowedOrigins.includes(origin.origin))){count('telemetryRejected');response(res,403);return true;}
  if(++ingressCount>600){count('telemetryRejected');response(res,429);return true;}
  if(!String(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length'])>2048){count('telemetryRejected');response(res,413);req.resume();return true;}
  let bytes=0,parts=[],done=false;
  req.on('data',part=>{if(done)return;bytes+=part.length;if(bytes>2048){done=true;parts=[];count('telemetryRejected');response(res,413);}else parts.push(part);});
  req.on('end',()=>{
   if(done)return;done=true;let report;try{report=JSON.parse(Buffer.concat(parts).toString());}catch{}
   if(!validReport(report)){count('telemetryRejected');response(res,400);return;}
   count('telemetryBytesIn',bytes);prune();reports.push({at:now(),report});if(reports.length>MAX_REPORTS){reports.shift();lastCapAt=now();}count('telemetryAccepted');response(res,204);
  });
  req.on('error',()=>{if(!done){done=true;count('telemetryRejected');if(!res.destroyed)response(res,400);}});
  return true;
 }
 function http(req,res){
  if(!enabled)return;let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{return;}
  if(path.startsWith('/ops/'))return;const admin=path.startsWith('/monitor')||/^\/client\/dashboard(?:-style)?-[A-Z0-9]{8}\.(?:js|css)$/.test(path);
  const at=performance.now();let finished=false,declaredBytes=0;
  const writeHead=res.writeHead;
  res.writeHead=function(...args){const headers=args.find((arg,index)=>index>0&&arg&&typeof arg==='object'&&!Array.isArray(arg));if(headers)declaredBytes=Number(headers['Content-Length']??headers['content-length'])||0;return writeHead.apply(this,args);};
  res.once('finish',()=>{finished=true;if(!admin){count('httpRequests');if(res.statusCode>=400)count('httpErrors');if(res.statusCode>=400&&res.statusCode<500)count('http4xx');if(res.statusCode>=500)count('http5xx');}
   if(!admin&&httpLatency.length<10000)httpLatency.push(performance.now()-at);
   if(req.method!=='HEAD'&&res.statusCode===200){const bytes=Number(res.getHeader('Content-Length'))||declaredBytes;count(admin?'monitorBytes':path.startsWith('/assets/')?'assetBytes':path==='/'||path.endsWith('.html')?'pageBytes':'otherBytes',bytes);}
  });
  res.once('close',()=>{if(!finished)count('httpAborts');});
 }
 return {enabled,count,sample,snapshot,handle,http,dispose(){clearInterval(timer);lag?.disable();}};
}
