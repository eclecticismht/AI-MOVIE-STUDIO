const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {create}=require('./workspace-store'),{createStore}=require('./workspace-api');
function data(name='A'){return {projects:[{id:'P',name}],activeProjectId:'P',...Object.fromEntries(['shots','jobs','generations','masters','audio','characters','scenes','props','scripts'].map(k=>[k,[]]))}}
test('workspace disk uses compare-and-swap, sanitizes secrets and retains recovery snapshots',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ams-workspace-'));
 try{const store=createStore(dir),first=store.save({...data(),apiKey:'private'},null);assert.equal(first.data.apiKey,undefined);assert.throws(()=>store.save(data('lost'),null),/已变化/);const second=store.save(data('B'),first.revision);assert.equal(store.read().data.projects[0].name,'B');assert.notEqual(first.revision,second.revision);assert.equal(fs.readdirSync(dir).filter(f=>f.startsWith('snapshot')).length,1);
 const broken=createStore(dir,{...fs,renameSync(){throw Error('disk failure')}});assert.throws(()=>broken.save(data('C'),second.revision),/disk failure/);assert.equal(store.read().data.projects[0].name,'B');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('workspace adapter blocks cross-tab lost updates and rolls back after quota failure',()=>{
 let raw='{"x":1}',fail=false,saved=0,rollback;const native={getItem:()=>raw,setItem(k,v){if(fail)throw Error('quota');raw=v}},adapter=create(native,{onSave:()=>saved++,onFailure:(e,value)=>rollback=value});
 adapter.setItem('aimovie_data','{"x":2}');assert.equal(saved,1);fail=true;assert.throws(()=>adapter.setItem('aimovie_data','{"x":3}'),/quota/);assert.equal(rollback,'{"x":2}');fail=false;raw='{"x":4}';assert.throws(()=>adapter.setItem('aimovie_data','{"x":5}'),/其他页面/);assert.equal(raw,'{"x":4}');
});
