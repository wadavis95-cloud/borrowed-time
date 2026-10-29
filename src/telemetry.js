import {raceEndpoint} from './endpoints.js';
// Fixed aggregate diagnostics only. No player IDs, names, URLs or error text leave the browser.
import {METRIC_BINS,PEAK_METRICS,CLIENT_COUNTERS} from './metric-schema.js';
export {METRIC_BINS} from './metric-schema.js';
export function makeReport(){return {...Object.fromEntries(Object.keys(METRIC_BINS).map(key=>[key,Array(8).fill(0)])),peaks:{},...Object.fromEntries(CLIENT_COUNTERS.map(key=>[key,0]))};}
export function addObservation(report,key,ms,at=Date.now()){
 if(!Number.isFinite(ms)||ms<0||ms>1e9)return;const bins=METRIC_BINS[key];if(!bins)return;
 let index=bins.findIndex(upper=>ms<=upper);if(index<0)index=bins.length-1;report[key][index]++;
 if(PEAK_METRICS.includes(key)&&Number.isFinite(at)&&at>=0&&(!report.peaks?.[key]||ms>report.peaks[key].ms)){
  report.peaks??={};report.peaks[key]={ms,at:Math.round(at/100)*100};
 }
}
const REPORT_BYTES=2048,MAX_QUEUED_REPORTS=4,META_KEYS=['map','inputMode','mode','device','phase'];
const hasSamples=report=>Object.keys(METRIC_BINS).some(key=>report[key]?.some(value=>value>0))||CLIENT_COUNTERS.some(key=>report[key]>0)||Object.keys(report.peaks||{}).length>0;
// Return complete JSON request bodies. Histograms travel with their peak, and
// counters occur in exactly one part so a split cannot inflate the totals.
export function encodeTelemetryReports(report){
 if(!hasSamples(report))return [];
 const meta=Object.fromEntries(META_KEYS.filter(key=>report[key]!==undefined).map(key=>[key,report[key]]));
 const entries=[];
 for(const key of Object.keys(METRIC_BINS))if(report[key]?.some(value=>value>0)||report.peaks?.[key])entries.push({[key]:report[key]??Array(8).fill(0),...(report.peaks?.[key]?{peaks:{[key]:report.peaks[key]}}:{})});
 for(const key of CLIENT_COUNTERS)if(report[key]>0)entries.push({[key]:report[key]});
 const merge=(a,b)=>({...a,...b,...(a.peaks||b.peaks?{peaks:{...a.peaks,...b.peaks}}:{})});
 const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
 const encoded=[];let part={...meta},hasData=false;
 for(const entry of entries){
  const candidate=merge(part,entry);
  if(bytes(candidate)>REPORT_BYTES){
   if(hasData)encoded.push(JSON.stringify(part));
   part=merge(meta,entry);hasData=true;
   if(bytes(part)>REPORT_BYTES)throw new RangeError('A telemetry metric exceeds the fixed report limit.');
  }else {part=candidate;hasData=true;}
 }
 if(hasData)encoded.push(JSON.stringify(part));return encoded;
}
// Coarse estimate only; raw device strings are never stored or transmitted.
export function detectDevice(nav=globalThis.navigator){
 if(!nav)return 'unknown';
 if(/Android|iPhone|iPad|iPod/i.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1))return 'mobile';
 if(typeof nav.userAgentData?.mobile==='boolean')return nav.userAgentData.mobile?'mobile':'desktop';
 return /Windows|Macintosh|Linux|CrOS/i.test(nav.userAgent||'')?'desktop':'unknown';
}
export function createTelemetry({request=globalThis.fetch,visible=()=>true,device=detectDevice(),now=Date.now}={}){
 let context={map:'tunnel',inputMode:'unknown',mode:'solo',device,phase:'unknown'},report=makeReport(),enabled=false,loaded=false,sending=null;
 const queue=[];
 const dropped=body=>{
  // Keep an undelivered loss count until a later normal report can carry it.
  const priorLosses=JSON.parse(body).telemetryDropped||0;
  report.telemetryDropped=Math.min(100000,report.telemetryDropped+1+priorLosses);
 };
 function capture(){
  if(!enabled||!hasSamples(report))return;
  const current={...report,...context};report=makeReport();
  for(const body of encodeTelemetryReports(current)){
   if(queue.length+(sending?1:0)>=MAX_QUEUED_REPORTS)dropped(body);else queue.push(body);
  }
 }
 function drain(){
  if(sending)return sending;
  if(!queue.length)return Promise.resolve();
  sending=(async()=>{
   while(queue.length){
    const body=queue.shift();
    // Lost reports are counted for the next normal flush, never retried.
    try{const result=await request(globalThis.location?raceEndpoint('/ops/client'):'/ops/client',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,signal:AbortSignal.timeout(5000)});if(!result?.ok)dropped(body);}catch{dropped(body);}
   }
  })().finally(()=>{sending=null;});return sending;
 }
 return {
  async init(){try{const r=await request(globalThis.location?raceEndpoint('/ops/config'):'/ops/config',{cache:'no-store',signal:AbortSignal.timeout(5000)});enabled=r.ok&&(await r.json()).enabled===true;}catch{}return enabled;},
  get enabled(){return enabled;},
  context(map,inputMode,mode,phase='unknown'){
   if(context.map!==map||context.inputMode!==inputMode||context.mode!==mode||context.phase!==phase){
    // Capture under the old context before switching, including during a send.
    capture();context={map,inputMode,mode,device,phase};void drain();
   }
  },
  observe(key,ms){if(enabled&&visible())addObservation(report,key,ms,now());},
  frame(ms){if(enabled&&visible()){addObservation(report,'frame',ms,now());report.frames++;if(ms>50)report.slowFrames++;}},
  count(key){if(enabled&&Object.hasOwn(report,key)&&typeof report[key]==='number')report[key]++;},
  ready(ms){if(!enabled||loaded)return;loaded=true;addObservation(report,'load',ms);void this.flush();},
  async flush(){if(!enabled)return;capture();await drain();},
 };
}
const browser=typeof window!=='undefined'&&typeof document!=='undefined';
export const telemetry=createTelemetry({visible:()=>browser&&!document.hidden});
if(browser){
 void telemetry.init();
 setInterval(()=>{if(!document.hidden)void telemetry.flush();},30000);
 window.addEventListener('error',()=>telemetry.count('errors'));
 window.addEventListener('unhandledrejection',()=>telemetry.count('errors'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void telemetry.flush();});
 try{const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.duration>=50)telemetry.count('longTasks');});observer.observe({type:'longtask',buffered:true});}catch{}
}
