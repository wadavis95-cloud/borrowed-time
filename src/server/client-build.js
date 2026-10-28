import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
// Capture a build once per server start. Never derive filesystem paths directly
// from a request: only validated manifest entries become public routes.
export function readClientBuild(root){
 let manifest;
 try{manifest=JSON.parse(readFileSync(resolve(root,'build/client/manifest.json'),'utf8'));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(manifest.version!==1||!manifest.files||!Object.keys(manifest.files).length)throw new Error('Invalid browser build manifest');
 const files=new Map();
 for(const [url,file]of Object.entries(manifest.files)){
  if(!/^\/client\/[a-zA-Z0-9_-]+-[A-Z0-9]{8}\.(js|css)$/.test(url)||file!==url.slice(8))throw new Error('Invalid browser build asset');
  files.set(url,resolve(root,'build/client',file));
 }
 return {files,html:resolve(root,'build/client/index.html'),monitor:resolve(root,'build/client/monitor.html')};
}
export function chooseEncoding(header){
 if(!header)return 'identity';
 const weights=new Map();
 for(const token of String(header).split(',')){
  const [name,...params]=token.trim().toLowerCase().split(';');
  const q=params.find(p=>p.trim().startsWith('q='));const value=q===undefined?1:Number(q.trim().slice(2));
  weights.set(name.trim(),Number.isFinite(value)&&value>=0&&value<=1?value:0);
 }
 const quality=name=>weights.get(name)??(name==='identity'?(weights.get('*')===0?0:1):weights.get('*')??0);
 return ['br','gzip','identity'].map(name=>({name,q:quality(name)})).filter(x=>x.q>0).sort((a,b)=>b.q-a.q)[0]?.name??null;
}
