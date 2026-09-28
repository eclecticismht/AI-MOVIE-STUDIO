const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Contract=require('./performance-audio-contract');
function setup(){
 const shot={id:'s',projectId:'p',storyboardBatchId:'b',dur:4,dialogue:'西门清：今天换。',sourceExcerpt:'西门清：今天换。'},other={id:'other',projectId:'q'},D={activeProjectId:'p',projects:[{id:'p'},{id:'q'}],shots:[shot,other],characters:[{id:'xm',projectId:'p',name:'西门清'}],jobs:[],generations:[{id:'old',projectId:'p',shot:'s',videoUrl:'old.mp4'}]};
 let stored=JSON.stringify(D),release,message='';
 const context=vm.createContext({D,TL:{},editingShotId:null,PerformanceAudio:Contract,DialogueContract:require('./dialogue-contract'),FilmSourceSync:require('./film-source-sync'),AbortSignal,
  localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},tlCurrent:()=>({shot:D.shots[0]}),tlInspector(){},tlRender(){},tlMessage:m=>message=m,window:{addEventListener(){}},document:{getElementById:()=>null},
  fetch:async(url,options)=>{if(!options?.body)return {ok:true,json:async()=>({version:1,connectorReady:false})};const input=JSON.parse(options.body);await new Promise(r=>release=r);return {ok:true,json:async()=>({binding:{version:1,file:'ams-audio-'+'c'.repeat(64)+'.wav',sha256:'c'.repeat(64),duration:input.duration,frames:Contract.frames(input.duration),speechKey:Contract.speechKey(input.dialogueEvents)}})}}
 });
 vm.runInContext(fs.readFileSync('performance-audio-ui.js','utf8'),context);vm.runInContext("var draft=performanceAudioDraft(D.shots[0]);draft.file='ams-audio-'+ 'a'.repeat(64)+'.wav'",context);
 return {context,stored:()=>JSON.parse(stored),setStored:fn=>{const d=JSON.parse(stored);fn(d);stored=JSON.stringify(d)},release:()=>release(),message:()=>message};
}
test('saving binds verified speech, invalidates current picture and preserves old versions and other projects',async()=>{
 const h=setup(),run=vm.runInContext("performanceAudioSave('s')",h.context);h.setStored(d=>d.projects[1].name='new other project name');h.release();assert.equal(await run,true,h.message());
 const data=h.stored();assert.equal(data.projects[1].name,'new other project name');assert.equal(data.shots[0].performanceAudio.duration,4);assert.equal(data.shots[0].status,'需重做');assert.equal(data.generations[0].videoUrl,'old.mp4');assert.equal(data.jobs.length,0);
});
for(const change of ['shot','project','draft','unsaved'])test('save rejects an in-flight '+change+' change without overwriting it',async()=>{
 const h=setup(),run=vm.runInContext("performanceAudioSave('s')",h.context);
 if(change==='shot')h.setStored(d=>d.shots[0].dialogue='changed');if(change==='project')h.context.D.activeProjectId='q';if(change==='draft')vm.runInContext('draft.offset="1"',h.context);if(change==='unsaved')h.context.TL.dirty=true;
 h.release();assert.equal(await run,false);assert.equal(h.stored().shots[0].performanceAudio,undefined);assert.equal(vm.runInContext('performanceAudioDrafts.size',h.context),1);
});
test('unsaved recording choice and old Connector block preflight with no queue mutation',async()=>{
 const h=setup();await assert.rejects(vm.runInContext('performanceAudioPreflight(D.shots)',h.context),/未保存/);
 vm.runInContext('performanceAudioDrafts.clear();D.shots[0].performanceAudio={version:1}',h.context);await assert.rejects(vm.runInContext('performanceAudioPreflight(D.shots)',h.context),/重启/);assert.equal(h.stored().jobs.length,0);
});
test('removing an invalid old binding needs no renderer and keeps original recordings and versions',async()=>{
 const h=setup();h.context.fetch=()=>{throw Error('must not fetch')};assert.equal(await vm.runInContext("performanceAudioSave('s',true)",h.context),true);assert.equal(h.stored().shots[0].performanceAudio,undefined);assert.equal(h.stored().generations.length,1);
});
