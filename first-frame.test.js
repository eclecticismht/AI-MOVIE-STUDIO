const {test}=require('node:test'),assert=require('node:assert/strict');
const {firstFramePrompt,validateFirstFrame}=require('./first-frame');
const {validatePlan}=require('./film-api');
test('first frame prompt removes reference sheet sections and preserves scene and sound',()=>{
 const out=firstFramePrompt('subject_definitions: ignored\n\ndetailed_description: [Shot 1] <Subject 2> looks down near <Picture 3>.\n\noverall_soundscape: Soft room tone.\n\nnon_diegetic_music: N/A');
 assert.match(out,/^For the target video/);assert.match(out,/looks down/);assert.match(out,/Soft room tone/);assert.doesNotMatch(out,/subject_definitions|<Subject|<Picture 3>/);
});
test('film plans preserve validated first frame and reject black-frame conflict',()=>{
 const firstFrame={file:'ams-ref-'+'b'.repeat(64)+'.png'},shot={shotId:'s',prompt:'Two students.',duration:4,width:864,height:480,firstFrame,dialogueEvents:[]};
 assert.deepEqual(validatePlan({projectId:'p',title:'t',shots:[shot]}).shots[0].firstFrame,firstFrame);
 assert.throws(()=>validateFirstFrame({file:'/private.png'}));
 assert.throws(()=>validatePlan({projectId:'p',title:'t',shots:[{...shot,renderMode:'black'}]}));
});
test('first-frame speech requires explicit visible speaker placement',()=>{
 const e={type:'speech',speakerId:'sun',speakerName:'孙嘉俊',delivery:'onscreen',text:'你好。'},s={shotId:'s',prompt:'Two people.',duration:4,width:864,height:480,firstFrame:{file:'ams-ref-'+'a'.repeat(64)+'.png'},dialogueEvents:[e]};
 assert.throws(()=>validatePlan({projectId:'p',title:'t',shots:[s]}),/位置/);
 assert.equal(validatePlan({projectId:'p',title:'t',shots:[{...s,firstFrame:{...s.firstFrame,speakerPosition:'right'}}]}).shots[0].firstFrame.speakerPosition,'right');
 const prompt=require('./dialogue-contract').bindDialogue(s.prompt,[e],4,[],'right');assert.match(prompt,/viewer’s right/);assert.match(prompt,/<d>\[Chinese\]你好。<\/d>/);
});
