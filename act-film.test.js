const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {groups,choose,at}=require('./act-film'),{validate,createService}=require('./act-film-api');
const input=()=>({projectId:'p',scopeKey:'batch',acts:[{id:'first',title:'场次一',shots:[{shotId:'a'},{shotId:'b'}]},{id:'second',title:'场次二',shots:[{shotId:'c'}]}]});
const source=(shotId,stamp='2026-09-24T00:00:00Z',ready=true)=>({id:shotId+stamp,projectId:'p',createdAt:stamp,ready,shot:{shotId,videoUrl:shotId+stamp,speechCheck:{status:'needs_review'}}});
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ams-act-film-'));t.after(()=>{for(const f of fs.readdirSync(root))fs.unlinkSync(path.join(root,f));fs.rmdirSync(root)});return root}
test('act groups use authored membership across generated batches and do not use scene headings',()=>{
 const data={activeProjectId:'p',projects:[{id:'p',storyActs:{'script|batch':{acts:[{id:'one',title:'第一场次',shotIds:['b','a']},{id:'two',title:'第二场次',shotIds:['c']}]}}}],storyboardBatches:[{id:'batch',projectId:'p',sourceScriptId:'script'}],shots:[{id:'a',projectId:'p',sequence:1,scene:'街道',storyboardBatchId:'batch'},{id:'b',projectId:'p',sequence:2,scene:'餐馆',storyboardBatchId:'generated'},{id:'c',projectId:'p',sequence:3,storyboardBatchId:'batch'},{id:'foreign',projectId:'other',storyboardBatchId:'batch'}]};
 assert.deepEqual(groups(data,'batch').map(a=>a.shots.map(s=>s.shotId)),[['a','b'],['c']]);
 data.projects[0].storyActs['script|batch'].acts=[];assert.deepEqual(groups(data,'batch'),[]);
 delete data.projects[0].storyActs;assert.deepEqual(groups(data,'batch')[0].shots.map(s=>s.shotId),['a','c']);
});
test('a pending newer render never silently falls back to an older finished shot or another project',()=>{
 const plan={projectId:'p',shots:[{shotId:'a'},{shotId:'b'}]},old=source('a'),newer=source('a','2026-09-24T01:00:00Z',false);
 assert.deepEqual(choose(plan,[old,newer,{...source('b'),projectId:'q'}]).missing,['a','b']);
 assert.equal(at([{shotId:'a',start:0,end:4},{shotId:'b',start:4,end:9}],4).shotId,'b');
});
test('reject invalid or duplicated membership before changing persisted plans',()=>{
 assert.throws(()=>validate({...input(),acts:[{id:'x',title:'X',shots:[{shotId:'a'},{shotId:'a'}]}]}),/重复/);
 assert.throws(()=>validate({...input(),acts:[...input().acts,{id:'third',title:'X',shots:[{shotId:'a'}]}]}),/重复/);
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
