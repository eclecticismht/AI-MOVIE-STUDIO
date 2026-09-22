const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatePlan,retryPlan}=require('./film-api');
const base={duration:4,width:864,height:480,prompt:'A quiet room.',dialogueEvents:[],references:[],subtitle:''};
const plan=()=>({projectId:'p',title:'continuity',shots:[{...base,shotId:'a'},{...base,shotId:'b',continueFromShotId:'a'},{...base,shotId:'c',continueFromShotId:'b'},{...base,shotId:'d'}]});
test('continuation preserves dependency and rejects missing, reordered or incompatible sources',()=>{
 assert.equal(validatePlan(plan()).shots[1].continueFromShotId,'a');
 for(const mutate of [p=>p.shots.shift(),p=>p.shots[1].continueFromShotId='c',p=>p.shots[1].firstFrame={file:'ams-ref-'+ 'a'.repeat(64)+'.png'},p=>p.shots[0].renderMode='black',p=>p.shots[1].width=640,p=>p.shots[1].dialogueEvents=[{type:'speech',speakerId:'c',speakerName:'陈实',delivery:'onscreen',text:'好。'}]]){const p=plan();mutate(p);assert.throws(()=>validatePlan(p));}
});
test('retry invalidates the entire dependent chain, preserves unrelated clips and original',()=>{
 const p={...validatePlan(plan()),id:'film_0000000000000000',status:'complete'};
 p.shots.forEach(s=>Object.assign(s,{ready:true,jobId:'old',videoUrl:'old',continuityFrame:{file:'old'},subtitleTiming:{status:'aligned'},renderAttempt:2}));
 const child=retryPlan(p,0);
 assert.deepEqual(child.shots.map(s=>s.ready),[false,false,false,true]);
 assert.deepEqual(child.retriedShots,[1,2,3]);
 for(const s of child.shots.slice(0,3))for(const k of ['jobId','videoUrl','continuityFrame','subtitleTiming','renderAttempt'])assert.equal(s[k],undefined);
 assert.equal(p.shots[1].ready,true);assert.deepEqual(child.shots[3],p.shots[3]);
 const middle=retryPlan(p,1);assert.deepEqual(middle.shots.map(s=>s.ready),[true,false,false,true]);assert.equal(middle.shots[1].continueFromShotId,'a');
});
test('continuation rejects changed asset images or identities, but allows new action notes',()=>{
 const ref={assetId:'c',kind:'characters',name:'陈实',file:'ams-ref-'+ 'a'.repeat(64)+'.png'},p=plan();p.shots.forEach(s=>s.references=[{...ref}]);
 p.shots[1].references[0].notes='He reaches into his pocket.';assert.doesNotThrow(()=>validatePlan(p));
 p.shots[1].references[0].file='ams-ref-'+ 'b'.repeat(64)+'.png';assert.throws(()=>validatePlan(p),/参考资产或图片/);
 p.shots[1].references[0]={...ref,assetId:'other'};assert.throws(()=>validatePlan(p),/参考资产或图片/);
});
