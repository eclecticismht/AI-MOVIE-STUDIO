const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(fail=false){
 const shot={id:'s',projectId:'p',storyboardBatchId:'b',sequence:1,dur:5,prompt:'old'},data={activeProjectId:'p',projects:[{id:'p',name:'Test'}],shots:[shot],generations:[{id:'old',videoUrl:'old.mp4'}]};
 let stored=JSON.stringify(data),submitted=null,closed=false;
 const prompt='integrated_multimodal_description: Park on the left.\noverall_soundscape: Traffic only.\nnon_diegetic_music: N/A';
 const nodes={textarea:{value:'靠左停车'},'#timelineRedoStatus':{},'#timelineRedoSubmit':{},'#timelineRedoCancel':{}},dialog={querySelector:k=>nodes[k],close:()=>closed=true};
 const context=vm.createContext({D:structuredClone(data),TL:{},TimelineRedo:require('./timeline-redo'),FilmSourceSync:require('./film-source-sync'),structuredClone,AbortSignal,console,
  localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},tlPreview(){},tlRender(){},tlMessage(){},textAIHeaders:()=>({}),compileH3Prompt:s=>s.prompt,
  workflowPreflight:async()=>{},h3JobSettings:()=>({width:864,height:480}),shotHasActiveJob:()=>false,requireShotReferenceImages(){},prepareShotReferences:async()=>[],prepareShotFirstFrame:async()=>undefined,shotDialogueEvents:()=>[],ScreenCards:{fromShot:()=>[]},timelinePromptDrafts:new Map(),timelinePromptKey:s=>s.id,filmRuns:[],
  fetch:async(url,options)=>{if(!options)return {ok:true,json:async()=>({runs:[]})};if(url==='/api/screenplay/shot-revision')return {ok:!fail,json:async()=>fail?{error:'AI failed'}:{revision:{script:'靠左停车',visual:'车在左侧',camera:'中景',scene:'街道',dialogue:'',dur:5,prompt,audioMode:'model',assetStates:{},summary:'车辆移到左侧'}}};submitted=JSON.parse(options.body);return {ok:true,json:async()=>({run:{id:'new'}})}}
 });
 vm.runInContext(fs.readFileSync('timeline-redo-ui.js','utf8'),context);context.dialog=dialog;context.shot=shot;
 vm.runInContext('timelineRedoState={shot,expected:JSON.stringify(shot),dialog};',context);
 return {context,result:()=>({stored:JSON.parse(stored),submitted,closed,nodes})};
}
test('natural-language redo submits a new plan with saved fingerprint and preserves old video',async()=>{
 const harness=setup();await vm.runInContext('timelineSubmitRedo()',harness.context);const result=harness.result();
 assert.ok(result.closed,result.nodes['#timelineRedoStatus'].textContent);assert.match(result.submitted.shots[0].prompt,/Park on the left/);assert.equal(result.stored.generations[0].videoUrl,'old.mp4');
 assert.equal(result.submitted.shots[0].sourceFingerprint,await require('./film-source-sync').fingerprint(result.stored.shots[0],result.stored));
});
test('AI failure leaves source and old video untouched and retains request',async()=>{
 const harness=setup(true);await vm.runInContext('timelineSubmitRedo()',harness.context);const result=harness.result();assert.equal(result.submitted,null);assert.equal(result.stored.shots[0].prompt,'old');assert.equal(result.nodes.textarea.value,'靠左停车');assert.equal(result.closed,false);
});
test('save-only redo applies AI edits without requiring a renderer or submitting video',async()=>{
 const h=setup();h.context.workflowPreflight=()=>{throw Error('must not render')};await vm.runInContext('timelineSubmitRedo(true)',h.context);const result=h.result();
 assert.equal(result.closed,true);assert.equal(result.submitted,null);assert.equal(result.stored.shots[0].script,'靠左停车');assert.equal(result.stored.shots[0].redoHistory.length,1);
});
test('redo button is available for a selected shot without any video',()=>{
 const actions={querySelector:id=>buttons[id]},buttons={'#timelineAccept':{},'#timelineRedo':{}};
 const c=vm.createContext({TL:{busy:false},document:{getElementById:id=>id==='timelinePreviewActions'?actions:{}},tlCurrent:()=>({shot:{id:'s'}}),tlMedia:()=>null,tlPreview(){}});
 vm.runInContext(fs.readFileSync('timeline-redo-ui.js','utf8'),c);vm.runInContext('timelinePreviewActions()',c);
 assert.equal(buttons['#timelineRedo'].disabled,false);assert.equal(buttons['#timelineAccept'].disabled,true);
});
