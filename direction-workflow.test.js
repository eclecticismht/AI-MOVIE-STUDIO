const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatePlan}=require('./film-api'),{compile}=require('./shot-prompt');
test('tail-frame speech requires an explicit position and keeps offscreen speech possible',()=>{
 const base={duration:4,width:864,height:480,prompt:'Room',references:[],dialogueEvents:[]};
 const p={projectId:'p',title:'t',shots:[{...base,shotId:'a'},{...base,shotId:'b',continueFromShotId:'a',dialogueEvents:[{type:'speech',speakerId:'x',speakerName:'西门清',text:'好。',delivery:'onscreen'}]}]};
 assert.throws(()=>validatePlan(p),/发声者/);p.shots[1].continuitySpeakerPosition='left';assert.equal(validatePlan(p).shots[1].continuitySpeakerPosition,'left');
 delete p.shots[1].continuitySpeakerPosition;p.shots[1].dialogueEvents[0].delivery='offscreen';assert.doesNotThrow(()=>validatePlan(p));
});
test('shot sounds and separate identities survive structured H3 compilation',()=>{
 const shot={dur:4,continueFromShotId:'a',characterPositions:{a:'right',b:'left'},soundscape:'Footsteps and traffic.',prompt:'integrated_multimodal_description: Two people.\noverall_soundscape: Old sound.\nnon_diegetic_music: N/A'};
 const refs=[{assetId:'a',kind:'characters',name:'清'},{assetId:'b',kind:'characters',name:'服务员'}];
 const p=compile(shot,{},refs);assert.match(p,/清: right/);assert.match(p,/服务员: left/);assert.match(p,/Footsteps and traffic/);assert.doesNotMatch(p,/Old sound|No speech or narration/);
 delete shot.soundscape;assert.match(compile(shot,{},refs),/Old sound/);
});
test('overlay allows spoken dialogue but requires a valid local sound asset',()=>{
 const {validate}=require('./shot-audio'),events=[{type:'speech'}];
 assert.equal(validate('overlay',events,'ams-audio-'+'a'.repeat(64)+'.wav'),'overlay');
 assert.throws(()=>validate('overlay',events));assert.throws(()=>validate('replacement',events));
});
test('first frame generation respects reversed character staging and preserves mapping',()=>{
 const {validatePlan,buildGraph}=require('./local-first-frame');
 const references=[{assetId:'a',kind:'characters',name:'A',position:'right',file:'ams-ref-'+'a'.repeat(64)+'.png'},{assetId:'b',kind:'characters',name:'B',position:'left',file:'ams-ref-'+'b'.repeat(64)+'.png'}];
 const p=validatePlan({projectId:'p',shotId:'s',prompt:'Two people.',references});const prompt=buildGraph(p,0,null,'s')['11'].inputs.prompt;
 assert.match(prompt,/A at the viewer’s right and B at the viewer’s left/);
 assert.throws(()=>require('./reference-assets').validateReferences([{...references[0],position:'invalid'}]));
});
