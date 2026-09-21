const {test}=require('node:test'),assert=require('node:assert/strict');
const {split,replace}=require('./dialogue-action-split');
const chars=[{id:'c',name:'陈实'}];
const source={id:'old',projectId:'p',storyboardBatchId:'b',sequence:2,dur:8,dialogue:'陈实：快了。',sourceExcerpt:'陈实：快了。',assetStates:{c:{description:'白袖'}},characterIds:['c'],firstFrameUrl:'/old.png',firstFrameProvenance:{old:true},filmPrompt:'old',audioAsset:'old',videoUrl:'old',dialogueEvents:[{old:true}]};
const options={before:{action:'陈实说话，双手保持不动',visual:'中景，陈实坐着',duration:8},after:{action:'陈实站起来',visual:'陈实起身',duration:4}};
test('two stages keep exact dialogue once, preserve assets independently, and clear stale outputs',()=>{
 const result=split(source,options,chars,['a','b']);const [a,b]=result.children;
 assert.equal(result.totalSeconds,12);assert.equal(a.dialogue,source.dialogue);assert.equal(b.dialogue,'');assert.equal(b.continueFromShotId,'a');
 for(const s of [a,b])for(const key of ['firstFrameUrl','firstFrameProvenance','filmPrompt','audioAsset','videoUrl','dialogueEvents'])assert.equal(s[key],undefined);
 b.assetStates.c.description='changed';assert.equal(a.assetStates.c.description,'白袖');assert.equal(source.assetStates.c.description,'白袖');assert.equal(source.autoArchived,undefined);
});
test('split rejects mixed written events, ungrounded or oversized dialogue and invalid durations',()=>{
 for(const s of [{...source,dialogue:''},{...source,dialogue:'陈实：不借。'},{...source,dialogue:'陈实：快了。\n屏幕文字：余额'},{...source,assetStates:{c:{screenText:'余额'}}},{...source,continueFromShotId:'earlier'},{...source,renderMode:'black'}])assert.throws(()=>split(s,options,chars,['a','b']));
 assert.throws(()=>split(source,{...options,after:{...options.after,duration:3}},chars,['a','b']));
 assert.throws(()=>split(source,options,chars,['old','b']));
 const long={...source,dialogue:'陈实：'+ '很长的台词'.repeat(10),sourceExcerpt:''};assert.throws(()=>split(long,options,chars,['a','b']),/台词过长/);
});
test('replacement respects sequence rather than storage order and rewires downstream continuation',()=>{
 const early={id:'first',projectId:'p',storyboardBatchId:'b',sequence:1},later={id:'last',projectId:'p',storyboardBatchId:'b',sequence:3,continueFromShotId:'old'},other={id:'other',projectId:'q',sequence:1};
 const next=replace([later,source,other,early],source,split(source,options,chars,['a','b']).children);
 assert.equal(next.find(s=>s.id==='old').autoArchived,true);assert.equal(next.find(s=>s.id==='last').continueFromShotId,'b');
 assert.deepEqual(next.filter(s=>s.projectId==='p'&&!s.autoArchived).sort((a,b)=>a.sequence-b.sequence).map(s=>s.id),['first','a','b','last']);assert.equal(next.find(s=>s.id==='other'),other);assert.equal(later.continueFromShotId,'old');
});
test('UI persistence failure leaves source and dependent shots untouched; confirmed frame gets a new valid provenance',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),FrameProvenance=require('./frame-provenance');
 const original=structuredClone(source);original.firstFrameProvenance=FrameProvenance.create(original,[],original.firstFrameUrl);original.firstFrameSpeakerPosition='left';
 const D={activeProjectId:'p',shots:[original],characters:chars.map(c=>({...c,projectId:'p'})),jobs:[]},output={},fields={split_keep_frame:{checked:true}};
 for(const phase of ['before','after'])for(const key of ['action','visual','duration'])fields[`split_${phase}_${key}`]={value:options[phase][key]};
 let fail=true,n=0;const ctx=vm.createContext({D,FrameProvenance,DialogueActionSplit:require('./dialogue-action-split'),shotReferenceAssets:()=>[],document:{querySelector:()=>output,getElementById:id=>fields[id]},localStorage:{setItem(){if(fail)throw Error('存储失败')}},uid:()=>`new${++n}`,editingShotId:'old',renderShots2(){}});
 vm.runInContext(fs.readFileSync('shot-split-ui.js','utf8'),ctx);vm.runInContext("splitDialogueAction('old')",ctx);
 assert.match(output.textContent,/存储失败/);assert.equal(D.shots.length,1);assert.equal(original.autoArchived,undefined);
 fail=false;vm.runInContext("splitDialogueAction('old')",ctx);assert.equal(D.shots.length,3);assert.equal(D.shots[1].firstFrameUrl,original.firstFrameUrl);assert.equal(D.shots[1].firstFrameSpeakerPosition,'left');assert.doesNotThrow(()=>FrameProvenance.validate(D.shots[1],[]));assert.equal(D.shots[2].firstFrameUrl,undefined);
});
