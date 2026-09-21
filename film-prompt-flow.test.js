const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const file=fs.readFileSync('film-ui.js','utf8');
test('film page script parses with preparation controls',()=>{assert.doesNotThrow(()=>new vm.Script(file));});
test('revision preflight and actual submission send identical edited sound and story fields',async()=>{
 const calls=[],draft={run:{id:'old',projectId:'p'},index:2,prompt:'updated',subtitle:'',duration:6,audioMode:'mute',audioAsset:''};
 const context={filmRevision:structuredClone(draft),filmRevisionBusy:false,D:{activeProjectId:'p'},filmRuns:[],filmMessage:'',renderEdit(){},fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({run:{id:'child'},impact:{redo:[3],reuse:[1,2],pending:[4]}})}}};
 vm.createContext(context);vm.runInContext(file.slice(file.indexOf('function filmRevisionPayload('),file.indexOf('async function recomposeFilmAudio(')),context);
 await vm.runInContext('checkFilmRevision()',context);assert.equal(context.filmRuns.length,0);assert.equal(context.filmRevision.prompt,'updated');
 await vm.runInContext('submitFilmRevision()',context);
 assert.match(calls[0].url,/validate-revision$/);assert.match(calls[1].url,/retry$/);assert.deepEqual(calls[0].body,calls[1].body);assert.equal(calls[1].body.revision.audioMode,'mute');assert.equal(context.filmRuns.length,1);
});
const flow=file.slice(file.indexOf('async function startAutomaticFilm('),file.indexOf('async function resumeAutomaticFilm('));
async function submit(prompt,prepareOnly=false){
 const requests=[],shot={id:'s',dur:8,prompt,dialogue:''},project={id:'p',name:'Test'};
 const context={FilmSourceSync:require('./film-source-sync'),filmStarting:false,filmRuns:[],filmMessage:'',editingShotId:null,screenplayApiKey:'',D:{},AbortSignal,ShotPrompt:require('./shot-prompt'),activeProject:()=>project,filmPlanShots:()=>({id:'b',shots:[shot]}),h3JobSettings:()=>({width:864,height:480}),compileH3Prompt:s=>require('./shot-prompt').compile(s,project,[]),ScreenCards:{fromShot:()=>[]},shotDialogueEvents:()=>[],requireShotReferenceImages:()=>{},prepareShotReferences:async()=>{if(prepareOnly)throw Error("unexpected reference upload");return []},prepareShotFirstFrame:async()=>{if(prepareOnly)throw Error("unexpected frame upload");return undefined},renderEdit:()=>{},localStorage:{setItem(){}},alert:s=>{throw Error(s)},fetch:async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});return {ok:true,json:async()=>url==='/api/h3-prompts'?{prompts:[{id:'s',prompt:'rewritten prompt'}]}:{run:{id:'new'}}}}};
 vm.createContext(context);vm.runInContext(flow,context);await vm.runInContext(`startAutomaticFilm(false,${prepareOnly})`,context);return {requests,context};
}

test('preparing prompts calls text service but never submits a film or uploads images',async()=>{
 const {requests,context}=await submit('Phone on wooden table.',true);
 assert.deepEqual(requests.map(r=>r.url),['/api/h3-prompts']);assert.equal(context.filmRuns.length,0);
 assert.match(context.filmMessage,/尚未启动/);assert.equal(context.filmPlanShots().shots[0].filmPrompt,'rewritten prompt');
});
test('authored complete H3 prompt goes directly to film plan without a second rewrite',async()=>{
 const authored='integrated_multimodal_description: Place the phone face-down on the wooden tabletop.\noverall_soundscape: A soft tap.\nnon_diegetic_music: N/A';
 const {requests}=await submit(authored);assert.deepEqual(requests.map(r=>r.url),['/api/film']);assert.match(requests[0].body.shots[0].prompt,/face-down on the wooden tabletop/);
});
test('unstructured visual notes still receive automatic H3 formatting',async()=>{
 const {requests}=await submit('Phone on the wooden table.');assert.deepEqual(requests.map(r=>r.url),['/api/h3-prompts','/api/film']);assert.equal(requests[1].body.shots[0].prompt,'rewritten prompt');
});
