const {test}=require('node:test'),assert=require('node:assert/strict');
const Sync=require('./film-source-sync'),{validatePlan,retryPlan}=require('./film-api');
test('source revision invalidates linked descendants regardless of order and preserves independent history',()=>{
 const a={id:'a',projectId:'p',storyboardBatchId:'b',status:'完成',videoUrl:'old-a'},b={...a,id:'b',continueFromShotId:'a',filmPrompt:'cached',speechCheck:{status:'text_match'},videoUrl:'old-b'},c={...b,id:'c',continueFromShotId:'b'},independent={...a,id:'i'},otherProject={...b,id:'x',projectId:'other'},otherBatch={...b,id:'y',storyboardBatchId:'other'},archived={...b,id:'z',autoArchived:true};
 const input=[c,independent,b,otherProject,a,otherBatch,archived],copy=structuredClone(input);
 const result=Sync.replaceWithDependents(input,a,{...a,prompt:'new'});
 assert.deepEqual(new Set(result.dependentIds),new Set(['b','c']));assert.deepEqual(input,copy);
 for(const id of ['a','b','c']){const s=result.shots.find(x=>x.id===id);assert.equal(s.status,'需重做');assert.equal(s.videoUrl,undefined);assert.equal(s.filmPrompt,undefined);assert.equal(s.speechCheck,undefined);}
 for(const untouched of [independent,otherProject,otherBatch,archived])assert.equal(result.shots.find(x=>x.id===untouched.id),untouched);
 assert.equal(result.shots.find(s=>s.id==='c').continueFromShotId,'b');
});
test('invalid dependency cycles terminate without touching unrelated shots',()=>{
 const a={id:'a',projectId:'p',continueFromShotId:'b'},b={id:'b',projectId:'p',continueFromShotId:'a'};
 assert.deepEqual(Sync.replaceWithDependents([a,b],a,{...a,prompt:'new'}).dependentIds,['b']);
});
test('source fingerprint detects edits and asset changes but ignores status and generated cache',async()=>{
 const s={id:'s',projectId:'p',prompt:'old',characterIds:['c']},d={characters:[{id:'c',projectId:'p',imageUrl:'one.png'}]};
 const key=await Sync.fingerprint(s,d);
 assert.equal(await Sync.fingerprint({...s,status:'完成',filmPrompt:'cached'},d),key);
 assert.notEqual(await Sync.fingerprint({...s,prompt:'new'},d),key);
 assert.notEqual(await Sync.fingerprint(s,{characters:[{...d.characters[0],imageUrl:'two.png'}]}),key);
 const revision={shotId:'s',prompt:'new',subtitle:'',duration:6,audioMode:'model',cropBottomPercent:15};
 const next=Sync.apply({...s,filmPrompt:'stale',filmPromptVersion:2},revision,key,key);
 assert.equal(next.prompt,'new');assert.equal(next.filmPrompt,undefined);assert.equal(next.status,'需重做');assert.equal(s.prompt,'old');
 assert.equal(next.cropBottomPercent,15);
 assert.throws(()=>Sync.apply(s,revision,undefined,key),/旧版本/);
 assert.throws(()=>Sync.apply(s,revision,key,'changed'),/阻止覆盖/);
 assert.throws(()=>Sync.apply({...s,autoArchived:true},revision,key,key),/归档/);
});
test('source fingerprint survives server validation and revision without silently rebasing',()=>{
 const s={shotId:'s',prompt:'room',duration:4,width:864,height:480,dialogueEvents:[],sourceFingerprint:'a'.repeat(64)};
 const plan=validatePlan({projectId:'p',title:'t',shots:[s]});assert.equal(plan.shots[0].sourceFingerprint,s.sourceFingerprint);
 const child=retryPlan({...plan,status:'paused'},0,{prompt:'new room',subtitle:'',duration:5});assert.equal(child.shots[0].sourceFingerprint,s.sourceFingerprint);
 assert.throws(()=>validatePlan({projectId:'p',title:'t',shots:[{...s,sourceFingerprint:'invalid'}]}));
});
test('source save persists before changing memory and never submits rendering',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),file=fs.readFileSync('film-ui.js','utf8');
 for(const scenario of ['success','storage-failure','other-tab']){
  const failStorage=scenario==='storage-failure',otherTab=scenario==='other-tab';
  const s={id:'s',projectId:'p',prompt:'old',dur:4,dialogue:''},D={activeProjectId:'p',shots:[s,{id:'dependent',projectId:'p',continueFromShotId:'s',status:'完成',videoUrl:'old',filmPrompt:'cached'}]},key=await Sync.fingerprint(s,D),requests=[];
  const context={D,editingShotId:null,FilmSourceSync:Sync,filmRevisionBusy:false,filmRevision:{run:{id:'r',projectId:'p',shots:[{shotId:'s',sourceFingerprint:key}]},index:0,prompt:'new',subtitle:'',duration:5,audioMode:'model'},renderEdit(){},localStorage:{getItem(){return otherTab?JSON.stringify({...D,shots:[{...s,prompt:'changed elsewhere'}]}):null},setItem(){if(failStorage)throw Error('storage full')}},fetch:async(url)=>{requests.push(url);return {ok:true,json:async()=>({revision:{shotId:'s',prompt:'new',subtitle:'',duration:5,audioMode:'model'}})}}};
  vm.createContext(context);vm.runInContext(file.slice(file.indexOf('async function saveFilmRevisionToSource'),file.indexOf('async function checkFilmRevision')),context);await vm.runInContext('saveFilmRevisionToSource()',context);
  assert.equal(D.shots[0].prompt,failStorage||otherTab?'old':'new');assert.equal(D.shots[1].status,failStorage||otherTab?'完成':'需重做');assert.equal(D.shots[1].videoUrl,failStorage||otherTab?'old':undefined);assert.deepEqual(requests,['/api/film/r/validate-revision']);assert.equal(context.filmRevisionBusy,false);
 }
});
