// Produce a standalone public-only directory for a future static host/CDN.
import {copyFile,mkdir,writeFile,readFile,mkdtemp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {staticFileEntries} from '../src/server/app.js';
import {readClientBuild} from '../src/server/client-build.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function exportStatic({raceOrigin,outdir}={}){
 const url=new URL(raceOrigin);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Supply an HTTP(S) race origin');
 if(!outdir){await mkdir(resolve(root,'build'),{recursive:true});outdir=await mkdtemp(resolve(root,'build/static-'));}
 await mkdir(outdir,{recursive:true});
 const copy=async(path,source)=>{const target=resolve(outdir,'.'+path);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);};
 let count=0;
 for(const [path,relative]of staticFileEntries()){
  if(path.startsWith('/monitor/'))continue;
  try{await copy(path,resolve(root,relative));count++;}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const build=readClientBuild(root);if(!build)throw new Error('Run npm run build before static export');
 await copy('/index.html',build.html);
 for(const [path,source]of build.files){for(const suffix of ['','.gz','.br'])await copy(path+suffix,source+suffix);}
 await writeFile(resolve(outdir,'runtime-config.js'),'globalThis.BORROWED_TIME_CONFIG='+JSON.stringify({raceOrigin:url.origin})+';\n');
 await writeFile(resolve(outdir,'_headers'),'/client/*\n  Cache-Control: public, max-age=31536000, immutable\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/runtime-config.js\n  Cache-Control: no-store\n');
 return {outdir,publicFiles:count,clientFiles:build.files.size,raceOrigin:url.origin};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await exportStatic({raceOrigin:process.env.RACE_ORIGIN,outdir:process.env.STATIC_OUTDIR}),null,2));
