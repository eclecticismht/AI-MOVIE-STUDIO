const {test}=require('node:test'),assert=require('node:assert/strict');
const {batchRetryPlan}=require('./film-api');
test('batch revisions invalidate selected shots once and retain unaffected footage',()=>{
 const shots=Array.from({length:4},(_,i)=>({shotId:'s'+i,duration:4,width:864,height:480,prompt:'A quiet scene.',dialogueEvents:[],subtitle:'',ready:true,speechCheck:{status:'text_match'}}));
 const parent={id:'parent',projectId:'p',title:'t',status:'paused',qualityGate:true,deferQualityReview:true,shots};
 const entries=[1,3].map(index=>({index,revision:{prompt:'Updated action.',subtitle:'',duration:5}}));
 const child=batchRetryPlan(parent,entries);
 assert.deepEqual(child.retriedShots,[2,4]);assert.deepEqual(child.shots.map(s=>s.ready),[true,false,true,false]);assert.equal(child.parentRunId,'parent');assert.equal(child.deferQualityReview,true);
 assert.equal(parent.shots[1].duration,4);assert.equal(child.shots[1].speechCheck,undefined);
 assert.throws(()=>batchRetryPlan(parent,[entries[0],entries[0]]),/重复/);assert.throws(()=>batchRetryPlan(parent,[{index:9}]),/有效/);
});
test('batch screen revisions preserve the selected asset and reject oral screen replacements',()=>{
 const ref={assetId:'screen',kind:'props',name:'screen',file:'ams-ref-'+'a'.repeat(64)+'.png'};
 const parent={id:'parent',projectId:'p',title:'t',status:'paused',shots:[{shotId:'s',duration:4,width:864,height:480,prompt:'screen',subtitle:'',dialogueEvents:[],references:[ref],ready:true,sourceExcerpt:'screen'}]};
 const revision={prompt:'screen',subtitle:'',duration:4,renderMode:'screen',screenAssetId:'screen',screenSource:'image',screenImagePercent:52,screenCards:[],firstFrame:null};
 const child=batchRetryPlan(parent,[{index:0,revision}]);
 assert.equal(child.shots[0].renderMode,'screen');assert.equal(child.shots[0].screenImagePercent,52);assert.equal(parent.shots[0].renderMode,undefined);
 assert.throws(()=>batchRetryPlan(parent,[{index:0,revision:{...revision,screenAssetId:'missing'}}]),/屏幕道具/);
 assert.throws(()=>batchRetryPlan(parent,[{index:0,revision:{...revision,firstFrame:{file:ref.file}}}]),/首帧/);
 const file='ams-ref-'+'b'.repeat(64)+'.png';
 const corrected=batchRetryPlan(parent,[{index:0,revision:{...revision,screenReferenceFile:file}}]);
 assert.equal(corrected.shots[0].references[0].file,file);assert.equal(parent.shots[0].references[0].file,ref.file);
 assert.throws(()=>batchRetryPlan(parent,[{index:0,revision:{...revision,screenReferenceFile:'../other.png'}}]),/参考图/);
 assert.throws(()=>batchRetryPlan(parent,[{index:0,revision:{...revision,screenSource:'text',screenReferenceFile:file}}]),/屏幕原图/);
});
