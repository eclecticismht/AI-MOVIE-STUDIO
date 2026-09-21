const {test}=require('node:test'),assert=require('node:assert/strict');
const {pendingQuality,holdBeforeAssembly}=require('./film-pending-quality');
test('deferred review never marks failed speech as passed and blocks final assembly',()=>{
 const failed={status:'needs_review',expected:'工期',actual:'公鸡'};
 const run={qualityGate:true,deferQualityReview:true,status:'rendering',shots:[{ready:true,shotId:'a',speechCheck:{status:'text_match'}},{ready:true,shotId:'b',speechCheck:failed},{ready:true,shotId:'c',speechCheck:{status:'check_failed'}}]};
 assert.deepEqual(pendingQuality(run).map(x=>x.index),[2,3]);
 assert.equal(holdBeforeAssembly(run),true);assert.equal(run.status,'paused');assert.equal(run.qualityHold.index,2);assert.equal(run.shots[1].speechCheck,failed);assert.equal(failed.review,undefined);
 run.shots[1].speechCheck={status:'text_match'};run.shots[2].speechCheck={status:'not_applicable'};
 assert.equal(holdBeforeAssembly(run),false);
});
test('pending review excludes unfinished shots but includes missing checks on ready footage',()=>{
 const run={qualityGate:true,shots:[{shotId:'a',ready:false},{shotId:'b',ready:true}]};assert.deepEqual(pendingQuality(run).map(x=>x.index),[2]);
 run.qualityGate=false;assert.deepEqual(pendingQuality(run),[]);
});
test('an active check is not shown as a failure but still cannot pass the assembly gate',()=>{
 const {visiblePendingQuality}=require('./film-pending-quality');
 const run={qualityGate:true,status:'rendering',current:{index:1,stage:'本地核对本镜实际声音'},shots:[{shotId:'a',ready:true}]};
 assert.deepEqual(visiblePendingQuality(run),[]);
 assert.equal(pendingQuality(run).length,1);
 run.shots.push({shotId:'b',ready:true,audioMode:'replacement'});
 assert.deepEqual(visiblePendingQuality(run),[]);
 assert.equal(holdBeforeAssembly(run),true);
 assert.equal(visiblePendingQuality(run).length,2);
 run.status='rendering';run.current={index:1,stage:'本地核对本镜实际声音'};run.shots[0].speechCheck={status:'check_failed',reason:'failed'};
 assert.equal(visiblePendingQuality(run).length,1);
});
