const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {Readable}=require('node:stream');
const {createScreenplayApi,parseStoryboard}=require('./screenplay-api');
const source='第1场 车站。父亲撑伞。女儿走来。';
const shot={scene:'第1场 车站',sourceExcerpt:'父亲撑伞。',action:'父亲撑伞',visual:'雨夜站台',camera:'中景，固定',characters:'父亲',dialogue:'',duration:5};
test('storyboard requires valid fields and a real screenplay excerpt',()=>{
  assert.equal(parseStoryboard(JSON.stringify({shots:[shot]}),source).length,1);
  for(const invalid of [{...shot,sourceExcerpt:'编造的情节'},{...shot,duration:30},{...shot,visual:null}])assert.throws(()=>parseStoryboard(JSON.stringify({shots:[invalid]}),source));
  assert.throws(()=>parseStoryboard('{bad',source));
});

test('storyboard asset references must belong to the supplied library and include a scene',()=>{
  const assets={characters:[{id:'c1'}],scenes:[{id:'loc1'}],props:[{id:'p1'}]};
  const linked={...shot,characterIds:['c1'],sceneIds:['loc1'],propIds:['p1']};
  const parse=s=>parseStoryboard(JSON.stringify({shots:[s]}),source,assets);
  assert.deepEqual(parse(linked)[0].propIds,['p1']);
  assert.throws(()=>parse({...linked,characterIds:['foreign']}),/引用无效/);
  assert.throws(()=>parse({...linked,sceneIds:[]}),/未引用场景/);
  assert.throws(()=>parse({...linked,propIds:undefined}),/引用无效/);
});

