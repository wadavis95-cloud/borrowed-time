import test from 'node:test';
import assert from 'node:assert/strict';
import {runShaderWarmup} from '../src/shader-warmup.js';
import {createMonitoring,validReport} from '../src/server/monitoring.js';
import {PassThrough} from 'node:stream';

function fixture(){
 const calls=[],texture={isTexture:true},child={visible:false,frustumCulled:true,material:{map:texture}},variant={visible:false,frustumCulled:true};
 variant.traverse=fn=>{fn(variant);fn(child);};const scene={traverse:fn=>{fn(variant);fn(child);fn({material:[{map:texture}]});}};
 const old={name:'original'},target={name:'hidden'};let active=old;
 const renderer={info:{programs:[]},getRenderTarget:()=>active,setRenderTarget:value=>{calls.push(['target',value]);active=value;},
  compileAsync:async()=>{calls.push(['compile']);assert.equal(variant.visible,true);},initTexture:t=>calls.push(['texture',t]),render:()=>calls.push(['render',active]),getContext:()=>({flush(){calls.push(['flush']);}})};
 return {renderer,scene,variant,child,calls,old,target};
}
test('warmup compiles first, deduplicates textures and renders into a hidden target',async()=>{
 const f=fixture();const result=await runShaderWarmup({...f,camera:{},variants:[f.variant]});
 assert.equal(result.textureCount,1);assert.equal(f.calls.filter(x=>x[0]==='compile').length,1);
 assert.equal(f.calls.filter(x=>x[0]==='render').length,2);
 assert.ok(f.calls.filter(x=>x[0]==='render').every(x=>x[1]===f.target));
 assert.ok(f.calls.findIndex(x=>x[0]==='compile')<f.calls.findIndex(x=>x[0]==='render'));
 assert.equal(f.variant.visible,false);assert.equal(f.child.visible,false);assert.equal(f.child.frustumCulled,true);
 assert.equal(f.renderer.getRenderTarget(),f.old);
});
test('warmup restores visibility and target when compilation fails',async()=>{
 const f=fixture();f.renderer.compileAsync=async()=>{throw Error('compile failed');};
 await assert.rejects(runShaderWarmup({...f,camera:{},variants:[f.variant]}),/compile failed/);
 assert.equal(f.variant.visible,false);assert.equal(f.child.visible,false);assert.equal(f.renderer.getRenderTarget(),f.old);
 assert.equal(f.calls.filter(x=>x[0]==='render').length,0);
});
test('a stalled asynchronous compile times out without a late hidden render',async()=>{
 const f=fixture();let finish;f.renderer.compileAsync=()=>new Promise(resolve=>finish=resolve);
 await assert.rejects(runShaderWarmup({...f,camera:{},variants:[f.variant],timeoutMs:5}),/warmup timed out/);
 finish();await Promise.resolve();assert.equal(f.calls.filter(x=>x[0]==='render').length,0);assert.equal(f.variant.visible,false);
});
test('WebGL2 completion is polled without blocking and its fence is released',async()=>{
 const f=fixture();let polls=0,deleted=0,yields=0;const sync={};f.renderer.getContext=()=>({SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,WAIT_FAILED:5,
  fenceSync:()=>sync,flush(){},clientWaitSync:()=>++polls===1?4:3,deleteSync:value=>{assert.equal(value,sync);deleted++;}});
 await runShaderWarmup({...f,camera:{},variants:[f.variant],yieldControl:async()=>{yields++;}});
 assert.equal(polls,2);assert.equal(deleted,1);assert.ok(yields>=1);
});
test('protected monitoring accepts fixed shader measurements and keeps phone preparation separate',async()=>{
 const report={map:'tunnel',device:'mobile',mode:'solo',phase:'preparing',shaderWarmups:1,shaderWarmupFailures:0,shaderProgramsCreated:2,
  shaderWarmup:[0,0,0,1,0,0,0,0],peaks:{shaderWarmup:{ms:200,at:1000}}};
 assert.equal(validReport(report),true);
 const m=createMonitoring({token:'x'.repeat(40),autoStart:false});
 try{
  const req=new PassThrough();Object.assign(req,{url:'/ops/client',method:'POST',headers:{origin:'http://localhost',host:'localhost','content-type':'application/json'}});
  let status;m.handle(req,{writeHead(code){status=code;},end(){}});req.end(JSON.stringify(report));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(status,204);const c=m.snapshot().client;
  assert.equal(c.byDevice[0].shaderWarmups,1);assert.equal(c.byPhase[0].name,'preparing');assert.equal(c.byPhase[0].shaderWarmup.maxMs,200);
  assert.equal(c.shaderProgramsCreated,2);
 }finally{m.dispose();}
});
