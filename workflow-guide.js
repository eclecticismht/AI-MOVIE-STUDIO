(function(root){
  function summary(data,projectId){
    const own=key=>(data[key]||[]).filter(x=>x.projectId===projectId);
    const shots=own('shots').filter(s=>!s.autoArchived), jobs=own('jobs');
    const failed=jobs.filter(j=>!j.videoUrl&&/失败|提交已阻止/.test(j.status||''));
    const pending=jobs.filter(j=>!j.videoUrl&&!j.comfyPromptId&&j.status!=='已取消'&&!failed.includes(j));
    const running=jobs.filter(j=>j.comfyPromptId&&!j.videoUrl&&j.status!=='已取消'&&!failed.includes(j));
    const review=own('generations').filter(g=>g.status==='待审核');
    const project=(data.projects||[]).find(p=>p.id===projectId)||{};
    let next={page:'edit',label:'选择关键镜头制作样片'};
    if(!String(project.storyText||'').trim())next={page:'stories',label:'录入故事原文'};
    else if(!own('scripts').length)next={page:'scripts',label:'生成并核对剧本'};
    else if(!shots.length)next={page:'shots',label:'生成第一批分镜'};
    else if(failed.length)next={page:'gen',label:'检查失败任务并重试'};
    else if(review.length)next={page:'review',label:'审阅已生成的视频'};
    else if(pending.length||running.length)next={page:'gen',label:pending.length?'检查并提交待生成任务':'查看渲染进度'};
    else if(shots.every(s=>s.status==='完成'))next={page:'edit',label:'检查成片与导出'};
    return {shots:shots.length,scripts:own('scripts').length,pending:pending.length,running:running.length,failed:failed.length,review:review.length,next};
  }
  function pace(events,duration){
    const speech=events.filter(e=>e.type==='speech');
    const units=speech.reduce((n,e)=>n+Array.from(e.text.replace(/[\s\p{P}\p{S}]/gu,'')).length,0);
    const seconds=Math.ceil(units/3+1);
    return units&&seconds>duration?'对白节奏建议：当前 '+duration+' 秒，按从容语速估算约 '+seconds+' 秒'+(seconds>15?'，建议拆镜。':'；请试听确认停顿与表演空间。'):'';
  }
  const api={summary,pace};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkflowGuide=api;
})(typeof globalThis!=='undefined'?globalThis:this);
