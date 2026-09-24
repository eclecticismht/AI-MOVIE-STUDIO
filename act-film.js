(function(root){
 function groups(data,batchId){
  const project=data.projects.find(p=>p.id===data.activeProjectId),batch=(data.storyboardBatches||[]).find(b=>b.id===batchId&&b.projectId===project?.id);
  if(!batch)return [];
  const shots=data.shots.filter(s=>s.projectId===project.id&&!s.autoArchived).sort((a,b)=>(a.sequence||0)-(b.sequence||0));
  const selected=project.storyActsSelection?.[batch.sourceScriptId||'draft'];
  const entries=Object.entries(project.storyActs||{}).sort(([a],[b])=>Number(b===selected)-Number(a===selected));
  const entry=entries.find(([key,value])=>key.split('|')[1]===batchId||value.acts?.some(a=>a.generatedBatchId===batchId||a.shotIds?.some(id=>shots.some(s=>s.id===id&&s.storyboardBatchId===batchId))));
  const acts=entry?entry[1].acts:[{id:'act-1',title:'场次一',shotIds:shots.filter(s=>s.storyboardBatchId===batchId).map(s=>s.id)}];
  return (acts||[]).map(a=>({id:a.id,title:a.title||'场次',shots:shots.filter(s=>(a.shotIds||[]).includes(s.id)).map(s=>({shotId:s.id,sequence:s.sequence,label:s.scene||'镜头'}))})).filter(a=>a.shots.length);
 }
 function choose(plan,sources){
  const selections=plan.shots.map(s=>{
   const candidates=sources.filter(x=>x.projectId===plan.projectId&&x.shot.shotId===s.shotId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
   return {slot:s,source:candidates[0]};
  });
  return {selections,missing:selections.filter(x=>!x.source?.ready).map(x=>x.slot.shotId)};
 }
 function at(shots,time){return shots.find(s=>time>=s.start&&time<s.end)||shots.at(-1)}
 const api={groups,choose,at};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ActFilm=api;
})(typeof globalThis!=='undefined'?globalThis:this);
