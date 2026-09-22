(function(root){
 async function run(story,model,draft,io){
  if(!story?.trim()||story.length>60000)throw Error('请填写本场故事原文，最多 60000 字。');
  let state=draft?.story===story&&draft.model===model?structuredClone(draft):{story,model};
  const checkpoint=async()=>io.save(structuredClone(state));
  if(!state.screenplay){io.notice('1 / 3 · 生成本场剧本与资产');state.screenplay=await io.request('/api/screenplay',{story,model,includeAssets:true,notes:'只改编当前场次原文，不补写其他场次。'});if(!state.screenplay.content?.trim())throw Error('未返回本场剧本');await checkpoint()}
  if(!state.prepared){state.prepared=io.prepare(state.screenplay);await checkpoint()}
  if(!state.shots){
   const parts=io.split(state.screenplay.content);state.parts||=[];
   for(let i=0;i<parts.length;i++){
    if(state.parts[i])continue;io.notice(`2 / 3 · 生成本场场景与镜头 ${i+1}/${parts.length}`);
    let result,repair;
    for(let attempt=0;attempt<3;attempt++){
     try{result=await io.request('/api/storyboard',{screenplay:parts[i].text,model,assets:state.prepared.assets,timing:{mode:'auto'},repair,notes:'只生成本段镜头。口头对白按每秒3字加1秒分配时长，每镜4至15秒，长对白按原文拆镜。'});break}catch(e){if(!e.repair||attempt===2)throw e;repair=e.repair}
    }
    if(!result?.shots?.length||result.shots[0].continuePrevious)throw Error('本场分镜为空或首镜错误承接其他场次');
    state.parts[i]=result.shots;await checkpoint();
   }
   state.shots=io.makeShots(state.parts.flat(),state.prepared);await checkpoint();
  }
  for(let i=0;i<state.shots.length;i+=6){
   const chunk=state.shots.slice(i,i+6).filter(s=>!s.prompt);if(!chunk.length)continue;
   io.notice(`3 / 3 · 生成本场 H3 提示词 ${i+1}–${Math.min(i+6,state.shots.length)}/${state.shots.length}`);
   const result=await io.request('/api/h3-prompts',{model,shots:chunk.map(s=>({id:s.id,duration:Number(s.dur),description:io.describe(s,state.prepared),dialogue:s.dialogue||''}))});
   if(!Array.isArray(result.prompts)||result.prompts.length!==chunk.length||new Set(result.prompts.map(p=>p.id)).size!==chunk.length||result.prompts.some(p=>!chunk.some(s=>s.id===p.id)||!io.validPrompt(p.prompt)))throw Error('H3 提示词返回不完整，请继续重试');
   for(const p of result.prompts)state.shots.find(s=>s.id===p.id).prompt=p.prompt;await checkpoint();
  }
  return state;
 }
 const api={run};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ActGeneration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
