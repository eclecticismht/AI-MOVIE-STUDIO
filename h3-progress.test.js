const {test}=require('node:test'),assert=require('node:assert/strict');
const {updateProgress}=require('./h3-progress');
test('step percentage is measured and ETA uses observed speed, not wall clock fiction',()=>{
  let p=updateProgress({}, {type:'execution_start'},1000);
  p=updateProgress(p,{type:'progress',data:{node:'5',value:1,max:25}},2000);
  assert.equal(p.percent,4);assert.equal(p.etaSeconds,null);
  p=updateProgress(p,{type:'progress',data:{node:'5',value:3,max:25}},18000);
  assert.equal(p.percent,12);assert.equal(p.etaSeconds,176);
  p=updateProgress(p,{type:'progress',data:{node:'5',value:1,max:25}},19000);
  assert.equal(p.etaSeconds,null);
  p=updateProgress(p,{type:'executing',data:{node:'7'}},20000);
  assert.equal(p.phase,'saving');assert.equal(p.etaSeconds,null);
});
