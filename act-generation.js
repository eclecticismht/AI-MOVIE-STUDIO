(function(root){
 async function run(story,model,draft,io){
  if(!story?.trim()||story.length>60000)throw Error('请填写本场故事原文，最多 60000 字。');
  let state=draft?.story===story&&draft.model===model?structuredClone(draft):{story,model};
  const semantic=typeof module!=='undefined'&&module.exports?require('./story-understanding'):root.StoryUnderstanding;
  const checked=(route,body)=>semantic.checked(io.request,route,body);
  const checkpoint=async()=>io.save(structuredClone(state));
  if(!state.screenplay&&!state.understanding){io.notice('1 / 5 · 理解人物、事实与动作顺序');state.understanding=(await checked('/api/screenplay/understanding',{story,model})).understanding;if(!state.understanding?.beats?.length)throw Error('未返回完整故事理解');await checkpoint()}
  if(!state.screenplay){io.notice('2 / 5 · 生成本场剧本与资产');state.screenplay=await checked('/api/screenplay',{story,model,storyUnderstanding:state.understanding,includeAssets:true,notes:'只改编当前场次原文，不补写其他场次。'});if(!state.screenplay.content?.trim())throw Error('未返回本场剧本');await checkpoint()}
  if(!state.prepared){state.prepared=io.prepare(state.screenplay);await checkpoint()}
  // Old checkpoints included every project asset. Narrow only before any shots
  // have been accepted, so resuming never invalidates an already saved reference.
  if(!state.shots&&!state.parts?.some(Boolean)&&state.prepared.references){
   for(const [kind,key] of [['characters','characterIds'],['scenes','sceneIds'],['props','propIds']]){
    const ids=state.prepared.references[key];
    if(Array.isArray(ids))state.prepared.assets[kind]=state.prepared.assets[kind].filter(a=>ids.includes(a.id));
   }
  }
  for(let round=0;!state.shots&&round<3;round++){
   const segments=typeof module!=='undefined'&&module.exports?require('./storyboard-segments'):root.StoryboardSegments;
   const parts=state.segments||io.split(state.screenplay.content);state.segments=parts;state.parts||=[];
   for(let i=0;i<parts.length;i++){
    if(state.parts[i])continue;io.notice(`3 / 5 · 生成本场场景与镜头 ${i+1}/${parts.length}`);
    let result,resplit=false,repair=state.repairs?.[i];
    for(let attempt=0;attempt<3;attempt++){
     try{result=await io.request('/api/storyboard',{screenplay:parts[i].text,segmentContext:{index:i,segments:parts.map(part=>part.text)},sourceStory:story,storyUnderstanding:state.understanding,model,assets:state.prepared.assets,timing:{mode:'auto'},repair,notes:(state.storyboardFeedback?'上次全场复核必须修正：'+state.storyboardFeedback+'\n':'')+'只生成本段镜头。口头对白按每秒3字加1秒分配时长，每镜4至15秒，长对白按原文拆镜。原文指定的一镜到底、连续运镜与总时长必须保留；同一连续动作的画面、声音和片名说明不能逐段拆成重复镜头。片名使用后期资产，不交给视频模型生成文字。sourceStory只供核对原文，不属于本段生成范围。只生成screenplay当前片段中的动作和对白。'+story.split('\n').filter(line=>/一镜到底|连续运镜|不切镜|横屏|fps|分辨率|[0-9]+秒镜头/.test(line)).join('\n')});break}catch(e){
      if(e.code==='MODEL_OUTPUT_LIMIT'){
       const smaller=/一镜到底|不切镜/.test(story)?[]:segments.bisect(parts[i]);
       state.outputLimits=[...(state.outputLimits||[]),{partIndex:i,characters:parts[i].text.length,at:new Date().toISOString()}].slice(-20);
       if(smaller.length){parts.splice(i,1,...smaller);state.parts.splice(i,1,...smaller.map(()=>null));delete state.repairs;io.notice('本段输出过长，已自动拆为较短片段；此前分镜保持不变');await checkpoint();resplit=true;break}
       await checkpoint();throw e;
      }
      if(!e.repair)throw e;repair=e.repair;state.repairs||={};state.repairs[i]=repair;await checkpoint();if(attempt===2)throw e}
    }
    if(resplit){i--;continue;}
    if(!result?.shots?.length||result.shots[0].continuePrevious)throw Error('本场分镜为空或首镜错误承接其他场次');
    state.parts[i]=result.shots;if(state.repairs)delete state.repairs[i];await checkpoint();
   }
   if(state.understanding){
    io.notice('4 / 5 · 对照原文复核全部动作与事实');
    state.review=(await checked('/api/screenplay/coverage',{story,model,storyUnderstanding:state.understanding,shots:state.parts.flat()})).review;await checkpoint();
    if(state.review?.status!=='checked'){
     state.storyboardFeedback=(state.review?.issues||['未返回完整复核结果']).join('\n');
     state.storyboardAttempts=[...(state.storyboardAttempts||[]),{parts:state.parts,review:state.review}].slice(-3);state.parts=[];delete state.repairs;delete state.segments;await checkpoint();
     if(round===2)throw Error('故事画面仍需修正：'+state.storyboardFeedback);
     // Repair omissions at their source too; a storyboard cannot quote facts
     // that the adapted screenplay accidentally dropped.
     state.screenplayAttempts=[...(state.screenplayAttempts||[]),state.screenplay].slice(-3);
     io.notice('按原文修正剧本遗漏，再重做尚未通过的分镜');
     state.screenplay=await checked('/api/screenplay',{story,model,storyUnderstanding:state.understanding,includeAssets:true,repair:{content:JSON.stringify(state.screenplay),error:state.storyboardFeedback},notes:'只修正复核发现的原文遗漏或冲突，不增加情节。所有关键日期、身份、年龄、生日、否定、次数与状态在正文明确保留，可作为静默画面信息，不补写对白。'});
     state.prepared=io.prepare(state.screenplay);await checkpoint();continue;
    }
   }
   let raw=state.parts.flat();if(state.understanding&&state.review?.beatIds)raw=semantic.annotate(raw.map((s,i)=>({...s,beatIds:state.review.beatIds[i]})),state.understanding);
   state.shots=io.makeShots(raw,state.prepared);await checkpoint();
  }
  for(let i=0;i<state.shots.length;i+=6){
   const chunk=state.shots.slice(i,i+6).filter(s=>!s.prompt);if(!chunk.length)continue;
   io.notice(`5 / 5 · 生成本场 H3 提示词 ${i+1}–${Math.min(i+6,state.shots.length)}/${state.shots.length}`);
   let result;
   try{result=await checked('/api/h3-prompts',{model,repair:state.h3Repairs?.[i],shots:chunk.map(s=>({id:s.id,duration:Number(s.dur),description:io.describe(s,state.prepared),dialogue:s.dialogue||''}))})}
   catch(error){if(error.repair){state.h3Repairs||={};state.h3Repairs[i]=error.repair;await checkpoint()}throw error}
   if(!Array.isArray(result.prompts)||result.prompts.length!==chunk.length||new Set(result.prompts.map(p=>p.id)).size!==chunk.length||result.prompts.some(p=>!chunk.some(s=>s.id===p.id)||!io.validPrompt(p.prompt)))throw Error('H3 提示词返回不完整，请继续重试');
   for(const p of result.prompts)state.shots.find(s=>s.id===p.id).prompt=p.prompt;if(state.h3Repairs)delete state.h3Repairs[i];await checkpoint();
  }
  return state;
 }
 const api={run};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ActGeneration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
