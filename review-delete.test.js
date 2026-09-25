const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('master approval is atomic, requires real video and keeps only one current approved version',async()=>{
 for(const fail of [false,true]){
  const D={activeProjectId:'p',generations:[{id:'new',projectId:'p',shot:'s',videoUrl:'new.mp4',status:'待审核'},{id:'old',projectId:'p',shot:'s',status:'MASTER'}],shots:[{id:'s',projectId:'p',status:'待审核'}],masters:[{generationId:'old',shot:'s',projectId:'p'}],audio:[]},before=JSON.stringify(D);
  const ctx={D,ResultGuard:{matches:async()=>true,reason:async()=>''},uid:()=> 'id',alert(){},go(){},localStorage:{setItem(){if(fail)throw Error('full')}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('review-delete.js','utf8'),ctx);await vm.runInContext("approveCurrentMaster('new')",ctx);
  if(fail)assert.equal(JSON.stringify(D),before);else{assert.equal(D.masters.length,1);assert.equal(D.masters[0].generationId,'new');assert.equal(D.generations[1].status,'历史批准版本');assert.equal(D.shots[0].status,'完成');}
 }
});
test('downstream master use rejects missing, obsolete and unapproved sources',async()=>{
 const D={generations:[{id:'g',projectId:'p',shot:'s',status:'MASTER'}],shots:[{id:'s',projectId:'p'}]},master={generationId:'g',projectId:'p',shot:'s'};
 let current=true;const ctx={D,master,ResultGuard:{matches:async()=>current}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('review-delete.js','utf8'),ctx);
 assert.equal(await vm.runInContext('masterSourceIsCurrent(master)',ctx),true);current=false;assert.equal(await vm.runInContext('masterSourceIsCurrent(master)',ctx),false);
 current=true;D.generations[0].status='需重做';assert.equal(await vm.runInContext('masterSourceIsCurrent(master)',ctx),false);
 D.generations=[];assert.equal(await vm.runInContext('masterSourceIsCurrent(master)',ctx),false);
});
test('deletion is scoped, atomic and removes dangling masters while preserving media and other projects',()=>{
 for(const fail of [false,true]){
  const g={id:'g',projectId:'p',shot:'s',jobId:'j',videoUrl:'old.mp4'},D={activeProjectId:'p',generations:[g,{id:'foreign',projectId:'q'}],masters:[{projectId:'p',shot:'s',generationId:'g'}],shots:[{id:'s',projectId:'p',status:'完成'}],audio:[{shot:'s'}],jobs:[{id:'j'}]};
  const original=JSON.stringify(D),ctx={D,localStorage:{setItem(){if(fail)throw Error('full')}},alert(){},renderReview(){},document:{createElement:()=>({setAttribute(){}}),getElementById:()=>({prepend(){}})}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('review-delete.js','utf8'),ctx);vm.runInContext("deleteReviewGeneration('foreign')",ctx);assert.equal(JSON.stringify(D),original);
  vm.runInContext("deleteReviewGeneration('g')",ctx);
  if(fail){assert.equal(JSON.stringify(D),original);continue;}
  assert.equal(D.generations.length,1);assert.equal(D.masters.length,0);assert.equal(D.shots[0].status,'需重做');assert.equal(D.jobs.length,1);assert.equal(D.audio.length,1);assert.equal(D.deletedGenerationResults[0].videoUrl,'old.mp4');
 }
});
test('deleted review result is not resurrected by another job sync',async()=>{
 const html=fs.readFileSync('AI_MOVIE_STUDIO.html','utf8'),D={jobs:[{id:'j',shot:'s',projectId:'p'}],shots:[{id:'s',projectId:'p',status:'需重做'}],generations:[],deletedGenerationResults:[{jobId:'j',projectId:'p',videoUrl:'old.mp4'}],connector:{endpoint:'http://local'}};
 const ctx={D,AbortSignal,ResultGuard:{matches:async()=>false},fetch:async()=>({ok:true,json:async()=>({job:{videoUrl:'old.mp4'}})}),persist(){},go(){},alert(){},uid:()=> 'g'};vm.createContext(ctx);vm.runInContext(html.split('\n').find(s=>s.startsWith('async function syncComfyJob')),ctx);await vm.runInContext("syncComfyJob('j')",ctx);assert.equal(D.generations.length,0);assert.equal(D.shots[0].status,'需重做');
});
test('queue button stays in place with inline success and failure feedback',async()=>{
 const file=fs.readFileSync('storyboard.js','utf8'),flow=file.slice(file.indexOf('async function queueById'),file.indexOf('function redoGeneration'));
 for(const fail of [false,true]){
  const status={},button={},D={activeProjectId:'p',shots:[{id:'s',projectId:'p'}],jobs:[]};let navigated=false;
  const ctx={D,button,document:{getElementById:()=>status},referenceQueueLocks:new Set(),shotHasActiveJob:()=>false,prepareStoryboardJob:async()=>({id:'j'}),localStorage:{setItem(){if(fail)throw Error('full')}},go(){navigated=true},alert(){throw Error('unexpected alert')}};
  vm.createContext(ctx);vm.runInContext(flow,ctx);await vm.runInContext("queueById('s',button)",ctx);assert.equal(navigated,false);assert.equal(button.disabled,false);assert.equal(D.jobs.length,fail?0:1);assert.match(status.textContent,fail?/添加失败/:/成功加入/);
 }
});

test('timeline queue preflight errors stay inline and release retry state',async()=>{
 const storyboard=fs.readFileSync('storyboard.js','utf8'),timeline=fs.readFileSync('timeline-ui.js','utf8');
 const D={activeProjectId:'p',shots:[{id:'s',projectId:'p',status:'待制作'}],jobs:[]},TL={busy:false,notice:''},referenceQueueLocks=new Set(),notice={};
 const before=JSON.stringify(D),error='生成前检查未通过：茅台酒瓶缺参考图片';let missing=true,prepared=0;
 const ctx={D,TL,referenceQueueLocks,document:{getElementById:id=>id==='tl-notice'?notice:null},tlCurrent:()=>({shot:D.shots[0]}),tlCanLeave:()=>true,tlRender(){},
  shotHasActiveJob:()=>D.jobs.length>0,workflowPreflight:async()=>{if(missing)throw Error(error)},prepareStoryboardJob:async()=>{prepared++;return {id:'j'}},localStorage:{setItem(){}},alert(){throw Error('unexpected native alert')}};
 vm.createContext(ctx);
 vm.runInContext(storyboard.slice(storyboard.indexOf('async function queueById'),storyboard.indexOf('function redoGeneration')),ctx);
 vm.runInContext(timeline.slice(timeline.indexOf('function tlMessage'),timeline.indexOf('function tlCanLeave')),ctx);
 vm.runInContext(timeline.slice(timeline.indexOf('async function tlAction'),timeline.indexOf('function tlSaveAudio')),ctx);
 await vm.runInContext("tlAction('queue')",ctx);
 assert.equal(TL.notice,'入队失败：'+error);assert.equal(notice.textContent,TL.notice);assert.equal(JSON.stringify(D),before);assert.equal(prepared,0);assert.equal(TL.busy,false);assert.equal(referenceQueueLocks.size,0);
 missing=false;await vm.runInContext("tlAction('queue')",ctx);
 assert.equal(D.jobs.length,1);assert.equal(prepared,1);assert.match(TL.notice,/本镜已有队列任务/);assert.equal(TL.busy,false);assert.equal(referenceQueueLocks.size,0);
 await vm.runInContext("tlAction('queue')",ctx);
 assert.equal(D.jobs.length,1);assert.equal(prepared,1);assert.match(TL.notice,/已有待提交或正在执行/);assert.equal(TL.busy,false);
});
