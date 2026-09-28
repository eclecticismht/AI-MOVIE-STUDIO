// Shared preflight for independent shots and automatic films. Read-only until passed.
async function checkRendererReady(){
  let response;
  try{response=await fetch(D.connector.endpoint+'/readiness',{signal:AbortSignal.timeout(8000)})}
  catch{throw Error('本地连接服务未响应。请运行 START_LOCAL_CONNECTOR.bat 后重新检查。现有任务与素材已保留。')}
  if(response.status===404)throw Error('连接服务需要重启以启用生成前检查，请重启本地 Connector。');
  const result=await response.json();
  if(!response.ok||!result.ok)throw Error(result.message||'渲染器检查失败，请检查本机 ComfyUI。');
  return result.message;
}
function workflowShotIssues(shots){
  const issues=[];
  shots.forEach((shot,i)=>{
    try{
      if(!Number.isFinite(Number(shot.dur))||Number(shot.dur)<4||Number(shot.dur)>15)throw Error('镜头时长须为 4–15 秒');
      if(shot.renderMode!=='black')requireShotReferenceImages(shot);
      const events=shotDialogueEvents(shot);
      const warning=WorkflowGuide.pace(events,Number(shot.dur));
      if(warning)issues.push({shot,index:i+1,warning:true,message:warning});
    }catch(error){issues.push({shot,index:i+1,warning:false,message:error.message})}
  });
  return issues;
}
function workflowProductionPolicy(){return D.projects?.find(p=>p.id===D.activeProjectId)?.productionPolicy}
function workflowProductionHold(){const p=workflowProductionPolicy();return p?.generationHold?'项目处于准备阶段，暂不生成新素材。'+(p.holdReason||'请先完成对白、配音与节奏验收。'):''}
function workflowProductionPanel(){const p=workflowProductionPolicy();if(!p)return '';return `<div class="card"><h2>系列制作标准 · ${esc(p.phase||'准备中')}</h2><p>${esc(workflowProductionHold()||'生成限制已解除，仍需逐集审片。')}</p><p>横屏 16:9 · 默认生成 480p · 成片 2560 × 1440 · 24fps</p><p>剧情冲突 → 对白 → 配音 → 节奏 → 分镜 → 生成 → 剪辑与声音 → 锁片 → 2K超分 → 字幕与输出</p><p class="muted">只对锁片选中的素材超分；工作室常规缩放不能代替AI超分验收。</p></div>`}
async function workflowPreflight(shots){
  const hold=workflowProductionHold();if(hold)throw Error(hold);
  const snapshot=()=>JSON.stringify(shots.map(({beatIds,storyBinding,...content})=>content));
  const projectId=D.activeProjectId,baseline=snapshot();
  const errors=workflowShotIssues(shots).filter(i=>!i.warning);
  if(errors.length)throw Error('生成前检查未通过：\n'+errors.map(i=>'第 '+i.index+' 镜：'+i.message).join('\n'));
  // Screen composites still use uploaded images; pure black sequences are local only.
  if(shots.some(s=>s.renderMode!=='black'))await checkRendererReady();
  if(typeof ensureStoryCoverage==='function')await ensureStoryCoverage(shots);
  if(D.activeProjectId!==projectId||baseline!==snapshot())throw Error('检查期间项目或分镜已变化，请重新检查。');
}
async function inspectWorkflow(button){
  const projectId=D.activeProjectId,shots=document.getElementById('edit')?.classList.contains('on')?filmPlanShots().shots:visibleStoryboardShots();
  const output=button.parentElement.querySelector('[data-workflow-output]');
  button.disabled=true;output.textContent='正在检查，不会提交渲染任务…';
  try{
    const issues=workflowShotIssues(shots);let service;
    try{service=await checkRendererReady()}catch(e){service=e.message}
    if(D.activeProjectId!==projectId)return;
    output.replaceChildren();
    const line=document.createElement('p');line.textContent=service;output.append(line);
    const stats=document.createElement('p');stats.textContent=shots.length+' 镜 · 必须修复 '+issues.filter(i=>!i.warning).length+' 项 · 节奏建议 '+issues.filter(i=>i.warning).length+' 项。'+(!shots.length?'请先创建分镜。':'');output.append(stats);
    for(const issue of issues){
      const row=document.createElement('p');row.textContent=(issue.warning?'建议':'必须修复')+' · 第 '+issue.index+' 镜：'+issue.message+' ';
      const link=document.createElement('button');link.className='btn';link.textContent='打开该镜头';link.onclick=()=>{if(editingShotId&&editingShotId!==issue.shot.id)return alert('请先保存或取消正在编辑的分镜。');go('shots');editShot(issue.shot.id)};row.append(link);output.append(row);
    }
  }finally{button.disabled=false}
}
function workflowCheckPanel(){return '<div class="card"><h2>生成前检查</h2><p class="muted">先检查图片、对白、时长和服务连接。节奏建议供审阅参考，不会自动改写原文；通过检查不代表生成质量已通过。</p><button class="btn" onclick="inspectWorkflow(this)">检查当前批次与服务（不渲染）</button><button class="btn" onclick="go(\'edit\')">选择关键镜头做样片</button><div data-workflow-output role="status" style="white-space:pre-wrap"></div></div>'}
const workflowShotsBase=renderShots2;
renderShots2=function(){workflowShotsBase();document.querySelector('#shots h1')?.insertAdjacentHTML('afterend',workflowProductionPanel()+workflowCheckPanel())};
const workflowCockpitBase=renderCockpit;
renderCockpit=function(){
  workflowCockpitBase();
  document.getElementById('workflow-production')?.remove();
  document.getElementById('cockpitTitle')?.insertAdjacentHTML('afterend','<div id="workflow-production">'+workflowProductionPanel()+'</div>');
  const s=WorkflowGuide.summary(D,D.activeProjectId),policy=workflowProductionPolicy(),preparing=policy?.generationHold===true;
  document.getElementById('workflow-next')?.remove();
  document.getElementById('cockpitTitle')?.insertAdjacentHTML('afterend',`<div id="workflow-next" class="card"><h2>接下来做什么</h2><p>待提交 ${s.pending} · 已提交待完成 ${s.running} · 任务异常 ${s.failed} · 待审视频 ${s.review}</p><button class="btn gold" onclick="go('${s.next.page}')">${esc(s.next.label)}</button><button class="btn" onclick="go('shots')">检查分镜与制作条件</button><p class="muted">入队仅保存任务；生成视频后仍需审片。修改分镜或资产后，请核对重做范围。</p></div>`);
  const phases=document.getElementById('cpPhases');
  const phaseRows=preparing?[['故事与冲突',activeProject().storyText?'已录入，按集复核':'待录入'],['对白版本',s.scripts+' 份，须区分历史稿与现行稿'],['声线与配音',policy.voiceReferencesApproved?.length?policy.voiceReferencesApproved.length+' 个角色参考已确认，完整配音逐集验收':policy.voiceReferenceLocked||policy.voiceDirectionConfirmed?'主角声线方向已确认，配音待验收':'声线待确认'],['实录节奏与分镜',policy.episodeDialogueEditApproved?'首集对白剪辑已确认；口型与画面待验收':'实录后拆镜；已有 '+s.shots+' 镜待复核'],['视频生成','准备期间暂停新任务'],['历史素材',s.review+' 个视频待审'],['锁片与2K超分',policy.pictureLocked?'已锁片，核对入选素材':'尚未锁片，不进入超分']]:[['故事',activeProject().storyText?'已录入原文':'待录入'],['剧本',s.scripts+' 份'],['分镜',s.shots+' 个有效镜头'],['生成',s.pending+' 待提交 / '+s.running+' 已提交待完成'],['审片',s.review+' 个视频待审核']];
  if(phases)phases.innerHTML=phaseRows.map(([a,b])=>'<div class="phase"><b>'+a+'</b><span style="float:right" class="muted">'+b+'</span></div>').join('');
  const todo=document.getElementById('cpTodo');if(todo)todo.textContent=s.next.label;
  const kpis=document.getElementById('cpKpis');if(kpis)kpis.innerHTML=[[preparing?'已有分镜（待复核）':'有效分镜',s.shots],['待提交任务',s.pending],['待审视频',s.review],['异常任务',s.failed]].map(([label,count])=>'<div class="k"><span class="muted">'+label+'</span><b>'+count+'</b></div>').join('');
  const p=activeProject(),b=p.bible||{},w=p.wizard||{},bible=document.getElementById('cpBible');
  if(bible)bible.innerHTML='<div class="formgrid">'+[['一句话故事',b.logline||w.logline],['核心命题',b.theme||w.theme],['视觉风格',b.style||w.style]].map(([label,value])=>'<div><span class="muted">'+label+'</span><p>'+esc(value||'尚未填写')+'</p></div>').join('')+'</div><button class="btn" onclick="go(\'stories\')">编辑故事与创作基线</button>';
};
checkConnector=async function(){
  try{D.connector.status=await checkRendererReady()}catch(e){D.connector.status=e.message}
  D.connector.lastCheck=new Date().toLocaleString();persist();
};
const workflowSubmitting=new Set();
startRenderQueue=async function(){
  const projectId=D.activeProjectId;if(workflowSubmitting.has(projectId))return;
  workflowSubmitting.add(projectId);
  try{
    const hold=workflowProductionHold();if(hold)throw Error(hold);
    await checkRendererReady();
    const pending=D.jobs.filter(j=>j.projectId===projectId&&!j.videoUrl&&!j.comfyPromptId&&(j.status==='等待本地 H3 Connector'||/发送失败/.test(j.status||'')));
    for(const job of pending){if(D.activeProjectId!==projectId)break;await dispatchJob(job.id)}
  }catch(e){renderQueueMessages.set(projectId,e.message);if(D.activeProjectId===projectId)renderGeneration()}
  finally{workflowSubmitting.delete(projectId)}
};
const workflowGenerationBase=renderGeneration;
renderGeneration=function(){
  workflowGenerationBase();
  document.querySelector('#gen h1')?.insertAdjacentHTML('afterend','<div class="card"><p>待提交 → 已提交待完成 → 待审片 → 审核通过。入队不会自动开始渲染。</p><button class="btn" onclick="checkConnector()">检查连接服务与渲染器</button><button class="btn gold" onclick="startRenderQueue()">提交待生成 / 重试发送失败项</button><p class="muted">只处理尚未获得渲染编号的任务。已提交任务请先同步结果，避免重复生成。</p></div>');
};
