function deleteReviewGeneration(id){
 const g=D.generations.find(x=>x.id===id&&x.projectId===D.activeProjectId);if(!g)return;
 const generations=D.generations.filter(x=>x!==g),masters=(D.masters||[]).filter(x=>!(x.projectId===g.projectId&&x.generationId===id));
 const removedMaster=masters.length!==(D.masters||[]).length;
 const shots=D.shots.map(s=>s.id===g.shot&&s.projectId===g.projectId&&removedMaster&&!masters.some(m=>m.projectId===g.projectId&&m.shot===s.id)?{...s,status:'需重做'}:s);
 const deletedGenerationResults=[...(D.deletedGenerationResults||[])];
 if(g.jobId&&g.videoUrl&&!deletedGenerationResults.some(t=>t.projectId===g.projectId&&t.jobId===g.jobId&&t.videoUrl===g.videoUrl))deletedGenerationResults.push({projectId:g.projectId,jobId:g.jobId,videoUrl:g.videoUrl});
 try{localStorage.setItem('aimovie_data',JSON.stringify({...D,generations,masters,shots,deletedGenerationResults}));}
 catch{return alert('删除保存失败，原记录已保留。');}
 Object.assign(D,{generations,masters,shots,deletedGenerationResults});renderReview();
 const root=document.getElementById('review'),message=document.createElement('p');message.setAttribute('role','status');message.textContent='已删除此审片版本'+(removedMaster?'及其 MASTER 引用':'')+'。分镜、独立音频和磁盘视频保留。';root.prepend(message);
}

async function masterSourceIsCurrent(master){
 const generation=D.generations.find(g=>g.id===master.generationId&&g.projectId===master.projectId);
 const shot=D.shots.find(s=>s.id===master.shot&&s.projectId===master.projectId);
 return !!generation&&generation.shot===master.shot&&generation.status==='MASTER'&&await ResultGuard.matches(shot,generation,D);
}
const masterApprovalLocks=new Set();
async function approveCurrentMaster(id){
 if(masterApprovalLocks.has(id))return;masterApprovalLocks.add(id);
 try{
  const g=D.generations.find(x=>x.id===id&&x.projectId===D.activeProjectId);if(!g)return;
  const shot=D.shots.find(s=>s.id===g.shot&&s.projectId===g.projectId);
  const reason=await ResultGuard.reason(shot,g,D);if(reason)throw Error(reason);
  const generations=D.generations.map(x=>x.projectId===g.projectId&&x.shot===g.shot?{...x,status:x===g?'MASTER':x.status==='MASTER'?'历史批准版本':x.status}:x);
  const existing=(D.masters||[]).find(m=>m.generationId===id&&m.projectId===g.projectId);
  const masters=[...(D.masters||[]).filter(m=>!(m.projectId===g.projectId&&m.shot===g.shot)),existing||{id:uid('MASTER'),projectId:g.projectId,generationId:id,shot:g.shot,status:'已批准',resolution:'原始生成分辨率'}];
  const shots=D.shots.map(s=>s===shot?{...s,status:'完成'}:s),audio=[...(D.audio||[])];
  for(const type of ['对白','音乐','音效'])if(!audio.some(a=>a.projectId===g.projectId&&a.shot===g.shot&&a.type===type))audio.push({id:uid('AUD'),projectId:g.projectId,shot:g.shot,name:g.shot+' · '+type,type,status:'待制作'});
  localStorage.setItem('aimovie_data',JSON.stringify({...D,generations,masters,shots,audio}));
  Object.assign(D,{generations,masters,shots,audio});go('masters');
 }catch(error){alert('暂不能采用：'+error.message)}finally{masterApprovalLocks.delete(id)}
}
async function explainReviewResult(id){const g=D.generations.find(x=>x.id===id&&x.projectId===D.activeProjectId);if(!g)return;const shot=D.shots.find(x=>x.id===g.shot&&x.projectId===g.projectId);try{alert(await ResultGuard.reason(shot,g,D)||'此视频的来源与当前分镜一致。请确认画面、动作、对白和声音满意后，点击“采用此版本”。')}catch{alert('暂时无法核验来源，请稍后重试。')}}
