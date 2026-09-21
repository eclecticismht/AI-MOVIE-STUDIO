(function(root){
 function progressText(run,now=Date.now()){
  const p=run.current?.progress,parts=[];
  if(Number.isInteger(run.current?.index))parts.push(`正在处理第 ${run.current.index} 镜`);
  if(run.current?.stage)parts.push(run.current.stage);
  if(p?.phase==='sampling'){
   parts.push(`采样 ${p.value}/${p.max} 步`);
   if(p.value===p.max)parts.push('等待解码和保存视频');
   else if(p.connected&&Number.isFinite(p.etaSeconds)&&p.etaSeconds>=0&&Number.isFinite(p.updatedAt)&&now-p.updatedAt<30000){
    const seconds=Math.ceil(p.etaSeconds);
    parts.push(`本镜采样预计还需 ${seconds>=60?Math.ceil(seconds/60)+' 分钟':seconds+' 秒'}（不含解码、检查和整片合成）`);
   }
  }
  return parts.join(' · ');
 }
 function orderedRuns(runs){
  const active=new Set(['pending','rendering','assembling']);
  return [...runs].sort((a,b)=>Number(active.has(b.status))-Number(active.has(a.status))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 }
 function latestByProject(runs,projects){
  return projects.flatMap(project=>{
   const entries=orderedRuns(runs.filter(run=>run.projectId===project.id));
   return entries[0]?[{project,run:entries[0]}]:[];
  });
 }
 const api={latestByProject,orderedRuns,progressText};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilmStudioSummary=api;
})(typeof globalThis!=='undefined'?globalThis:this);
