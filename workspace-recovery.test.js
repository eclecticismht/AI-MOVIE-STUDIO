const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('./workspace-recovery-model');
const copy=v=>JSON.parse(JSON.stringify(v));
function data(){return {activeProjectId:'p',projects:[{id:'p',name:'Film',storyActs:{scope:{acts:[{id:'six',title:'场次六',storyText:'原文',content:'',shotIds:['new-shot'],generatedBatchId:'new-batch'}]}}},{id:'other',name:'Other'}],shots:[{id:'new-shot',projectId:'p',prompt:'latest',performanceAudio:{file:'approved'}}],characters:[{id:'actor',projectId:'p',imageUrl:'latest.png'}],jobs:[],generations:[],masters:[],audio:[],scenes:[],props:[],scripts:[]};}
const draft=(text='我的新原文',base='原文')=>({projectId:'p',scope:'scope',actId:'six',field:'storyText',text,base,hadScope:true});
const records=d=>[{storageKey:'draft-key',raw:JSON.stringify(d),draft:d}];
function inspect(d,local=d,rows=records(draft())){return R.inspect(d,local,rows,'p');}
test('safe field recovery preserves latest shot/audio/reference bindings and other projects',()=>{
 const disk=data(),local=copy(disk);local.shots=[];local.characters=[];local.projects[0].storyActs.scope.acts[0].shotIds=['old-shot'];
 const original=copy(disk),view=inspect(disk,local),out=R.apply(disk,local,view);assert.equal(view.rows[0].status,'safe');
 assert.equal(out.data.projects[0].storyActs.scope.acts[0].storyText,'我的新原文');assert.deepEqual(out.data.shots,disk.shots);assert.deepEqual(out.data.characters,disk.characters);assert.deepEqual(out.data.projects[0].storyActs.scope.acts[0].shotIds,['new-shot']);assert.deepEqual(out.data.projects[1],disk.projects[1]);assert.deepEqual(disk,original);
});
test('real same-field divergence needs an explicit choice, not last-writer-wins',()=>{
 const disk=data();disk.projects[0].storyActs.scope.acts[0].storyText='磁盘的新原文';const view=inspect(disk),row=view.rows[0];assert.equal(row.status,'conflict');assert.throws(()=>R.apply(disk,disk,view),/明确选择/);
 assert.equal(R.apply(disk,disk,view,{[row.key]:'local'}).data.projects[0].storyActs.scope.acts[0].storyText,'我的新原文');assert.equal(R.apply(disk,disk,view,{[row.key]:'disk'}).changes.length,0);
});
test('unchanged stale draft does not revert a newer disk field; already-saved draft is idempotent',()=>{
 const disk=data();disk.projects[0].storyActs.scope.acts[0].storyText='新版';for(const d of [draft('原文','原文'),draft('新版','原文')]){const view=inspect(disk,disk,records(d));assert.equal(view.rows[0].status,'same');assert.equal(R.apply(disk,disk,view).changes.length,0);}
});
test('locally saved text with no baseline is compared rather than automatically promoted',()=>{
 const disk=data(),local=copy(disk);local.projects[0].storyActs.scope.acts[0].storyText='浏览器已保存但磁盘未确认';const view=inspect(disk,local,[]);assert.equal(view.rows.length,1);assert.equal(view.rows[0].status,'conflict');assert.equal(view.rows[0].source,'browser');assert.throws(()=>R.apply(disk,local,view),/明确选择/);
});
test('missing scene can only be explicitly restored as text-only with a fresh ID',()=>{
 const disk=data(),local=copy(disk);local.projects[0].storyActs.scope.acts.push({id:'unsaved',title:'场次六',storyText:'新场次文字',content:'内容',shotIds:['old-shot'],generatedBatchId:'old'});
 const view=inspect(disk,local,[]);assert.ok(view.rows.every(r=>r.status==='missing'));assert.ok(view.rows[0].sameTitle.includes('场次六'));assert.throws(()=>R.apply(disk,local,view),/明确选择/);
 const choices=Object.fromEntries(view.rows.map(r=>[r.key,'new'])),out=R.apply(disk,local,view,choices,()=> 'fresh');const restored=out.data.projects[0].storyActs.scope.acts.at(-1);assert.equal(restored.id,'fresh');assert.equal(restored.storyText,'新场次文字');assert.equal(restored.title,'场次六（恢复草稿）');assert.deepEqual(restored.shotIds,[]);assert.equal(restored.generatedBatchId,undefined);assert.equal(out.data.projects[0].storyActs.scope.acts[0].id,'six');
});
test('other-project drafts stay untouched, invalid fields and duplicate drafts are rejected',()=>{
 const disk=data(),other={...draft(),projectId:'other'};const view=inspect(disk,disk,[...records(draft()),{storageKey:'other-draft',draft:other}]);assert.equal(view.rows.length,1);assert.deepEqual(R.apply(disk,disk,view).resolvedStorageKeys,['draft-key']);
 assert.throws(()=>inspect(disk,disk,records({...draft(),field:'generatedBatchId'})),/格式/);assert.throws(()=>inspect(disk,disk,[...records(draft()),...records(draft())]),/重复/);
});
function ioHarness(){
 const disk={data:data(),revision:'v1'},browser=copy(disk.data),inspection=inspect(disk.data,browser),snapshot={disk,browser,inspection,records:records(draft()),localSignature:'unchanged',decisions:{}};
 const h={snapshot,merged:R.apply(disk.data,browser,inspection),current:copy(disk),signature:'unchanged',log:[],accepted:null,cleared:null};
 h.io={localSignature:()=>h.signature,archive:async data=>{h.log.push({kind:'archive',data:copy(data)});return {name:'backup-'+h.log.length}},readDisk:async()=>copy(h.current),saveDisk:async(data,base)=>{h.log.push({kind:'save',base});assert.equal(base,h.current.revision);h.current={data:copy(data),revision:'v2'};return {revision:'v2'}},acceptBrowser:async data=>{h.log.push({kind:'accept'});h.accepted=copy(data)},clearResolved:keys=>{h.cleared=keys}};return h;
}
test('both workspaces and input drafts are archived before a scoped commit and browser synchronization',async()=>{
 const h=ioHarness(),out=await R.commit(h.snapshot,h.merged,h.io);assert.deepEqual(h.log.map(e=>e.kind),['archive','archive','save','accept']);assert.equal(h.log[0].data._workspaceRecovery.drafts[0].draft.text,'我的新原文');assert.equal(h.current.data.projects[0].storyActs.scope.acts[0].storyText,'我的新原文');assert.equal(out.backups.length,2);assert.deepEqual(h.cleared,['draft-key']);
});
test('archive failures or a newer disk revision never write or clear drafts',async()=>{
 for(const type of ['archive','disk']){const h=ioHarness();if(type==='archive')h.io.archive=async()=>{throw Error('backup unavailable')};else h.current.revision='v3';await assert.rejects(R.commit(h.snapshot,h.merged,h.io));assert.equal(h.accepted,null);assert.equal(h.cleared,null);assert.ok(!h.log.some(e=>e.kind==='save'));}
});
test('local edits made before or after disk commit are preserved; post-commit failure is explicit',async()=>{
 const before=ioHarness();before.signature='new local';await assert.rejects(R.commit(before.snapshot,before.merged,before.io),/停止覆盖/);assert.equal(before.log.length,0);
 const after=ioHarness(),save=after.io.saveDisk;after.io.saveDisk=async(...args)=>{const out=await save(...args);after.signature='new local';return out};await assert.rejects(R.commit(after.snapshot,after.merged,after.io),e=>e.diskCommitted===true);assert.equal(after.accepted,null);assert.equal(after.cleared,null);
});
test('lost disk acknowledgement is reconciled once rather than resubmitted',async()=>{
 const h=ioHarness(),save=h.io.saveDisk;h.io.saveDisk=async(...args)=>{await save(...args);throw Error('lost response')};const out=await R.commit(h.snapshot,h.merged,h.io);assert.equal(h.log.filter(e=>e.kind==='save').length,1);assert.equal(out.revision,'v2');assert.ok(h.accepted);
});
test('browser quota failure after commit keeps recoverable drafts and reports partial completion',async()=>{
 const h=ioHarness();h.io.acceptBrowser=async()=>{throw Error('quota')};await assert.rejects(R.commit(h.snapshot,h.merged,h.io),e=>e.diskCommitted===true&&e.backups.length===2);assert.equal(h.cleared,null);assert.equal(h.current.revision,'v2');
});
test('no-change recovery only archives and synchronizes; no unnecessary disk revision is created',async()=>{
 const h=ioHarness();h.merged={data:copy(h.current.data),changes:[],created:[],resolvedStorageKeys:[]};await R.commit(h.snapshot,h.merged,h.io);assert.ok(!h.log.some(e=>e.kind==='save'));assert.ok(h.accepted);
});

