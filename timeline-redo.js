(function(root){
 function scope(shots,id){
  const target=shots.find(s=>s.id===id);if(!target)throw Error('对应镜头已不存在');
  const list=shots.filter(s=>!s.autoArchived&&s.projectId===target.projectId&&s.storyboardBatchId===target.storyboardBatchId).slice().sort((a,b)=>a.sequence-b.sequence);
  let start=list.findIndex(s=>s.id===id),end=start;
  while(list[start].continueFromShotId){if(start===0||list[start-1].id!==list[start].continueFromShotId)throw Error('尾帧承接顺序不完整，请先调整分镜');start--;}
  while(end+1<list.length&&list[end+1].continueFromShotId===list[end].id)end++;
  return list.slice(start,end+1);
 }
 function request(shot,prompt,instruction){
  if(typeof instruction!=='string'||!instruction.trim()||instruction.length>3000)throw Error('请填写修改要求，最多 3000 字');
  return {id:shot.id,duration:Number(shot.dur),dialogue:shot.dialogue||'',description:JSON.stringify({currentPrompt:prompt,revisionRequest:instruction.trim(),rules:'Revise this shot to fulfill the revision request, replacing conflicting visual or ambient-sound directions rather than appending contradictory instructions. Keep unrelated composition, reference identities, wardrobe, timing and verified dialogue. Remove unwanted generated captions, narration and stray voices when requested; keep necessary physical sounds. Dialogue is bound separately; do not add spoken words or dialogue tags. Interpret left/right relative to the viewer.'})};
 }
 function revised(shot,prompt){
  if(prompt&&typeof prompt==='object'){
   const r=prompt,next=revised(shot,r.prompt);
   for(const field of ['script','visual','camera','scene','dialogue'])if(typeof r[field]!=='string')throw Error('AI 返回的镜头内容不完整');
   if(!Number.isFinite(r.dur)||r.dur<4||r.dur>15||!['model','mute','replacement','overlay'].includes(r.audioMode))throw Error('AI 返回的时长或声音设置无效');
   Object.assign(next,Object.fromEntries(['script','visual','camera','scene','dialogue','dur','audioMode','assetStates'].map(k=>[k,r[k]])),{desc:r.visual,actionReviewRequired:false,sourceReviewRequired:false});
   const texts=Object.values(r.assetStates||{}).map(a=>a.screenText).filter(Boolean);
   next.sourceExcerpt=[r.script,r.dialogue,...texts.map(t=>'屏幕文字：'+t)].filter(Boolean).join('\n');
   next.redoHistory=[...(shot.redoHistory||[]),{at:new Date().toISOString(),instruction:r.instruction||'',summary:r.summary||'',before:{script:shot.script,visual:shot.visual,camera:shot.camera,dialogue:shot.dialogue,dur:shot.dur,sourceExcerpt:shot.sourceExcerpt,prompt:shot.prompt,assetStates:shot.assetStates,audioMode:shot.audioMode}}].slice(-5);
   if(r.breakContinuity)delete next.continueFromShotId;
   if(r.audioMode==='model'||r.audioMode==='mute')delete next.audioAsset;
   return next;
  }
  if(typeof prompt!=='string'||prompt.length>30000||!/^integrated_multimodal_description:/i.test(prompt)||!prompt.includes('overall_soundscape:')||!prompt.includes('non_diegetic_music:')||/<d\b/i.test(prompt))throw Error('AI 返回的提示词不完整，请重试');
  return {...shot,prompt,soundscape:prompt.split('overall_soundscape:')[1].split('non_diegetic_music:')[0].trim()};
 }
 function editRequest(shot,prompt,instruction,characters){
  const fields=['script','visual','camera','scene','dialogue','dur','audioMode','audioAsset','assetStates','characterIds','sceneIds','propIds','continueFromShotId','renderMode'];
  return {instruction,characters:characters.map(c=>({id:c.id,name:c.name})),shot:{...Object.fromEntries(fields.map(k=>[k,shot[k]])),prompt}};
 }
 const api={scope,request,revised,editRequest};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimelineRedo=api;
})(typeof globalThis!=='undefined'?globalThis:this);