test('generation sends only current project assets and persists returned references',async()=>{
  let body;
  const a=app(async(url,options)=>{body=JSON.parse(options.body);return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({shots:[{...shot,characterIds:['c'],sceneIds:['sc'],propIds:['pr']}]})}});
  a.D.characters=[{id:'c',name:'父亲',projectId:'p1',notes:'蓝外套'},{id:'foreign',name:'别人',projectId:'p2'}];
  a.D.scenes=[{id:'sc',name:'车站',projectId:'p1'}];a.D.props=[{id:'pr',name:'雨伞',projectId:'p1'}];
  await a.run('generateStoryboard()');
  assert.equal(body.assets.characters.length,1);assert.equal(body.assets.characters[0].notes,'蓝外套');
  assert.equal(a.D.shots.at(-1).characterIds[0],'c');assert.equal(a.D.shots.at(-1).sceneIds[0],'sc');assert.equal(a.D.shots.at(-1).propIds[0],'pr');
});
test('storyboard API uses selected screenplay and structured output',async()=>{
  let request;
  const handler=createScreenplayApi({env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({shots:[shot]})}}]})}}});
  const req=Readable.from([JSON.stringify({screenplay:source})]);Object.assign(req,{method:'POST',headers:{host:'127.0.0.1:4173'}});
  let status,result;await handler(req,{writeHead(s){status=s},end(r){result=JSON.parse(r)}},'/api/storyboard');
  assert.equal(status,200);assert.equal(result.shots.length,1);assert.equal(request.response_format.type,'json_object');assert.equal(JSON.parse(request.messages[1].content).剧本正文,source);
});
function app(fetchImpl){
  const D={activeProjectId:'p1',projects:[{id:'p1',screenplayId:'s1'},{id:'p2'}],scripts:[{id:'s1',projectId:'p1',kind:'screenplay',title:'剧本',content:source}],shots:[{id:'old',projectId:'p1'}],jobs:[]};
  let count=0,saved='';const nodes={};
  const context=vm.createContext({StoryboardSegments:require('./storyboard-segments'),FilmSourceSync:require('./film-source-sync'),ResultGuard:require('./result-guard'),D,activeProject:()=>D.projects.find(p=>p.id===D.activeProjectId),items:k=>D[k].filter(s=>s.projectId===D.activeProjectId),projectShots:()=>D.shots.filter(s=>s.projectId===D.activeProjectId),document:{getElementById:id=>nodes[id]||{innerHTML:''}},location:{protocol:'http:'},localStorage:{setItem(k,v){saved=v}},fetch:fetchImpl,AbortSignal,uid:prefix=>prefix+(++count),esc:s=>String(s??''),screenplayApiKey:'test',screenplayServerConfigured:false,renderShots2(){},editingShotId:null,selectedCharacterIds:()=>[],selectedSceneIds:()=>[],selectedPropIds:()=>[],alert:message=>{throw Error(message)}});
  vm.runInContext(fs.readFileSync('shot-audio.js','utf8'),context);vm.runInContext(fs.readFileSync('storyboard.js','utf8'),context);vm.runInContext('renderShots2=()=>{}',context);vm.runInContext(fs.readFileSync('dialogue-contract.js','utf8'),context);vm.runInContext(fs.readFileSync('asset-reference-ui.js','utf8'),context);
  return {D,context,nodes,run:s=>vm.runInContext(s,context),saved:()=>saved};
}
const response=()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({shots:[shot],model:'deepseek-flash'})});
test('regeneration preserves old batches and screenplay; shot edits never overwrite screenplay',async()=>{
  const a=app(async()=>response());await a.run('generateStoryboard()');await a.run('generateStoryboard()');
  assert.equal(a.D.shots.length,3);assert.equal(a.D.storyboardBatches.length,2);assert.equal(a.D.scripts[0].content,source);assert.equal(a.D.jobs.length,0);
  for(const [key,value] of Object.entries({scene:'车站',char:'父亲',camera:'近景',dur:'6',script:'修改动作',visual:'修改画面',dialogue:'你好',prompt:''}))a.nodes['board_'+key]={value};
  a.run(`saveStoryboardShot('${a.D.shots[1].id}')`);
  assert.equal(a.D.shots[1].script,'修改动作');assert.equal(a.D.scripts[0].content,source);
  assert.equal(JSON.parse(a.saved()).storyboardBatches[0].sourceContent,source);
});
test('double click and project switching keep generated shots with their source project',async()=>{
  let release,calls=0;const a=app(async()=>{calls++;await new Promise(r=>release=r);return response()});
  const pending=a.run('generateStoryboard()');await a.run('generateStoryboard()');while(!release)await new Promise(r=>setImmediate(r));a.D.activeProjectId='p2';release();await pending;
  assert.equal(calls,1);assert.equal(a.D.shots[1].projectId,'p1');assert.equal(a.D.storyboardBatches[0].sourceScriptId,'s1');
});
test('generation failure preserves existing shots',async()=>{
  const a=app(async()=>{throw Error('offline')});await a.run('generateStoryboard()');assert.equal(a.D.shots.length,1);assert.equal(a.D.storyboardBatches,undefined);
});
test('bulk queue respects batch and project, skips queued or finished shots, and is repeat-safe',async()=>{
  const a=app(async()=>response());a.context.compileH3Prompt=s=>'prompt for '+s.id;
  a.D.storyboardBatches=[{id:'batch',projectId:'p1'}];a.D.projects[0].storyboardBatchId='batch';
  a.D.shots=[['new','待制作','p1','batch'],['queued','待制作','p1','batch'],['done','完成','p1','batch'],['otherbatch','待制作','p1','other'],['otherproject','待制作','p2','batch']].map(([id,status,projectId,storyboardBatchId])=>({id,status,projectId,storyboardBatchId,dur:6}));
  a.D.jobs=[{id:'existing',shot:'queued',projectId:'p1',status:'等待本地 H3 Connector'}];
  await a.run('queueVisibleStoryboardShots()');await a.run('queueVisibleStoryboardShots()');
  assert.equal(a.D.jobs.length,2);assert.equal(a.D.jobs[1].shot,'new');assert.equal(a.D.jobs[1].prompt,'prompt for new');assert.equal(a.D.jobs[1].duration,6);
  assert.equal(a.D.shots.find(s=>s.id==='new').status,'等待 Worker');assert.equal(a.D.shots.find(s=>s.id==='otherbatch').status,'待制作');
});
test('bulk queue storage failure leaves every shot and job unchanged',async()=>{
  const a=app(async()=>response());a.context.compileH3Prompt=()=> 'prompt';a.D.shots[0].status='待制作';
  a.context.localStorage.setItem=()=>{throw Error('quota')};await a.run('queueVisibleStoryboardShots()');
  assert.equal(a.D.jobs.length,0);assert.equal(a.D.shots[0].status,'待制作');
});

