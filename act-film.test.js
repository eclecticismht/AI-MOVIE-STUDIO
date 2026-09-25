const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {groups,choose,at}=require('./act-film'),{validate,createService}=require('./act-film-api');
const input=()=>({projectId:'p',scopeKey:'batch',acts:[{id:'first',title:'场次一',shots:[{shotId:'a',sourceFingerprint:'a'.repeat(64)},{shotId:'b',sourceFingerprint:'a'.repeat(64)}]},{id:'second',title:'场次二',shots:[{shotId:'c',sourceFingerprint:'a'.repeat(64)}]}]});
const source=(shotId,stamp='2026-09-24T00:00:00Z',ready=true)=>({id:shotId+stamp,projectId:'p',createdAt:stamp,ready,shot:{shotId,sourceFingerprint:'a'.repeat(64),videoUrl:shotId+stamp,speechCheck:{status:'needs_review'}}});
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ams-act-film-'));t.after(()=>{for(const f of fs.readdirSync(root))fs.unlinkSync(path.join(root,f));fs.rmdirSync(root)});return root}
test('act groups use authored membership across generated batches and do not use scene headings',()=>{
 const data={activeProjectId:'p',projects:[{id:'p',storyActs:{'script|batch':{acts:[{id:'one',title:'第一场次',shotIds:['b','a']},{id:'two',title:'第二场次',shotIds:['c']}]}}}],storyboardBatches:[{id:'batch',projectId:'p',sourceScriptId:'script'}],shots:[{id:'a',projectId:'p',sequence:1,scene:'街道',storyboardBatchId:'batch'},{id:'b',projectId:'p',sequence:2,scene:'餐馆',storyboardBatchId:'generated'},{id:'c',projectId:'p',sequence:3,storyboardBatchId:'batch'},{id:'foreign',projectId:'other',storyboardBatchId:'batch'}]};
 assert.deepEqual(groups(data,'batch').map(a=>a.shots.map(s=>s.shotId)),[['a','b'],['c']]);
 data.projects[0].storyActs['script|batch'].acts=[];assert.deepEqual(groups(data,'batch'),[]);
 delete data.projects[0].storyActs;assert.deepEqual(groups(data,'batch')[0].shots.map(s=>s.shotId),['a','c']);
});
test('a pending newer render never silently falls back to an older finished shot or another project',()=>{
 const plan={projectId:'p',shots:[{shotId:'a',sourceFingerprint:'a'.repeat(64)},{shotId:'b',sourceFingerprint:'a'.repeat(64)}]},old=source('a'),newer=source('a','2026-09-24T01:00:00Z',false);
 assert.deepEqual(choose(plan,[old,newer,{...source('b'),projectId:'q'}]).missing,['a','b']);
 assert.equal(at([{shotId:'a',sourceFingerprint:'a'.repeat(64),start:0,end:4},{shotId:'b',sourceFingerprint:'a'.repeat(64),start:4,end:9}],4).shotId,'b');
});
test('reject invalid or duplicated membership before changing persisted plans',()=>{
 assert.throws(()=>validate({...input(),acts:[{id:'x',title:'X',shots:[{shotId:'a',sourceFingerprint:'a'.repeat(64)},{shotId:'a',sourceFingerprint:'a'.repeat(64)}]}]}),/重复/);
 assert.throws(()=>validate({...input(),acts:[...input().acts,{id:'third',title:'X',shots:[{shotId:'a',sourceFingerprint:'a'.repeat(64)}]}]}),/重复/);
});
test('first act auto-assembles before later acts, sound warnings remain reviewable, and polling is idempotent',async t=>{
 let data=[source('a')],calls=0;const service=createService({root:fixture(t),autoTick:false,sources:()=>data,assemble:async(p,selection)=>{calls++;return {duration:8,shots:selection.map((x,i)=>({shotId:x.slot.shotId,start:i*4,end:(i+1)*4})),warnings:[{index:1,message:'待核对声音'}]}}});
 await service.sync(input());await service.tick();assert.equal(calls,0);
 data.push(source('b'));await service.tick();let [first,second]=service.list('p');assert.equal(first.status,'ready');assert.equal(first.versions[0].warnings.length,1);assert.equal(first.versions[0].approvedAt,undefined);assert.equal(second.status,'waiting');
 await service.tick();assert.equal(calls,1);await service.approve(first.id,first.versions[0].id);assert.ok(service.list('p')[0].versions[0].approvedAt);
 data.push(source('a','2026-09-24T01:00:00Z',false));await assert.rejects(()=>service.approve(first.id,first.versions[0].id),/更新/);await service.tick();assert.equal(service.list('p')[0].versions.length,1);
 data.at(-1).ready=true;await service.tick();first=service.list('p')[0];assert.equal(first.versions.length,2);assert.equal(first.versions[1].approvedAt,undefined);assert.ok(first.versions[0].approvedAt);
 await assert.rejects(()=>service.approve(first.id,first.versions[0].id),/最新/);
});
test('restart resumes registered acts and removed acts never recreate automatically',async t=>{
 const root=fixture(t),options={root,autoTick:false,sources:()=>[source('a'),source('b')],assemble:async()=>({duration:8,shots:[],warnings:[]})};
 const first=createService(options);await first.sync(input());await first.tick();const id=first.list('p')[0].versions[0].id;
 const restarted=createService(options);await restarted.tick();assert.equal(restarted.list('p')[0].versions[0].id,id);
 await restarted.sync({...input(),acts:[]});await restarted.tick();assert.deepEqual(restarted.list('p'),[]);assert.deepEqual(createService(options).list('p'),[]);
});
test('membership changes during assembly cannot publish an obsolete version',async t=>{
 let release;const service=createService({root:fixture(t),autoTick:false,sources:()=>[source('a'),source('b'),source('c')],assemble:()=>new Promise(resolve=>release=()=>resolve({shots:[],warnings:[]}))});
 await service.sync({...input(),acts:input().acts.slice(0,1)});const work=service.tick();await new Promise(r=>setImmediate(r));
 await service.sync({...input(),acts:[]});release();await work;assert.deepEqual(service.list('p'),[]);
});
test('assembly failure retains previous film and retries only on explicit retry or changed inputs',async t=>{
 let count=0,fail=false,data=[source('a'),source('b')];const service=createService({root:fixture(t),autoTick:false,sources:()=>data,assemble:async()=>{count++;if(fail)throw Error('disk unavailable');return {shots:[],warnings:[]}}});
 await service.sync({...input(),acts:input().acts.slice(0,1)});await service.tick();fail=true;data.push(source('a','2026-09-24T01:00:00Z'));await service.tick();const s=service.list('p')[0];assert.equal(s.status,'failed');assert.equal(s.versions.length,1);await service.tick();assert.equal(count,2);fail=false;service.retry(s.id);await service.tick();assert.equal(service.list('p')[0].versions.length,2);
});
test('subtitle offsets use actual clip lengths for automatic scene composition',()=>{
 const ass=require('./film-api').makeAss([{duration:5,actualDuration:2,subtitle:'第一镜'},{duration:5,actualDuration:3,subtitle:'第二镜'}]);assert.match(ass,/0:00:02\.00,0:00:05\.00,Default/);
});

