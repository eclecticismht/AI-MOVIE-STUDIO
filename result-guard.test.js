const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Sync=require('./film-source-sync'),Guard=require('./result-guard');
test('approval explains missing video, missing provenance and changed source separately',async()=>{
 const shot={id:'s',projectId:'p',prompt:'old'},data={},result={shot:'s',projectId:'p',videoUrl:'video.mp4'};
 assert.match(await Guard.reason(shot,{...result,videoUrl:''},data),/视频地址/);
 assert.match(await Guard.reason(shot,result,data),/缺少来源记录/);
 result.sourceFingerprint=await Sync.fingerprint(shot,data);assert.equal(await Guard.reason(shot,result,data),'');
 shot.prompt='new';assert.match(await Guard.reason(shot,result,data),/发生了变化/);
 assert.match(await Guard.reason(undefined,result,data),/删除或归档/);
});
test('source changes during connector preparation never reach the GPU submit endpoint',async()=>{
 const D={jobs:[{id:'j',shot:'s',projectId:'p',references:[],dialogueEvents:[]}],shots:[{id:'s',projectId:'p'}],connector:{endpoint:'http://local'}},requests=[];
 const ctx={D,AbortSignal,dispatchingJobs:new Set(),ResultGuard:{matches:async()=>false},persist(){},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({job:{references:[]}})}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('AI_MOVIE_STUDIO.html','utf8').split('\n').find(s=>s.startsWith('async function dispatchJob(')),ctx);
 await vm.runInContext("dispatchJob('j')",ctx);assert.deepEqual(requests,['http://local/jobs']);assert.match(D.jobs[0].status,/提交已阻止/);assert.equal(D.jobs[0].comfyPromptId,undefined);
});
test('late result stays in history and cannot approve a revised shot',async()=>{
 const shot={id:'s',projectId:'p',prompt:'old',status:'需重做'},D={activeProjectId:'p',shots:[shot],jobs:[],generations:[],masters:[],audio:[],connector:{endpoint:'http://local'}};
 const key=await Sync.fingerprint(shot,D);D.jobs.push({id:'j',shot:'s',projectId:'p',sourceFingerprint:key});shot.prompt='revised';
 const html=fs.readFileSync('AI_MOVIE_STUDIO.html','utf8'),alerts=[];
 const ctx={D,ResultGuard:Guard,AbortSignal,uid:()=> 'g',persist(){},go(){},alert:x=>alerts.push(x),fetch:async()=>({ok:true,json:async()=>({job:{videoUrl:'http://local/old.mp4'}})})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('review-delete.js','utf8'),ctx);for(const prefix of ['async function syncComfyJob','async function approveMaster'])vm.runInContext(html.split('\n').find(x=>x.startsWith(prefix)),ctx);
 await vm.runInContext("syncComfyJob('j')",ctx);assert.equal(shot.status,'需重做');assert.equal(D.generations.length,1);assert.match(D.generations[0].status,/历史/);
 await vm.runInContext("approveMaster('g')",ctx);assert.equal(D.masters.length,0);assert.equal(shot.status,'需重做');assert.equal(alerts.length,1);
});
test('matching provenance permits current results; missing, foreign, deleted and changed assets do not',async()=>{
 const shot={id:'s',projectId:'p',characterIds:['c']},D={characters:[{id:'c',projectId:'p',imageUrl:'one'}]},result={shot:'s',projectId:'p',sourceFingerprint:await Sync.fingerprint(shot,D)};
 assert.equal(await Guard.matches(shot,result,D),true);assert.equal(await Guard.matches(shot,{...result,projectId:'other'},D),false);
 assert.equal(await Guard.matches(shot,{...result,sourceFingerprint:undefined},D),false);assert.equal(await Guard.matches(undefined,result,D),false);
 D.characters[0].imageUrl='two';assert.equal(await Guard.matches(shot,result,D),false);
});
