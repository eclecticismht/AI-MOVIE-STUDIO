(function(root){
 function merge(data,runs){
  const generations=[...(data.generations||[])];let added=0;
  for(const run of runs)for(const [index,shot] of (run.shots||[]).entries()){
   if(!shot.ready||!shot.videoUrl||!shot.jobId||!(data.shots||[]).some(s=>!s.autoArchived&&s.projectId===run.projectId&&s.id===shot.shotId))continue;
   const processed=run.status==='complete'&&/^film_[a-f0-9]{16}$/.test(run.id)&&(shot.cropBottomPercent>0||shot.audioMode&&shot.audioMode!=='model'),url=processed?'/film-runs/'+run.id+'/'+(shot.cropBottomPercent>0?'framed':'sound')+'-'+index+'.mp4':shot.videoUrl;
   if((data.deletedGenerationResults||[]).some(t=>t.projectId===run.projectId&&t.jobId===shot.jobId&&(t.videoUrl===shot.videoUrl||t.videoUrl===url)))continue;
   if(generations.some(g=>g.projectId===run.projectId&&g.jobId===shot.jobId&&g.videoUrl===url))continue;
   let id='GEN_'+run.id+'_'+shot.jobId;while(generations.some(g=>g.id===id))id+='v';
   generations.push({id,projectId:run.projectId,shot:shot.shotId,jobId:shot.jobId,filmRunId:run.id,sourceFingerprint:shot.sourceFingerprint,performanceAudio:shot.performanceAudio,videoUrl:url,...(processed?{originalVideoUrl:shot.videoUrl,processedComposition:true}:{}),version:processed?'自动成片逐镜 · 已处理画面/声音':'自动成片逐镜',status:'待审核',createdAt:run.createdAt});added++;
  }
  return {generations,added};
 }
 const api={merge};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilmPreviewResults=api;
})(typeof globalThis!=='undefined'?globalThis:this);
