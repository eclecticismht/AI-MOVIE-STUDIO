const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const B=require('./workspace-bootstrap'),{createStore,createWorkspaceApi}=require('./workspace-api');
const demo=()=>({projects:[{id:'P001',name:'人生评分99分'}],activeProjectId:'P001',shots:structuredClone(B.initial.shots).map(s=>({...s,projectId:'P001'})),...Object.fromEntries(['jobs','generations','masters','audio','characters','scenes','props','scripts'].map(k=>[k,[]]))});
const real=()=>({...demo(),projects:[{id:'P001',name:'人生评分99分'},{id:'MOVIE',name:'电影项目'}]});
test('new browser and untouched example load disk projects before migration; edits and damaged JSON stay intact',()=>{
 for(const raw of [null,JSON.stringify(demo()),JSON.stringify({...demo(),projects:[{id:'P001',storyText:'未保存的原文'}]}),'{broken']){
  const values=new Map([['aimovie_data',raw]]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},expected=raw===null||raw===JSON.stringify(demo());
  assert.equal(B.hydrate(storage,{data:real()}),expected);assert.equal(values.get('aimovie_data'),expected?JSON.stringify(real()):raw);if(raw&&expected)assert.equal(values.get('aimovie_before_disk_bootstrap'),raw);
 }
});
test('ordinary saving cannot reset an existing disk workspace to the example; explicit restore keeps a snapshot',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ams-bootstrap-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createStore(dir),first=store.save(real(),null);
 assert.throws(()=>store.save(demo(),first.revision),/示例数据/);assert.equal(store.read().revision,first.revision);
 store.save(demo(),first.revision,{allowProjectReplacement:true});assert.equal(store.read().data.projects.length,1);assert.equal(fs.readdirSync(dir).filter(f=>f.startsWith('snapshot')).length,1);
});
test('bootstrap endpoint sends the latest snapshot without cache or mutations',async()=>{
 const expected={revision:'version',data:real()},api=createWorkspaceApi({read:()=>expected,save(){throw Error('unexpected write')}});let status,headers,body;
 await api({method:'GET'},{writeHead(s,h){status=s;headers=h},end(v){body=v}},'/api/workspace/bootstrap.js');assert.equal(status,200);assert.equal(headers['Cache-Control'],'no-store');assert.equal(body,'globalThis.workspaceDiskStartup='+JSON.stringify(expected)+';');
});
test('archiving a conflicting browser copy never promotes it to the current workspace',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ams-archive-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createStore(dir),current=store.save(real(),null),copy=store.archive({...demo(),apiKey:'secret'});
 assert.equal(store.read().revision,current.revision);const archived=JSON.parse(fs.readFileSync(path.join(dir,copy.name)));assert.equal(archived.data.apiKey,undefined);assert.equal(archived.data.projects.length,1);
 const legacy=demo();legacy.shots.push({...legacy.shots[0]});const broken=store.archive(legacy);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,broken.name))).data.shots.length,5);assert.equal(store.read().revision,current.revision);
});
