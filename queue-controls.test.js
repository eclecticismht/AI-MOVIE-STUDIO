const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function app(jobs,fetchImpl=async()=>{throw Error('offline')}){
  const D={activeProjectId:'p1',jobs,generations:[],shots:jobs.map(j=>({id:j.shot,projectId:j.projectId,status:'等待 Worker'})),connector:{endpoint:'http://local'}};
  let saved,requests=0;
  const context=vm.createContext({ResultGuard:require('./result-guard'),D,dispatchingJobs:new Set(),confirm:()=>true,alert(){},AbortSignal,uid:()=> 'generation',jobIsComplete:j=>!!j.videoUrl||/已完成|已生成|待审核/.test(j.status||''),fetch:async(...args)=>{requests++;return fetchImpl(...args)},localStorage:{setItem(k,v){saved=v}},renderGeneration(){},items:k=>D[k].filter(j=>j.projectId===D.activeProjectId),esc:String});
  context.window=context;
  for(const name of ['dispatchJob','syncComfyJob','cancelJob','deleteJob','simulateGeneration'])context[name]=()=>{};
  vm.runInContext(fs.readFileSync('queue-controls.js','utf8'),context);vm.runInContext('renderGeneration=()=>{}',context);
  return {D,context,requests:()=>requests,saved:()=>saved,clear:()=>vm.runInContext('clearRenderQueue()',context)};
}
const job=(id,extra={})=>({id,shot:id,projectId:'p1',status:'等待本地 H3 Connector',...extra});
const reply=(data,ok=true)=>({ok,json:async()=>data});
test('clear removes local tasks only in current project without contacting GPU',async()=>{
  const a=app([job('one'),job('other',{projectId:'p2'})]);await a.clear();
  assert.equal(a.D.jobs.length,1);assert.equal(a.D.jobs[0].projectId,'p2');assert.equal(a.D.shots[0].status,'待制作');assert.equal(a.requests(),0);
});
test('stale and legacy queue submissions stop before dispatch and allow retry after storage failure',async()=>{
 const a=app([job('one')]);a.context.ResultGuard={matches:async()=>false};
 await vm.runInContext("dispatchJob('one')",a.context);
 assert.match(a.D.jobs[0].status,/提交已阻止/);assert.equal(a.D.jobs[0].dispatchAttemptedAt,undefined);assert.equal(a.D.shots[0].status,'需重做');assert.equal(a.requests(),0);
 const b=app([job('two')]);b.context.ResultGuard={matches:async()=>false};b.context.localStorage.setItem=()=>{throw Error('quota')};
 await vm.runInContext("dispatchJob('two')",b.context);assert.equal(b.D.jobs[0].status,'等待本地 H3 Connector');assert.equal(vm.runInContext('renderJobOperations.size',b.context),0);
});
test('version check locks prevent duplicate submissions while fingerprint is pending',async()=>{
 const a=app([job('one')]);let finish,calls=0;
 a.context.ResultGuard={matches:()=>{calls++;return new Promise(resolve=>finish=resolve)}};
 const first=vm.runInContext("dispatchJob('one')",a.context);await vm.runInContext("dispatchJob('one')",a.context);assert.equal(calls,1);
 finish(true);await first;assert.ok(a.D.jobs[0].dispatchAttemptedAt);assert.equal(vm.runInContext('renderJobOperations.size',a.context),0);
});
test('queued remote jobs are cancelled; running and unreachable records are removed with an audit trail',async()=>{
  const a=app([job('queued',{comfyPromptId:'q'}),job('running',{comfyPromptId:'r'}),job('unknown',{dispatchAttemptedAt:'now'})],async(url)=>{
    if(url.includes('unknown'))throw Error('offline');
    if(url.endsWith('/status'))return reply({job:{connectorStatus:'已提交 ComfyUI H3'}});
    return url.includes('running')?reply({error:'running'},false):reply({job:{connectorStatus:'已取消'}});
  });await a.clear();
  assert.equal(a.D.jobs.length,0);assert.equal(a.D.detachedRenderJobs.length,2);assert.ok(a.D.detachedRenderJobs.some(j=>j.id==='running'));assert.ok(a.D.detachedRenderJobs.some(j=>j.id==='unknown'));
});
test('completed remote video is retained in review when queue record is cleared',async()=>{
  const a=app([job('done',{comfyPromptId:'d'})],async()=>reply({job:{videoUrl:'http://local/movie.mp4',connectorStatus:'ComfyUI H3 已完成'}}));await a.clear();
  assert.equal(a.D.jobs.length,0);assert.equal(a.D.generations[0].videoUrl,'http://local/movie.mp4');assert.equal(a.D.shots[0].status,'待制作');assert.match(a.D.generations[0].status,/历史/);assert.equal(a.requests(),1);
});
test('clear respects review deletion and keeps valid result provenance',async()=>{
 for(const deleted of [true,false]){
  const a=app([job('done',{videoUrl:'movie.mp4'})]);
  const key=await require('./film-source-sync').fingerprint(a.D.shots[0],a.D);a.D.jobs[0].sourceFingerprint=key;
  if(deleted)a.D.deletedGenerationResults=[{projectId:'p1',jobId:'done',videoUrl:'movie.mp4'}];
  await a.clear();assert.equal(a.D.generations.length,deleted?0:1);assert.equal(a.D.shots[0].status,deleted?'待制作':'待审核');
  if(!deleted)assert.equal(a.D.generations[0].sourceFingerprint,key);
 }
});
test('old pending review cannot restore current shot readiness during clear',async()=>{
 const a=app([job('one')]);a.D.generations=[{id:'old',projectId:'p1',shot:'one',status:'待审核'}];
 await a.clear();assert.equal(a.D.shots[0].status,'待制作');assert.equal(a.D.generations.length,1);
});
test('edits during clear provenance checks prevent a stale local overwrite',async()=>{
 const a=app([job('one',{videoUrl:'movie.mp4'})]);a.context.ResultGuard={matches:async()=>{a.D.shots[0].prompt='new';return true}};
 await a.clear();assert.equal(a.D.jobs.length,1);assert.equal(a.D.generations.length,0);assert.equal(a.D.shots[0].prompt,'new');assert.match(vm.runInContext("renderQueueMessages.get('p1')",a.context),/数据发生变化/);
});
test('confirmation and storage failure preserve records; in-flight tasks are detached',async()=>{
  const a=app([job('one')]);a.context.confirm=()=>false;await a.clear();assert.equal(a.D.jobs.length,1);
  a.context.confirm=()=>true;a.context.dispatchingJobs.add('one');await a.clear();assert.equal(a.D.jobs.length,0);assert.equal(a.D.detachedRenderJobs[0].id,'one');a.D.jobs.push(job('one'));a.D.shots[0].status='等待 Worker';
  a.context.dispatchingJobs.clear();a.context.localStorage.setItem=()=>{throw Error('quota')};await a.clear();assert.equal(a.D.jobs.length,1);assert.equal(a.D.shots[0].status,'等待 Worker');
});