test('one-step review revision targets the selected shot and forwards the exact request',()=>{
 const vm=require('node:vm'),calls=[],textarea={value:''},host={querySelector:s=>s==='#actFilmRequest'?{value:'裤子保持纯黑色'}:s==='#actFilmShot'?{value:'b'}:{pause:()=>calls.push('pause')}};
 const ctx={TL:{busy:false},D:{activeProjectId:'p',shots:[{id:'b',projectId:'p',storyboardBatchId:'batch'}]},tlCanLeave:()=>true,cutStop:()=>{},cutBatch:()=> 'batch',tlSelect:id=>calls.push(id),timelineOpenRedo:()=>{},timelineRedoState:{shot:{id:'b'},dialog:{querySelector:()=>textarea}},timelineSubmitRedo:()=>calls.push(textarea.value),tlRender:()=>{},tlTools:()=>{},renderMasters:()=>{},storyFlowOutline:()=>'',dispatchJob:()=>{},setInterval:()=>{}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'act-film-ui.js'),'utf8'),ctx);ctx.actFilmRedo({id:'act'},host);assert.deepEqual(calls,['pause','b','裤子保持纯黑色']);
 ctx.TL.busy=true;ctx.actFilmRedo({id:'act'},host);assert.equal(calls.length,3);
});

