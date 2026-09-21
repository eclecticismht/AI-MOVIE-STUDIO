const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatePlan,makeAss,publicRun}=require('./film-api');
const {retryPlan}=require('./film-api');
test('pausing between shots preserves ready media and pending plans without cancelling GPU work',()=>{
 const {pauseAtBoundary}=require('./film-api');
 const run={status:'rendering',shots:[{ready:true,jobId:'finished',videoUrl:'source'},{ready:false,prompt:'next'}],current:{index:1}};
 const before=structuredClone(run);assert.equal(pauseAtBoundary(run),false);assert.deepEqual(run,before);
 run.pauseRequested=true;assert.equal(pauseAtBoundary(run),true);assert.equal(run.status,'paused');assert.deepEqual(run.shots,before.shots);assert.equal(publicRun(run).pauseRequested,true);
 delete run.pauseRequested;run.status='rendering';assert.equal(pauseAtBoundary(run),false);assert.deepEqual(run.shots,before.shots);
});

test('revision validates original words, keeps reference snapshots, and clears stale render state',()=>{
  const event={type:'speech',speakerId:'c',speakerName:'陈实',delivery:'onscreen',text:'快了。'};
  const original={shotId:'one',duration:4,width:864,height:480,prompt:'Worker sits.',subtitle:'陈实：快了。',sourceExcerpt:'陈实：快了。',dialogueEvents:[event],ready:true,subtitleTiming:{status:'aligned'},renderAttempt:2};
  const parent={id:'film_0000000000000000',projectId:'p',title:'test',status:'complete',shots:[original,{...original,shotId:'two'}]};
  const revision={prompt:'Worker looks down before speaking.',subtitle:'陈实：快了。',duration:5};
  const child=retryPlan(parent,0,revision);
  assert.equal(child.shots[0].prompt,revision.prompt);assert.equal(child.shots[0].duration,5);assert.equal(child.shots[0].subtitleTiming,undefined);assert.equal(child.shots[0].renderAttempt,undefined);assert.deepEqual(child.shots[1],parent.shots[1]);assert.equal(parent.shots[0].prompt,'Worker sits.');assert.equal(child.revision.previousDuration,4);
  assert.throws(()=>retryPlan(parent,0,{...revision,subtitle:'陈实：不借。'}),/原文/);
  assert.throws(()=>retryPlan(parent,0,{...revision,subtitle:'陌生人：快了。'}),/人物/);
  assert.throws(()=>retryPlan(parent,0,{...revision,prompt:'<d>bad</d>'}),/提示词/);
  assert.throws(()=>retryPlan(parent,0,{...revision,subtitle:'屏幕文字：9999'}),/原文/);
  assert.throws(()=>retryPlan({...parent,shots:[{...original,sourceExcerpt:''}]},0,{...revision,subtitle:''}),/原文依据/);
});
const shot={shotId:'one',duration:7.5,width:864,height:480,prompt:'A worker sits down.',subtitle:'陈实：钱没有再转。'};
test('revision cannot reuse a first-frame position for a different visible speaker',()=>{
 const original={shotId:'s',duration:4,width:864,height:480,prompt:'Two people.',firstFrame:{file:'ams-ref-'+ 'a'.repeat(64)+'.png',speakerPosition:'left'},sourceExcerpt:'甲：你好。\n乙：再见。',dialogueEvents:[{type:'speech',speakerId:'a',speakerName:'甲',delivery:'onscreen',text:'你好。'}],references:[{assetId:'a',kind:'characters',name:'甲',file:'ams-ref-'+ 'b'.repeat(64)+'.png'},{assetId:'b',kind:'characters',name:'乙',file:'ams-ref-'+ 'c'.repeat(64)+'.png'}]};
 assert.throws(()=>retryPlan({id:'old',status:'complete',projectId:'p',title:'test',shots:[original]},0,{prompt:'Two people.',subtitle:'乙：再见。',duration:4}),/发声人物已改变/);
});
test('subtitle-only recomposition keeps the enhanced local recognition choice without rerendering',()=>{
 const run={id:'old',projectId:'p',title:'test',status:'complete',audit:{model:'medium'},shots:[{shotId:'s',duration:4,ready:true,audioMode:'model',dialogueEvents:[],screenCards:[]}]};
 const child=require('./film-api').recomposePlan(run,[{shotId:'s',screenCards:[]}]);assert.equal(child.asrModel,'medium');assert.equal(child.compositionOnly,true);assert.equal(child.shots[0].ready,true);assert.equal(run.asrModel,undefined);
});
test('film plans preserve per-shot timing and reject missing or invalid shots',()=>{
  const p={projectId:'p',title:'老实人',shots:[shot]};assert.equal(validatePlan(p).shots[0].duration,7.5);
  for(const s of [{...shot,duration:0},{...shot,duration:20},{...shot,width:1080},{...shot,prompt:''}])assert.throws(()=>validatePlan({...p,shots:[s]}));
  assert.throws(()=>validatePlan({...p,shots:[shot,shot]}));
});
test('subtitles use aligned render duration and remove ASS control commands',()=>{
  const ass=makeAss([{...shot,duration:5,subtitle:'第一句。'},{...shot,duration:9,subtitle:'{\\pos(0,0)}第二句。'}]);
  assert.match(ass,/0:00:05\.17/);assert.doesNotMatch(ass,/pos\(/);assert.match(ass,/第二句/);
});
test('unfinished renders never expose a playable final result',()=>{
  const r={id:'run',projectId:'p',title:'测试',status:'rendering',shots:[shot]};assert.equal(publicRun(r).videoUrl,null);assert.equal(publicRun(r).completed,0);
});
test('single-shot retry creates a new version and preserves the parent and reusable clips',()=>{
  const parent={id:'film_0000000000000000',projectId:'p',title:'test',status:'complete',shots:[{...shot,dialogueEvents:[],ready:true,jobId:'old'},{...shot,shotId:'two',dialogueEvents:[],ready:true}]};
  const child=retryPlan(parent,0);assert.notEqual(child.id,parent.id);assert.equal(child.parentRunId,parent.id);assert.equal(child.shots[0].ready,false);assert.equal(child.shots[0].jobId,undefined);assert.equal(child.shots[1].ready,true);assert.equal(parent.shots[0].ready,true);assert.equal(parent.shots[0].jobId,'old');
  assert.throws(()=>retryPlan(parent,-1));assert.throws(()=>retryPlan({...parent,status:'rendering'},0));assert.throws(()=>retryPlan({...parent,shots:[shot]},0));
});