test('redo opens its own batch and creates v002 without deleting history or duplicate queueing',async()=>{
  const a=app(async()=>response());a.context.go=()=>{};a.context.compileH3Prompt=()=> 'corrected prompt';
  a.context.h3JobSettings=()=>({width:1280,height:736});
  a.nodes.board_prompt={scrollIntoView(){},focus(){}};
  a.D.shots=[{id:'shot',projectId:'p1',status:'待审核',storyboardBatchId:'original',dur:5}];
  a.D.generations=[{id:'g1',jobId:'old',projectId:'p1',shot:'shot',version:'v001',videoUrl:'old.mp4',status:'待审核'}];
  a.D.jobs=[{id:'old',projectId:'p1',shot:'shot',status:'ComfyUI H3 已完成',videoUrl:'old.mp4'}];
  a.D.projects[0].storyboardBatchId='different';
  a.run("redoGeneration('g1')");
  assert.equal(a.D.projects[0].storyboardBatchId,'original');assert.equal(a.run('editingShotId'),'shot');
  await a.run("queueById('shot')");
  assert.equal(a.D.jobs.length,2);assert.equal(a.D.jobs[1].version,'v002');assert.equal(a.D.jobs[1].width,1280);
  assert.equal(a.D.generations[0].videoUrl,'old.mp4');
  await assert.rejects(a.run("queueById('shot')"),/已有待提交/);assert.equal(a.D.jobs.length,2);
});

test('redo queue storage failure preserves shot status and does not create a job',async()=>{
  const a=app(async()=>response());a.context.go=()=>{};a.context.compileH3Prompt=()=> 'prompt';
  a.D.shots=[{id:'redo',projectId:'p1',status:'需重做',dur:5}];
  a.context.localStorage.setItem=()=>{throw Error('full')};
  await assert.rejects(a.run("queueById('redo')"),/入队失败/);
  assert.equal(a.D.jobs.length,0);assert.equal(a.D.shots[0].status,'需重做');
});

test('bulk queue allows redo after completion while blocking unknown remote tasks',async()=>{
  const a=app(async()=>response());a.context.compileH3Prompt=()=> 'prompt';
  a.D.shots=[{id:'redo',projectId:'p1',status:'需重做',dur:5},{id:'uncertain',projectId:'p1',status:'失败',dur:5}];
  a.D.jobs=[{id:'done',projectId:'p1',shot:'redo',status:'ComfyUI H3 已完成'},{id:'remote',projectId:'p1',shot:'uncertain',status:'发送失败：timeout',comfyPromptId:'known'}];
  await a.run('queueVisibleStoryboardShots()');assert.equal(a.D.jobs.length,3);assert.equal(a.D.jobs[2].shot,'redo');
});

test('missing reference images block queueing instead of silently using text generation',async()=>{
  const a=app(async()=>response());a.context.compileH3Prompt=()=> 'prompt';
  a.D.characters=[{id:'chen',projectId:'p1',name:'陈实',imageUrl:''}];
  a.D.shots=[{id:'s',projectId:'p1',status:'待制作',dur:5,characterIds:['chen']}];
  await assert.rejects(a.run("queueById('s')"),/陈实/);
  assert.equal(a.D.jobs.length,0);assert.equal(a.D.shots[0].status,'待制作');
});

