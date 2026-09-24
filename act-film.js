(function(root){
 function context(data,batchId){
  const project=data.projects.find(p=>p.id===data.activeProjectId),batch=(data.storyboardBatches||[]).find(b=>b.id===batchId&&b.projectId===project?.id);
  if(!batch)return {scopeKey:batchId||'',acts:[]};
  const shots=data.shots.filter(s=>s.projectId===project.id&&!s.autoArchived).sort((a,b)=>(a.sequence||0)-(b.sequence||0));
  const selected=project.storyActsSelection?.[batch.sourceScriptId||'draft'];
  const entries=Object.entries(project.storyActs||{}).sort(([a],[b])=>Number(b===selected)-Number(a===selected));
  const entry=entries.find(([key,value])=>key.split('|')[1]===batchId||value.acts?.some(a=>a.generatedBatchId===batchId||a.shotIds?.some(id=>shots.some(s=>s.id===id&&s.storyboardBatchId===batchId))));
  const acts=entry?entry[1].acts:[{id:'act-1',title:'场次一',shotIds:shots.filter(s=>s.storyboardBatchId===batchId).map(s=>s.id)}];
  const grouped=(acts||[]).map(a=>({id:a.id,title:a.title||'场次',shots:shots.filter(s=>(a.shotIds||[]).includes(s.id)).map(s=>({shotId:s.id,sequence:s.sequence,label:s.scene||'镜头'}))})).filter(a=>a.shots.length);
  return {scopeKey:entry?.[0].split('|')[1]||batchId,acts:grouped,preferredActId:grouped.find(a=>a.shots.some(s=>shots.find(x=>x.id===s.shotId)?.storyboardBatchId===batchId))?.id};
 }
 function groups(data,batchId){return context(data,batchId).acts}
 function choose(plan,sources){
  const selections=plan.shots.map(s=>{
   const candidates=sources.filter(x=>x.projectId===plan.projectId&&x.shot.shotId===s.shotId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
   return {slot:s,source:candidates[0]};
  });
  return {selections,missing:selections.filter(x=>!x.source?.ready).map(x=>x.slot.shotId)};
 }
 function at(shots,time){return shots.find(s=>time>=s.start&&time<s.end)||shots.at(-1)}
 function approval(act,version,pending=false){
  if(pending)return {label:'正在保存…',disabled:true};
  if(version?.id!==act?.versions.at(-1)?.id)return {label:'查看最新版后通过',disabled:false,latest:true,notice:'当前观看的是旧版，已有新版成片。请先切换并观看最新版，再确认通过。'};
  if(version?.approvedAt)return {label:'本场已通过',disabled:true,notice:'本场通过状态已保存。'};
  if(act?.status!=='ready')return {label:'等待新版成片完成',disabled:true,notice:'镜头正在更新，成片完成后即可确认通过。'};
  return {label:'本场通过',disabled:false};
 }
 const api={context,groups,choose,at,approval};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ActFilm=api;
})(typeof globalThis!=='undefined'?globalThis:this);
