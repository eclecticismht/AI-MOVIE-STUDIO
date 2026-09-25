const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('./connector-recovery');
test('successful empty observations have a persistent grace period and a bounded terminal state',()=>{
 const j={id:'j'};R.missing(j,100);R.missing(j,200);assert.equal(j.recovery.status,'checking');
 const restored=JSON.parse(JSON.stringify(j));R.missing(restored,30100);assert.equal(restored.recovery.status,'missing');assert.equal(restored.recovery.since,100);
 R.found(restored);assert.equal(restored.recovery,undefined);R.missing(restored,40000);assert.equal(restored.recovery.status,'checking');
});
test('missing task pauses film without discarding completed shots or creating another GPU attempt',()=>{
 const run={status:'rendering',shots:[{ready:true},{ready:false}]},j={id:'j'};R.missing(j,0);assert.equal(R.hold(run,1,j),false);R.missing(j,15000);R.missing(j,30000);assert.equal(R.hold(run,1,j),true);assert.equal(run.status,'paused');assert.equal(run.shots[0].ready,true);assert.equal(run.shots[1].renderAttempt,undefined);
});
test('explicit resume recovers a late result or running task and only retries a still-missing task',async()=>{
 for(const state of [{videoUrl:'clip'}, {comfyPromptId:'late'}, {recovery:{status:'missing',checkedAt:30000}}]){
  const run={lostTask:{index:0,jobId:'j'},shots:[{jobId:'j'}]};let reads=0;
  await R.resume(run,async url=>{assert.equal(url,'/jobs/j/status');reads++;return {job:{id:'j',...state}}});
  assert.equal(reads,1);assert.equal(run.lostTask,undefined);assert.equal(run.shots[0].renderAttempt,state.recovery?1:undefined);if(state.recovery)assert.equal(run.shots[0].previousAttempts[0].jobId,'j');
 }
});
test('offline renderer and concurrent recovery cannot launch duplicate attempts',async()=>{
 const run={lostTask:{index:0,jobId:'j'},shots:[{}]};await assert.rejects(()=>R.resume(run,async()=>{throw Error('offline')}),/offline/);assert.ok(run.lostTask);assert.equal(run.shots[0].renderAttempt,undefined);
 let release;const one=R.resume(run,()=>new Promise(r=>release=r));await assert.rejects(()=>R.resume(run,async()=>{}),/正在查找/);release({job:{id:'j',recovery:{status:'missing'}}});await one;assert.equal(run.shots[0].renderAttempt,1);
});
