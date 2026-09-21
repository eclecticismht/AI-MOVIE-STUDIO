const {test}=require('node:test'),assert=require('node:assert/strict'),{latestByProject}=require('./film-studio-summary');
test('studio shows actual active production instead of stale historical pauses or unrelated QA',()=>{
 const projects=[{id:'p'},{id:'q'}],runs=[{id:'old',projectId:'p',status:'paused',createdAt:'2026-01-01'},{id:'active',projectId:'p',status:'rendering',createdAt:'2026-01-02'},{id:'newer',projectId:'p',status:'complete',createdAt:'2026-01-03'},{id:'test',projectId:'qa',status:'rendering',createdAt:'2026-01-04'}];
 assert.deepEqual(latestByProject(runs,projects).map(x=>x.run.id),['active']);runs[1].status='complete';assert.deepEqual(latestByProject(runs,projects).map(x=>x.run.id),['newer']);
 assert.equal(runs[0].id,'old');
});
test('production ETA is explicitly sampling-only and withheld for stale or disconnected progress',()=>{
 const {progressText}=require('./film-studio-summary'),run={current:{index:46,stage:'运行中',progress:{phase:'sampling',value:12,max:25,etaSeconds:65,connected:true,updatedAt:10000}}};
 assert.match(progressText(run,11000),/第 46 镜.*预计还需 2 分钟.*不含解码/);
 assert.doesNotMatch(progressText(run,50000),/预计/);
 run.current.progress.connected=false;assert.doesNotMatch(progressText(run,11000),/预计/);
 run.current.progress.value=25;assert.match(progressText(run,11000),/等待解码和保存/);
});
