export function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
}
export function stats(values){return {count:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:values.length?values.reduce((a,b)=>Math.max(a,b),-Infinity):null};}
export class Samples {
  constructor(limit=100000){this.values=[];this.limit=limit;this.seen=0;this.highest=-Infinity;this.randomState=12345;}
  add(value){
    if(!Number.isFinite(value))return;this.seen++;this.highest=Math.max(this.highest,value);
    if(this.values.length<this.limit)this.values.push(value);
    else { // Deterministic reservoir covers the whole run instead of its beginning.
      this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;
      const slot=Math.floor((this.randomState/4294967296)*this.seen);
      if(slot<this.limit)this.values[slot]=value;
    }
  }
  summary(){return {...stats(this.values),max:this.seen?this.highest:null,seen:this.seen,truncated:this.seen>this.limit};}
}
export function localOrigin(raw){
  const url=new URL(raw);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Capacity tests only target their own disposable 127.0.0.1 server.');
  return url;
}
