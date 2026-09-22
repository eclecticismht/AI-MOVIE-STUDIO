(function(root){
 function merge(data,runs){
  const generations=[...(data.generations||[])];let added=0;
  for(const run of runs)for(const shot of run.shots||[]){
   if(!shot.ready||!shot.videoUrl||!shot.jobId||!(data.shots||[]).some(s=>!s.autoArchived&&s.projectId===run.projectId&&s.id===shot.shotId))continue;
   if((data.deletedGenerationResults||[]).some(t=>t.projectId===run.projectId&&t.jobId===shot.jobId&&t.videoUrl===shot.videoUrl))continue;
   if(generations.some(g=>g.projectId===run.projectId&&g.jobId===shot.jobId&&g.videoUrl===shot.videoUrl))continue;
   let id='GEN_'+run.id+'_'+shot.jobId;while(generations.some(g=>g.id===id))id+='v';
   generations.push({id,projectId:run.projectId,shot:shot.shotId,jobId:shot.jobId,filmRunId:run.id,sourceFingerprint:shot.sourceFingerprint,videoUrl:shot.videoUrl,version:'自动成片逐镜',status:'待审核',createdAt:run.createdAt});added++;
  }
  return {generations,added};
 }
 const api={merge};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilmPreviewResults=api;
})(typeof globalThis!=='undefined'?globalThis:this);
