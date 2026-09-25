const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Backup=require('./project-backup'),{create}=require('./workspace-store'),{createStore}=require('./workspace-api');
function data(name){return {projects:[{id:'p',name}],activeProjectId:'p',...Object.fromEntries(['shots','jobs','generations','masters','audio','characters','scenes','props','scripts'].map(k=>[k,[]]))}}
async function harness(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ams-restore-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createStore(dir),initial=store.save(data('original'),null),elements=new Map(),timers=new Map();let raw=JSON.stringify(initial.data),quota=false,hook,puts=0,reloaded=0;
 const native={getItem:()=>raw,setItem(k,v){assert.equal(k,'aimovie_data');if(quota)throw Error('quota full');raw=v}};
 const ctx={D:initial.data,ProjectBackup:Backup,AbortSignal,confirm:()=>true,addEventListener(){},renderSettings(){},location:{reload(){reloaded++}},document:{getElementById(id){if(!elements.has(id))elements.set(id,{children:[],append(...items){this.children.push(...items)}});return elements.get(id)},createElement(){return {}}},setTimeout(fn){const id=Symbol();timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)},fetch:async(url,options={})=>{
  if(url==='/api/film')return {ok:true,json:async()=>({runs:[]})};
  if(url==='/api/workspace/archive')return {ok:true,json:async()=>store.archive(JSON.parse(options.body).data)};
  if(options.method==='PUT'){puts++;if(hook)return hook(JSON.parse(options.body));try{const x=JSON.parse(options.body);return {ok:true,json:async()=>store.save(x.data,x.baseRevision)}}catch(e){return {ok:false,status:409,json:async()=>({error:e.message})}}}
  return {ok:true,json:async()=>store.read()};
 }};
 ctx.localStorage=create(native,{onSave:v=>ctx.workspaceChanged(v)});vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('workspace-store-ui.js','utf8')+'\n'+fs.readFileSync('project-backup-ui.js','utf8'),ctx);
 await new Promise(setImmediate);
 return {ctx,store,dir,initial,run:s=>vm.runInContext(s,ctx),raw:()=>raw,external:v=>raw=v,quota:v=>quota=v,hook:fn=>hook=fn,puts:()=>puts,reloaded:()=>reloaded,timers};
}
test('restore waits for disk acknowledgement, snapshots original, then updates browser and reloads',async t=>{
 const h=await harness(t);let commit,release;h.hook(body=>new Promise(resolve=>{commit=()=>h.store.save(body.data,body.baseRevision);release=out=>resolve({ok:true,json:async()=>out})}));
 h.ctx.replacement=data('restored');h.run('pendingProjectBackup=replacement');const restoring=h.run('restoreProjectBackup()');await new Promise(setImmediate);
 assert.equal(h.reloaded(),0);assert.equal(h.ctx.D.projects[0].name,'original');assert.throws(()=>h.ctx.localStorage.setItem('aimovie_data',JSON.stringify(data('edit'))),/恢复/);
 const out=commit();assert.equal(h.reloaded(),0);release(out);await restoring;
 assert.equal(h.store.read().data.projects[0].name,'restored');assert.equal(JSON.parse(h.raw()).projects[0].name,'restored');assert.equal(h.reloaded(),1);
 const snapshots=fs.readdirSync(h.dir).filter(x=>x.startsWith('snapshot'));assert.equal(snapshots.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,snapshots[0]),'utf8')).data.projects[0].name,'original');
});
test('concurrent flush callers wait for the same write and drain edits arriving in flight',async t=>{
 const h=await harness(t);let finish;h.hook(body=>new Promise(resolve=>{finish=()=>{const out=h.store.save(body.data,body.baseRevision);resolve({ok:true,json:async()=>out})}}));
 h.ctx.localStorage.setItem('aimovie_data',JSON.stringify(data('B')));const first=h.run('workspaceFlush()'),second=h.run('workspaceFlush()');assert.equal(first,second);
 let done=false;second.then(()=>done=true);await new Promise(setImmediate);h.ctx.localStorage.setItem('aimovie_data',JSON.stringify(data('C')));finish();await new Promise(setImmediate);assert.equal(done,false);finish();await second;
 assert.equal(h.store.read().data.projects[0].name,'C');assert.equal(h.puts(),2);assert.equal(h.run('workspaceSave.pending'),null);
});
test('a rejected malformed pending write releases the flush lock for a corrected save',async t=>{
 const h=await harness(t);h.run("workspaceSave.pending='{broken'");await assert.rejects(h.run('workspaceFlush()'));assert.equal(h.run('workspaceSave.inflight'),null);
 h.ctx.localStorage.setItem('aimovie_data',JSON.stringify(data('corrected')));await h.run('workspaceFlush()');assert.equal(h.store.read().data.projects[0].name,'corrected');
});
test('failed or conflicting restore keeps both existing copies and never reloads',async t=>{
 for(const conflict of [false,true]){const h=await harness(t);if(conflict)h.store.save(data('other page'),h.initial.revision);
  h.hook(async()=>({ok:false,status:conflict?409:500,json:async()=>({error:conflict?'conflict':'disk unavailable'})}));h.ctx.replacement=data('restored');h.run('pendingProjectBackup=replacement');await h.run('restoreProjectBackup()');
  assert.equal(h.ctx.D.projects[0].name,'original');assert.equal(JSON.parse(h.raw()).projects[0].name,'original');assert.equal(h.store.read().data.projects[0].name,conflict?'other page':'original');assert.equal(h.reloaded(),0);assert.equal(h.run('workspaceSave.conflict'),conflict);
 }
});
test('lost acknowledgement is recovered by readback without a duplicate restore',async t=>{
 const h=await harness(t);h.hook(async body=>{h.store.save(body.data,body.baseRevision);throw Error('connection lost')});h.ctx.replacement=data('restored');await h.run('workspaceRestore(replacement)');assert.equal(h.puts(),1);assert.equal(JSON.parse(h.raw()).projects[0].name,'restored');
});
test('browser quota failure or cross-tab race after disk commit preserves browser and exposes recovery',async t=>{
 for(const race of [false,true]){const h=await harness(t);h.hook(async body=>{const out=h.store.save(body.data,body.baseRevision);if(race)h.external(JSON.stringify(data('other tab')));else h.quota(true);return {ok:true,json:async()=>out}});h.ctx.replacement=data('restored');
  await assert.rejects(h.run('workspaceRestore(replacement)'),e=>e.diskCommitted===true);assert.equal(h.store.read().data.projects[0].name,'restored');assert.equal(JSON.parse(h.raw()).projects[0].name,race?'other tab':'original');assert.equal(h.run('workspaceSave.conflict'),true);assert.equal(h.reloaded(),0);
 }
});
test('load disk archives the browser workspace separately before replacing it',async t=>{
 const h=await harness(t);h.ctx.D=data('browser-only edit');h.ctx.localStorage.setItem('aimovie_data',JSON.stringify(h.ctx.D));
 h.run('workspaceSave.conflict=true');await h.run('workspaceLoadDisk()');
 const copies=fs.readdirSync(h.dir).filter(n=>n.startsWith('recovery-'));assert.equal(copies.length,1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,copies[0]))).data.projects[0].name,'browser-only edit');assert.equal(h.store.read().data.projects[0].name,'original');assert.equal(JSON.parse(h.raw()).projects[0].name,'original');assert.equal(h.reloaded(),1);assert.equal(h.run('workspaceSave.pending'),null);
});
test('invalid legacy browser records still expose recovery instead of pretending the disk is offline',async t=>{
 const h=await harness(t),legacy=data('legacy');legacy.shots=[{id:'duplicate',projectId:'p'},{id:'duplicate',projectId:'p'}];const raw=JSON.stringify(legacy);h.external(raw);h.ctx.localStorage.initial=()=>raw;
 await h.run('workspaceStart()');assert.equal(h.run('workspaceSave.conflict'),true);assert.match(h.run('workspaceSave.message'),/浏览器与磁盘项目不同/);assert.equal(h.store.read().data.projects[0].name,'original');
});

test('confirmed browser replacement retains cross-tab changes arriving during the disk write',async t=>{
 const h=await harness(t);h.ctx.D=data('chosen browser version');h.ctx.localStorage.setItem('aimovie_data',JSON.stringify(h.ctx.D));h.run('workspaceSave.conflict=true');
 await h.run('workspaceKeepLocal()');const button=h.ctx.document.getElementById('workspaceSaveStatus').children.at(-1);
 h.hook(async body=>{const out=h.store.save(body.data,body.baseRevision);h.external(JSON.stringify(data('other tab edit')));return {ok:true,json:async()=>out}});
 await button.onclick();assert.equal(h.store.read().data.projects[0].name,'chosen browser version');assert.equal(JSON.parse(h.raw()).projects[0].name,'other tab edit');assert.equal(h.run('workspaceSave.conflict'),true);assert.match(h.run('workspaceSave.message'),/浏览器副本仍保留/);assert.equal(h.reloaded(),0);
});
