(function(root){
 const Dialogue=typeof module!=='undefined'&&module.exports?require('./dialogue-contract'):root.DialogueContract;
 const clearKeys=['continueFromShotId','filmPrompt','filmPromptSource','filmPromptVersion','autoArchived','videoUrl','firstFrameUrl','firstFrameProvenance','firstFrameSpeakerPosition','firstFrameIntent','localFrameJobId','localFrameResult','localFrameSource','audioAsset','dialogueEvents','jobId','ready','subtitleTiming','continuityFrame'];
 function split(source,options,characters,ids){
  if(!source||source.autoArchived||source.renderMode==='black')throw Error('请选择尚未归档的普通镜头');
  if(source.continueFromShotId)throw Error('请从对白所在的独立镜头开始拆分');
  if(!Array.isArray(ids)||ids.length!==2||ids.some(id=>!id||id===source.id)||ids[0]===ids[1])throw Error('新镜头编号无效');
  const events=Dialogue.parseDialogue(source.dialogue,characters);
  Dialogue.checkSource(events,source.sourceExcerpt);
  if(!events.some(e=>e.type==='speech'))throw Error('此入口需要口头对白，无对白请使用独立拆镜');
  if(events.some(e=>e.type==='screen')||Object.values(source.assetStates||{}).some(s=>s.screenText))throw Error('含屏幕文字的镜头需先分配文字时序，不能自动复制到两段');
  const children=['before','after'].map((phase,i)=>{
   const p=options[phase];
   if(!p||typeof p.action!=='string'||!p.action.trim()||typeof p.visual!=='string'||!p.visual.trim()||p.action.length>10000||p.visual.length>10000)throw Error('请分别填写说话段和动作段的行动与画面');
   if(!Number.isFinite(p.duration)||p.duration<4||p.duration>15)throw Error('每段需为 4–15 秒，总时长可能增加');
   const copy=JSON.parse(JSON.stringify(source));for(const key of clearKeys)delete copy[key];
   Object.assign(copy,{id:ids[i],parentShotId:source.id,script:p.action.trim(),visual:p.visual.trim(),desc:p.visual.trim(),dur:p.duration,dialogue:i?'':source.dialogue,prompt:'',audioMode:'model',status:'待制作',splitPhase:phase});
   if(i)copy.continueFromShotId=ids[0];
   return copy;
  });
  Dialogue.bindDialogue('visual only',events,children[0].dur);
  return {children,totalSeconds:children.reduce((n,s)=>n+s.dur,0),previousSeconds:Number(source.dur)};
 }
 function replace(shots,source,children){
  if(!shots.includes(source)||children.length!==2)throw Error('拆分镜头已改变，请重新打开');
  const batch=shots.filter(s=>s.projectId===source.projectId&&s.storyboardBatchId===source.storyboardBatchId&&!s.autoArchived).sort((a,b)=>(a.sequence||0)-(b.sequence||0));
  const expanded=batch.flatMap(s=>s===source?children:[s]);
  const order=new Map(expanded.map((s,i)=>[s.id,i+1]));
  return shots.flatMap(s=>s===source?[{...s,autoArchived:true},...children]:[s]).map(s=>{
   if(s.projectId!==source.projectId||s.storyboardBatchId!==source.storyboardBatchId||s.autoArchived)return s;
   return {...s,sequence:order.get(s.id),...(s.continueFromShotId===source.id?{continueFromShotId:children[1].id}:{})};
  });
 }
 const api={split,replace};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DialogueActionSplit=api;
})(typeof globalThis!=='undefined'?globalThis:this);
