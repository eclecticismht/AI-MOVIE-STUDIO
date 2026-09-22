const {test}=require('node:test'),assert=require('node:assert/strict');
const {merge}=require('./film-preview-results');
const shot={shotId:'s',ready:true,jobId:'j',videoUrl:'video.mp4',sourceFingerprint:'original'};
test('automatic film exposes finished shots before movie completion without approving or changing sources',()=>{
 const data={shots:[{id:'s',projectId:'p',prompt:'edited'}],generations:[]},before=JSON.stringify(data);
 const result=merge(data,[{id:'r',projectId:'p',status:'rendering',shots:[shot,{...shot,shotId:'pending',ready:false}]}]);
 assert.equal(result.added,1);assert.equal(result.generations[0].sourceFingerprint,'original');assert.equal(result.generations[0].status,'待审核');assert.equal(JSON.stringify(data),before);
 assert.equal(merge({...data,generations:result.generations},[{id:'r',projectId:'p',shots:[shot]}]).added,0);
});
test('automatic film respects deleted results and project ownership',()=>{
 const data={shots:[{id:'s',projectId:'p'}],deletedGenerationResults:[{projectId:'p',jobId:'j',videoUrl:'video.mp4'}]};
 assert.equal(merge(data,[{id:'r',projectId:'p',shots:[shot]},{id:'q',projectId:'q',shots:[shot]}]).added,0);
 assert.equal(merge(data,[{id:'r2',projectId:'p',shots:[{...shot,jobId:'new'}]}]).added,1);
});