function reviewUi(fetch){
 const vm=require('node:vm'),ctx={ActFilm:require('./act-film'),fetch,AbortSignal,tlRender:()=>{},tlTools:()=>{},renderMasters:()=>{},storyFlowOutline:()=>'',dispatchJob:()=>{},setInterval:()=>{}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'act-film-ui.js'),'utf8')+'\nthis.reviewState=AF;renderActFilms=()=>{};registerActFilms=async()=>{};',ctx);return ctx;
}
test('old scene version has an actionable latest-version control instead of a silent disabled approval',async()=>{
 const old={id:'old'},latest={id:'new'},act={id:'act',status:'ready',versions:[old,latest]};
 const control=require('./act-film').approval(act,old);assert.equal(control.disabled,false);assert.equal(control.latest,true);assert.match(control.notice,/旧版/);
 let requests=0,paused=false;const ctx=reviewUi(()=>requests++);ctx.reviewState.version='old';await ctx.actFilmApprove(act,old,{querySelector:()=>({pause:()=>paused=true})});assert.equal(paused,true);assert.equal(ctx.reviewState.version,null);assert.equal(requests,0);
});
test('scene approval shows pending, prevents duplicates, and applies persisted success',async()=>{
 let resolve,calls=0;const version={id:'new'},act={id:'act',status:'ready',versions:[version]};
 const ctx=reviewUi((url,options)=>{calls++;assert.equal(url,'/api/act-films/act/approve');assert.equal(JSON.parse(options.body).versionId,'new');return new Promise(r=>resolve=r)});ctx.reviewState.acts=[act];
 const pending=ctx.actFilmApprove(act,version,{});await new Promise(r=>setImmediate(r));assert.equal(ctx.reviewState.approving,'act');assert.match(require('./act-film').approval(act,version,true).label,/保存/);await ctx.actFilmApprove(act,version,{});assert.equal(calls,1);
 resolve({ok:true,json:async()=>({act:{...act,versions:[{...version,approvedAt:'saved'}]}})});await pending;assert.equal(ctx.reviewState.approving,null);assert.equal(ctx.reviewState.acts[0].versions[0].approvedAt,'saved');assert.equal(require('./act-film').approval(ctx.reviewState.acts[0],ctx.reviewState.acts[0].versions[0]).label,'本场已通过');
});
test('failed scene approval remains visible and permits retry',async()=>{
 const version={id:'new'},act={id:'act',status:'ready',versions:[version]},ctx=reviewUi(async()=>({ok:false,json:async()=>({error:'镜头已更新'})}));ctx.reviewState.acts=[act];
 await ctx.actFilmApprove(act,version,{});assert.match(ctx.reviewState.reviewError,/镜头已更新/);assert.equal(ctx.reviewState.approving,null);assert.equal(version.approvedAt,undefined);
});

test('generated act batches share the original review scope and select their own act',()=>{
 const data={activeProjectId:'p',projects:[{id:'p',storyActs:{'script|original':{acts:[{id:'one',title:'First',shotIds:['a']},{id:'two',title:'Second',generatedBatchId:'generated',shotIds:['b']}]}}}],storyboardBatches:[{id:'original',projectId:'p'},{id:'generated',projectId:'p'}],shots:[{id:'a',projectId:'p',storyboardBatchId:'original'},{id:'b',projectId:'p',storyboardBatchId:'generated'}]};
 const api=require('./act-film');assert.equal(api.context(data,'original').scopeKey,'original');assert.equal(api.context(data,'generated').scopeKey,'original');assert.equal(api.context(data,'generated').preferredActId,'two');
});
test('title images are local imported assets and persist through grouping sync and restart',async t=>{
 const api=require('./act-film-api'),name='asset-'+require('node:crypto').randomBytes(32).toString('hex')+'.png',dir=path.join(__dirname,'assets','imported'),file=path.join(dir,name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,Buffer.from('89504e470d0a1a0a','hex'));t.after(()=>fs.unlinkSync(file));
 const card={imageUrl:'/assets/imported/'+name,seconds:5};assert.deepEqual(api.titleCard(card),card);for(const bad of [{imageUrl:'https://example.com/title.png'},{imageUrl:'/assets/imported/../secret.png'},{...card,seconds:100}])assert.throws(()=>api.titleCard(bad));
 const root=fixture(t),options={root,autoTick:false,sources:()=>[source('a'),source('b')],assemble:async plan=>({shots:[],warnings:[],hasTitle:!!plan.titleCard})},service=createService(options);await service.sync(input());const id=service.list('p')[0].id;await service.tick();service.setTitle(id,card);await service.sync(input());await service.tick();let state=service.list('p')[0];assert.equal(state.versions.length,2);assert.equal(state.versions[1].hasTitle,true);assert.deepEqual(createService(options).list('p')[0].plan.titleCard,card);service.setTitle(id,null);await service.tick();assert.equal(service.list('p')[0].versions.length,3);
});