test('a conflicted workspace blocks new-scene structural writes before touching browser storage',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),file=fs.readFileSync('story-acts-ui.js','utf8'),start=file.indexOf('function storyActsCommit('),end=file.indexOf('function storyActsChange(',start);let writes=0;
 const ctx=vm.createContext({workspaceSave:{conflict:true},localStorage:{setItem(){writes++},getItem(){throw Error('must stop before reading stale records')}}});vm.runInContext(file.slice(start,end),ctx);assert.throws(()=>ctx.storyActsCommit({},[]),/恢复场次保存/);assert.equal(writes,0);
});
test('legacy backup-and-load route also archives in-memory scene drafts instead of only the saved workspace',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),file=fs.readFileSync('workspace-store-ui.js','utf8'),start=file.indexOf('async function workspaceArchive('),end=file.indexOf('async function workspaceLoadDisk(',start);let captured;
 const ctx=vm.createContext({ActTextEditor:{drafts:new Map([['d',draft('尚未保存的原文')]])},ProjectBackup:require('./project-backup'),AbortSignal,fetch:async(url,options)=>{captured=JSON.parse(options.body);return {ok:true,json:async()=>({name:'safe-backup'})}}});vm.runInContext(file.slice(start,end),ctx);const original=data();await ctx.workspaceArchive(original);assert.equal(captured.data._workspaceRecovery.drafts[0].text,'尚未保存的原文');assert.equal(original._workspaceRecovery,undefined);
});
