function h3JobSettings(){const p=activeProject();return {width:p.h3Width||864,height:p.h3Height||480}}
function faceRefineControls(){return `<div class="card"><h2>H3 人脸精修</h2><p>用于已生成视频中的远景小脸：跟踪脸部、局部重新生成，再合回原画面，保留原声。精修单独输出文件，不覆盖原视频，也不会自动增加所有镜头的渲染次数。</p><p><a class="btn" href="http://127.0.0.1:8188/" target="_blank" rel="noopener">打开本地精修工具</a> <a class="btn" href="/workflows/H3-FaceRefine-Manual.json" download>下载手动选脸工作流</a> <a class="btn" href="/workflows/H3-FaceRefine-Auto.json" download>下载自动选脸工作流</a></p><details><summary>如何精修一个镜头</summary><p>将下载的工作流拖入本地 ComfyUI，换成要修复的单镜视频、对应角色参考图和该镜提示词。示例预填了《老实人》的一段素材；不要直接把它当作当前所选镜头。</p><p>多人画面优先用手动选脸工作流的 Pick faces 选择人物。先查看跟踪预览，再执行精修。默认使用 512 × 512 的脸部画布和位置跟踪；需要跨遮挡身份识别时可开启 identity_track，InsightFace 身份模型首次使用需另行下载。输出在 ComfyUI 的 AI_MOVIE_STUDIO/FaceRefine 文件夹。</p><p>这是可选的镜头精修入口，目前不会自动替换审片结果或成片；精修后需要查看效果。</p></details></div>`}
function renderH3Settings(){const {width,height}=h3JobSettings();return `<div class="card"><h2>H3 生成画面尺寸</h2><p class="muted">用于之后加入队列的镜头，已排队任务保持原尺寸。这是生成分辨率，最终成片分辨率另行设置。</p><div class="formgrid"><div class="field"><label for="h3Preset">常用尺寸</label><select id="h3Preset" onchange="if(this.value){const [w,h]=this.value.split('x');document.getElementById('h3Width').value=w;document.getElementById('h3Height').value=h}"><option value="">选择尺寸或自定义</option><option value="864x480">864 × 480 · 横屏预览</option><option value="1280x736">1280 × 736 · 横屏</option><option value="1920x1088">1920 × 1088 · 高清横屏</option><option value="480x864">480 × 864 · 竖屏预览</option><option value="736x1280">736 × 1280 · 竖屏</option><option value="1024x1024">1024 × 1024 · 方形</option></select></div><div class="field"><label for="h3Width">宽（像素）</label><input id="h3Width" type="number" min="32" max="8192" step="32" value="${width}"></div><div class="field"><label for="h3Height">高（像素）</label><input id="h3Height" type="number" min="32" max="8192" step="32" value="${height}"></div></div><p class="muted">宽高须为 32 的整数倍；像素越多，显存需求和耗时越高。当前已保存：${width} × ${height}。</p><button class="btn gold" onclick="saveH3Settings()">保存生成尺寸</button><span id="h3SettingsStatus" role="status"></span></div>${faceRefineControls()}`}
function saveH3Settings(){
  const width=Number(document.getElementById('h3Width').value),height=Number(document.getElementById('h3Height').value),status=document.getElementById('h3SettingsStatus');
  if(![width,height].every(n=>Number.isInteger(n)&&n>=32&&n<=8192&&n%32===0)){status.textContent='宽高须为 32 的整数倍，范围 32–8192。';return}
  const p=activeProject(),next={...D,projects:D.projects.map(item=>item===p?{...p,h3Width:width,h3Height:height}:item)};
  try{localStorage.setItem('aimovie_data',JSON.stringify(next));p.h3Width=width;p.h3Height=height;renderShots2();document.getElementById('h3SettingsStatus').textContent='已保存，之后入队的镜头使用此尺寸。'}catch{status.textContent='保存失败，原设置保留。'}
}
function realProgressInfo(job){
  const p=job.progress||{},size=`${job.width||864} × ${job.height||480}`;
  if(job.videoUrl||p.phase==='complete')return {label:'已生成，待审核',percent:100,detail:`${size} · ${job.actualSeconds?`实际用时 ${renderDuration(job.actualSeconds)}`:'生成完成'}`};
  if(/失败|异常/.test(job.status||''))return {label:'任务失败',detail:job.status};
  if(job.status==='已取消')return {label:'已取消',detail:size};
  if(job.progressUnavailable)return {label:'进度连接中断',detail:'保留任务，正在重新连接；剩余时间未知'};
  if(p.phase==='queued')return {label:'等待渲染',detail:`${size} · 前方 ${p.ahead} 个任务 · 开始时间待定`};
  if(p.phase==='sampling') {
    const stale=p.connected===false||Date.now()-p.updatedAt>30000;
    return {label:`采样 ${p.value} / ${p.max} 步${stale?'（最后收到）':''}`,percent:p.percent,detail:stale?'进度暂未更新，剩余时间未知':p.value===p.max?'采样完成，等待解码和保存视频':`${size} · ${p.etaSeconds==null?'正在测量速度':`采样预计还需 ${renderDuration(p.etaSeconds)}`}（不含解码和保存）`};
  }
  if(p.phase==='saving')return {label:'合成 / 保存视频',detail:`${size} · 等待视频文件写入，剩余时间未知`};
  if(p.phase==='loading')return {label:'加载模型 / 准备生成',detail:`${size} · 等待真实采样进度，剩余时间未知`};
  return {label:job.comfyPromptId?'等待真实进度':'尚未提交',detail:size};
}
const renderBeforeRealProgress=renderGeneration;
renderGeneration=function(){
  renderBeforeRealProgress();const jobs=items('jobs');
  document.querySelectorAll('#gen tbody tr').forEach((row,index)=>{
    const job=jobs[index];if(!job)return;const info=realProgressInfo(job),cell=row.lastElementChild;
    cell.innerHTML=`<b>${esc(info.label)}${info.percent==null?'':` · ${info.percent}%`}</b><br>${info.percent==null?'':`<progress max="100" value="${info.percent}" style="width:160px"></progress><br>`}<span class="muted">${esc(info.detail)}</span>`;
  });
};
let progressRefreshBusy=false;
async function refreshRenderProgress(){
  if(progressRefreshBusy||!document.getElementById('gen')?.classList.contains('on'))return;
  const jobs=items('jobs').filter(j=>j.comfyPromptId&&!j.videoUrl&&j.status!=='已取消'&&!/生成失败/.test(j.status||''));
  if(!jobs.length)return;progressRefreshBusy=true;
  try{
    await Promise.allSettled(jobs.map(async job=>{
      try{
        const response=await fetch(D.connector.endpoint+'/jobs/'+encodeURIComponent(job.id)+'/status',{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('offline');const {job:remote}=await response.json();
        if(!D.jobs.includes(job))return;
        job.progressUnavailable=false;job.progress=remote.progress;job.status=remote.connectorStatus;job.actualSeconds=remote.actualSeconds;
        if(remote.videoUrl){job.videoUrl=remote.videoUrl;job.completedAt=remote.completedAt;
          if(!D.generations.some(g=>g.jobId===job.id&&g.videoUrl===remote.videoUrl)){D.generations.push({id:uid('GEN'),projectId:job.projectId,jobId:job.id,shot:job.shot,version:job.version||'v001',status:'待审核',model:job.model,videoUrl:remote.videoUrl,createdAt:new Date().toLocaleString()});const shot=D.shots.find(s=>s.id===job.shot&&s.projectId===job.projectId);if(shot)shot.status='待审核'}
        }
      }catch{job.progressUnavailable=true}
    }));
    try{localStorage.setItem('aimovie_data',JSON.stringify(D))}catch{}
    if(document.getElementById('gen')?.classList.contains('on'))renderGeneration();
  }finally{progressRefreshBusy=false}
}
setInterval(refreshRenderProgress,3000);
