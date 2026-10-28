import {timingSafeEqual} from 'node:crypto';
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
export const BINS=Object.freeze({frame:[8.4,16.8,25,33.4,50,100,250,1000],gap:[20,40,50,60,100,200,500,10000],rtt:[10,25,50,100,200,500,1000,10000],input:[10,25,50,100,150,250,500,5000],load:[500,1000,2000,5000,10000,20000,45000,120000],mapFirst:[50,100,200,500,1000,2000,5000,45000],mapRepeat:[50,100,200,500,1000,2000,5000,45000]});
const META_KEYS=['map','inputMode','mode','device'];
const CLIENT_KEYS=new Set([...META_KEYS,'frame','gap','rtt','input','load','mapFirst','mapRepeat','longTasks','errors','graphicsErrors','contextLosses','disconnects','slowFrames','frames']);
const COUNTERS=['connections','connectionRejects','roomRejects','disconnects','slowClients','invalidMessages','rateLimits','messagesIn','bytesIn','messagesOut','bytesOut','snapshots','httpRequests','httpErrors','http4xx','http5xx','monitorBytes','telemetryBytesIn','assetBytes','pageBytes','otherBytes','httpAborts','telemetryAccepted','telemetryRejected'];
export function validReport(report){
 if(!report||typeof report!=='object'||Array.isArray(report))return false;
 for(const [key,value]of Object.entries(report)){
  if(!CLIENT_KEYS.has(key))return false;
  if(META_KEYS.includes(key)){const allowed=key==='map'?['tunnel','pirate','jungle','frozen','orbital','desert']:key==='inputMode'?['touch','keyboard','unknown']:key==='device'?['mobile','desktop','unknown']:['solo','online','demo'];if(!allowed.includes(value))return false;continue;}
  if(BINS[key]){if(!Array.isArray(value)||value.length!==8||!value.every(v=>Number.isInteger(v)&&v>=0&&v<=100000))return false;}
  else if(!Number.isInteger(value)||value<0||value>100000)return false;
 }
 return Object.keys(report).length>0;
}
function quantile(hist,p=.95){const count=hist.reduce((a,b)=>a+b,0);if(!count)return null;let total=0;for(let i=0;i<hist.length;i++){total+=hist[i];if(total>=Math.ceil(count*p))return i;}return hist.length-1;}
export function createMonitoring({token='',state=()=>({}),now=Date.now,autoStart=true}={}){
 const enabled=typeof token==='string'&&token.length>=32;
 const started=now(),totals=Object.fromEntries(COUNTERS.map(k=>[k,0])),history=[],reports=[];
 const httpLatency=[];let previous={...totals},last=now(),cpu=process.cpuUsage(),cpuAt=performance.now(),timer,lag;
 let rateStart=now(),ingressCount=0,adminCount=0;
 if(enabled){lag=monitorEventLoopDelay({resolution:10});lag.enable();if(autoStart){timer=setInterval(sample,1000);timer.unref();}}
 function count(name,value=1){if(enabled&&Object.hasOwn(totals,name)&&Number.isFinite(value))totals[name]+=value;}
 function sample(){
  const time=now(),elapsed=Math.max(1,time-last)/1000,at=performance.now(),usage=process.cpuUsage(cpu),memory=process.memoryUsage();
  const point={at:time,intervalSeconds:elapsed,...state(),cpuPct:(usage.user+usage.system)/Math.max(1,(at-cpuAt)*1000)*100,rssMB:memory.rss/1e6,heapMB:memory.heapUsed/1e6,eventLoopP95Ms:lag?lag.percentile(95)/1e6:0,eventLoopMaxMs:lag?lag.max/1e6:0};
  for(const key of ['bytesOut','bytesIn','monitorBytes','assetBytes','pageBytes','otherBytes','snapshots','httpRequests','httpErrors','connectionRejects','roomRejects','disconnects','slowClients'])point[key+'PerSec']=(totals[key]-previous[key])/elapsed;
  point.httpP95Ms=httpLatency.length?[...httpLatency].sort((a,b)=>a-b)[Math.ceil(httpLatency.length*.95)-1]:null;
  httpLatency.length=0;history.push(point);if(history.length>180)history.shift();
  previous={...totals};last=time;cpu=process.cpuUsage();cpuAt=at;lag?.reset();return point;
 }
 function prune(){while(reports.length&&reports[0].at<now()-120000)reports.shift();}
 function snapshot(){
  prune();const client={reports:reports.length,windowSeconds:120};
  for(const [key,bins]of Object.entries(BINS)){
   const values=Array(8).fill(0);for(const r of reports)r.report[key]?.forEach((v,i)=>values[i]+=v);
   const index=quantile(values);client[key]={count:values.reduce((a,b)=>a+b,0),p95UpperMs:index===null||index===bins.length-1?null:bins[index],p95OverMs:index===bins.length-1?bins[index-1]:null};
  }
  for(const key of [...CLIENT_KEYS].filter(k=>!BINS[k]&&!META_KEYS.includes(k)))client[key]=reports.reduce((sum,r)=>sum+(r.report[key]||0),0);
  function summary(selected,key){const hist=Array(8).fill(0);for(const r of selected)r.report[key]?.forEach((v,i)=>hist[i]+=v);const index=quantile(hist);return {count:hist.reduce((a,b)=>a+b,0),p95UpperMs:index===null||index===7?null:BINS[key][index],p95OverMs:index===7?BINS[key][6]:null};}
  const group=field=>[...new Set(reports.map(r=>r.report[field]).filter(Boolean))].map(value=>{
   const selected=reports.filter(r=>r.report[field]===value),frame=summary(selected,'frame');
   return {name:value,reports:selected.length,frames:frame.count,frameP95UpperMs:frame.p95UpperMs,frameP95OverMs:frame.p95OverMs,load:summary(selected,'load'),mapFirst:summary(selected,'mapFirst'),mapRepeat:summary(selected,'mapRepeat')};
  });
  client.byMap=group('map');client.byInput=group('inputMode');client.byMode=group('mode');client.byDevice=group('device');
  return {enabled,startedAt:started,uptimeSeconds:(now()-started)/1000,totals:{...totals},current:history.at(-1)||null,history:[...history],client,notes:['Application JSON and declared completed HTTP body bytes; excludes TLS/WS/HTTP headers, aborted partial bodies and provider accounting.','Browser metrics are untrusted aggregate samples from the last two minutes, not unique people. Histogram p95 values are bucket upper bounds; the last bucket includes overflow.','History and totals reset on process restart. No persistence, external alerts, billing integration or cold-start measurement.']};
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
  if(!origin||!['http:','https:'].includes(origin.protocol)||origin.host!==req.headers.host){count('telemetryRejected');response(res,403);return true;}
  if(++ingressCount>600){count('telemetryRejected');response(res,429);return true;}
  if(!String(req.headers['content-type']||'').startsWith('application/json')||Number(req.headers['content-length'])>2048){count('telemetryRejected');response(res,413);req.resume();return true;}
  let bytes=0,parts=[],done=false;
  req.on('data',part=>{if(done)return;bytes+=part.length;if(bytes>2048){done=true;parts=[];count('telemetryRejected');response(res,413);}else parts.push(part);});
  req.on('end',()=>{
   if(done)return;done=true;let report;try{report=JSON.parse(Buffer.concat(parts).toString());}catch{}
   if(!validReport(report)){count('telemetryRejected');response(res,400);return;}
   count('telemetryBytesIn',bytes);prune();reports.push({at:now(),report});if(reports.length>1200)reports.shift();count('telemetryAccepted');response(res,204);
  });
  req.on('error',()=>{if(!done){done=true;count('telemetryRejected');if(!res.destroyed)response(res,400);}});
  return true;
 }
 function http(req,res){
  if(!enabled)return;let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{return;}
  if(path.startsWith('/ops/'))return;const admin=path.startsWith('/monitor');
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
