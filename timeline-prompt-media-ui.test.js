const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(){
 const shot={id:'s',projectId:'p',storyboardBatchId:'b',dur:5,sequence:1},data={projects:[{id:'p'}],activeProjectId:'p',shots:[shot],generations:[{id:'old',videoUrl:'old.mp4'}]};let stored=JSON.stringify(data);
 const context=vm.createContext({D:structuredClone(data),TL:{},CUT:{},editingShotId:null,structuredClone,shotReferenceAssets:()=>[],requireShotReferenceImages:()=>[],timelinePromptRender(){},TimelinePromptMedia:require('./timeline-prompt-media'),TimelineEdit:require('./timeline-edit'),FilmSourceSync:require('./film-source-sync'),timelinePromptDrafts:new Map(),timelinePromptKey:s=>s.id,document:{activeElement:null,getElementById:()=>null},localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},cutProbeDuration:async()=>1.25,uid:()=> 'new',cutClear(){},tlRender(){},tlMessage(){}});
 vm.runInContext(fs.readFileSync('timeline-prompt-media-ui.js','utf8'),context);context.shot=shot;return {context,get:()=>JSON.parse(stored)};
}
test('direct clip import preserves old versions, uses real duration, and pins imported video',async()=>{
 const h=harness();await vm.runInContext("timelineImportClip(shot,'/assets/imported/asset-"+'a'.repeat(64)+".mp4','clip.mp4')",h.context);
 const data=h.get();assert.equal(data.generations.length,2);assert.equal(data.generations[0].videoUrl,'old.mp4');assert.equal(data.generations[1].status,'待审核');assert.equal(data.projects[0].timelineEdits.b.clips.s.trimOut,1.25);assert.equal(data.projects[0].timelineEdits.b.clips.s.versionId,'new');
});
test('saved first frame reaches source and marks shot for regeneration',()=>{
 const h=harness();vm.runInContext("timelineSaveFrame(shot,'/assets/imported/frame.png','left')",h.context);const s=h.get().shots[0];assert.equal(s.firstFrameUrl,'/assets/imported/frame.png');assert.equal(s.firstFrameSpeakerPosition,'left');assert.equal(s.status,'需重做');assert.equal(h.get().generations[0].videoUrl,'old.mp4');
});
