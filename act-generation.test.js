const {test}=require('node:test'),assert=require('node:assert/strict'),{run}=require('./act-generation');
function harness(fail=false){let draft,calls=[];return {get draft(){return draft},calls,io:{save:s=>draft=s,notice(){},split:()=>[{text:'scene'}],prepare:()=>({}),makeShots:()=>[{id:'s',dur:4,prompt:''}],describe:()=> 'visual',validPrompt:p=>p==='valid H3',request:async(url)=>{calls.push(url);if(url==='/api/screenplay')return {content:'script'};if(url==='/api/storyboard')return {shots:[{action:'walk'}]};if(fail)throw Error('network unavailable');return {prompts:[{id:'s',prompt:'valid H3'}]}}}}}
test('act pipeline checkpoints successful steps and resumes only missing prompts',async()=>{const first=harness(true);await assert.rejects(run('story','model',null,first.io),/network/);assert.equal(first.draft.shots.length,1);const next=harness();const done=await run('story','model',first.draft,next.io);assert.deepEqual(next.calls,['/api/h3-prompts']);assert.equal(done.shots[0].prompt,'valid H3')});
test('changing story starts a fresh independent generation and validates prompt coverage',async()=>{const h=harness();await run('new','model',{story:'old',model:'model',screenplay:{content:'old'}},h.io);assert.deepEqual(h.calls,['/api/screenplay','/api/storyboard','/api/h3-prompts']);const bad=harness();bad.io.validPrompt=()=>false;await assert.rejects(run('story','model',null,bad.io),/不完整/);await assert.rejects(run('','model',null,h.io),/故事原文/)});
test('act generation commits a separate batch while preserving other acts and project story',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');let n=0;
 const p={id:'p',storyText:'whole story',screenplayId:'original',storyboardBatchId:'old',storyActs:{'original|old':{acts:[{id:'a',title:'场次一',storyText:'new story',shotIds:['oldshot']},{id:'b',title:'场次二',shotIds:['other']}],history:[]}}};
 const D={activeProjectId:'p',projects:[p],scripts:[{id:'original',kind:'screenplay',projectId:'p',content:'whole script'}],shots:[{id:'oldshot',projectId:'p'},{id:'other',projectId:'p'}],storyboardBatches:[],characters:[],scenes:[],props:[]};let stored=JSON.stringify(D);
 const ctx={D,ActGeneration:require('./act-generation'),structuredClone,AbortSignal,editingShotId:null,storyFlowRuns:new Map(),screenplayRequests:new Set(),storyboardRequests:new Set(),activeProject:()=>p,storyActsContext:()=>({p,script:D.scripts[0],key:'original|old',saved:p.storyActs['original|old'],acts:p.storyActs['original|old'].acts}),localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},uid:prefix=>prefix+(++n),renderScripts(){},storyFlowNotice(){},textAIHeaders:()=>({}),StoryboardSegments:{split:()=>[{text:'part'}]},ShotPrompt:{isStructured:()=>true,compile:()=> 'description'},prepareScreenplayAssets:()=>({collections:{characters:[],scenes:[],props:[]},references:{},summary:''}),fetch:async(url,options)=>({ok:true,json:async()=>url==='/api/screenplay'?{content:'act script',assets:{}}:url==='/api/storyboard'?{shots:[{action:'walk',visual:'room',duration:4}]}:{prompts:JSON.parse(options.body).shots.map(s=>({id:s.id,prompt:'valid prompt'}))}})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('act-generation-ui.js','utf8'),ctx);await vm.runInContext("generateStoryAct('a')",ctx);
 const result=JSON.parse(stored);assert.equal(result.scripts.length,2);assert.equal(result.shots.length,3);assert.equal(result.projects[0].screenplayId,'original');assert.equal(result.projects[0].storyboardBatchId,'old');assert.equal(result.projects[0].storyText,'whole story');assert.deepEqual(result.projects[0].storyActs['original|old'].acts[1],JSON.parse(JSON.stringify(p.storyActs['original|old'].acts[1])));assert.equal(result.projects[0].storyActs['original|old'].acts[0].pipeline,undefined);assert.equal(result.shots[2].prompt,'valid prompt');
});

test('resume retains storyboard correction after all repair attempts fail',async()=>{
 const h=harness();let count=0;
 h.io.request=async url=>{if(url==='/api/screenplay')return {content:'script'};count++;const e=Error('invalid dialogue');e.repair={content:'draft '+count,error:e.message};throw e};
 await assert.rejects(run('story','model',null,h.io),/invalid dialogue/);
 assert.equal(count,3);assert.equal(h.draft.repairs[0].content,'draft 3');
 const next=harness(),original=next.io.request;
 next.io.request=async(url,body)=>{if(url==='/api/storyboard')assert.equal(body.repair.content,'draft 3');return original(url,body)};
 const result=await run('story','model',h.draft,next.io);assert.equal(result.repairs[0],undefined);assert.equal(result.shots[0].prompt,'valid H3');
});
test('old checkpoint limits assets to this act before retrying storyboard',async()=>{
 const h=harness(),original=h.io.request;
 h.io.request=async(url,body)=>{if(url==='/api/storyboard')assert.deepEqual(body.assets,{characters:[{id:'hero'}],scenes:[],props:[]});return original(url,body)};
 await run('story','model',{story:'story',model:'model',screenplay:{content:'script'},prepared:{references:{characterIds:['hero'],sceneIds:[],propIds:[]},assets:{characters:[{id:'hero'},{id:'unrelated'}],scenes:[],props:[]}}},h.io);
});
test('act asset selection excludes other acts and preserves reused referenced assets',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('act-generation-ui.js','utf8'),ctx);
 ctx.prepared={references:{characterIds:['hero'],sceneIds:[],propIds:[]},collections:{characters:[{id:'hero',projectId:'p',name:'Hero'},...Array.from({length:201},(_,i)=>({id:'other'+i,projectId:'p',name:'Other'}))],scenes:[],props:[]}};
 const assets=vm.runInContext("actGenerationAssets(prepared,'p')",ctx);assert.equal(assets.characters.length,1);assert.equal(assets.characters[0].id,'hero');
});
test('act progress stays in the active expanded panel after rerender',()=>{
 const vm=require('node:vm'),fs=require('node:fs');const panel={open:false},el={dataset:{actStatus:'a'},textContent:'',closest:()=>panel};let rendered=0;
 const ctx={D:{activeProjectId:'p'},document:{querySelectorAll:()=>[el]},renderScripts:()=>rendered++,storyFlowNotice(){}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('act-generation-ui.js','utf8'),ctx);
 vm.runInContext("actGenerationRender('a');actGenerationNotice({id:'p'},'a','分镜生成失败')",ctx);
 assert.equal(rendered,1);assert.equal(panel.open,true);assert.equal(el.textContent,'分镜生成失败');
});
