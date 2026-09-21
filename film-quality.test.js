const {test}=require('node:test'),assert=require('node:assert/strict');
const Quality=require('./film-quality'),{retryPlan}=require('./film-api');
const speech={type:'speech',speakerId:'sun',speakerName:'孙嘉俊',delivery:'phone',text:'喂，陈实。借我两千块钱。'};
const shot=()=>({shotId:'s',duration:12,width:864,height:480,prompt:'Hands hold the phone.',dialogueEvents:[speech],audioMode:'model',ready:true});
test('single-shot recheck keeps history, excludes concurrent actions and never starts rendering',async()=>{
 const s=shot();s.speechCheck={status:'needs_review',actual:'喂'};
 const run={shots:[s,{ready:false}],status:'paused'};Quality.holdForReview(run,0,s.speechCheck);
 let finish;const task=Quality.recheckHeldShot(run,'original.mp4',()=>new Promise(resolve=>finish=resolve));
 await assert.rejects(Quality.recheckHeldShot(run,'original.mp4'),/正在/);
 assert.throws(()=>Quality.acceptReview(run,'确认实际正确'),/正在/);
 finish({segments:[{text:speech.text,start:0,end:7}]});await task;
 assert.equal(s.speechCheckHistory[0].result.actual,'喂');assert.equal(s.speechCheck.status,'text_match');
 assert.equal(s.speechCheck.speakerIdentity,'not_verified');assert.equal(run.status,'paused');assert.equal(run.shots[1].ready,false);
 assert.equal(run.qualityHold,undefined);assert.equal(run.rechecking,undefined);
});
test('failed single-shot recheck remains held and preserves original evidence',async()=>{
 const s=shot();s.speechCheck={status:'needs_review',actual:'旧结果'};const run={shots:[s]};Quality.holdForReview(run,0,s.speechCheck);
 await Quality.recheckHeldShot(run,'original.mp4',async()=>{throw Error('识别服务失败')});
 assert.equal(run.qualityHold.result.status,'check_failed');assert.equal(s.speechCheckHistory[0].result.actual,'旧结果');assert.equal(run.rechecking,undefined);
});
test('incomplete phone speech holds production and does not rewrite the script',async()=>{
 const s=shot(),result=await Quality.checkShot(s,'source.mp4','medium',async()=>({segments:[{text:'喂，陈实。'}]}));
 assert.equal(result.status,'needs_review');assert.equal(Quality.passed(result),false);
 const run={status:'rendering',shots:[s,{shotId:'next',ready:false}]};s.speechCheck=result;Quality.holdForReview(run,0,result);
 assert.equal(run.status,'paused');assert.equal(run.shots[1].ready,false);assert.equal(s.ready,true);assert.equal(s.dialogueEvents[0].text,speech.text);
 assert.throws(()=>Quality.acceptReview(run,''),/填写/);
 Quality.acceptReview(run,'实际试听内容完整，识别漏句');assert.equal(Quality.passed(s.speechCheck),true);assert.equal(run.qualityHold,undefined);
});
test('unexpected speech in a silent message shot is held; recognition failure cannot be approved',async()=>{
 const silent={...shot(),dialogueEvents:[{type:'screen',text:'再转五百呗'}]};
 assert.equal((await Quality.checkShot(silent,'source.mp4','medium',async()=>({segments:[{text:'再转五百呗'}]}))).status,'needs_review');
 silent.speechCheck=await Quality.checkShot(silent,'source.mp4','medium',async()=>{throw Error('ASR unavailable')});
 const run={shots:[silent]};Quality.holdForReview(run,0,silent.speechCheck);assert.equal(silent.speechCheck.status,'check_failed');assert.throws(()=>Quality.acceptReview(run,'试听没有问题'),/检查失败/);
});
test('paused partial-film retry reuses finished clips and invalidates dependent quality results',()=>{
 const first={...shot(),speechCheck:{status:'needs_review'}},second={...shot(),shotId:'s2',dialogueEvents:[],continueFromShotId:'s',speechCheck:{status:'text_match'}},third={...shot(),shotId:'s3',ready:false};
 const parent={id:'old',projectId:'p',title:'test',status:'paused',qualityGate:true,shots:[first,second,third]};
 const child=retryPlan(parent,0);assert.equal(child.qualityGate,true);assert.equal(child.shots[0].speechCheck,undefined);assert.equal(child.shots[1].speechCheck,undefined);assert.equal(child.shots[1].ready,false);assert.equal(child.shots[2].ready,false);assert.equal(parent.shots[0].ready,true);
});
test('correct text and deliberate silent composition are distinct results',async()=>{
 const result=await Quality.checkShot(shot(),'source.mp4','medium',async()=>({segments:[{text:speech.text,start:0,end:7}]}));assert.equal(Quality.passed(result),true);assert.equal(result.speakerIdentity,'not_verified');
 let called=false;const skipped=await Quality.checkShot({...shot(),dialogueEvents:[],audioMode:'mute'},'source.mp4','medium',async()=>{called=true});assert.equal(called,false);assert.equal(skipped.status,'not_applicable');
});