test('uploaded images are snapshotted, project switching does not misfile queued shots',async()=>{
  let release;const a=app(async()=>{await new Promise(r=>release=r);return {ok:true,json:async()=>({file:'ams-ref-'+'b'.repeat(64)+'.png'})}});
  a.context.compileH3Prompt=()=> 'prompt';a.context.go=()=>{};a.D.connector={endpoint:'http://127.0.0.1:8080'};
  a.D.characters=[{id:'chen',projectId:'p1',name:'陈实',imageUrl:'data:image/png;base64,abc'}];
  a.D.shots=[{id:'s',projectId:'p1',status:'待制作',dur:5,characterIds:['chen']}];
  const pending=a.run("queueById('s')");await a.run("queueById('s')");while(!release)await new Promise(r=>setImmediate(r));a.D.activeProjectId='p2';release();await pending;
  assert.equal(a.D.jobs.length,1);assert.equal(a.D.jobs[0].projectId,'p1');assert.equal(a.D.jobs[0].mode,'Ref2VA');assert.equal(a.D.jobs[0].references[0].assetId,'chen');assert.equal(a.D.jobs[0].references[0].imageUrl,undefined);
});
test('mentioned-only characters are not forced into visual references',()=>{
  const a=app(async()=>response());
  a.D.characters=[{id:'mom',projectId:'p1',name:'妈',type:'仅提及',imageUrl:''},{id:'worker',projectId:'p1',name:'工人',imageUrl:'/assets/worker.png'}];
  a.D.shots=[{id:'s',projectId:'p1',characterIds:['mom','worker']}];
  const refs=a.run('requireShotReferenceImages(D.shots[0])');assert.equal(refs.length,1);assert.equal(refs[0].assetId,'worker');
});
test('phone-only speaker is not uploaded as a visible face',()=>{
  const a=app(async()=>response());a.D.characters=[{id:'caller',name:'来电人',projectId:'p1',imageUrl:''},{id:'listener',name:'听者',projectId:'p1',imageUrl:'/assets/person.png'}];
  a.D.shots=[{projectId:'p1',characterIds:['caller','listener'],dialogue:'来电人（语音）：你好。'}];
  const refs=a.run('requireShotReferenceImages(D.shots[0])');assert.equal(refs.length,1);assert.equal(refs[0].assetId,'listener');
});
test('screen portrait stays a screen prop and cannot become an onsite speaker',()=>{
 const a=app(async()=>response());a.context.AssetStates=require('./asset-states');a.D.characters=[{id:'sun',name:'同学',projectId:'p1',imageUrl:'/assets/sun.png'}];a.D.shots=[{id:'s',projectId:'p1',characterIds:['sun'],dialogue:'',assetStates:{sun:{presence:'screen'}}}];
 let refs=a.run('requireShotReferenceImages(D.shots[0])');assert.equal(refs[0].kind,'props');assert.match(refs[0].notes,/ONLY inside/);assert.equal(refs[0].imageUrl,'/assets/sun.png');
 a.D.shots[0].dialogue='同学：你好。';assert.throws(()=>a.run('requireShotReferenceImages(D.shots[0])'),/出现方式/);
 a.D.shots[0].dialogue='';a.D.shots[0].assetStates.sun.presence='offscreen';assert.equal(a.run('requireShotReferenceImages(D.shots[0])').length,0);
});
test('stale adopted first frame is blocked before any image upload',async()=>{const a=app(async()=>{throw Error('should not upload')});a.context.FrameProvenance=require('./frame-provenance');a.D.shots=[{id:'s',projectId:'p1',visual:'旧画面',firstFrameUrl:'/assets/frame.png'}];a.D.shots[0].firstFrameProvenance=a.context.FrameProvenance.create(a.D.shots[0],[],'/assets/frame.png');a.D.shots[0].visual='新画面';assert.throws(()=>a.run('requireShotReferenceImages(D.shots[0])'),/过期/);await assert.rejects(a.run('prepareShotFirstFrame(D.shots[0])'),/过期/);});
test('current-shot screen state is uploaded instead of the historical asset picture',async()=>{
  let uploaded;const a=app(async(url,options)=>{uploaded=JSON.parse(options.body).dataUrl;return {ok:true,json:async()=>({file:'ams-ref-'+'c'.repeat(64)+'.png'})}});
  a.context.AssetStates=require('./asset-states');a.context.screenStateImage=text=>'data:image/png;base64,'+Buffer.from(text).toString('base64');a.D.connector={endpoint:'http://127.0.0.1:8080'};
  a.D.props=[{id:'balance',projectId:'p1',name:'余额',imageUrl:'/assets/before.png'}];
  a.D.shots=[{id:'s',projectId:'p1',sourceExcerpt:'余额603.72',propIds:['balance'],assetStates:{balance:{screenText:'603.72',description:'转账后'}}}];
  const refs=await a.run('prepareShotReferences(D.shots[0])');assert.equal(uploaded,'data:image/png;base64,'+Buffer.from('603.72').toString('base64'));assert.match(refs[0].notes,/转账后/);assert.equal(a.D.props[0].imageUrl,'/assets/before.png');
});
test('dialogue repair creates a new batch and preserves old shots and source',()=>{
  const a=app(async()=>response());const output={textContent:''};a.context.go=()=>{};a.context.document.querySelector=()=>output;
  a.D.characters=[{id:'a',name:'甲',projectId:'p1'},{id:'b',name:'乙',projectId:'p1'}];
  a.D.storyboardBatches=[{id:'batch',projectId:'p1',sourceTitle:'剧本',sourceContent:'original'}];a.D.projects[0].storyboardBatchId='batch';
  a.D.shots=[{id:'turns',firstFrameSpeakerPosition:'right',projectId:'p1',storyboardBatchId:'batch',dur:10,dialogue:'甲：你好。\n乙：再见。',sourceExcerpt:'甲：你好。\n乙：再见。'},{id:'typed',projectId:'p1',storyboardBatchId:'batch',dur:5,dialogue:'甲：收到',sourceExcerpt:'他打字：收到'}];
  a.context.repairButton={parentElement:{querySelector:()=>output}};
  a.run('repairDialogueBatch(repairButton)');assert.equal(a.D.storyboardBatches.length,2);assert.equal(a.D.shots.length,5);
  assert.equal(a.D.shots[0].dialogue,'甲：你好。\n乙：再见。');assert.equal(a.D.shots[4].dialogue,'屏幕文字：收到');assert.equal(a.D.shots[2].dur,4);assert.equal(a.D.shots[2].firstFrameSpeakerPosition,undefined);assert.equal(a.D.shots[3].firstFrameSpeakerPosition,undefined);assert.equal(a.D.jobs.length,0);
  assert.equal(a.D.shots[2].actionReviewRequired,true);assert.equal(a.D.shots[3].actionReviewRequired,true);
  assert.throws(()=>a.run('shotDialogueEvents(D.shots[2])'),/动作仍待核对/);
});
test('explicit screen imagery and exact asset inserts never lose photos to a text-only card',()=>{
 const a=app(async()=>response());a.context.AssetStates=require('./asset-states');a.context.screenStateImage=()=>{throw Error('Must preserve picture')};
 a.D.props=[{id:'feed',projectId:'p1',name:'朋友圈',imageUrl:'/assets/moments.png'}];
 a.D.shots=[{id:'s',projectId:'p1',sourceExcerpt:'今晚聚聚',propIds:['feed'],assetStates:{feed:{screenText:'今晚聚聚',imageUrl:'/assets/moments-current.png'}}}];
 assert.equal(a.run('shotReferenceAssets(D.shots[0])[0].imageUrl'),'/assets/moments-current.png');
 delete a.D.shots[0].assetStates.feed.imageUrl;a.D.shots[0].renderMode='screen';a.D.shots[0].screenAssetId='feed';
 assert.equal(a.run('shotReferenceAssets(D.shots[0])[0].imageUrl'),'/assets/moments.png');
});
test('batch rebuild remaps continuity and validates preserved first-frame provenance',()=>{
 const a=app(async()=>response()),output={textContent:''};a.context.go=()=>{};a.context.document.querySelector=()=>output;a.context.FrameProvenance=require('./frame-provenance');
 a.D.characters=[{id:'a',name:'甲',projectId:'p1'}];a.D.storyboardBatches=[{id:'batch',projectId:'p1',sourceTitle:'剧本'}];a.D.projects[0].storyboardBatchId='batch';
 a.D.shots=[{id:'one',projectId:'p1',storyboardBatchId:'batch',sequence:1,dur:4,dialogue:'甲：你好。',sourceExcerpt:'甲：你好。',firstFrameUrl:'/assets/f.png',firstFrameSpeakerPosition:'left'}, {id:'two',projectId:'p1',storyboardBatchId:'batch',sequence:2,dur:4,continueFromShotId:'one',dialogue:'甲：收到',sourceExcerpt:'他打字：收到'}];
 a.D.shots[0].firstFrameProvenance=a.context.FrameProvenance.create(a.D.shots[0],[],a.D.shots[0].firstFrameUrl);
 a.context.repairButton={parentElement:{querySelector:()=>output}};a.run('repairDialogueBatch(repairButton)');
 assert.equal(a.D.shots.length,4);assert.equal(a.D.shots[3].continueFromShotId,a.D.shots[2].id);assert.equal(a.D.shots[1].continueFromShotId,'one');assert.doesNotThrow(()=>a.context.FrameProvenance.validate(a.D.shots[2],[]));
});
test('explicit screen portrait overrides mentioned-only metadata without creating a physical person',()=>{
 const a=app(async()=>response());a.D.characters=[{id:'mom',name:'妈',projectId:'p1',type:'仅提及',imageUrl:'/assets/mom.png'}];
 const shot={projectId:'p1',characterIds:['mom'],assetStates:{mom:{presence:'screen'}}};a.D.shots=[shot];
 const refs=a.run('shotReferenceAssets(D.shots[0])');assert.equal(refs.length,1);assert.equal(refs[0].kind,'props');assert.match(refs[0].notes,/ONLY inside/);
});
test('generated storyboards validate automatic silent-action continuity',()=>{
 const shots=[shot,{...shot,continuePrevious:true}];
 assert.equal(parseStoryboard(JSON.stringify({shots}),source)[1].continuePrevious,true);
 for(const change of [{scene:'别处'},{camera:'特写'},{dialogue:'旁白：你好'},{continuePrevious:'yes'}])assert.throws(()=>parseStoryboard(JSON.stringify({shots:[shot,{...shots[1],...change}]}),source));
 assert.throws(()=>parseStoryboard(JSON.stringify({shots:[shots[1]]}),source),/第一镜/);
});
test('generated continuity binds actual saved IDs and never a previous batch',async()=>{
 const a=app(async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({shots:[shot,{...shot,continuePrevious:true}]})}));
 await a.run('generateStoryboard()');assert.equal(a.D.shots[2].continueFromShotId,a.D.shots[1].id);
 await a.run('generateStoryboard()');assert.equal(a.D.shots[4].continueFromShotId,a.D.shots[3].id);assert.notEqual(a.D.shots[4].continueFromShotId,a.D.shots[1].id);
});
test('invalid model duration is retried with feedback without losing earlier shots',async()=>{
 let calls=0,bodies=[];const a=app(async(url,options)=>{bodies.push(JSON.parse(options.body));calls++;return calls===1?{ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'台词过长，当前时长难以自然说完；请延长镜头或拆分台词。'})}:response()});
 await a.run('generateStoryboard()');assert.equal(calls,2);assert.match(bodies[1].notes,/上次结果未通过检查/);assert.equal(a.D.shots.length,2);
});

