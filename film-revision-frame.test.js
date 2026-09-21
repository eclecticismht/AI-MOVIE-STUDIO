const {test}=require('node:test'),assert=require('node:assert/strict');
const {retryPlan}=require('./film-api');
test('revision frame replacement validates speaker position and preserves original',()=>{
const event={type:'speech',speakerId:'liu',speakerName:'刘头儿',delivery:'onscreen',text:'快一点啊！'};
const shot={shotId:'s',duration:5,width:864,height:480,prompt:'Man speaks.',subtitle:'刘头儿：快一点啊！',sourceExcerpt:'刘头儿：快一点啊！',dialogueEvents:[event],ready:true};
const parent={id:'old',projectId:'p',title:'t',status:'paused',shots:[shot],qualityGate:true};
const revision={prompt:shot.prompt,subtitle:shot.subtitle,duration:5,firstFrame:{file:'ams-ref-'+'a'.repeat(64)+'.png',speakerPosition:'center'}};
const child=retryPlan(parent,0,revision);assert.equal(child.shots[0].firstFrame.file,revision.firstFrame.file);assert.equal(parent.shots[0].firstFrame,undefined);assert.equal(child.shots[0].ready,false);
delete revision.firstFrame.speakerPosition;assert.throws(()=>retryPlan(parent,0,revision),/位置/);
});
