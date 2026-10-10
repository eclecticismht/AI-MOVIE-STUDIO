// AMS director plan -> real frame and render requests. No network or automatic approval here.
(function(root){
 'use strict';
 const node=typeof module!=='undefined'&&module.exports;
 const P=node?require('./director-previs-model'):root.DirectorPrevis;
 const D=node?require('./dialogue-contract'):root.DialogueContract;
 const S=node?require('./shot-prompt'):root.ShotPrompt;
 const A=node?require('./asset-states'):root.AssetStates;
 const F=node?require('./frame-provenance'):root.FrameProvenance;
 const V=node?require('./voice-casting'):root.VoiceCasting;
 const C=node?require('./performance-audio-contract'):root.PerformanceAudio;
 function dimensions(data,shot){
  const p=(data.projects||[]).find(p=>p.id===shot.projectId);if(!p)throw Error('镜头项目不存在');
  const width=shot.width??p.h3Width??1024,height=shot.height??p.h3Height??576;
  if(![width,height].every(x=>Number.isInteger(x)&&x>=256&&x<=1536&&x%32===0)||width*height>1572864)throw Error('导演镜头尺寸须符合本机32像素网格，256—1536且总像素不超过150万');
  return {width,height};
 }
 function context(data,shot){
  const project=(data.projects||[]).find(p=>p.id===shot.projectId);if(!project)throw Error('导演镜头所属项目不存在');
  if(project.productionPolicy?.generationHold)throw Error('项目已暂停生成，导演试镜不解除项目暂停');
  const characters=(data.characters||[]).filter(c=>c.projectId===shot.projectId),events=D.parseDialogue(shot.dialogue||'',characters);
  D.checkSource(events,shot.sourceExcerpt,characters);
  if(!shot.directorPlan)throw Error('本镜尚无导演调度');
  P.assertReady(shot.directorPlan,shot,project,characters,events);
  return {project,characters,events};
 }
 function references(data,shot){
  const {characters}=context(data,shot),refs=[];
  const selected=[...(shot.characterIds||[]),...(shot.sceneIds||[]),...(shot.propIds||[])];
  const states=A?A.validate(shot.assetStates||{},selected,shot.sourceExcerpt):(shot.assetStates||{});
  for(const [kind,key] of [['scenes','sceneIds'],['characters','characterIds'],['props','propIds']]){
   for(const id of new Set(shot[key]||[])){
    const item=(data[kind]||[]).find(a=>a.projectId===shot.projectId&&a.id===id);if(!item)throw Error('本镜资产不存在或不属于此项目：'+id);
    const actor=kind==='characters'?shot.directorPlan.actors.find(a=>a.characterId===id):null;
    if(actor&&['offscreen','absent'].includes(actor.presence))continue;
    if(kind==='characters'&&!actor)throw Error('人物引用缺少对应调度：'+id);
    const asset=A?A.resolve(item,states[id]):item;if(!asset.imageUrl)throw Error('缺少本镜资产图片：'+asset.name);
    const presence=actor?.presence;
    refs.push({assetId:id,kind:presence==='screen'?'props':kind,name:asset.name,imageUrl:asset.imageUrl,
     notes:presence==='screen'?'ONLY within the existing video display, never an extra physical person.':String(asset.notes||asset.prompt||''),
     ...(actor&&presence==='onscreen'?{position:P.projectPoint(actor.start,shot.directorPlan.camera.start,shot.directorPlan.camera.fov).side}:{})});
   }
  }
  if(refs.length>9)throw Error('本镜超过9张图片引用；请调整资产而不是删除在场人物');
  return refs;
 }
 function frameKey(data,shot){
  const {project}=context(data,shot);
  return P.signature({version:2,dimensions:dimensions(data,shot),visualGuidance:shot.directorVisualGuidance||'',projectId:shot.projectId,shotId:shot.id,plan:shot.directorPlan,binding:P.binding(shot),assets:references(data,shot),space:project.directorSpaces?.find(s=>s.id===shot.directorPlan.space.id)});
 }
 function openingPrompt(data,shot){
  const {project,characters}=context(data,shot);
  return P.frameInstructions(shot,project,characters)+'\nCreate a single live-action cinematic ensemble opening frame. Use the specified physical positions, furniture and distinct reference identities. Do not collapse this into a solo close-up or reference-sheet collage. Only the starting state is pictured; later actions are performed in the video. '+(shot.directorVisualGuidance||'');
 }
 function frameRequest(data,shot,uploaded){
  const required=references(data,shot),ids=new Set(uploaded.map(r=>r.assetId));
  if(required.some(r=>!ids.has(r.assetId))||ids.size!==required.length)throw Error('上传图片与本镜资产不一致');
  return {projectId:shot.projectId,shotId:shot.id,prompt:openingPrompt(data,shot),...dimensions(data,shot),references:uploaded,referencePolicy:'adapt',referenceStrength:3};
 }
 // Staged requests use only the current AMS two-image/pair API; no unsupported backend flag.
 function framePasses(refs){
  const people=refs.filter(r=>r.kind==='characters'),scene=refs.find(r=>r.kind==='scenes');
  if(!scene||people.length<2)return [refs.slice()];
  const rank=r=>({left:0,center:1,right:2,background:3})[r.position]??1;
  const sorted=people.slice().sort((a,b)=>rank(a)-rank(b));
  const first=[scene,sorted[0],sorted.at(-1)],ids=new Set(first.map(r=>r.assetId));
  return [first,...refs.filter(r=>!ids.has(r.assetId)).map(r=>[r])];
 }
 function checkFrame(data,shot,review){
  const source=frameKey(data,shot),ctx=context(data,shot),visible=shot.directorPlan.actors.filter(a=>a.presence==='onscreen').map(a=>a.characterId).sort();
  if(!review||review.source!==source||!review.imageUrl||review.imageUrl!==shot.firstFrameUrl)throw Error('首帧调度来源已变化，须重新检查实际图片');
  if(!['user_visual_inspection','assistant_visual_inspection'].includes(review.reviewer)||!review.at)throw Error('首帧尚未实际看图核对');
  if(P.signature([...(review.visibleCharacterIds||[])].sort())!==P.signature(visible))throw Error('首帧中可见人物未与导演计划一致');
  for(const k of ['identities','count','wardrobe','blocking','space'])if(review.checks?.[k]!==true)throw Error('首帧尚未通过 '+k+' 检查');
  const speech=ctx.events.filter(e=>e.type==='speech'&&e.delivery==='onscreen');
  if(new Set(ctx.events.filter(e=>e.type==='speech').map(e=>e.speakerId)).size>1)throw Error('当前渲染段只绑定一位发声者；多人同框不等于多人同时说话');
  if(speech.length){
   if(review.speakerId!==speech[0].speakerId||!['left','center','right'].includes(review.speakerPosition))throw Error('须在实际首帧中核对发声者，而不是自动填center');
   if(shot.firstFrameSpeakerPosition!==review.speakerPosition)throw Error('首帧发声者位置与看图记录不一致');
  }
  F.validate(shot,references(data,shot));return ctx;
 }
 function renderRequest(data,shot,{firstFrame,binding,jobId,review=shot.directorFrameReview}={}){
  const ctx=checkFrame(data,shot,review),duration=Number(shot.dur);
  if(duration<4||duration>15||!Number.isFinite(duration))throw Error('试镜时长必须为4—15秒');
  if(!firstFrame||!/^ams-ref-[a-f0-9]{64}\.(png|jpg|webp)$/.test(firstFrame.file||''))throw Error('必须上传已核对的本镜首帧');
  const speech=ctx.events.filter(e=>e.type==='speech');
  if(speech.length){
   if(!binding)throw Error('请为本镜绑定已核对对白，不能重新随机生成语音');
   V.assertSelection(data,shot,binding.source?.file||binding.file,ctx.events);
   C.validate(binding,{...shot,duration,dialogueEvents:ctx.events,firstFrame});
   if(speech.some(e=>e.delivery==='onscreen')&&firstFrame.speakerPosition!==review.speakerPosition)throw Error('上传首帧的发声位置不匹配实际检查');
  }else if(binding)throw Error('无对白动作镜头不能附带别人的配音');
  const refs=references(data,shot),prompt=S.compile({...shot,dialogueEvents:ctx.events},ctx.project,refs)+'\n'+(shot.directorVisualGuidance||'');
  return {id:jobId,projectId:shot.projectId,shot:shot.id,model:'Minimax H3',mode:'I2VA',prompt,duration,...dimensions(data,shot),references:[],firstFrame,dialogueEvents:ctx.events,...(binding?{performanceAudio:binding}:{}),h3Attention:'pytorch',faceRefineMode:'off',directorSource:frameKey(data,shot)};
 }
 function cloneTrial(data,source,{id,batchId,duration=source.dur,plan=source.directorPlan}={}){
  if(!id||!batchId||(data.shots||[]).some(s=>s.id===id))throw Error('试镜编号缺失或已存在，不能覆盖旧媒体');
  const next=P.clone(source);Object.assign(next,{id,storyboardBatchId:batchId,parentShotId:source.id,dur:duration,directorPrevisOnly:true,status:'导演试镜待检查',isDirectorTrial:true});
  for(const k of ['videoUrl','firstFrame','firstFrameUrl','firstFrameProvenance','firstFrameSpeakerPosition','performanceAudio','localFrameJobId','localFrameSource','localFrameResult','directorFrameReview','continueFromShotId','filmPrompt','filmPromptSource','filmPromptVersion'])delete next[k];
  const combined={...data,shots:[...data.shots,next]};return P.applyPlan(combined,source.projectId,id,P.clone(plan),P.signature(next),D.parseDialogue(next.dialogue||'',data.characters.filter(c=>c.projectId===source.projectId)));
 }
 const api={dimensions,framePasses,context,references,frameKey,openingPrompt,frameRequest,checkFrame,renderRequest,cloneTrial};
 if(node)module.exports=api;else root.DirectorRenderBridge=api;
})(typeof globalThis!=='undefined'?globalThis:this);
