const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatePlan,makeAss}=require('./film-api'),{screenImageFilter}=require('./screen-shot');
const ref={assetId:'feed',kind:'props',name:'朋友圈',file:'ams-ref-'+ 'a'.repeat(64)+'.png'};
const shot={shotId:'s',renderMode:'screen',screenAssetId:'feed',screenImagePercent:52,prompt:'Exact asset insert.',duration:12,width:864,height:480,references:[ref],dialogueEvents:[{type:'screen',text:'今晚聚聚'}],subtitle:'今晚聚聚'};
test('screen inserts require a selected bound prop and preserve exact crop and image',()=>{
 const valid=validatePlan({projectId:'p',title:'test',shots:[shot]}).shots[0];assert.equal(valid.renderMode,'screen');assert.equal(valid.screenImagePercent,52);assert.equal(valid.references[0].file,ref.file);
 for(const change of [{screenAssetId:'other'},{screenImagePercent:101},{screenImagePercent:NaN},{firstFrame:{file:ref.file}},{dialogueEvents:[{type:'speech',speakerId:'sun',speakerName:'孙',delivery:'phone',text:'你好'}]}])assert.throws(()=>validatePlan({projectId:'p',title:'test',shots:[{...shot,...change}]}));
 assert.match(screenImageFilter(52),/ih\*0.52/);assert.throws(()=>screenImageFilter('52;movie=bad'),/无效/);
});
test('screen inserts do not cover source photos with duplicate generated text',()=>{
 const ass=makeAss([shot,{...shot,shotId:'black',renderMode:'black',dialogueEvents:[],subtitle:''}]);assert.doesNotMatch(ass,/今晚聚聚/);
});
test('typing insert keeps animated deletion in its local text viewport',()=>{
 const source='好\n我这个月真没了',s={...shot,screenSource:'text',sourceExcerpt:source,screenCards:[{title:'输入草稿（未发送）',text:source,effect:'type-delete'}]};
 const valid=validatePlan({projectId:'p',title:'t',shots:[s]}).shots[0];assert.equal(valid.screenImagePercent,100);
 const ass=makeAss([valid]);assert.match(ass,/pos\(180,300\)/);assert.doesNotMatch(ass,/输入草稿（未发送）/);assert.match(ass,/我这个月真没了/);
});