test('bulk jobs carry dispatch-valid source records and give inline feedback without rebuilding the page',async()=>{
  const a=app();a.context.compileH3Prompt=()=> 'prompt';
  a.D.shots=[{id:'ready',projectId:'p1',status:'待制作',dur:5}];
  a.nodes['queue-all-status']={textContent:''};
  a.context.renderShots2=()=>{throw Error('must stay in place')};
  const button={disabled:false};a.context.button=button;
  await a.run('queueVisibleStoryboardShots(button)');
  assert.equal(a.D.jobs.length,1);assert.ok(a.D.jobs[0].sourceFingerprint);
  assert.equal(await a.context.ResultGuard.matches(a.D.shots[0],a.D.jobs[0],a.D),true);
  assert.match(a.nodes['queue-all-status'].textContent,/已加入 1 镜/);assert.equal(button.disabled,false);
  await a.run('queueVisibleStoryboardShots(button)');assert.equal(a.D.jobs.length,1);
});

test('one invalid shot and local-only shots do not prevent valid batch jobs',async()=>{
  const a=app();a.context.compileH3Prompt=()=> 'prompt';a.nodes['queue-all-status']={textContent:''};
  a.D.shots=[{id:'bad',dur:0},{id:'good',dur:5},{id:'screen',renderMode:'screen'},{id:'follow',continueFromShotId:'good'}].map(s=>({...s,projectId:'p1',status:'待制作'}));
  await a.run('queueVisibleStoryboardShots()');
  assert.deepEqual(Array.from(a.D.jobs,j=>j.shot),['good']);
  assert.equal(a.D.shots[0].status,'待制作');
  assert.match(a.nodes['queue-all-status'].textContent,/失败 1 镜，跳过 2 镜/);
  assert.match(a.nodes['queue-all-status'].textContent,/第 1 镜（bad）/);
});

