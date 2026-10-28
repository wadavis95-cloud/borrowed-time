// Observe an existing browser run; does not start clients or load-test any host.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const [label,rawSeconds='30']=process.argv.slice(2),seconds=Number(rawSeconds);
if(!['before','after'].includes(label)||!Number.isInteger(seconds)||seconds<5||seconds>60)throw new Error('Use before|after and 5..60 seconds. Localhost only.');
const key=(await readFile(new URL('../.local/monitor-key.txt',import.meta.url),'utf8')).trim();
const samples=[];
for(let elapsed=0;;){
 const response=await fetch('http://localhost:4173/ops/metrics',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error(`Metrics HTTP ${response.status}`);
 const data=await response.json();samples.push({at:Date.now(),startedAt:data.startedAt,current:data.current,totals:data.totals,client:data.client});
 if(elapsed>=seconds)break;
 const step=Math.min(2,seconds-elapsed);await new Promise(r=>setTimeout(r,step*1000));elapsed+=step;
}
if(samples.some(s=>s.startedAt!==samples[0].startedAt))throw new Error('Server restarted during comparison; repeat this window.');
const start=samples[0],end=samples.at(-1),duration=(end.at-start.at)/1000;
const report={label,durationSeconds:duration,samples,summary:{sockets:[...new Set(samples.map(s=>s.current?.sockets))],rooms:[...new Set(samples.map(s=>s.current?.rooms))],raceJSONBytes:end.totals.bytesOut-start.totals.bytesOut,raceJSONBytesPerSecond:(end.totals.bytesOut-start.totals.bytesOut)/duration,serverCPUAverage:samples.reduce((sum,s)=>sum+(s.current?.cpuPct||0),0)/samples.length,clientAtStart:start.client,clientAtEnd:end.client}};
await mkdir(new URL('../artifacts/performance/',import.meta.url),{recursive:true});
const path=new URL(`../artifacts/performance/demo-${label}-${Date.now()}.json`,import.meta.url);await writeFile(path,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({path:fileURLToPath(path),...report.summary},null,2));
