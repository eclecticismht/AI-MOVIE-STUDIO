const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('./shot-audio');
const {validatePlan,recomposePlan}=require('./film-api');
test('revision applies edited sound atomically and distinguishes unmade shots from redo scope',()=>{
 const {retryPlan}=require('./film-api');
 const s={shotId:'one',duration:4,width:864,height:480,prompt:'Quiet room',dialogueEvents:[],subtitle:'',ready:true};
 const parent={id:'old',projectId:'p',title:'t',status:'paused',shots:[s,{...s,shotId:'two',continueFromShotId:'one',speechCheckHistory:[{}]},{...s,shotId:'three',ready:false}]};
 const child=retryPlan(parent,0,{prompt:'Still room',subtitle:'',duration:5,audioMode:'mute'});
 assert.equal(child.shots[0].audioMode,'mute');assert.equal(child.shots[0].duration,5);
 assert.deepEqual(child.retriedShots,[1,2]);assert.equal(child.shots[2].ready,false);assert.equal(child.shots[1].speechCheckHistory,undefined);
 assert.equal(parent.shots[0].audioMode,undefined);assert.equal(parent.shots[1].speechCheckHistory.length,1);
 assert.throws(()=>retryPlan(parent,0,{prompt:'Still',subtitle:'',duration:5,audioMode:'replacement',audioAsset:'missing'}));
});
test('revision cannot mute spoken dialogue, even when prompt and duration are valid',()=>{
 const {retryPlan}=require('./film-api'),e={type:'speech',speakerId:'c',speakerName:'陈实',delivery:'onscreen',text:'快了。'};
 const parent={projectId:'p',title:'t',status:'paused',shots:[{shotId:'one',duration:4,width:864,height:480,prompt:'Man talking',dialogueEvents:[e],sourceExcerpt:'陈实：快了。'}]};
 assert.throws(()=>retryPlan(parent,0,{prompt:'Man talking',subtitle:'陈实：快了。',duration:4,audioMode:'mute'}),/没有口头对白/);
});
test('paused sound repair retains completed footage and continues missing shots with quality gates',()=>{
 const ready={shotId:'one',ready:true,dialogueEvents:[],speechCheck:{status:'needs_review'},jobId:'old'};
 const parent={id:'old',projectId:'p',title:'t',status:'paused',qualityGate:true,qualityHold:{index:1},shots:[ready,{shotId:'two',ready:false,dialogueEvents:[]}]};
 const child=recomposePlan(parent,[{shotId:'one',audioMode:'mute'}]);
 assert.equal(child.compositionOnly,false);assert.equal(child.qualityGate,true);assert.equal(child.shots[0].jobId,'old');assert.equal(child.shots[0].ready,true);assert.equal(child.shots[1].ready,false);assert.equal(child.shots[0].speechCheck,undefined);assert.equal(parent.shots[0].speechCheck.status,'needs_review');
 assert.throws(()=>recomposePlan(parent,[{shotId:'two',audioMode:'mute'}]),/已生成/);
 assert.throws(()=>recomposePlan(parent,[{shotId:'one',screenCards:[]}]),/声音/);
});
test('mute is explicit and cannot erase expected or unknown dialogue',()=>{
 assert.equal(validate(undefined,undefined),'model');assert.equal(validate('mute',[]),'mute');
 assert.throws(()=>validate('mute',undefined));assert.throws(()=>validate('mute',[{type:'speech'}]));assert.throws(()=>validate('other',[]));
});
test('replacement needs a valid asset and cannot replace spoken dialogue',()=>{
 const asset='ams-audio-'+'a'.repeat(64)+'.wav';
 assert.equal(validate('replacement',[],asset),'replacement');
 assert.throws(()=>validate('replacement',[]));assert.throws(()=>validate('replacement',[],'../../x.wav'));
 assert.throws(()=>validate('replacement',[{type:'speech'}],asset));
});
test('audio composition preserves original clips, screen cards and parent state',()=>{
 const shot={shotId:'s',duration:4,width:864,height:480,prompt:'Quiet room',dialogueEvents:[],screenCards:[],ready:true};
 assert.equal(validatePlan({projectId:'p',title:'t',shots:[{...shot,audioMode:'mute'}]}).shots[0].audioMode,'mute');
 const parent={id:'film_0000000000000000',projectId:'p',title:'t',status:'complete',shots:[shot]};
 const child=recomposePlan(parent,[{shotId:'s',audioMode:'mute'}]);
 assert.equal(child.compositionOnly,true);assert.equal(child.shots[0].ready,true);assert.equal(child.shots[0].audioMode,'mute');assert.equal(parent.shots[0].audioMode,undefined);assert.deepEqual(child.shots[0].screenCards,[]);
 assert.equal(recomposePlan({...child,status:'complete'},[{shotId:'s',audioMode:'model'}]).shots[0].audioMode,'model');
 assert.throws(()=>recomposePlan({...parent,shots:[{...shot,renderMode:'black'}]},[{shotId:'s',audioMode:'replacement',audioAsset:'ams-audio-'+'a'.repeat(64)+'.wav'}]),/纯黑/);
});
