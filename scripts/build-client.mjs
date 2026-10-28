import {build} from 'esbuild';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {resolve,basename} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildClient({outdir=resolve(root,'build/client')}={}){
 const result=await build({absWorkingDir:root,entryPoints:{main:'src/main.js',styles:'styles.css',dashboard:'monitor/dashboard.js','dashboard-style':'monitor/dashboard.css'},
   bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',minify:true,
   legalComments:'inline',entryNames:'[name]-[hash]',chunkNames:'chunk-[hash]',outdir,write:false,metafile:true});
 await mkdir(outdir,{recursive:true});
 const manifest={version:1,files:{}};
 for(const output of result.outputFiles){
  const name=basename(output.path);manifest.files['/client/'+name]=name;
  await Promise.all([writeFile(output.path,output.contents),writeFile(output.path+'.gz',gzipSync(output.contents,{level:9})),
   writeFile(output.path+'.br',brotliCompressSync(output.contents,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}))]);
 }
 const entry=source=>{
  const found=Object.entries(result.metafile.outputs).find(([,info])=>info.entryPoint===source);
  if(!found)throw new Error(`Missing browser entry ${source}`);
  return '/client/'+basename(found[0]);
 };
 const html=(await readFile(resolve(root,'index.html'),'utf8')).replace('/src/main.js',entry('src/main.js')).replace('/styles.css',entry('styles.css'));
 const monitor=(await readFile(resolve(root,'monitor/index.html'),'utf8')).replace('/monitor/dashboard.js',entry('monitor/dashboard.js')).replace('/monitor/dashboard.css',entry('monitor/dashboard.css'));
 // Content files first, then atomic HTML/manifest replacement. Restart the local
 // server after rebuilding: it intentionally captures one manifest per process.
 for(const [name,body]of Object.entries({'index.html':html,'monitor.html':monitor,'manifest.json':JSON.stringify(manifest,null,2)+'\n'})){
  await writeFile(resolve(outdir,name+'.tmp'),body);await rename(resolve(outdir,name+'.tmp'),resolve(outdir,name));
 }
 return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const manifest=await buildClient();console.log(`Built ${Object.keys(manifest.files).length} hashed browser files with gzip and Brotli.`);
}