test('late sound verification updates scene warnings without rerendering the same footage',async t=>{
 const data=[source('a'),source('b')];let count=0;const service=createService({root:fixture(t),autoTick:false,sources:()=>data,assemble:async()=>{count++;return {shots:[],warnings:[{message:'pending'}]}}});await service.sync({...input(),acts:input().acts.slice(0,1)});await service.tick();const id=service.list('p')[0].versions[0].id;for(const s of data)s.shot.speechCheck={status:'text_match'};await service.tick();assert.equal(count,1);assert.equal(service.list('p')[0].versions[0].id,id);assert.deepEqual(service.list('p')[0].versions[0].warnings,[]);
});

test('scene waiting state reports ongoing shot rendering instead of suggesting nothing has started',async t=>{
 const data=[{...source('a','2026-09-24',false),status:'rendering',progress:{percent:48}},source('b')];const service=createService({root:fixture(t),autoTick:false,sources:()=>data,assemble:async()=>{throw Error('must not compose yet')}});await service.sync(input());await service.tick();assert.match(service.list('p')[0].message,/48%/);assert.equal(service.list('p')[0].versions.length,0);
});

test('editing picture, dialogue, duration or references invalidates an assembled act without deleting its old version',async t=>{
 const Act=require('./act-film'),data={activeProjectId:'p',projects:[{id:'p'}],storyboardBatches:[{id:'batch',projectId:'p'}],shots:[{id:'a',projectId:'p',storyboardBatchId:'batch',dur:4,prompt:'old picture',dialogue:'old words',characterIds:['actor']}],characters:[{id:'actor',projectId:'p',imageUrl:'old.png'}]};
 const plan=await Act.snapshot(data,'batch'),record=source('a');record.shot.sourceFingerprint=plan.acts[0].shots[0].sourceFingerprint;
 let assemblies=0;const service=createService({root:fixture(t),autoTick:false,sources:()=>[record],assemble:async()=>{assemblies++;return {shots:[],warnings:[]}}});
 await service.sync(plan);await service.tick();const state=service.list('p')[0],id=state.id,versionId=state.versions[0].id;
 for(const edit of [()=>data.shots[0].prompt='new picture',()=>data.shots[0].dialogue='new words',()=>data.shots[0].dur=8,()=>data.characters[0].imageUrl='new.png']){
  edit();await service.sync(await Act.snapshot(data,'batch'));await service.tick();
  assert.equal(service.list('p')[0].status,'waiting');await assert.rejects(()=>service.approve(id,versionId),/更新/);
 }
 assert.equal(assemblies,1);assert.equal(service.list('p')[0].versions[0].id,versionId);
});

test('review notes stay with their version and validate playback time',async t=>{const service=createService({root:fixture(t),autoTick:false,sources:()=>[source('a'),source('b')],assemble:async()=>({duration:8,shots:[],warnings:[]})});await service.sync(input());await service.tick();const a=service.list('p')[0],versionId=a.versions[0].id;service.note(a.id,{versionId,seconds:2.5,text:'检查手部'});assert.equal(service.list('p')[0].versions[0].notes[0].seconds,2.5);assert.throws(()=>service.note(a.id,{versionId,seconds:99,text:'越界'}),/有效/);});
