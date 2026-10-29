const $=id=>document.getElementById(id);let key='',timer=null,lastSuccess=0,failures=0,generation=0;
const format=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:digits}):'—';
const mb=value=>format(value/1e6,2)+' MB';
function card(label,value,note=''){const item=document.createElement('article');item.className='card';const title=document.createElement('small'),number=document.createElement('div'),detail=document.createElement('p');title.textContent=label;number.className='value';number.textContent=value;detail.textContent=note;item.append(title,number,detail);return item;}
function cards(id,items){$(id).replaceChildren(...items.map(args=>card(...args)));}
const svgNS='http://www.w3.org/2000/svg';
function chart(id,history,series,floor=1){
 const svg=$(id),all=history.flatMap(point=>series.map(s=>s.value(point))).filter(Number.isFinite),max=Math.max(floor,...all)*1.12;
 const node=(tag,attrs,text)=>{const n=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;};
 const children=[];for(let i=0;i<3;i++){const y=15+i*55;children.push(node('line',{x1:40,x2:590,y1:y,y2:y,stroke:'#30434b'}),node('text',{x:2,y:y+4},format(max*(1-i*.5))));}
 if(history.length>1)for(const s of series){const path=history.map((p,i)=>`${i?'L':'M'}${40+(p.at-history[0].at)/Math.max(1,history.at(-1).at-history[0].at)*550},${125-Math.max(0,s.value(p)||0)/max*110}`).join(' ');children.push(node('path',{d:path,fill:'none',stroke:s.color,'stroke-width':2}));}
 else children.push(node('text',{x:200,y:75},'Gathering history…'));
 children.push(node('text',{x:40,y:146},`${format(history.length>1?(history.at(-1).at-history[0].at)/1000:0,0)}s of recent history`));svg.replaceChildren(...children);
}
function render(data){
 const c=data.current,t=data.totals,u=data.client;if(!c){$('message').textContent='Connected. Waiting for the first server sample…';return;}$('message').textContent='';
 $('uptime').textContent=`Uptime ${format(data.uptimeSeconds/60)} min · history resets on restart`;
 cards('server-cards',[
 ['Connections',`${c.sockets} / ${c.maxConnections}`,'Online racers and lobby guests'],['Lobbies',`${c.rooms} / ${c.maxRooms}`,`${c.racingRooms} racing · ${c.racingPlayers} running racers`],['CPU · one core',format(c.cpuPct)+'%','Process CPU sampled over the last second'],['Server memory',format(c.rssMB)+' MB',`${format(c.heapMB)} MB JavaScript heap`],
 ['Event loop · p95',format(c.eventLoopP95Ms)+' ms',`Max ${format(c.eventLoopMaxMs)} ms this interval`],['Simulation backlog',format(c.simulationBacklogMs)+' ms','Sampled race-clock work awaiting processing'],['Send backlog',mb(c.bufferedBytes),'Queued WebSocket data across connections'],['HTTP response · p95',c.httpP95Ms===null?'—':format(c.httpP95Ms)+' ms','Completed responses in the last interval']]);
 const recent=data.history.filter(p=>p.at>=c.at-30000),duration=recent.reduce((s,p)=>s+(p.intervalSeconds||1),0),avg=field=>recent.reduce((s,p)=>s+(p[field]||0)*(p.intervalSeconds||1),0)/Math.max(.001,duration);
 const monitoring=avg('monitorBytesPerSec'),race=avg('bytesOutPerSec'),assets=avg('assetBytesPerSec')+avg('pageBytesPerSec')+avg('otherBytesPerSec');
 cards('traffic-cards',[
 ['Race output',mb(race)+'/s','Recent 30-second average · queued JSON'],['Download output',mb(assets)+'/s','Assets + code + pages · completed bodies'],['Output / connection',c.sockets?format(race/c.sockets/1000)+' KB/s':'—','Current socket count; varying race states'],['If this rate lasts an hour',format((race+assets+monitoring)*3600/1e9,2)+' GB','Projection from recent traffic; excludes overhead'],
 ['Monitoring output',mb(monitoring)+'/s','Dashboard/API bodies; separate from game traffic'],['Race output total',mb(t.bytesOut),'Since process start'],['Asset downloads total',mb(t.assetBytes),'Models, music and map thumbnails'],['Code & pages total',mb(t.otherBytes+t.pageBytes),'Since process start'],['Incoming race traffic',mb(t.bytesIn),`${format(c.bytesInPerSec/1000)} KB/s right now`]]);
 const timing=key=>u[key]?.count?`${u[key].p95OverMs!=null?'>':'≤'} ${format(u[key].p95OverMs??u[key].p95UpperMs,0)} ms`:'—';
 $('sample-label').textContent=`${u.reports} reports · up to ${Math.round(u.windowSeconds/60)} min · not unique players${u.reportLimitReached?' · report cap reached; earlier data may be missing':''}`;
 cards('client-cards',[
 ['First rendered view · p95',timing('load'),`${u.load.count} navigation/readiness samples`],['First map visit · p95',timing('mapFirst'),`${u.mapFirst.count} switches · first model load in this tab, may use browser cache`],['Map revisit · p95',timing('mapRepeat'),`${u.mapRepeat.count} switches · models already in memory`],['Running frame time · p95',timing('frame'),`${u.frames} visible frame samples`],['Network RTT · p95',timing('rtt'),`${u.rtt.count} application echo samples`],['Processed acknowledgment · p95',timing('input'),`${u.input.count} sent → snapshot acknowledgment samples; processing does not imply acceptance`],['Update gap · p95',timing('gap'),`${u.gap.count} samples; target ≈50 ms`],
 ['Slow frames (>50 ms)',u.frames?format(u.slowFrames/u.frames*100)+'%':'—','Visible running frames only'],['Long tasks',format(u.longTasks,0),'Browser support varies; ≥50 ms'],['Browser / graphics errors',`${u.errors} / ${u.graphicsErrors}`,'Counts only; no error text collected'],['Client disconnect reports',format(u.disconnects,0),`${u.contextLosses} graphics context losses`]]);
 const p99=value=>!value?.count?'—':`${value.p99OverMs!=null?'>':'≤'} ${format(value.p99OverMs??value.p99UpperMs)} ms`;
 const peak=value=>Number.isFinite(value?.maxMs)?`${format(value.maxMs)} ms`:'not measured';
 cards('control-cards',[
  ...[['Gesture entry → send','controlDispatch'],['Recognized input → send','controlRecognize'],['Recognized lane input → anticipated submission','controlAnticipatedRender'],['Recognized input → confirmed render submission','controlRender'],['Processed acknowledgment → confirmed render submission','controlConfirmRender'],['Displayed movement age · receipt-relative','renderStateAge'],['Projection beyond received authority','renderLead']].map(([label,metric])=>[label+' · p95',timing(metric),`p99 ${p99(u[metric])} · max ${peak(u[metric])} · ${u[metric]?.count??0} samples`]),
  ['Sent / matched commands',`${u.controlSent??0} / ${u.controlMatched??0}`,'Matched means the corresponding confirmed state reached a renderer submission; sent commands can still be pending'],
  ['Unmatched / cancelled traces',`${u.controlUnmatched??0} / ${u.controlCancelled??0}`,'Counts expose missing matches and cancelled control traces; neither means an accepted action'],
  ['Anticipated lane responses',format(u.controlAnticipated??0,0),'Provisional lane movement before state confirmation; the server may still reject or correct it'],
  ['Lane corrections / expired intents',`${u.laneCorrections??0} / ${u.laneExpired??0}`,'Corrected provisional lane targets / expired pending lane intentions; not collision counts']]);
 cards('delivery-cards',[
  ['Server schedule delay · p99',p99(u.scheduleLag),`Max ${peak(u.scheduleLag)} · periodic snapshots only`],
  ['Server send interval · p99',p99(u.sendGap),`Max ${peak(u.sendGap)} · target ≈50 ms`],
  ['Excess arrival interval · p99',p99(u.arrivalExcess),`Max ${peak(u.arrivalExcess)} · arrival gap minus send gap; includes browser scheduling`],
  ['Latest server schedule / broadcast work',`${format(c.updateScheduleLagMs)} / ${format(c.updateBroadcastWorkMs)} ms`,'Local server clock; callback lateness / complete broadcast work']]);
 cards('spike-cards',[
  ['Update gaps · p99',p99(u.gap),`Recorded max ${peak(u.gap)} · ${u.gap.overThreshold??0} over 100 ms`],
  ['RTT · p99',p99(u.rtt),`Recorded max ${peak(u.rtt)} · ${u.rtt.overThreshold??0} over 200 ms`],
  ['Processed acknowledgment · p99',p99(u.input),`Recorded max ${peak(u.input)} · ${u.input.overThreshold??0} over 150 ms; not acceptance`],
  ['Frame time · p99',p99(u.frame),`Recorded max ${peak(u.frame)} · ${u.frame.overThreshold??0} over 50 ms`],
  ['Opponent buffer target · p99',p99(u.bufferDelay),`${u.bufferDelay?.count??0} target samples · max ${peak(u.bufferDelay)}`],
  ['Opponent buffer holds · p99',p99(u.bufferHold),`Max recovered hold ${peak(u.bufferHold)} · ${u.bufferUnderruns??0} underruns; includes ongoing holds without a completed duration`]]);
 const spikes=[];
 for(const event of u.recentSpikes||[]){const li=document.createElement('li');li.textContent=`${new Date(event.at).toLocaleTimeString()} client clock · ${event.device} / ${event.mode} / ${event.phase??'unknown'} / ${event.raceWindow??'unknown'} / ${event.map} · ${event.metric} ${format(event.ms)} ms (report received ${new Date(event.receivedAt).toLocaleTimeString()})`;spikes.push(li);}
 for(const event of data.serverSpikes||[]){const li=document.createElement('li');li.textContent=`${new Date(event.at).toLocaleTimeString()} server sample · event-loop max ${format(event.eventLoopMaxMs)} ms · simulation backlog ${format(event.simulationBacklogMs)} ms`;spikes.push(li);}
 if(!spikes.length){const li=document.createElement('li');li.textContent='No threshold-exceeding peaks recorded in the retained reports.';spikes.push(li);}$('spike-list').replaceChildren(...spikes);
 cards('reliability-cards',[
 ['Connection rejections',format(t.connectionRejects,0),'Capacity or shutdown; rejected upgrades'],['Lobby-full rejections',format(t.roomRejects,0),'A room could not be created'],['Socket closes',format(t.disconnects,0),'All closes, including normal exits'],['Slow-client removals',format(t.slowClients,0),'Send queue exceeded 256 KB'],['HTTP failures / aborts',`${t.http4xx} / ${t.http5xx} / ${t.httpAborts}`,'4xx / 5xx / incomplete responses'],['Validation / rate limits',`${format(t.invalidMessages,0)} / ${format(t.rateLimits,0)}`,'Invalid messages / input-rate refusals'],['Telemetry accepted / rejected',`${t.telemetryAccepted} / ${t.telemetryRejected}`,'Capped at 600 reports/minute; may be sampled'],['Browser payloads discarded',format(u.telemetryDropped??0,0),'Bounded queue or failed POST; reported on a later normal flush, with no retries'],['Snapshots sent',format(t.snapshots,0),`${format(c.snapshotsPerSec)} per second across sockets`]]);
 const latency=value=>!value?.count?'—':`${value.p95OverMs!=null?'>':'≤'} ${format(value.p95OverMs??value.p95UpperMs)} ms (${value.count})`;
 const breakdowns=[];for(const [label,groups]of [['Map',u.byMap],['Estimated device',u.byDevice],['Controls',u.byInput],['Play mode',u.byMode],['Race phase',u.byPhase],['Seconds into race',u.byRaceWindow],['Device / seconds into race',u.byDeviceWindow]]){const section=document.createElement('div');const heading=document.createElement('h4');heading.textContent=label;section.append(heading);for(const group of groups||[]){
  const p=document.createElement('p');p.textContent=`${group.name}: ${group.frames?`p95 frame ${group.frameP95OverMs!=null?'>':'≤'} ${format(group.frameP95OverMs??group.frameP95UpperMs)} ms`:'No running frame samples'} · first view ${latency(group.load)} · first map ${latency(group.mapFirst)} · revisit ${latency(group.mapRepeat)} · update gap ${latency(group.gap)} · server schedule ${latency(group.scheduleLag)} · send interval ${latency(group.sendGap)} · excess arrival ${latency(group.arrivalExcess)} · RTT ${latency(group.rtt)} · processed acknowledgment ${latency(group.input)} · ${group.reports} reports`;
  const controls=document.createElement('p');controls.textContent=`Control p95: entry → send ${latency(group.controlDispatch)} · recognized → send ${latency(group.controlRecognize)} · lane → anticipated submission ${latency(group.controlAnticipatedRender)} · recognized → confirmed submission ${latency(group.controlRender)} · acknowledged → confirmed submission ${latency(group.controlConfirmRender)} · displayed movement age ${latency(group.renderStateAge)} · projection ${latency(group.renderLead)} · sent / matched / unmatched / cancelled ${group.controlSent??0} / ${group.controlMatched??0} / ${group.controlUnmatched??0} / ${group.controlCancelled??0} · anticipated lane responses ${group.controlAnticipated??0} · lane corrections / expired ${group.laneCorrections??0} / ${group.laneExpired??0}`;
  const startup=document.createElement('p');startup.textContent=`Shader preparation: ${group.shaderWarmups??0} completed / ${group.shaderWarmupFailures??0} failed · warmup ${peak(group.shaderWarmup)} · compile ${peak(group.shaderCompile)} · ${group.shaderProgramsCreated??0} new program objects during play. Render objects: ${group.renderObjectCreates??0} created · ${group.renderObjectMisses??0} unprepared lookups. Startup diagnostics · maximum: frame CPU work ${peak(group.frameWork)} · snapshot handling ${peak(group.snapshotWork)} · drawing CPU submission ${peak(group.drawWork)} · completed own movement hold ${peak(group.ownHold)} · excess forward advance ${peak(group.forwardExcess)}. These identify symptoms, not the cause; drawing time excludes asynchronous GPU work.`;
  section.append(p,controls,startup);
 }breakdowns.push(section);}$('breakdowns').replaceChildren(...breakdowns);
 chart('memory-chart',data.history,[{value:p=>p.rssMB,color:'#72c9fc'},{value:p=>p.heapMB,color:'#f2be70'}],100);
 chart('cpu-chart',data.history,[{value:p=>p.cpuPct,color:'#72c9fc'}],100);
 chart('lag-chart',data.history,[{value:p=>p.eventLoopP95Ms,color:'#72c9fc'},{value:p=>p.simulationBacklogMs,color:'#f2be70'},{value:p=>p.eventLoopMaxMs,color:'#f08080'}],50);
 chart('traffic-chart',data.history,[{value:p=>p.bytesOutPerSec/1e6,color:'#72c9fc'},{value:p=>(p.assetBytesPerSec+p.pageBytesPerSec+p.otherBytesPerSec)/1e6,color:'#f2be70'}],.1);
 const signals=[];if(u.reportLimitReached)signals.push('Browser report storage reached its cap. The displayed time window may have incomplete early coverage.');const sustained=(field,threshold)=>data.history.length>=10&&data.history.slice(-10).every(p=>p[field]>threshold);
 if(c.sockets/c.maxConnections>=.8||c.rooms/c.maxRooms>=.8)signals.push('Capacity is above 80%. New online players may soon be refused.');
 if(sustained('cpuPct',80))signals.push('CPU has exceeded 80% of one core for 10 samples. Check timing and traffic together.');
 if(sustained('eventLoopP95Ms',50)||sustained('simulationBacklogMs',100))signals.push('Processing delays have persisted for 10 samples. Race responsiveness may suffer.');
 if(u.telemetryRejected||t.telemetryRejected>0)signals.push('Some browser reports were rejected. Player-experience coverage may be incomplete.');
 if(u.telemetryDropped)signals.push('Browsers discarded some telemetry payloads because their queue filled or a request failed. Samples may be incomplete.');
 if(!u.reports)signals.push('No recent browser reports yet. Open the game on this server and play; reports arrive on first render and every 30 seconds.');
 if(u.errors||u.graphicsErrors||u.contextLosses)signals.push('Recent browser or graphics errors were reported. Counts are aggregate and cannot identify the cause.');
 if(!signals.length)signals.push('No provisional sustained-pressure signal. This is not a guarantee of healthy performance for every player.');
 $('alerts').replaceChildren(...signals.map((text,i)=>{const p=document.createElement('div');p.className='signal'+(signals.length>1||text.startsWith('Capacity')||text.startsWith('Processing')||text.startsWith('CPU')?' warn':'');p.textContent=text;return p;}));
}
function lock(message='Dashboard locked.'){
 generation++;key='';clearTimeout(timer);timer=null;$('dashboard').hidden=true;$('login').hidden=false;$('lock').hidden=true;$('connection').textContent='Locked';$('message').textContent=message;
}
async function poll(){
 if(!key)return;const ticket=generation;
 try{const r=await fetch('/ops/metrics',{headers:{Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(ticket!==generation||!key)return;
  if(r.status===401){lock('The monitoring key was rejected.');return;}
  if(!r.ok)throw new Error(r.status===503?'Monitoring is disabled on this server.':`Metrics unavailable (${r.status}).`);
  const data=await r.json();if(ticket!==generation||!key)return;lastSuccess=Date.now();failures=0;render(data);$('dashboard').hidden=false;$('login').hidden=true;$('lock').hidden=false;$('connection').textContent='● Live';$('updated').textContent='Updated '+new Date(lastSuccess).toLocaleTimeString();
 }catch(error){if(ticket!==generation||!key)return;failures++;$('connection').textContent='● Stale';$('message').textContent=error.message+` Last success ${lastSuccess?new Date(lastSuccess).toLocaleTimeString():'never'}.`;}
 if(key&&ticket===generation)timer=setTimeout(poll,Math.min(30000,2000*2**Math.min(failures,4)));
}
$('login').addEventListener('submit',event=>{event.preventDefault();generation++;key=$('key').value.trim();$('key').value='';clearTimeout(timer);void poll();});
$('lock').addEventListener('click',()=>lock());
window.addEventListener('pagehide',()=>lock('Dashboard locked when you left this page.'));