test('batch revalidates earlier shots after later image uploads',async()=>{
  const a=app();a.context.compileH3Prompt=()=> 'prompt';a.nodes['queue-all-status']={textContent:''};
  a.D.shots=[{id:'first',projectId:'p1',status:'待制作',dur:5},{id:'second',projectId:'p1',status:'待制作',dur:5}];
  const prepare=a.context.prepareStoryboardJob;
  a.context.prepareStoryboardJob=async s=>{const job=await prepare(s);if(s.id==='second')a.D.shots[0].dur=6;return job;};
  await a.run('queueVisibleStoryboardShots()');
  assert.deepEqual(Array.from(a.D.jobs,j=>j.shot),['second']);assert.match(a.nodes['queue-all-status'].textContent,/准备期间/);
});
test('model correction is bounded and credentials failures are not retried',async()=>{
 for(const [error,expected] of [['台词过长',3],['DeepSeek API Key 无效，请检查密钥。',1]]){
 let calls=0;const a=app(async()=>{calls++;return {ok:false,headers:{get:()=> 'application/json'},json:async()=>({error})}});await a.run('generateStoryboard()');assert.equal(calls,expected);assert.equal(a.D.shots.length,1);assert.equal(a.D.storyboardBatches,undefined);
 }
});
test('long script resumes saved segments and source edits invalidate that checkpoint',async()=>{
 const storage=new Map();let fail=true,calls=[];
 const a=app(async(url,options)=>{const body=JSON.parse(options.body);calls.push(body.screenplay);return fail&&body.screenplay.startsWith('第2场')?{ok:false,headers:{get:()=> 'application/json'},json:async()=>({error:'连接中断'})}:response()});
 a.context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 a.D.scripts[0].content='第1场 外景\n'+'动作'.repeat(1100)+'\n第2场 内景\n结束';
 await a.run('generateStoryboard()');assert.equal(calls.length,2);assert.equal(a.D.shots.length,1);
 fail=false;await a.run('generateStoryboard()');assert.equal(calls.length,3);assert.ok(calls[2].startsWith('第2场'));assert.equal(a.D.shots.length,3);assert.equal(storage.has('aimovie_storyboard_draft_p1'),false);
 fail=true;await a.run('generateStoryboard()');const before=calls.length;a.D.scripts[0].content+='新内容';await a.run('generateStoryboard()');assert.equal(calls.length,before+2);
});
test('model validation returns the exact draft for correction and resends it without changing source',async()=>{
 let sent;const invalid=JSON.stringify({shots:[{...shot,duration:2}]});
 const handler=createScreenplayApi({env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:invalid}}]})}}});
 const invoke=async(body)=>{const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{method:'POST',headers:{host:'127.0.0.1:4173'}});let status,result;await handler(req,{writeHead(s){status=s},end(r){result=JSON.parse(r)}},'/api/storyboard');return {status,result}};
 const first=await invoke({screenplay:source});assert.equal(first.status,422);assert.equal(first.result.repair.content,invalid);
 await invoke({screenplay:source,repair:first.result.repair});assert.equal(sent.messages[2].role,'assistant');assert.equal(sent.messages[2].content,invalid);assert.equal(JSON.parse(sent.messages[1].content).剧本正文,source);
});
test('split utterance repeats label but is grounded in the exact full original speaker line',()=>{
 const line='父亲（语音）：你好。今天下雨，记得带伞。';const partial={...shot,sourceExcerpt:'父亲（语音）：今天下雨，记得带伞。'};
 assert.equal(parseStoryboard(JSON.stringify({shots:[partial]}),line)[0].sourceExcerpt,line);
 assert.throws(()=>parseStoryboard(JSON.stringify({shots:[{...partial,sourceExcerpt:'母亲（语音）：今天下雨，记得带伞。'}]}),line),/原文/);
 assert.throws(()=>parseStoryboard(JSON.stringify({shots:[{...partial,sourceExcerpt:'父亲（语音）：今天下雪，记得带伞。'}]}),line),/原文/);
});
test('video prompt API round-trips short model IDs to the original long shot IDs',async()=>{
 const prompt='integrated_multimodal_description: [Shot 1] A quiet room.\noverall_soundscape: Room tone.\nnon_diegetic_music: N/A';
 const handler=createScreenplayApi({env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async(url,options)=>{const sent=JSON.parse(options.body),shots=JSON.parse(sent.messages[1].content).shots;assert.deepEqual(shots.map(s=>s.id),['shot_1','shot_2']);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({prompts:shots.slice().reverse().map(s=>({id:s.id,prompt}))})}}]})}}});
 const req=Readable.from([JSON.stringify({shots:[{id:'SH_long_original_a',description:'room'},{id:'SH_long_original_b',description:'room'}]})]);Object.assign(req,{method:'POST',headers:{host:'127.0.0.1:4173'}});let result;await handler(req,{writeHead(s){assert.equal(s,200)},end(r){result=JSON.parse(r)}},'/api/h3-prompts');assert.deepEqual(result.prompts.map(p=>p.id),['SH_long_original_a','SH_long_original_b']);
});
