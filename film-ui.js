let filmRevision=null,filmRevisionBusy=false;
async function syncFilmAudioToShots(id){
 try{
  if(editingShotId)throw Error('请先保存分镜编辑');
  const projectId=activeProject().id,response=await fetch('/api/film/'+encodeURIComponent(id)),out=await response.json();if(!response.ok)throw Error(out.error);
  if(activeProject().id!==projectId)throw Error('项目已切换，请重新操作');
  const changes=FilmAudioSync.updates(out.run,D.shots,projectId,shotDialogueEvents,ShotAudio.validate);
  const shots=D.shots.map(s=>{const change=changes.find(c=>c.id===s.id);return change?{...s,...change}:s});
  localStorage.setItem('aimovie_data',JSON.stringify({...D,shots}));D.shots=shots;
  filmMessage=`已将 ${changes.length} 镜的声音修复保存到分镜；今后重新制作也会沿用。`;
 }catch(e){filmMessage=e.message}renderEdit();
}
const filmSampleSelections=new Map();
async function pauseAutomaticFilm(id){
 try{const response=await fetch('/api/film/'+encodeURIComponent(id)+'/pause',{method:'POST'}),out=await response.json();if(!response.ok)throw Error(out.error);filmRuns=filmRuns.map(r=>r.id===id?out.run:r);filmMessage='将在当前镜头完成后暂停，保留已生成素材。';}catch(e){filmMessage=e.message}renderEdit();
}
let filmSampleExpanded=false;
function renderFilmSampling(shots,batchId){
 const key=activeProject().id+'|'+batchId,selected=filmSampleSelections.get(key)||new Set();
 return `<div class="card"><h2>先制作选镜样片</h2><p>选择 1–12 个镜头，沿用各自的时长、对白和资产图片，按原顺序生成独立样片。可先检查造型、场景和声音，再制作完整成片。</p><details ${filmSampleExpanded?'open':''} ontoggle="filmSampleExpanded=this.open"><summary>选择样片镜头</summary>${shots.map((s,i)=>`<label style="display:block;margin:8px 0"><input type="checkbox" data-sample-id="${esc(s.id)}" ${selected.has(s.id)?'checked':''} ${filmStarting?'disabled':''} onchange="toggleFilmSample(this.dataset.sampleId,this.checked)">第 ${i+1} 镜 · ${esc(s.scene)} · ${s.dur} 秒${s.renderMode==='black'?' · 纯黑静音':''}</label>`).join('')}</details><p id="filmSampleSummary">已选 ${shots.filter(s=>selected.has(s.id)).length} 镜 · ${shots.filter(s=>selected.has(s.id)).reduce((n,s)=>n+Number(s.dur),0)} 秒</p><button class="btn" ${filmStarting?'disabled':''} onclick="startAutomaticFilm(true)">制作所选镜头样片</button></div>`;
}
function toggleFilmSample(id,checked){const batch=filmPlanShots(),key=activeProject().id+'|'+batch.id,selected=filmSampleSelections.get(key)||new Set();if(checked)selected.add(id);else selected.delete(id);filmSampleSelections.set(key,selected);const shots=batch.shots.filter(s=>selected.has(s.id));document.getElementById('filmSampleSummary').textContent=`已选 ${shots.length} 镜 · ${shots.reduce((n,s)=>n+Number(s.dur),0)} 秒`}
let filmRuns=[],filmMessage='',filmStarting=false,filmPolling=false;
function filmPlanShots(){const p=activeProject(),batches=(D.storyboardBatches||[]).filter(b=>b.projectId===p.id),id=p.filmBatchId||p.storyboardBatchId||batches.at(-1)?.id;return {id,batches,shots:projectShots().filter(s=>!s.autoArchived&&s.storyboardBatchId===id).sort((a,b)=>(a.sequence||0)-(b.sequence||0))}}
function selectFilmBatch(id){activeProject().filmBatchId=id;localStorage.setItem('aimovie_data',JSON.stringify(D));renderEdit()}
function renderAutomaticFilm(){
  const p=activeProject(),{id,batches,shots}=filmPlanShots(),runs=filmRuns.filter(r=>r.projectId===p.id),total=shots.reduce((n,s)=>n+(Number(s.dur)||0),0);
  document.getElementById('edit').innerHTML=`<h1>自动成片</h1><p class="muted">按分镜顺序自动渲染、拼接、保留生成音轨并添加对白字幕；已填写的屏幕原文以清晰信息卡叠加，输出 1280 × 720 MP4。生成结果仍需观看验收；不会把缺失镜头当作已完成。</p><div class="card"><label for="filmBatch">制作分镜批次</label><select id="filmBatch" onchange="selectFilmBatch(this.value)">${batches.map((b,i)=>`<option value="${esc(b.id)}" ${b.id===id?'selected':''}>第 ${i+1} 批 · ${esc(b.sourceTitle)}</option>`).join('')}</select><p>${shots.length} 个镜头 · 计划 ${Math.floor(total/60)} 分 ${Math.round(total%60)} 秒 · H3 帧数对齐可能产生少量差异</p><p class="muted">每镜独立采用分镜推荐时长。制作会保存计划，关闭页面后本地服务器仍可继续；请保持本机服务与 ComfyUI 运行。服务重启后可点击继续制作。</p><button class="btn gold" ${filmStarting||!shots.length?'disabled':''} onclick="startAutomaticFilm()">${filmStarting?'正在启动…':'自动制作完整成片'}</button><button class="btn" ${filmStarting||!shots.length?'disabled':''} onclick="startAutomaticFilm(false,true)">准备整批提示词（不渲染视频）</button><p role="status">${esc(filmMessage)}</p></div>${renderFilmSampling(shots,id)}${filmRevision?renderFilmRevision():''}${productionAuditControl()}${FilmStudioSummary.orderedRuns(runs).map(renderFilmRun).join('')}`;
}
const deletingFilms=new Set();
async function deleteAutomaticFilm(id){
 const run=filmRuns.find(r=>r.id===id&&r.projectId===D.activeProjectId);if(!run||deletingFilms.has(id))return;
 if(!confirm('删除成片“'+run.title+'”？本版本的成片、镜头缓存和制作记录将永久删除。原分镜、资产和其他成片版本保留。'))return;
 deletingFilms.add(id);
 try{const response=await fetch('/api/film/'+encodeURIComponent(id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:run.projectId})}),out=await response.json();if(!response.ok)throw Error(out.error);filmRuns=filmRuns.filter(r=>r.id!==id);if(filmRevision?.run.id===id)filmRevision=null;filmMessage='已删除所选成片及本版本文件。';}
 catch(e){filmMessage='删除未完成：'+e.message;alert(filmMessage)}finally{deletingFilms.delete(id);renderEdit();renderMasters();}
}
function renderFilmRun(run){const labels={pending:'准备开始',rendering:'正在制作镜头',assembling:'自动合成',complete:'MP4 已生成，待验收',failed:'制作遇到问题',paused:'等待继续'},progress=run.current?.progress;return `<div class="card"><h2>${esc(run.title)}</h2><p>${labels[run.status]||esc(run.status)} · 已完成 ${run.completed} / ${run.total} 个镜头</p><p>${esc(FilmStudioSummary.progressText(run))}</p>${run.parentRunId&&filmRuns.some(r=>r.id===run.parentRunId&&r.videoUrl)?`<p>${run.retriedShot?`本版重做第 ${(run.retriedShots||[run.retriedShot]).join('、')} 镜 · `:''}<a href="/api/film/${esc(run.parentRunId)}/video" target="_blank" rel="noopener">打开原版对比</a></p>`:''}${run.pendingQuality?.length&&['paused','failed'].includes(run.status)?`<button class="btn" ${run.rechecking?'disabled':''} data-id="${esc(run.id)}" onclick="recheckPendingFilm(this.dataset.id)">增强复核全部存疑对白</button><button class="btn" ${run.rechecking?'disabled':''} data-id="${esc(run.id)}" onclick="recheckPendingFilm(this.dataset.id,'sensevoice')">独立中文识别交叉复核</button>`:''}${run.pendingQuality?.length?`<p class="warn">${run.pendingQuality.length} 镜声音待处理；最终合成前必须解决。</p>`:''}${run.qualityHold&&run.completed<run.total?`<button class="btn" data-id="${esc(run.id)}" onclick="continueOtherFilmShots(this.dataset.id)">保留问题，继续其他镜头</button>`:''}${run.error?`<p class="warn">${esc(run.error)}</p>`:''}${['failed','paused'].includes(run.status)?`<button class="btn" data-id="${esc(run.id)}" onclick="resumeAutomaticFilm(this.dataset.id)">继续制作</button>`:''}${run.completed===run.total?`<button class="btn" ${run.audit?.status==='running'?'disabled':''} data-id="${esc(run.id)}" onclick="auditFilmSpeech(this.dataset.id)">${run.audit?.status==='running'?'正在检查对白…':'检查生成对白（本地）'}</button>`:''}${run.completed===run.total?`<button class="btn" ${run.audit?.status==='running'?'disabled':''} data-id="${esc(run.id)}" onclick="auditFilmSpeech(this.dataset.id,'medium')">增强复核对白（本地）</button>`:''}${run.status==='complete'?`<button class="btn" data-id="${esc(run.id)}" onclick="recomposeFilmText(this.dataset.id)">按所选原批次更新文字（不渲染）</button>`:''}${run.status==='complete'?`<button class="btn" data-id="${esc(run.id)}" onclick="alignFilmSubtitles(this.dataset.id)">按实际声音对齐字幕（不渲染）</button>`:''}${run.subtitleAlignment?`<p>已按声音对齐 ${run.subtitleAlignment.aligned} 镜字幕；${run.subtitleAlignment.issues.length} 镜需复核${run.subtitleAlignment.issues.length?'（保留估算字幕，未自动认定通过）':''}。</p>`:''}${run.subtitleAlignment?.issues?.length?`<details><summary>查看字幕未对齐的镜头</summary>${run.subtitleAlignment.issues.map(issue=>`<p>第 ${issue.index} 镜：${esc(issue.reason)} ${run.status==='complete'?`<button class="btn" data-id="${esc(run.id)}" data-index="${issue.index-1}" onclick="openFilmRevision(this.dataset.id,Number(this.dataset.index))">查看此镜提示词和对白</button>`:''}</p>`).join('')}</details>`:''}${run.status==='complete'?`<button class="btn" data-id="${esc(run.id)}" onclick="openFilmRevision(this.dataset.id,0)">查看镜头并修订重做</button>`:''}<button class="btn" data-id="${esc(run.id)}" onclick="syncFilmAudioToShots(this.dataset.id)">将本版声音设置保存到分镜</button>${['complete','paused','failed'].includes(run.status)?`<button class="btn" data-id="${esc(run.id)}" onclick="deleteAutomaticFilm(this.dataset.id)">删除成片</button>`:''}${renderQualityHold(run)}${renderSpeechAudit(run.audit,run)}${run.videoUrl?`<video src="${esc(run.videoUrl)}" controls preload="metadata" style="max-width:100%;width:960px"></video><p><a class="btn gold" href="${esc(run.videoUrl)}" download="movie.mp4">下载 MP4 成片</a></p>`:''}</div>`}
const renderFilmRunBeforePause=renderFilmRun;
renderFilmRun=function(run){
 const html=renderFilmRunBeforePause(run);
 if(!['pending','rendering'].includes(run.status))return html;
 const control=run.pauseRequested?'<p>已请求暂停，等待当前镜头完成；不会中断正在运行的 GPU 任务。</p>':`<p><button class="btn" data-id="${esc(run.id)}" onclick="pauseAutomaticFilm(this.dataset.id)">完成当前镜头后暂停</button></p>`;
 return html.replace('</h2>','</h2>'+control);
};
async function startAutomaticFilm(sample=false,prepareOnly=false){
  if(filmStarting)return;const p=activeProject(),batch=filmPlanShots();let shots=batch.shots;
  if(sample){try{shots=FilmSampling.select(shots,[...(filmSampleSelections.get(p.id+'|'+batch.id)||[])])}catch(error){filmMessage=error.message;renderEdit();return}}
  if(!shots.length)return;
  if(editingShotId)return alert('请先保存正在编辑的分镜。');
  const settings=h3JobSettings();
  let plan;try{plan={projectId:p.id,title:p.name+(sample?' · 选镜样片':''),shots:shots.map(s=>({shotId:s.id,cropBottomPercent:s.cropBottomPercent||0,continueFromShotId:s.continueFromShotId,audioAsset:s.audioAsset,audioMode:s.audioMode||'model',renderMode:s.renderMode||'model',screenSource:s.screenSource,screenAssetId:s.screenAssetId,screenImagePercent:s.screenImagePercent,duration:Number(s.dur),...settings,prompt:s.renderMode==='black'?'Pure black silent frame.':s.renderMode==='screen'?'Display the selected screen asset exactly.':compileH3Prompt(s),subtitle:s.dialogue||'',sourceExcerpt:s.sourceExcerpt,screenCards:ScreenCards.fromShot(s,D),dialogueEvents:shotDialogueEvents(s)}))};}catch(error){filmMessage=error.message;renderEdit();return}
  if(plan.shots.some(s=>!Number.isFinite(s.duration)||s.duration<4||s.duration>15))return alert('有镜头时长无效，请先在分镜页修正。');
  filmStarting=true;filmMessage=sample?'正在保存选镜样片计划…':'正在保存完整制作计划…';renderEdit();
  try{
    if(!prepareOnly&&typeof workflowPreflight==='function')await workflowPreflight(shots);
    shots.forEach((s,i)=>{if(s.continueFromShotId&&(i===0||shots[i-1].id!==s.continueFromShotId))throw Error('请同时选择承接镜头及其紧邻的前镜');});
    for(let i=0;i<shots.length;i++)plan.shots[i].sourceFingerprint=await FilmSourceSync.fingerprint(shots[i],D);
    shots.forEach(requireShotReferenceImages);
    if(!prepareOnly)for(let i=0;i<shots.length;i++){filmMessage=`正在绑定资产参考图：${i+1} / ${shots.length}`;renderEdit();plan.shots[i].references=await prepareShotReferences(shots[i]);plan.shots[i].firstFrame=shots[i].continueFromShotId?undefined:await prepareShotFirstFrame(shots[i])}
    for(let i=0;i<plan.shots.length;i+=6){
      filmMessage=`正在自动编写视频提示词：${i+1}–${Math.min(i+6,plan.shots.length)} / ${plan.shots.length}`;renderEdit();
      const batch=plan.shots.slice(i,i+6),needed=batch.filter(s=>{if(['black','screen'].includes(s.renderMode))return false;const original=shots.find(x=>x.id===s.shotId);if(ShotPrompt.isStructured(original.prompt))return false;return original.filmPromptVersion!==2||!original.filmPrompt||original.filmPromptSource!==s.prompt});
      if(needed.length){
        const r=await fetch('/api/h3-prompts',{method:'POST',headers:{'Content-Type':'application/json',...(screenplayApiKey?{Authorization:'Bearer '+screenplayApiKey}:{})},body:JSON.stringify({model:p.screenplayModel||'deepseek-flash',shots:needed.map(s=>({id:s.shotId,duration:s.duration,description:s.prompt,dialogue:s.subtitle}))}),signal:AbortSignal.timeout(250000)}),out=await r.json();
        if(!r.ok)throw Error(out.error||'提示词生成失败');
        for(const item of out.prompts){const original=shots.find(s=>s.id===item.id),draft=needed.find(s=>s.shotId===item.id);original.filmPrompt=item.prompt;original.filmPromptVersion=2;original.filmPromptSource=draft.prompt}
        localStorage.setItem('aimovie_data',JSON.stringify(D));
      }
      for(const draft of batch.filter(s=>!['black','screen'].includes(s.renderMode))){const original=shots.find(s=>s.id===draft.shotId);if(!ShotPrompt.isStructured(original.prompt))draft.prompt=original.filmPrompt;}
    }
    if(prepareOnly){filmMessage='整批提示词已保存，可导出制作检查包核对；尚未启动视频渲染。';return;}
    const response=await fetch('/api/film',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan),signal:AbortSignal.timeout(30000)}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns.push(data.run);filmMessage='已启动，全部镜头完成后自动合成 MP4。';
  }catch(error){filmMessage=error.message}
  finally{filmStarting=false;renderEdit()}
}
async function resumeAutomaticFilm(id){try{const response=await fetch('/api/film/'+encodeURIComponent(id)+'/resume',{method:'POST'}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns=filmRuns.map(r=>r.id===id?data.run:r);filmMessage='已继续制作。'}catch(error){filmMessage=error.message}renderEdit()}
function renderQualityHold(run){
 const hold=run.qualityHold;if(!hold)return '';
 const r=hold.result;
 return `<section class="card"><h3>第 ${hold.index} 镜需要声音复核</h3><p>原句：${esc(r.expected||'（无口头对白）')}</p><p>识别：${esc(r.actual||'（未识别到台词）')}</p><p>${esc(r.reason||'')}</p>${hold.history?.length?`<details><summary>此前 ${hold.history.length} 次检查记录</summary>${hold.history.map(h=>`<p>${esc(h.at)} · ${esc(h.result?.actual||h.result?.reason||'未识别到台词')}</p>`).join('')}</details>`:''}<video controls preload="metadata" style="width:100%;max-width:720px" src="/api/film/${esc(run.id)}/preview?index=${hold.index-1}"></video><p>识别结果不能确认说话人物和口型；请核对实际声音。</p><button class="btn" ${run.rechecking?'disabled':''} data-id="${esc(run.id)}" onclick="recheckFilmSpeech(this.dataset.id)">${run.rechecking?'正在复核声音…':'重新检查此镜声音（不重渲染）'}</button><button class="btn" data-id="${esc(run.id)}" data-index="${hold.index-1}" onclick="openFilmRevision(this.dataset.id,Number(this.dataset.index))">查看提示词与对白并重做</button>${r.status==='needs_review'?`<label>试听核对结果<input id="quality-note-${esc(run.id)}" placeholder="仅在实际台词正确、属于识别误差时填写"></label><button class="btn" data-id="${esc(run.id)}" onclick="acceptFilmSpeechReview(this.dataset.id)">已试听确认原句正确，保留此镜</button>`:''}</section>`;
}
async function recheckFilmSpeech(id){
 try{const response=await fetch('/api/film/'+encodeURIComponent(id)+'/recheck',{method:'POST'}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns=filmRuns.map(r=>r.id===id?data.run:r);filmMessage='正在本地重新识别此镜声音，保留原始素材和上次结果。';}catch(error){filmMessage=error.message}renderEdit();
}
async function acceptFilmSpeechReview(id){
 try{const note=document.getElementById('quality-note-'+id).value;const response=await fetch('/api/film/'+encodeURIComponent(id)+'/accept-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note})}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns=filmRuns.map(r=>r.id===id?data.run:r);filmMessage='已记录试听结果，可继续制作。'}catch(error){filmMessage=error.message}renderEdit();
}
async function pollFilms(){if(filmPolling)return;filmPolling=true;try{const r=await fetch('/api/film',{signal:AbortSignal.timeout(10000)});if(!r.ok)return;const updated=(await r.json()).runs,changed=JSON.stringify(updated)!==JSON.stringify(filmRuns);const finishedRecheck=updated.find(r=>filmRuns.some(old=>old.id===r.id&&old.rechecking)&&!r.rechecking);if(finishedRecheck)filmMessage=finishedRecheck.qualityHold?'声音复核完成，仍需核对实际片段；原素材和此前记录已保留。':'声音文字复核匹配，可继续制作；说话人物和口型仍需审片。';filmRuns=updated;if(!changed)return;if(document.getElementById('studio')?.classList.contains('on'))renderStudio();if(document.getElementById('edit')?.classList.contains('on'))renderEdit();if(document.getElementById('masters')?.classList.contains('on'))renderMasters()}catch{}finally{filmPolling=false}}
renderEdit=renderAutomaticFilm;
const renderBeforeFilmMasters=renderMasters;
renderMasters=function(){renderBeforeFilmMasters();const root=document.getElementById('masters');root.insertAdjacentHTML('afterbegin',`<div class="card"><h2>自动生成的成片</h2><button class="btn gold" onclick="go('edit')">打开自动成片</button></div>`+FilmStudioSummary.orderedRuns(filmRuns.filter(r=>r.projectId===D.activeProjectId&&r.status==='complete')).map(renderFilmRun).join(''))};
setInterval(pollFilms,5000);pollFilms();

function renderSpeechAudit(audit,run){
  if(!audit)return '';
  const labels={running:'正在检查',complete:'检查完成',failed:'检查失败',interrupted:'检查已中断',text_match:'文字识别一致',pronunciation_match:'同音／轻声转写可对应',needs_review:'需试听核对',unverifiable:'无法自动核对'};
  return `<div><p>${labels[audit.status]||esc(audit.status)}${audit.model==='medium'?' · 增强本地识别':''} · ${audit.completed}/${audit.total} 镜。语音识别可能出错，不能确认说话人物或口型。</p>${audit.error?`<p class="warn">${esc(audit.error)}</p>`:''}<details><summary>查看逐镜对白检查</summary>${(audit.results||[]).map(r=>`<div class="card"><b>第 ${r.index} 镜 · ${labels[r.status]||esc(r.status)}</b><p>原句：${esc(r.expected||'（无结构化对白或无对白）')}</p><p>识别：${esc(r.actual??r.transcription?.segments?.map(s=>s.text).join('')??'')}</p><p>${esc(r.reason)}</p>${r.status==='needs_review'&&run.status==='complete'?`<button class="btn" data-id="${esc(run.id)}" data-index="${r.index-1}" onclick="openFilmRevision(this.dataset.id,Number(this.dataset.index))">查看提示词并修订此镜</button>`:''}</div>`).join('')}</details></div>`;
}
async function auditFilmSpeech(id,model='small'){try{const response=await fetch('/api/film/'+encodeURIComponent(id)+'/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model})}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns=filmRuns.map(r=>r.id===id?data.run:r);filmMessage='开始在本机检查音轨，不会重新渲染视频。'}catch(error){filmMessage=error.message}renderEdit()}

async function retryFilmShot(id,index){try{const response=await fetch('/api/film/'+encodeURIComponent(id)+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index})}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns.push(data.run);filmMessage='已创建新版，重做所选镜头及连续承接的后镜，其余镜头复用；旧版成片保留。'}catch(error){filmMessage=error.message}renderEdit()}

async function recomposeFilmText(id){
  try{
    if(editingShotId)throw Error('请先保存分镜');
    const changes=filmPlanShots().shots.filter(s=>Object.values(s.assetStates||{}).some(a=>a.screenText?.trim())).map(s=>({shotId:s.id,screenCards:ScreenCards.fromShot(s,D)}));
    if(!changes.length)throw Error('请先在原分镜批次填写本镜屏幕原文');
    const response=await fetch('/api/film/'+encodeURIComponent(id)+'/recompose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes})}),data=await response.json();if(!response.ok)throw Error(data.error);
    filmRuns.push(data.run);filmMessage='正在复用已有视频，合成文字更新版；原片保留，不调用视频模型。';
  }catch(error){filmMessage=error.message}renderEdit();
}

async function alignFilmSubtitles(id){try{const response=await fetch('/api/film/'+encodeURIComponent(id)+'/align',{method:'POST'}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns.push(data.run);filmMessage='正在复用视频、识别声音时间并生成字幕对齐版，旧版保留。'}catch(error){filmMessage=error.message}renderEdit()}

async function openFilmRevision(id,index){
  try{const response=await fetch('/api/film/'+encodeURIComponent(id)),data=await response.json();if(!response.ok)throw Error(data.error);
    if(data.run.projectId!==D.activeProjectId)throw Error('请在该成片所属项目修订');
    filmRevision={run:data.run,index};selectFilmRevision(index);go('edit');
  }catch(error){filmMessage=error.message;renderEdit()}
}
function selectFilmRevision(index){
  if(filmRevisionBusy)return;
  filmRevision.cropBottomPercent=filmRevision.run.shots[index].cropBottomPercent||0;filmRevision.audioMode=filmRevision.run.shots[index].audioMode||'model';filmRevision.audioAsset=filmRevision.run.shots[index].audioAsset||'';
  const s=filmRevision.run.shots[index];filmRevision.index=index;delete filmRevision.firstFrame;delete filmRevision.screenReferenceFile;filmRevision.prompt=s.prompt;filmRevision.duration=s.duration;
  filmRevision.subtitle=Array.isArray(s.dialogueEvents)?s.dialogueEvents.map(DialogueContract.eventText).join('\n'):s.subtitle||'';
  const staged=filmRevision.batchRevisions?.find(entry=>entry.index===index);
  if(staged)Object.assign(filmRevision,structuredClone(staged.revision));
  filmRevision.error=staged?'已载入本次批量修订内容；修改后请再次加入以更新。':'';
  renderEdit();
}
function renderFilmRevision(){
  const f=filmRevision,s=f.run.shots[f.index],displayFrame=f.firstFrame||s.firstFrame;if(f.run.projectId!==D.activeProjectId)return '';
  return `<div class="card" id="filmRevisionEditor"><h2>修订单镜 · ${esc(f.run.title)}</h2><p>先检查提示词、原句和发声人物。提交后重新生成所选镜头及连续承接的后镜并自动合成子版本，其他素材与旧片保留。此处沿用该版本的资产图片；修改资产请返回分镜制作新版本。</p><label>选择镜头<select ${filmRevisionBusy?'disabled':''} onchange="selectFilmRevision(Number(this.value))">${f.run.shots.map((s,i)=>`<option value="${i}" ${i===f.index?'selected':''}>第 ${i+1} 镜 · ${esc(s.shotId)}</option>`).join('')}</select></label><details><summary>查看对应剧本原文与资产</summary><pre style="white-space:pre-wrap">${esc(s.sourceExcerpt||'此旧镜头未保存原文，仅能保留已有对白。')}</pre><p>${esc((s.references||[]).map(r=>r.name).join('、')||'无参考图片')}</p></details><p>可为本次重做导入已核对的首帧，固定人物造型（沿用本版资产）。</p><label>修订首帧<input type="file" accept=".png,.jpg,.jpeg,.webp" onchange="importFilmRevisionFrame(this)"></label><label>首帧发声者位置<select onchange="setFilmRevisionFramePosition(this.value)"><option value="center" ${!displayFrame?.speakerPosition||displayFrame.speakerPosition==='center'?'selected':''}>中间</option><option value="left" ${displayFrame?.speakerPosition==='left'?'selected':''}>左侧</option><option value="right" ${displayFrame?.speakerPosition==='right'?'selected':''}>右侧</option></select></label>${displayFrame?'<p>已配置首帧；未重新上传时沿用本版图片</p>':''}${s.renderMode==='screen'&&s.screenSource!=='text'?`<label>替换本镜屏幕原图（5MB以内）<input type="file" accept=".png,.jpg,.jpeg,.webp" onchange="importFilmRevisionFrame(this,true)"></label><p>用于修复旧版误用了文字替代图等问题；保留道具引用与其他镜头。${f.screenReferenceFile?'已选新原图，待提交。':''}</p>`:''}<label>画面提示词<textarea id="filmRevisionPrompt" rows="10" oninput="filmRevision.prompt=this.value">${esc(f.prompt)}</textarea></label><label>对白与声音<textarea id="filmRevisionDialogue" rows="5" oninput="filmRevision.subtitle=this.value">${esc(f.subtitle)}</textarea></label>${!Array.isArray(s.dialogueEvents)?'<p class="warn">此旧版没有结构化对白，不能直接重做。请从校正后的分镜批次制作。</p>':''}<p>每行：人物名：原句；电话声音：人物名（语音）：原句；静默消息：屏幕文字：内容。</p><label>成片声音<select id="filmRevisionAudio" onchange="filmRevision.audioMode=this.value"><option value="model" ${(f.audioMode??s.audioMode??'model')==='model'?'selected':''}>保留模型原声音</option><option value="mute" ${(f.audioMode??s.audioMode)==='mute'?'selected':''}>整镜静音（也移除环境声）</option><option value="replacement" ${f.audioMode==='replacement'?'selected':''}>独立环境音（替换模型音轨）</option></select></label><label>导入环境音<input type="file" accept="audio/wav,audio/mpeg,.wav,.mp3" onchange="importShotAmbience(this,'filmRevisionAudioAsset')"></label><input type="hidden" id="filmRevisionAudioAsset" value="${esc(f.audioAsset||'')}"><p id="filmRevisionAudioAsset_status">${f.audioAsset?'已配置独立环境音':''}</p><button class="btn" ${filmRevisionBusy?'disabled':''} onclick="recomposeFilmAudio()">仅更新声音，不重渲染</button><p>暂停或失败的版本更新声音后，会复用已完成画面并继续未完成镜头。声音更新只应用本项选择；提示词、对白、时长和声音设置可一起用下方重做按钮提交。有口头对白的镜头不能整镜静音。</p><label>镜头秒数<input id="filmRevisionDuration" type="number" min="4" max="15" step="0.1" value="${f.duration}" oninput="filmRevision.duration=Number(this.value)"></label><label>裁去底部模型字幕（0–20%，会移除相应画面）<input id="filmRevisionCrop" type="number" min="0" max="20" step="1" value="${f.cropBottomPercent??s.cropBottomPercent??0}" oninput="filmRevision.cropBottomPercent=Number(this.value)"></label><button class="btn" ${filmRevisionBusy?'disabled':''} onclick="recomposeFilmFraming()">仅整理画面边缘，不重渲染</button><button class="btn" ${filmRevisionBusy?'disabled':''} onclick="saveFilmRevisionToSource()">保存修订到原分镜（不渲染）</button><p>本次批量修订：${(f.batchRevisions||[]).map(x=>`<button class="btn" ${filmRevisionBusy?'disabled':''} onclick="selectFilmRevision(${x.index})">第 ${x.index+1} 镜</button> <button class="btn" ${filmRevisionBusy?'disabled':''} onclick="removeStagedFilmRevision(${x.index})">移除第 ${x.index+1} 镜</button>`).join(' ')||'尚未添加'}</p><button class="btn" ${filmRevisionBusy?'disabled':''} onclick="stageFilmRevision()">加入本次批量修订</button><button class="btn gold" ${filmRevisionBusy||!f.batchRevisions?.length?'disabled':''} onclick="submitFilmRevisionBatch()">批量重做所列镜头</button><button class="btn" ${filmRevisionBusy?'disabled':''} onclick="checkFilmRevision()">检查修订与重做范围（不渲染）</button><button class="btn gold" ${filmRevisionBusy||!Array.isArray(s.dialogueEvents)?'disabled':''} onclick="submitFilmRevision()">保存修订并重做（含承接后镜）</button><button class="btn" ${filmRevisionBusy?'disabled':''} onclick="filmRevision=null;renderEdit()">关闭修订</button><p role="status">${esc(f.error||'')}</p></div>`;
}
async function saveFilmRevisionToSource(){
 if(filmRevision?.firstFrame||filmRevision?.screenReferenceFile){filmRevision.error='本次图片仅用于成片修订；如需保存到原分镜，请在分镜编辑页导入同一图片。';renderEdit();return;}
 if(filmRevisionBusy||!filmRevision)return;
 const f=filmRevision,projectId=f.run.projectId,source=f.run.shots[f.index];
 filmRevisionBusy=true;
 try{
  if(projectId!==D.activeProjectId||editingShotId)throw Error('请切回所属项目并先保存分镜编辑');
  if(!source.sourceFingerprint)throw Error('此旧版本未保存来源校验信息，不能安全覆盖；请到分镜页核对修改。');
  const response=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/validate-revision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:f.index,revision:filmRevisionPayload(f)})}),out=await response.json();if(!response.ok)throw Error(out.error);
  if(projectId!==D.activeProjectId||editingShotId)throw Error('项目或编辑状态已改变，请重新操作');
  const current=D.shots.find(s=>s.id===source.shotId&&s.projectId===projectId);if(!current)throw Error('原分镜已删除');
  const baseline=JSON.stringify(D),savedBaseline=localStorage.getItem('aimovie_data'),actual=await FilmSourceSync.fingerprint(current,D);
  if(savedBaseline&&JSON.stringify(JSON.parse(savedBaseline))!==baseline)throw Error('其他页面已有更新，请刷新后核对再保存');
  if(baseline!==JSON.stringify(D)||savedBaseline!==localStorage.getItem('aimovie_data'))throw Error('项目在检查期间发生变化，请重新操作');
  const next=FilmSourceSync.apply(current,out.revision,source.sourceFingerprint,actual),update=FilmSourceSync.replaceWithDependents(D.shots,current,next),shots=update.shots;
  localStorage.setItem('aimovie_data',JSON.stringify({...D,shots}));D.shots=shots;
  f.error=`修订已保存到原分镜，${update.dependentIds.length} 个承接后镜已标记需重做，旧提示词和画面缓存已清除；未启动渲染，历史成片保留。`;
 }catch(error){f.error=error.message}finally{filmRevisionBusy=false;renderEdit()}
}
function filmRevisionPayload(f){return {cropBottomPercent:f.cropBottomPercent??0,...(f.firstFrame?{firstFrame:f.firstFrame}:{}),...(f.screenReferenceFile?{screenReferenceFile:f.screenReferenceFile}:{}),prompt:f.prompt,subtitle:f.subtitle,duration:f.duration,audioMode:f.audioMode,audioAsset:f.audioAsset};}
async function checkFilmRevision(){
 if(filmRevisionBusy||!filmRevision)return;
 const f=filmRevision;if(f.run.projectId!==D.activeProjectId)return;
 filmRevisionBusy=true;f.error='正在检查修订，不提交渲染…';renderEdit();
 try{const response=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/validate-revision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:f.index,revision:filmRevisionPayload(f)})}),out=await response.json();if(!response.ok)throw Error(out.error);
 f.error=`修订检查通过：重做第 ${out.impact.redo.join('、')} 镜，复用 ${out.impact.reuse.length} 镜，另有 ${out.impact.pending.length} 镜尚未制作。尚未提交渲染；修改后需重新检查。`;
 }catch(error){f.error=error.message}finally{filmRevisionBusy=false;renderEdit()}
}
async function submitFilmRevision(){
  if(filmRevisionBusy||!filmRevision)return;const f=filmRevision;
  if(f.run.projectId!==D.activeProjectId)return;
  filmRevisionBusy=true;f.error='正在校验并提交单镜修订…';renderEdit();
  try{const response=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:f.index,revision:filmRevisionPayload(f)})}),data=await response.json();if(!response.ok)throw Error(data.error);filmRuns.push(data.run);filmMessage='已保存修订并开始重做（含承接后镜），完成后自动合成新版；旧版保留。';filmRevision=null;
  }catch(error){f.error=error.message}finally{filmRevisionBusy=false;renderEdit()}
}

