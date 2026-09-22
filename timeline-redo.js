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
  if(typeof prompt!=='string'||prompt.length>30000||!/^integrated_multimodal_description:/i.test(prompt)||!prompt.includes('overall_soundscape:')||!prompt.includes('non_diegetic_music:')||/<d\b/i.test(prompt))throw Error('AI 返回的提示词不完整，请重试');
  return {...shot,prompt,soundscape:prompt.split('overall_soundscape:')[1].split('non_diegetic_music:')[0].trim()};
 }
 const api={scope,request,revised};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimelineRedo=api;
})(typeof globalThis!=='undefined'?globalThis:this);
