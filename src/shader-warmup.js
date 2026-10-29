// Preparation only. No simulation, inputs, balances or network settings.
export async function runShaderWarmup({renderer,scene,camera,target,variants=[],timeoutMs=15000,
  now=()=>performance.now(),yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0))}){
 const started=now(),original=renderer.getRenderTarget(),saved=[],textures=new Set();
 let timer,sync,gl;
 const remaining=()=>Math.max(0,timeoutMs-(now()-started));
 try{
  for(const root of variants)root.traverse(node=>{
   saved.push({node,visible:node.visible,frustumCulled:node.frustumCulled});node.visible=true;node.frustumCulled=false;
  });
  const compileAt=now();
  await Promise.race([renderer.compileAsync(scene,camera),new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('Shader warmup timed out')),remaining());
  })]);clearTimeout(timer);
  const compileMs=now()-compileAt;
  scene.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:[node.material]){
   if(material)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  }});
  for(const texture of textures)renderer.initTexture(texture);
  renderer.setRenderTarget(target);
  // The first hidden draw exercises geometry uploads and shadow/depth variants
  // that compileAsync alone does not guarantee have been submitted.
  renderer.render(scene,camera);await yieldControl();renderer.render(scene,camera);
  gl=renderer.getContext();sync=gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush?.();
  if(sync){
   for(;;){
    const status=gl.clientWaitSync(sync,0,0);
    if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;
    if(status===gl.WAIT_FAILED)throw Error('Shader warmup GPU wait failed');
    if(remaining()===0)throw Error('Shader warmup timed out');
    await yieldControl();
   }
  }
  return {durationMs:now()-started,compileMs,textureCount:textures.size};
 }finally{
  clearTimeout(timer);if(sync)gl.deleteSync(sync);
  renderer.setRenderTarget(original);
  for(const {node,visible,frustumCulled}of saved){node.visible=visible;node.frustumCulled=frustumCulled;}
 }
}