async function recomposeFilmAudio(){
 if(filmRevisionBusy||!filmRevision)return;
 const f=filmRevision,s=f.run.shots[f.index],mode=document.getElementById('filmRevisionAudio').value;
 try{ShotAudio.validate(mode,s.dialogueEvents,f.audioAsset)}catch(e){f.error=e.message;renderEdit();return}
 filmRevisionBusy=true;
 try{const r=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/recompose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes:[{shotId:s.shotId,audioMode:mode,audioAsset:f.audioAsset}]})}),out=await r.json();if(!r.ok)throw Error(out.error);filmRuns.push(out.run);filmMessage='已保存声音更新版本；复用已完成画面，继续未完成镜头，原版与原始声音保留。';filmRevision=null}catch(e){f.error=e.message}finally{filmRevisionBusy=false;renderEdit()}
}

function setFilmRevisionFramePosition(value){
 if(!filmRevision||filmRevisionBusy)return;
 const frame=filmRevision.firstFrame||filmRevision.run.shots[filmRevision.index].firstFrame;
 if(frame)filmRevision.firstFrame={...frame,speakerPosition:value};
}
function removeStagedFilmRevision(index){
 if(!filmRevision||filmRevisionBusy)return;
 filmRevision.batchRevisions=(filmRevision.batchRevisions||[]).filter(entry=>entry.index!==index);
 filmRevision.error='已从本次批量列表移除；原素材未改变。';renderEdit();
}
async function importFilmRevisionFrame(input,screenImage=false){
 const f=filmRevision,file=input.files?.[0];if(!f||!file||filmRevisionBusy)return;
 filmRevisionBusy=true;
 try{if(file.size>5*1024*1024)throw Error('首帧不能超过5MB');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
 const [frame]=await uploadShotImages([{name:'修订首帧',imageUrl:data}]);
 if(filmRevision!==f)return;if(screenImage){f.screenReferenceFile=frame.file;f.error='已选择屏幕原图；提交重做后只重新合成此屏幕镜头。';return;}f.firstFrame={file:frame.file,speakerPosition:'center'};f.error='首帧已上传，请确认画内发声者位置后检查修订。';
 }catch(e){f.error=e.message}finally{filmRevisionBusy=false;renderEdit();}
}

