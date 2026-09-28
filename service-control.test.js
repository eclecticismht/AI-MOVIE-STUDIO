const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createLifecycle}=require('./service-lifecycle'),{createControlApi}=require('./studio-control');
const {runOperation,WEB,CONNECTOR,COMFY}=require('./service-control-worker');
test('service entry scripts parse in Windows PowerShell 5 with Chinese paths and messages',{skip:process.platform!=='win32'},()=>{
 const path=require('node:path'),{execFileSync}=require('node:child_process');
 for(const name of ['start-local-services.ps1','start-renderer-service.ps1','restart-web-service.ps1']){
  const file=path.join(__dirname,name).replaceAll("'","''"),source=`$errors=$null;$tokens=$null;[System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 1}`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});
 }
});
async function serverFor(t,lifecycle,handler){
 const server=http.createServer(lifecycle.wrap(handler));lifecycle.attach(server);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close()});
 const base='http://127.0.0.1:'+server.address().port;
 return async(route,body,headers={})=>{const r=await fetch(base+route,{headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}};
}
test('safe shutdown waits for requests and background work; drain rejects new production',async t=>{
 let finish,background=true,exited=0;const active=new Promise(resolve=>{finish=resolve});
 const lifecycle=createLifecycle({role:'web',build:'test',busy:()=>background?['export']:[],exit:()=>exited++});
 const request=await serverFor(t,lifecycle,async(req,res)=>{await active;res.end('{}')});
 const work=request('/render');while(!lifecycle.status().busy.some(s=>s.includes('请求')))await new Promise(setImmediate);
 const lease=crypto.randomUUID();assert.equal((await request('/api/service-lifecycle',{action:'prepare',lease})).status,200);
 assert.equal((await request('/new-job',{})).status,503);
 assert.equal((await request('/api/service-lifecycle',{action:'stop',lease})).status,409);
 finish();await work;assert.deepEqual(lifecycle.status().busy,['export']);
 background=false;assert.equal((await request('/api/service-lifecycle',{action:'stop',lease})).status,202);
 await new Promise(setImmediate);assert.equal(exited,1);
});
test('drain lease expires on helper failure and foreign pages cannot control services',async t=>{
 let now=1000;const lifecycle=createLifecycle({role:'web',build:'test',now:()=>now,exit:()=>assert.fail('unexpected exit')});
 const request=await serverFor(t,lifecycle,(req,res)=>res.end('{}')),lease=crypto.randomUUID();
 assert.equal((await request('/api/service-lifecycle',{action:'prepare',lease},{Origin:'https://example.com'})).status,403);
 await request('/api/service-lifecycle',{action:'prepare',lease});
 assert.equal((await request('/api/service-lifecycle',{action:'stop',lease:crypto.randomUUID()})).status,409);
 now+=30001;assert.equal((await request('/ordinary')).status,200);
 assert.equal((await request('/api/service-lifecycle',{action:'stop',lease})).status,409);
});
test('disconnect does not hide asynchronous work from shutdown checks',async t=>{
 let finish;const active=new Promise(resolve=>{finish=resolve}),lifecycle=createLifecycle({role:'web',build:'test',exit:()=>{}});
 const request=await serverFor(t,lifecycle,async(req,res)=>{res.end('{}');await active});
 await request('/work');assert.ok(lifecycle.status().busy.length);finish();await new Promise(setImmediate);assert.deepEqual(lifecycle.status().busy,[]);
});
function workerHarness(options={}){
 const events=[],records=[],stopped=new Set(),op={id:crypto.randomUUID(),action:options.action||'restart',expectedBuild:'new',installation:'ours'};
 let time=0,busy=options.busy||0,starts=0,prepared=false;
 const deps={now:()=>time,pause:async ms=>{time+=ms;if(busy)busy--},currentBuild:()=>options.changed?'other':'new',cancelled:()=>!!options.cancel,
  record:state=>records.push(state),start:async()=>{events.push('start');starts++;stopped.clear()},startRenderer:async()=>events.push('startRenderer'),
  req:async(base,route,body)=>{
   events.push([base,route,body?.action]);
   if(options.failure?.(base,route,body))throw Error('injected failure');
   if(route==='/queue'){if(options.badQueue)return {};return {queue_running:busy?[[1,'prompt']]:[],queue_pending:[]}}
   if(route==='/system_stats')return {system:{}};
   if(route==='/api/performance-audio')return {version:2,connectorReady:!options.incompatible};
   if(route!=='/api/service-lifecycle')assert.fail('unexpected request');
   if(stopped.has(base))throw Object.assign(Error('offline'),{cause:{code:'ECONNREFUSED'}});
   if(body?.action==='stop')stopped.add(base);
   if(body?.action==='prepare')prepared=true;
   if(body?.action==='cancel')prepared=false;
   return {version:1,role:base===WEB?'web':'connector',pid:base===WEB?100:200,installation:options.foreign?'theirs':'ours',build:starts?'new':'old',busy:prepared&&options.race?['late export']:[]};
  }};
 return {op,deps,events,records,stopped,run:()=>runOperation(op,deps)};
}
test('queued restart waits for H3, gracefully stops only Studio, then verifies both builds',async()=>{
 const h=workerHarness({busy:2});await h.run();
 assert.equal(h.records.at(-1).phase,'complete');assert.equal(h.records.filter(r=>r.phase==='waiting').length,2);
 const stops=h.events.filter(e=>Array.isArray(e)&&e[2]==='stop');assert.deepEqual(stops.map(e=>e[0]),[CONNECTOR,WEB]);
 assert.ok(h.events.filter(e=>Array.isArray(e)&&e[0]===COMFY).every(e=>!e[2]));
});
test('exit waits and closes services without launching H3 or resuming any paused job',async()=>{
 const h=workerHarness({action:'exit',busy:1});await h.run();assert.equal(h.records.at(-1).phase,'complete');assert.equal(h.events.includes('start'),false);assert.equal(h.events.includes('startRenderer'),false);
});
test('cancel, changed code, foreign checkout and unknown GPU state cannot stop services',async()=>{
 for(const options of [{cancel:true},{changed:true},{foreign:true},{badQueue:true}]){
  const h=workerHarness(options);await h.run();assert.ok(['cancelled','failed'].includes(h.records.at(-1).phase));assert.equal(h.events.some(e=>Array.isArray(e)&&e[2]==='stop'),false);
 }
});
test('work arriving after the first idle check releases maintenance and keeps waiting',async()=>{
 const options={race:true},h=workerHarness(options);let pauses=0;
 h.deps.pause=async()=>{pauses++;options.race=false};await h.run();
 assert.equal(pauses,1);assert.equal(h.records.at(-1).phase,'complete');assert.equal(h.events.filter(e=>Array.isArray(e)&&e[2]==='cancel').length,2);
});
test('a partial shutdown failure restores availability and does not claim success',async()=>{
 const h=workerHarness({failure:(base,route,body)=>base===WEB&&body?.action==='stop'});await h.run();
 assert.equal(h.records.at(-1).phase,'failed');assert.equal(h.events.includes('start'),true);
});
test('startup is idempotent service startup followed by renderer and compatibility checks',async()=>{
 const h=workerHarness({action:'start'});await h.run();assert.equal(h.records.at(-1).phase,'complete');assert.equal(h.events.includes('startRenderer'),true);assert.equal(h.events.some(e=>Array.isArray(e)&&e[2]==='stop'),false);
});
test('incompatible live versions are reported as failure after restart',async()=>{
 const h=workerHarness({incompatible:true});await h.run();assert.equal(h.records.at(-1).phase,'failed');
});
test('duplicate service actions share one operation; cancel has to match that operation',async t=>{
 let current=null,launches=0,cancelled=null;const lifecycle=createLifecycle({role:'web',build:'test',exit:()=>{}});
 const api=createControlApi(lifecycle,{store:{read:()=>current,write:value=>(current=value),cancel:id=>{cancelled=id}},launch:async()=>launches++});
 const request=await serverFor(t,lifecycle,(req,res)=>api(req,res,new URL(req.url,'http://localhost').pathname));
 const first=await request('/api/studio-control',{action:'restart'}),again=await request('/api/studio-control',{action:'restart'});
 assert.equal(first.data.operation.id,again.data.operation.id);assert.equal(launches,1);
 assert.equal((await request('/api/studio-control',{action:'exit'})).status,409);
 assert.equal((await request('/api/studio-control',{action:'cancel',id:crypto.randomUUID()})).status,409);
 assert.equal((await request('/api/studio-control',{action:'cancel',id:first.data.operation.id})).status,202);assert.equal(cancelled,first.data.operation.id);
});
