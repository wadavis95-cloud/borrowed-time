// Fixed aggregate diagnostics only. No player IDs, names, URLs or error text leave the browser.
export const METRIC_BINS={frame:[8.4,16.8,25,33.4,50,100,250,1000],gap:[20,40,50,60,100,200,500,10000],rtt:[10,25,50,100,200,500,1000,10000],input:[10,25,50,100,150,250,500,5000],load:[500,1000,2000,5000,10000,20000,45000,120000],mapFirst:[50,100,200,500,1000,2000,5000,45000],mapRepeat:[50,100,200,500,1000,2000,5000,45000]};
export function makeReport(){return {frame:Array(8).fill(0),gap:Array(8).fill(0),rtt:Array(8).fill(0),input:Array(8).fill(0),load:Array(8).fill(0),mapFirst:Array(8).fill(0),mapRepeat:Array(8).fill(0),longTasks:0,errors:0,graphicsErrors:0,contextLosses:0,disconnects:0,slowFrames:0,frames:0};}
export function addObservation(report,key,ms){if(!Number.isFinite(ms)||ms<0)return;const bins=METRIC_BINS[key];if(!bins)return;let index=bins.findIndex(upper=>ms<=upper);if(index<0)index=bins.length-1;report[key][index]++;}
// Coarse estimate only; raw device strings are never stored or transmitted.
export function detectDevice(nav=globalThis.navigator){
 if(!nav)return 'unknown';
 if(/Android|iPhone|iPad|iPod/i.test(nav.userAgent||'')||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1))return 'mobile';
 if(typeof nav.userAgentData?.mobile==='boolean')return nav.userAgentData.mobile?'mobile':'desktop';
 return /Windows|Macintosh|Linux|CrOS/i.test(nav.userAgent||'')?'desktop':'unknown';
}
export function createTelemetry({request=globalThis.fetch,visible=()=>true,device=detectDevice()}={}){
 let context={map:'tunnel',inputMode:'unknown',mode:'solo',device},report=makeReport(),enabled=false,loaded=false,sending=false;
 return {
  async init(){try{const r=await request('/ops/config',{cache:'no-store',signal:AbortSignal.timeout(5000)});enabled=r.ok&&(await r.json()).enabled===true;}catch{}return enabled;},
  get enabled(){return enabled;},
  context(map,inputMode,mode){if(context.map!==map||context.inputMode!==inputMode||context.mode!==mode){if(sending)report=makeReport();else void this.flush();context={map,inputMode,mode,device};}},
  observe(key,ms){if(enabled&&visible())addObservation(report,key,ms);},
  frame(ms){if(enabled&&visible()){addObservation(report,'frame',ms);report.frames++;if(ms>50)report.slowFrames++;}},
  count(key){if(enabled&&Object.hasOwn(report,key)&&typeof report[key]==='number')report[key]++;},
  ready(ms){if(!enabled||loaded)return;loaded=true;addObservation(report,'load',ms);void this.flush();},
  async flush(){
   if(!enabled||sending||!Object.values(report).some(value=>Array.isArray(value)?value.some(n=>n>0):value>0))return;const current={...report,...context};report=makeReport();sending=true;
   // Failed samples are dropped; telemetry never retries into an outage.
   try{await request('/ops/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current),keepalive:true,signal:AbortSignal.timeout(5000)});}catch{}finally{sending=false;}
  },
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