async function continueOtherFilmShots(id){
 try{const r=await fetch('/api/film/'+encodeURIComponent(id)+'/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deferQualityReview:true})});const data=await r.json();if(!r.ok)throw Error(data.error);filmMessage='继续制作其他镜头；问题记录保留，未解决前不会合成最终视频。';filmRuns=filmRuns.map(x=>x.id===id?data.run:x);}catch(e){filmMessage=e.message}renderEdit();
}

async function stageFilmRevision(){
 if(filmRevisionBusy||!filmRevision)return;const f=filmRevision,index=f.index,payload=filmRevisionPayload(f);filmRevisionBusy=true;
 try{const r=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/validate-revision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index,revision:payload})});const out=await r.json();if(!r.ok)throw Error(out.error);f.batchRevisions=[...(f.batchRevisions||[]).filter(x=>x.index!==index),{index,revision:structuredClone(payload)}];f.error='已加入批量修订列表，尚未渲染。';}catch(e){f.error=e.message}finally{filmRevisionBusy=false;renderEdit();}
}
async function submitFilmRevisionBatch(){
 if(filmRevisionBusy||!filmRevision?.batchRevisions?.length)return;const f=filmRevision;if(f.run.projectId!==D.activeProjectId)return;filmRevisionBusy=true;
 try{const r=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/retry-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revisions:f.batchRevisions})});const out=await r.json();if(!r.ok)throw Error(out.error);filmRuns.push(out.run);filmMessage='批量修订已启动，保留旧版本及其他镜头。';filmRevision=null;}catch(e){f.error=e.message}finally{filmRevisionBusy=false;renderEdit();}
}

