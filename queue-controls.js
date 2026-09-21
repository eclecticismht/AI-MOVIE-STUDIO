const clearingRenderProjects=new Set(),renderQueueMessages=new Map(),renderJobOperations=new Set();

async function clearRenderQueue(){
  const projectId=D.activeProjectId,targets=D.jobs.filter(j=>j.projectId===projectId);
  if(clearingRenderProjects.has(projectId)||!targets.length)return;
  if(!confirm('清空当前项目的 '+targets.length+' 条队列记录？\n所有记录都会移除，旧视频和分镜保留。会尝试取消尚未运行的远程任务；正在运行或连接不上的任务可能继续在 ComfyUI 中执行，移除记录不代表停止渲染。'))return;
  clearingRenderProjects.add(projectId);renderQueueMessages.set(projectId,'正在清空全部队列记录…');renderGeneration();
  let remoteUncertain=0;
  try{
    const results=await Promise.all(targets.map(async job=>{
      let videoUrl=job.videoUrl,uncertain=false;
      const remote=job.comfyPromptId||job.dispatchAttemptedAt||job.startedAt||/已提交|发送失败|运行中|渲染中|处理中/.test(job.status||'');
      if(dispatchingJobs.has(job.id)||renderJobOperations.has(job.id))return {job,videoUrl,uncertain:true};
      if(remote&&job.status!=='已取消'&&!jobIsComplete(job)){
        try{
          const response=await fetch(D.connector.endpoint+'/jobs/'+encodeURIComponent(job.id)+'/status',{signal:AbortSignal.timeout(8000)});
          const result=await response.json();if(!response.ok)throw Error('unknown');
          videoUrl=result.job?.videoUrl||videoUrl;
          if(!videoUrl&&result.job?.connectorStatus!=='已取消'){
            const cancel=await fetch(D.connector.endpoint+'/jobs/'+encodeURIComponent(job.id)+'/cancel',{method:'POST',signal:AbortSignal.timeout(8000)});
            const outcome=await cancel.json();if(!cancel.ok||outcome.job?.connectorStatus!=='已取消')uncertain=true;
          }
        }catch{uncertain=true}
      }
      return {job,videoUrl,uncertain};
    }));
    const baseline=JSON.stringify(D),currentResults=new Set(),currentGenerations=new Set();
    for(const {job,videoUrl} of results)if(videoUrl&&await ResultGuard.matches(D.shots.find(s=>s.id===job.shot&&s.projectId===projectId),job,D))currentResults.add(job.id);
    for(const g of D.generations)if(g.projectId===projectId&&g.status==='待审核'&&await ResultGuard.matches(D.shots.find(s=>s.id===g.shot&&s.projectId===projectId),g,D))currentGenerations.add(g.id);
    if(baseline!==JSON.stringify(D))throw Error('检查期间项目数据发生变化，队列仍保留，请重试；远程取消可能已执行。');
    const ids=new Set(targets.map(j=>j.id)),jobs=D.jobs.filter(j=>!ids.has(j.id)),generations=[...D.generations],detached=[...(D.detachedRenderJobs||[])];
    for(const {job,videoUrl,uncertain} of results){
      if(videoUrl&&!(D.deletedGenerationResults||[]).some(t=>t.projectId===projectId&&t.jobId===job.id&&t.videoUrl===videoUrl)&&!generations.some(g=>g.projectId===projectId&&g.jobId===job.id&&g.videoUrl===videoUrl)){
        const generation={id:uid('GEN'),projectId,jobId:job.id,shot:job.shot,version:job.version||'v001',status:currentResults.has(job.id)?'待审核':'历史结果（来源已变化或未记录）',sourceFingerprint:job.sourceFingerprint,model:job.model,videoUrl,createdAt:new Date().toLocaleString()};
        generations.push(generation);if(currentResults.has(job.id))currentGenerations.add(generation.id);
      }
      if(uncertain){remoteUncertain++;if(!detached.some(j=>j.id===job.id))detached.push({...job,removedAt:new Date().toISOString(),removalNote:'已从工作室队列移除，远程任务可能仍在执行'})}
    }
    const shots=D.shots.map(shot=>{
      if(shot.projectId!==projectId||shot.status!=='等待 Worker'||!targets.some(j=>j.shot===shot.id)||jobs.some(j=>j.shot===shot.id&&j.projectId===projectId))return shot;
      return {...shot,status:generations.some(g=>g.projectId===projectId&&g.shot===shot.id&&currentGenerations.has(g.id))?'待审核':'待制作'};
    });
    localStorage.setItem('aimovie_data',JSON.stringify({...D,jobs,generations,shots,detachedRenderJobs:detached}));
    Object.assign(D,{jobs,generations,shots,detachedRenderJobs:detached});
    renderQueueMessages.set(projectId,'已清空 '+targets.length+' 条记录。'+(remoteUncertain?remoteUncertain+' 条远程任务可能仍在执行，请在 ComfyUI 查看；已保留后台任务记录。':'已生成的视频和分镜已保留。'));
  }catch(error){renderQueueMessages.set(projectId,error.message?.startsWith('检查期间')?error.message:'清理未完成，队列记录仍保留；远程取消可能已执行，请同步状态后重试。')}
  finally{clearingRenderProjects.delete(projectId);renderGeneration()}
}

// Keep submit/cancel/delete actions from racing a bulk clear in this page.
for(const name of ['dispatchJob','syncComfyJob','cancelJob','deleteJob','simulateGeneration']){
  const original=window[name];
  window[name]=async function(id){
    const job=D.jobs.find(j=>j.id===id);
    if(!job||clearingRenderProjects.has(job.projectId)||renderJobOperations.has(id))return;
    renderJobOperations.add(id);
    try{
      if(name==='dispatchJob'){
        if(!job.comfyPromptId){
          const shot=D.shots.find(s=>s.id===job.shot&&s.projectId===job.projectId);
          if(!await ResultGuard.matches(shot,job,D)){
            const message='提交已阻止：分镜或资产已变化，或旧任务缺少来源记录。请按当前分镜重新入队。';
            const jobs=D.jobs.map(j=>j===job?{...j,status:message}:j),shots=D.shots.map(s=>s===shot&&s.status==='等待 Worker'?{...s,status:'需重做'}:s);
            try{localStorage.setItem('aimovie_data',JSON.stringify({...D,jobs,shots}));D.jobs=jobs;D.shots=shots;renderQueueMessages.set(job.projectId,message);renderGeneration()}catch{alert('无法保存检查结果，任务未提交。')}
            return;
          }
        }
        job.dispatchAttemptedAt=new Date().toISOString();
        try{localStorage.setItem('aimovie_data',JSON.stringify(D))}catch{return alert('无法保存任务，请检查本机存储空间后重试。')}
      }
      return await original(id);
    }finally{renderJobOperations.delete(id)}
  };
}
const renderGenerationBeforeClear=renderGeneration;
renderGeneration=function(){
  renderGenerationBeforeClear();
  const section=document.getElementById('gen'),projectId=D.activeProjectId,busy=clearingRenderProjects.has(projectId),count=items('jobs').length;
  section.querySelector('h1')?.insertAdjacentHTML('afterend',`<div class="toolbar"><button class="btn" ${busy||!count?'disabled':''} onclick="clearRenderQueue()">${busy?'正在清空…':'一键清空渲染队列'}</button><span class="muted">仅清理当前项目 · ${count} 条任务</span></div><p role="status" aria-live="polite">${esc(renderQueueMessages.get(projectId)||'')}</p>`);
  if(busy)section.querySelectorAll('table button').forEach(button=>button.disabled=true);
};
