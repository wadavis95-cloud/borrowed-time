// Public routing only. Never put monitoring keys or other secrets in runtime config.
export function raceEndpoint(path,{page=globalThis.location?.href,origin=globalThis.BORROWED_TIME_CONFIG?.raceOrigin}={}){
 const current=new URL(page),base=origin?new URL(origin):current;
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||origin&&(base.pathname!=='/'||base.search||base.hash)||current.protocol==='https:'&&base.protocol!=='https:')throw new Error('Invalid race service origin');
 return new URL(path,base.origin).href;
}
