import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {buildClient} from '../scripts/build-client.mjs';

test('browser build is split, hashed, compressed and linked by fresh HTML',async t=>{
 const out=await mkdtemp(join(tmpdir(),'bt-build-'));t.after(()=>rm(out,{recursive:true,force:true}));
 const manifest=await buildClient({outdir:out});
 const html=await readFile(join(out,'index.html'),'utf8');
 assert.match(html,/\/client\/main-[A-Z0-9]+\.js/);assert.doesNotMatch(html,/src="\/src\/main.js"/);
 assert.ok(Object.keys(manifest.files).length>5,'dynamic imports remain split');
 let raw=0,compressed=0;
 for(const [url,file]of Object.entries(manifest.files)){
  assert.match(url,/^\/client\/[a-zA-Z0-9_-]+\.(js|css)$/);assert.equal(file,url.slice(8));
  const bytes=await readFile(join(out,file));raw+=bytes.length;
  const br=await readFile(join(out,file+'.br'));compressed+=br.length;
  assert.deepEqual(brotliDecompressSync(br),bytes);
  assert.deepEqual(gunzipSync(await readFile(join(out,file+'.gz'))),bytes);
 }
 assert.ok(compressed<raw*.5);
 assert.match(await readFile(join(out,'monitor.html'),'utf8'),/\/client\/dashboard-/);
});

import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {createStaticFileHandler} from '../src/server/app.js';
const networkTest=process.env.RUN_NETWORK_TESTS==='1'?test:test.skip;
function response(url,headers={},method='GET'){
 return new Promise((resolve,reject)=>{const req=request(url,{headers,method},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});
}
networkTest('built code negotiates compression and immutable cache; HTML and source stay fresh',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'bt-serving-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const manifest=await buildClient({outdir:join(dir,'build/client')});
 const server=createServer(createStaticFileHandler({publicRoot:dir}));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`http://127.0.0.1:${server.address().port}`;
 const url=Object.keys(manifest.files).find(p=>p.includes('/main-'));
 const identity=await response(origin+url);assert.equal(identity.status,200);assert.match(identity.headers['cache-control'],/immutable/);
 for(const encoding of ['br','gzip']){
  const result=await response(origin+url,{'Accept-Encoding':encoding});assert.equal(result.headers['content-encoding'],encoding);assert.equal(result.headers.vary,'Accept-Encoding');
  assert.deepEqual((encoding==='br'?brotliDecompressSync:gunzipSync)(result.body),identity.body);
  const head=await response(origin+url,{'Accept-Encoding':encoding},'HEAD');assert.equal(head.body.length,0);assert.equal(+head.headers['content-length'],result.body.length);
 }
 const denied=await response(origin+url,{'Accept-Encoding':'br;q=0, gzip;q=0'});assert.equal(denied.headers['content-encoding'],undefined);
 assert.equal((await response(origin+url,{'Accept-Encoding':'br;q=0.2, gzip;q=1'})).headers['content-encoding'],'gzip');
 assert.equal((await response(origin+url,{'Accept-Encoding':'identity;q=0, *;q=0'})).status,406);
 const html=await response(origin+'/');assert.equal(html.status,200);assert.equal(html.headers['cache-control'],'no-store');assert.match(html.body.toString(),/\/client\/main-/);
 assert.equal((await response(origin+'/monitor')).status,200);
 for(const path of ['/client/unknown-ABC.js','/build/client/manifest.json','/.local/monitor-key.txt'])assert.equal((await response(origin+path)).status,404);
});

import {writeFile,mkdir} from 'node:fs/promises';
import {readClientBuild,chooseEncoding} from '../src/server/client-build.js';
test('manifest cannot expose arbitrary filesystem paths and encodings honor exclusions',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'bt-invalid-build-'));t.after(()=>rm(dir,{recursive:true,force:true}));await mkdir(join(dir,'build/client'),{recursive:true});
 await writeFile(join(dir,'build/client/manifest.json'),JSON.stringify({version:1,files:{'/client/main-ABCDEFGH.js':'../../../.local/monitor-key.txt'}}));
 assert.throws(()=>readClientBuild(dir),/Invalid browser/);
 assert.equal(chooseEncoding('gzip;q=0, br;q=0, identity;q=1'),'identity');
 assert.equal(chooseEncoding('gzip;q=1, br;q=0.5'),'gzip');
 assert.equal(chooseEncoding('*;q=0'),null);
 assert.equal(chooseEncoding('*;q=0, identity;q=0.5'),'identity');
});