async function recheckPendingFilm(id,model='large-v3'){try{const r=await fetch('/api/film/'+encodeURIComponent(id)+'/recheck-pending',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model})});const data=await r.json();if(!r.ok)throw Error(data.error);filmMessage='正在本地复核存疑对白；保留此前识别记录，不改写剧本或放行不匹配项。';}catch(e){filmMessage=e.message}renderEdit();}

async function recomposeFilmFraming(){
 if(filmRevisionBusy||!filmRevision)return;const f=filmRevision,s=f.run.shots[f.index],cropBottomPercent=Number(document.getElementById('filmRevisionCrop').value);
 if(!Number.isFinite(cropBottomPercent)||cropBottomPercent<0||cropBottomPercent>20){f.error='底部裁切须为 0–20%';renderEdit();return}filmRevisionBusy=true;
 try{const r=await fetch('/api/film/'+encodeURIComponent(f.run.id)+'/recompose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes:[{shotId:s.shotId,cropBottomPercent}]})}),out=await r.json();if(!r.ok)throw Error(out.error);filmRuns.push(out.run);filmMessage='已保存画面整理版本；保留原素材，不重新生成已完成画面。';filmRevision=null;}catch(e){f.error=e.message}finally{filmRevisionBusy=false;renderEdit();}
}

const renderStudioBeforeFilms=renderStudio;
renderStudio=function(){
 renderStudioBeforeFilms();const root=document.getElementById('studio');if(!root)return;
 document.getElementById('studioFilmProduction')?.remove();
 const labels={pending:'准备开始',rendering:'正在制作镜头',assembling:'正在自动合成',complete:'视频已生成，待验收',paused:'制作暂停',failed:'需要处理'};
 const entries=FilmStudioSummary.latestByProject(filmRuns,D.projects);
 root.insertAdjacentHTML('beforeend','<div class="card" id="studioFilmProduction"><h3>自动制作实时状态</h3><p class="muted">显示各项目最近的自动制作任务；上方已审核时长按审片结果统计。</p>'+entries.map(({project,run})=>'<p><b>'+esc(project.name)+'</b> · '+esc(labels[run.status]||run.status)+' · '+run.completed+'/'+run.total+' 镜'+(run.videoUrl?' · <a class="btn" href="'+esc(run.videoUrl)+'" target="_blank" rel="noopener">查看视频</a>':'')+'</p>').join('')+(entries.length?'':'<p class="muted">暂无自动制作任务</p>')+'</div>');
};
