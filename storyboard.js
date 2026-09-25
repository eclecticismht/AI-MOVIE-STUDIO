// A screenplay can feed many shots; editing a shot never writes back to its source.
function screenAssetEditor(shot){
 const assets=(D.props||[]).filter(a=>a.projectId===shot.projectId);
 return `<details><summary>屏幕资产展示设置</summary><p>直接显示原图片，适合必须准确的聊天、金额和朋友圈。无人物动作，默认静音，可配独立环境音；不调用视频模型。</p><label>展示来源<select id="board_screenSource"><option value="image">原始图片（保留照片）</option><option value="text" ${shot.screenSource==='text'?'selected':''}>本镜屏幕原文（准确显示文字）</option></select></label><label>展示的屏幕道具<select id="board_screenAssetId"><option value="">请选择本镜引用的道具</option>${assets.map(a=>`<option value="${esc(a.id)}" ${shot.screenAssetId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label><label>展示图片上部高度（%，100表示整图）<input id="board_screenImagePercent" type="number" min="20" max="100" value="${shot.screenImagePercent||100}"></label><p>只裁掉下方多余空白；请通过样片确认没有裁掉信息。</p></details>`;
}
const storyboardRequests=new Set(),storyboardMessages=new Map();
function storyboardTiming(){const p=activeProject();return {mode:p.storyboardTimingMode==='target'?'target':'auto',targetSeconds:Math.round(Number(p.storyboardTargetMinutes||p.target||8)*60)}}
function saveStoryboardTiming(){
  const p=activeProject(),mode=document.getElementById('boardTimingMode').value,minutes=Number(document.getElementById('boardTargetMinutes').value);
  if(mode==='target'&&(!Number.isFinite(minutes)||minutes<0.1||minutes>40))return alert('目标时长请输入 0.1 到 40 分钟。');
  const changes={storyboardTimingMode:mode,storyboardTargetMinutes:Number.isFinite(minutes)&&minutes>0?minutes:8};
  try{localStorage.setItem('aimovie_data',JSON.stringify({...D,projects:D.projects.map(x=>x===p?{...p,...changes}:x)}));Object.assign(p,changes);storyboardMessages.set(p.id,'时长设置已保存，用于下一次生成分镜；已有镜头时长保留。');renderShots2()}catch{alert('时长设置保存失败，请重试。')}
}
function storyboardTimingControls(shots){const p=activeProject(),timing=storyboardTiming(),total=shots.reduce((sum,s)=>sum+(Number(s.dur)||0),0);return `<div class="card"><h2>分镜时长</h2><div class="formgrid"><div class="field"><label for="boardTimingMode">时长分配方式</label><select id="boardTimingMode" onchange="document.getElementById('boardTargetMinutes').disabled=this.value!=='target'"><option value="auto" ${timing.mode==='auto'?'selected':''}>根据剧本自动推荐（默认）</option><option value="target" ${timing.mode==='target'?'selected':''}>按目标总时长规划</option></select></div><div class="field"><label for="boardTargetMinutes">目标总时长（分钟）</label><input id="boardTargetMinutes" type="number" min="0.1" max="40" step="0.1" value="${esc(p.storyboardTargetMinutes||p.target||8)}" ${timing.mode==='auto'?'disabled':''}></div></div><p class="muted">根据动作、对白和情绪节奏分别推荐每镜时长，不统一为 5 秒。当前 H3 单镜支持 4–15 秒，较长情节会拆镜。目标总时长是规划参考，不会强行拉伸或裁掉对白；每镜仍可手动调整。H3 帧数对齐会产生少量实际时长差异。</p><p>当前列表合计：${Math.floor(total/60)} 分 ${(total%60).toFixed(1)} 秒 · ${shots.length} 个镜头</p><button class="btn" onclick="saveStoryboardTiming()">保存时长设置</button></div>`}
function validatedShotAssetIds(shot,kind,key,projectId){
  const available=(D[kind]||[]).filter(a=>a.projectId===projectId),ids=shot[key]||[];
  if(!Array.isArray(ids)||ids.some(id=>!available.some(a=>a.id===id)))throw Error('生成的分镜引用了不存在或已删除的资产，请重新生成。');
  if(kind==='scenes'&&available.length&&!ids.length)throw Error('分镜缺少场景资产引用，请重新生成。');
  return [...new Set(ids)];
}
function storyboardAssetSummary(shot){return `<div class="assetMeta">${[['characters','characterIds','角色'],['scenes','sceneIds','场景'],['props','propIds','道具']].map(([kind,key,label])=>`${label}引用：${(shot[key]||[]).map(id=>(D[kind]||[]).find(a=>a.id===id&&a.projectId===shot.projectId)?.name).filter(Boolean).map(esc).join('、')||'无（可在编辑分镜中选择）'}`).join('<br>')}</div>`}
function shotHasActiveJob(shot){return D.jobs.some(j=>j.projectId===shot.projectId&&j.shot===shot.id&&
  !j.videoUrl&&!['已取消','已生成，待审核','ComfyUI H3 已完成'].includes(j.status)&&
  !(D.generations||[]).some(g=>g.jobId===j.id)&&
  !/生成失败|提交已阻止/.test(j.status||'')&&!(j.status==='失败'&&!j.comfyPromptId))}
function nextShotVersion(shot){
  const records=[...D.jobs,...(D.generations||[])].filter(x=>x.projectId===shot.projectId&&x.shot===shot.id);
  const highest=Math.max(0,...records.map(x=>Number(String(x.version||'v001').replace(/^v/,''))||1));
  return 'v'+String(highest+1).padStart(3,'0');
}
function createStoryboardJob(s){if(['black','screen'].includes(s.renderMode))throw Error('此镜头由自动成片在本地合成，无需加入模型队列。');const p=activeProject(),duration=Number(s.dur);if(!Number.isFinite(duration)||duration<4||duration>15)throw Error('请先为分镜设置 4–15 秒的有效时长。');return {dialogueEvents:shotDialogueEvents(s),id:uid('JOB'),shot:s.id,projectId:p.id,version:nextShotVersion(s),status:'等待本地 H3 Connector',model:'Minimax H3',mode:'T2VA',duration,...(typeof h3JobSettings==='function'?h3JobSettings():{}),prompt:compileH3Prompt(s),candidates:p.wizard?.candidates||3,createdAt:new Date().toLocaleString(),queuedAt:new Date().toISOString()}}
const referenceQueueLocks=new Set();
async function queueById(id,button){
  const shot=D.shots.find(s=>s.id===id&&s.projectId===D.activeProjectId);if(!shot)return;
  const notice=document.getElementById('queue-status-'+id),notify=message=>{if(notice)notice.textContent=message;};
  if(shotHasActiveJob(shot)){notify('已在队列中，请等待完成或取消后重试。');if(!button)throw Error('该镜头已有待提交或正在执行的任务，请等待完成或取消后重试。');return;}
  if(referenceQueueLocks.has(shot.projectId)){notify('正在添加镜头，请稍后重试。');return;}referenceQueueLocks.add(shot.projectId);if(button)button.disabled=true;notify('正在添加…');
  try{
    if(typeof workflowPreflight==='function')await workflowPreflight([shot]);
    const job=await prepareStoryboardJob(shot),jobs=[...D.jobs,job],shots=D.shots.map(s=>s===shot?{...s,status:'等待 Worker'}:s);
    localStorage.setItem('aimovie_data',JSON.stringify({...D,jobs,shots}));D.jobs=jobs;D.shots=shots;notify('已成功加入生成队列。');
  }catch(error){notify('添加失败：'+error.message);if(!button)throw Error('入队失败：'+error.message)}finally{referenceQueueLocks.delete(shot.projectId);if(button)button.disabled=false}
}
function redoGeneration(id){
  const generation=(D.generations||[]).find(g=>g.id===id&&g.projectId===D.activeProjectId);
  const shot=generation&&D.shots.find(s=>s.id===generation.shot&&s.projectId===generation.projectId);
  if(!shot)return alert('对应分镜已删除，无法直接重做。');
  if(shotHasActiveJob(shot))return alert('该镜头已有待提交或正在执行的任务，请先处理现有任务。');
  const generations=D.generations.map(g=>g===generation?{...g,status:'需重做'}:g),shots=D.shots.map(s=>s===shot?{...s,status:'需重做'}:s);
  const p=activeProject(),batch=shot.storyboardBatchId||'';
  try{localStorage.setItem('aimovie_data',JSON.stringify({...D,generations,shots,projects:D.projects.map(x=>x===p?{...p,storyboardBatchId:batch}:x)}))}
  catch{return alert('保存失败，未修改审片结果。')}
  D.generations=generations;D.shots=shots;p.storyboardBatchId=batch;editingShotId=shot.id;go('shots');
  const prompt=document.getElementById('board_prompt');
  prompt?.scrollIntoView({block:'center',behavior:'smooth'});prompt?.focus({preventScroll:true});
}
function saveAndRequeueStoryboard(id){if(saveStoryboardShot(id))queueById(id)}
function visibleStoryboardShots(){
  const p=activeProject(),filter=(D.storyboardBatches||[]).some(b=>b.projectId===p.id&&b.id===p.storyboardBatchId)?p.storyboardBatchId:'';
  return projectShots().filter(s=>!s.autoArchived&&(!filter||s.storyboardBatchId===filter));
}
async function queueVisibleStoryboardShots(button){
  const p=activeProject(),visible=visibleStoryboardShots();
  const notice=document.getElementById('queue-all-status'),notify=message=>{storyboardMessages.set(p.id,message);if(notice)notice.textContent=message;};
  if(editingShotId){notify('请先保存或取消正在编辑的分镜，再全部加入队列。');return;}
  if(referenceQueueLocks.has(p.id)){notify('正在添加镜头，请稍后。');return;}
  const local=visible.filter(s=>['black','screen'].includes(s.renderMode)||s.continueFromShotId);
  const eligible=visible.filter(s=>!local.includes(s)&&['待制作','需重做','失败'].includes(s.status)&&!shotHasActiveJob(s));
  const localNote=local.length?`其中 ${local.length} 镜需在“自动成片”中制作（屏幕、黑屏或承接镜头）。`:'';
  if(!eligible.length){notify('当前列表没有可加入的模型镜头；已排队、待审核或已完成的镜头会自动跳过。'+localNote);return;}
  referenceQueueLocks.add(p.id);if(button)button.disabled=true;
  const added=[],failed=[];
  try{
    if(typeof workflowPreflight==='function'){notify('正在检查本批制作条件与渲染器连接…');await workflowPreflight(eligible);}
    for(const [i,shot] of eligible.entries()){
      notify(`正在准备 ${i+1}/${eligible.length} 镜…`);
      if(D.activeProjectId!==p.id)throw Error('项目已切换，本次未添加，请返回原项目重试。');
      try{added.push(await prepareStoryboardJob(shot));}
      catch(error){failed.push(`第 ${visible.indexOf(shot)+1} 镜（${shot.id}）：${error.message}`);}
    }
    if(D.activeProjectId!==p.id)throw Error('项目已切换，本次未添加，请返回原项目重试。');
    for(let i=added.length-1;i>=0;i--){const job=added[i],shot=D.shots.find(s=>s.id===job.shot&&s.projectId===p.id);if(!await ResultGuard.matches(shot,job,D)||shotHasActiveJob(shot)){failed.push(`${job.shot}：准备期间分镜、资产或队列已变化，请重新添加。`);added.splice(i,1);}}
    const ids=new Set(added.map(j=>j.shot)),shots=D.shots.map(s=>s.projectId===p.id&&ids.has(s.id)?{...s,status:'等待 Worker'}:s),jobs=[...D.jobs,...added];
    localStorage.setItem('aimovie_data',JSON.stringify({...D,shots,jobs}));
    D.shots=shots;D.jobs=jobs;
    notify(`已加入 ${added.length} 镜，失败 ${failed.length} 镜，跳过 ${visible.length-eligible.length} 镜。${localNote}${added.length?'可前往“AI生成”查看队列。':''}${failed.length?'\n'+failed.join('\n'):''}`);
    for(const job of added){const row=document.getElementById('queue-status-'+job.shot);if(row)row.textContent='已成功加入生成队列。';}
  }catch(error){notify('批量入队失败，未添加任务：'+error.message)}finally{referenceQueueLocks.delete(p.id);if(button)button.disabled=false;}
}
function storyboardScripts(){return items('scripts').filter(s=>!s.autoArchived&&s.content?.trim())}
function selectedStoryboardScript(){const p=activeProject(),scripts=storyboardScripts();return scripts.find(s=>s.id===p.storyboardScriptId)||scripts.find(s=>s.id===p.screenplayId)||scripts.filter(s=>s.kind==='screenplay').at(-1)||scripts[0]}
function setStoryboardOption(key,value){if(!['storyboardScriptId','storyboardNotes','storyboardBatchId'].includes(key))return;activeProject()[key]=value;localStorage.setItem('aimovie_data',JSON.stringify(D));if(key!=='storyboardNotes'){editingShotId=null;renderShots2()}}
function storyboardShotEditor(shot){
  return `<div class="card"><h3>编辑分镜 · ${esc(shot.id)}</h3><div class="formgrid">
    ${[['scene','场次 / 地点',shot.scene],['char','出场人物',shot.char],['camera','景别 / 运镜',shot.camera],['dur','时长（秒）',shot.dur]].map(([key,label,value])=>`<div class="field"><label for="board_${key}">${label}</label><input id="board_${key}" ${key==='dur'?'type="number" min="4" max="15" step="0.1"':''} value="${esc(value||'')}"></div>`).join('')}
    ${[['script','人物行动',shot.script||shot.desc],['visual','画面设计',shot.visual||shot.desc],['dialogue','对白（每行：人物名：原句；电话用 人物名（语音）：原句；消息用 屏幕文字：原文）',shot.dialogue||'']].map(([key,label,value])=>`<div class="field"><label for="board_${key}">${label}</label><textarea id="board_${key}">${esc(value||'')}</textarea></div>`).join('')}</div>
    ${characterReferencePicker('shot_'+shot.id,shot.characterIds||[])}${sceneReferencePicker('shot_'+shot.id,shot.sceneIds||[])}${propReferencePicker('shot_'+shot.id,shot.propIds||[])}
    ${screenAssetEditor(shot)}<label>制作方式<select id="board_renderMode"><option value="screen" ${shot.renderMode==='screen'?'selected':''}>直接展示屏幕资产（本地合成）</option><option value="model" ${!shot.renderMode||shot.renderMode==='model'?'selected':''}>AI 视频生成</option><option value="black" ${shot.renderMode==='black'?'selected':''}>纯黑静音（本地合成，不调用模型）</option></select></label><label>成片声音（自动成片时应用）<select id="board_audioMode"><option value="model">保留模型声音（含环境声，需试听）</option><option value="mute" ${shot.audioMode==='mute'?'selected':''}>整镜静音（同时移除环境声；不能有口头对白）</option><option value="overlay" ${shot.audioMode==='overlay'?'selected':''}>叠加音效（保留原声与对白）</option><option value="voiceover" ${shot.audioMode==='voiceover'?'selected':''}>独立画外声（电视 / 旁白 / 电话）</option><option value="replacement" ${shot.audioMode==='replacement'?'selected':''}>独立环境音（替换模型音轨）</option></select></label>${typeof reuseShotAmbienceControl==='function'?reuseShotAmbienceControl(shot):''}<label>导入声音（WAV/MP3，20MB以内）<input type="file" accept="audio/wav,audio/mpeg,.wav,.mp3" onchange="importShotAmbience(this,'board_audioAsset')"></label><input type="hidden" id="board_audioAsset" value="${esc(shot.audioAsset||'')}"><p id="board_audioAsset_status">${shot.audioAsset?'已配置独立声音素材':''}</p><p>独立画外声使用已录制的电视、旁白或电话音轨，保留对白文字和字幕校验；不能替换画内人物对白，不足时补静音，过长时阻止生成。环境音替换仅用于无对白镜头；叠加模式保留模型原声。</p><label>动作衔接（自动成片）<select id="board_continueFromShotId"><option value="">独立镜头</option>${shot.continueFromShotId&&!D.shots.some(s=>s.id===shot.continueFromShotId&&!s.autoArchived)?`<option selected value="${esc(shot.continueFromShotId)}">原承接镜头已缺失，请重新选择</option>`:''}${D.shots.filter(s=>s.projectId===shot.projectId&&s.storyboardBatchId===shot.storyboardBatchId&&!s.autoArchived&&s.id!==shot.id&&(s.sequence||0)<(shot.sequence||0)).sort((a,b)=>(b.sequence||0)-(a.sequence||0)).slice(0,1).map(s=>`<option value="${esc(s.id)}" ${shot.continueFromShotId===s.id?'selected':''}>承接第 ${s.sequence} 镜最后一帧</option>`).join('')}</select></label><p>使用上一镜最后一帧作为本镜起点，保持人物和场景连续。本镜可以有对白；画内对白须指定发声者位置，不设置独立首帧。请在自动成片中连同前镜一起制作。重做前镜会同步重做相连的后镜。</p><label>首帧图片地址（可选）<input id="board_firstFrameUrl" value="${esc(shot.firstFrameUrl||'')}" placeholder="/assets/… 或导入图片"></label><input type="file" accept="image/png,image/jpeg,image/webp" onchange="importShotFirstFrame(this)"><button class="btn" type="button" onclick="document.getElementById('board_firstFrameUrl').value='';document.getElementById('board_firstFramePreview').removeAttribute('src');document.getElementById('board_firstFrameSpeakerPosition').value=''">清除首帧（保存后生效）</button><label>首帧中画内发声者的位置<select id="board_firstFrameSpeakerPosition"><option value="">无画内对白 / 未指定</option>${[['left','画面左侧'],['center','画面中央'],['right','画面右侧']].map(([v,t])=>`<option value="${v}" ${shot.firstFrameSpeakerPosition===v?'selected':''}>${t}</option>`).join('')}</select></label><p>先确认画面中的人物、服装和场景。设置首帧后，模型从这张完整画面生成动作；原资产关系保留，但不再分别向模型输入资产图片。清空地址恢复资产参考模式。</p><img id="board_firstFramePreview" ${shot.firstFrameUrl?'src="'+esc(shot.firstFrameUrl)+'"':''} style="max-width:360px;max-height:220px" alt="首帧预览">${typeof assetStateEditor==='function'?assetStateEditor(shot):''}${typeof splitShotForm==='function'?splitShotForm(shot):''}
    <details ${shot.status==='需重做'?'open':''}><summary>生成提示词</summary><label for="board_prompt" class="muted">检查并修改发送给 H3 的提示词；留空时会根据分镜内容自动编写。</label><textarea id="board_prompt" style="min-height:240px">${esc(shot.prompt||'')}</textarea></details>
    <p class="muted">修改画面后，请同时检查下方生成提示词是否需要调整。重新入队会保留旧任务和旧视频，不会立即开始渲染。</p>
    <p><button class="btn gold" data-id="${esc(shot.id)}" onclick="saveStoryboardShot(this.dataset.id)">保存分镜</button> <button class="btn gold" data-id="${esc(shot.id)}" onclick="saveAndRequeueStoryboard(this.dataset.id)">保存并重新加入生成队列</button> <button class="btn" onclick="editingShotId=null;renderShots2()">取消</button></p></div>`;
}
function renderStoryboardWorkspace(){
  const p=activeProject(),source=selectedStoryboardScript(),scripts=storyboardScripts(),busy=storyboardRequests.has(p.id);
  const batches=(D.storyboardBatches||[]).filter(b=>b.projectId===p.id),filter=batches.some(b=>b.id===p.storyboardBatchId)?p.storyboardBatchId:'';
  const shots=visibleStoryboardShots();
  document.getElementById('shots').innerHTML=`<h1>从剧本生成分镜</h1><p class="muted">选择已保存的剧本，由 DeepSeek 按场次和剧情动作生成分镜，再逐条调整。</p>
    <div class="card"><div class="field"><label for="boardSource">来源剧本</label><select id="boardSource" onchange="setStoryboardOption('storyboardScriptId',this.value)">${scripts.length?scripts.map(s=>`<option value="${esc(s.id)}" ${s.id===source?.id?'selected':''}>${esc(s.title)}${s.kind==='screenplay'?' · '+esc(new Date(s.createdAt).toLocaleString()):' · 以前保存'}</option>`).join(''):'<option value="">暂无可用剧本</option>'}</select></div>
    ${source?`<details style="margin:12px 0"><summary>查看所选剧本 · ${source.content.length} 字</summary><pre style="white-space:pre-wrap;max-height:260px;overflow:auto;font:inherit">${esc(source.content)}</pre></details>`:'<p class="muted">请先在剧本页生成并保存剧本。</p>'}
    <div class="field"><label for="boardNotes">分镜要求（可选）</label><textarea id="boardNotes" placeholder="例如：节奏舒缓，突出人物表情，保持场景连续性。" oninput="setStoryboardOption('storyboardNotes',this.value)">${esc(p.storyboardNotes||'')}</textarea></div>
    <details style="margin:12px 0" ${!screenplayApiKey&&!screenplayServerConfigured?'open':''}><summary>DeepSeek 连接</summary><p class="muted">沿用剧本页的会话密钥；生成时将所选剧本发送至 DeepSeek。每次生成保存为新一批分镜。</p><div class="field"><label for="boardApiKey">API Key</label><input id="boardApiKey" type="password" autocomplete="off" placeholder="${screenplayApiKey?'当前会话已填写':screenplayServerConfigured?'服务器已配置':'填写 DeepSeek API Key'}" oninput="screenplayApiKey=this.value.trim()"></div></details>
    <div class="toolbar"><button class="btn gold" ${busy||!source?'disabled':''} onclick="generateStoryboard()">${busy?'正在生成分镜…':'根据所选剧本生成分镜'}</button><button class="btn" onclick="go('scripts')">打开剧本页</button></div><p role="status">${esc(storyboardMessages.get(p.id)||'')}</p></div>
    ${storyboardTimingControls(shots)}
    ${typeof renderH3Settings==='function'?renderH3Settings():''}${typeof productionAuditControl==='function'?productionAuditControl():''}
    <div class="toolbar"><h2 style="margin:0">分镜列表 · ${shots.length} 条</h2><label for="boardBatch">查看批次</label><select id="boardBatch" onchange="setStoryboardOption('storyboardBatchId',this.value)"><option value="">全部分镜（含以前保存）</option>${batches.map((b,i)=>`<option value="${esc(b.id)}" ${filter===b.id?'selected':''}>第 ${i+1} 批 · ${esc(b.sourceTitle)} · ${esc(new Date(b.createdAt).toLocaleString())}</option>`).join('')}</select><button class="btn gold" ${shots.length?'':'disabled'} onclick="queueVisibleStoryboardShots(this)">全部加入生成队列</button><button class="btn" onclick="go('gen')">查看生成队列</button><span class="muted">仅加入当前列表中待制作或需重做的镜头，自动跳过已排队项。</span></div><p id="queue-all-status" role="status" style="white-space:pre-wrap;min-height:1.5em">${esc(storyboardMessages.get(p.id)||'')}</p>
    ${shots.map((shot,index)=>`<article class="card"><div class="toolbar"><h3 style="margin:0">${index+1}. ${esc(shot.scene||'场次待定')}</h3><span class="status">${esc(shot.status)}</span><span class="muted">${esc(shot.id)} · ${esc(shot.dur)} 秒</span></div><p class="assetMeta">${esc(shot.camera||'景别待定')} · 人物：${esc(shot.char||'—')}</p><div class="row2"><div><b>人物行动</b><p style="white-space:pre-wrap">${esc(shot.script||shot.desc)}</p></div><div><b>画面设计</b><p style="white-space:pre-wrap">${esc(shot.visual||shot.desc)}</p></div></div>${storyboardAssetSummary(shot)}${shot.dialogue?`<p style="white-space:pre-wrap"><b>对白 / 声音：</b>${esc(shot.dialogue)}</p>`:''}${shot.sourceExcerpt?`<details><summary>对应剧本原文</summary><p style="white-space:pre-wrap">${esc(shot.sourceExcerpt)}</p></details>`:''}<p><button class="btn" data-id="${esc(shot.id)}" onclick="editingShotId=this.dataset.id;renderShots2()">编辑分镜</button> ${['screen','black'].includes(shot.renderMode)?`<button class="btn gold" onclick="go('edit')">在自动成片中制作</button>`:`<button class="btn gold" data-id="${esc(shot.id)}" onclick="queueById(this.dataset.id,this)">加入生成队列</button>`} <button class="btn" data-id="${esc(shot.id)}" onclick="deleteShot(this.dataset.id)">删除</button></p><p role="status" id="queue-status-${esc(shot.id)}" style="min-height:1.5em;margin:0"></p>${editingShotId===shot.id?storyboardShotEditor(shot):''}</article>`).join('')||'<div class="card empty">选择剧本后点击“根据所选剧本生成分镜”。</div>'}`;
}
async function generateStoryboard(){
  const p=activeProject(),source=selectedStoryboardScript();if(storyboardRequests.has(p.id))return;
  if(!source){storyboardMessages.set(p.id,'请先生成并保存剧本。');renderShots2();return}
  const content=source.content,sourceId=source.id,sourceTitle=source.title,notes=p.storyboardNotes||'',timing=storyboardTiming();
  const assets=Object.fromEntries(['characters','scenes','props'].map(kind=>[kind,(D[kind]||[]).filter(a=>a.projectId===p.id).map(({id,name,type,notes})=>({id,name,type,notes}))]));
  if(content.length>60000){storyboardMessages.set(p.id,'剧本超过 60,000 字，请按场次分成多个剧本后生成。');renderShots2();return}
  if(location.protocol==='file:'){storyboardMessages.set(p.id,'请在 http://127.0.0.1:4173 打开工作室后生成。');renderShots2();return}
  storyboardRequests.add(p.id);storyboardMessages.set(p.id,'正在按剧本场次生成分镜，请稍候…');renderShots2();
  try{
    const segments=StoryboardSegments.split(content,timing),result={shots:[],model:p.screenplayModel||'deepseek-flash'};
    const draftKey='aimovie_storyboard_draft_'+p.id,signature=JSON.stringify({content,assets,timing,notes,storyUnderstanding:source.storyUnderstanding,model:result.model});let draft;
    try{draft=JSON.parse(localStorage.getItem(draftKey)||'null')}catch{}
    if(draft?.signature!==signature||!Array.isArray(draft.parts))draft={signature,parts:[]};
    for(const [partIndex,part] of segments.entries()){
    if(draft.parts[partIndex]){result.shots.push(...draft.parts[partIndex].shots);result.model=draft.parts[partIndex].model;continue;}
    let piece;
    for(let attempt=0,repair=draft.repairs?.[partIndex],feedback=repair?'\n请继续修正上次未通过检查的原始结果。':'';attempt<3;attempt++){
      storyboardMessages.set(p.id,`正在生成第 ${partIndex+1}/${segments.length} 段分镜${attempt?`，自动修正第 ${attempt} 次`:''}…`);if(D.activeProjectId===p.id)renderShots2();
      const guidance=(draft.feedback?'上次故事核对问题，请修正：'+draft.feedback+'\n':'')+'\n口头对白时长计算：字数除以3再加1秒，向上取整，最少4秒，最多15秒；超过15秒必须按原文标点拆成多镜，每镜仍逐字保留原句片段和说话人，不得删掉台词。屏幕文字不计入口头对白。';
      const response=await fetch('/api/storyboard',{method:'POST',headers:{'Content-Type':'application/json',...(typeof textAIHeaders==='function'?textAIHeaders(p.screenplayModel):(screenplayApiKey?{Authorization:'Bearer '+screenplayApiKey}:{}))},body:JSON.stringify({screenplay:part.text,sourceStory:source.sourceStory,storyUnderstanding:source.storyUnderstanding,repair,notes:guidance+(segments.length>1?`\n本次只生成完整剧本第${partIndex+1}/${segments.length}段，不能重复其他段。整片镜头数量要求按本段目标时长比例分配，不要为本段生成整片镜头数量。`:'')+feedback+'\n'+notes,assets,timing:part.timing,model:p.screenplayModel||'deepseek-flash'}),signal:AbortSignal.timeout(250000)});
      if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('分镜接口尚未启动，请重启本地服务器。');
      piece=await response.json();
      if(response.ok)break;
      const error=piece.error||'分镜生成失败。';
      if(piece.repair){draft.repairs=draft.repairs||{};draft.repairs[partIndex]=piece.repair;localStorage.setItem(draftKey,JSON.stringify(draft));}
      if(attempt===2||(!piece.repair&&!/台词|分镜.*(?:不完整|原文|引用)|说话人物|承接|屏幕(?:原文|文字)|对白|资产状态|角色|原文/.test(error)))throw new Error(`第${partIndex+1}段：`+error);
      repair=piece.repair;feedback='\n上次结果未通过检查，请修正以下问题并重新输出本段完整分镜：'+error;
    }
    if(!Array.isArray(piece.shots)||!piece.shots.length)throw Error('分段未返回镜头');if(piece.shots[0].continuePrevious)throw Error('新场次首镜不能承接其他场次');draft.parts[partIndex]=piece;localStorage.setItem(draftKey,JSON.stringify(draft));result.shots.push(...piece.shots);result.model=piece.model;
    }
    if(!Array.isArray(result.shots)||!result.shots.length)throw new Error('未收到有效分镜，请重试。');
    let storyReview;
    if(source.storyUnderstanding){
      storyboardMessages.set(p.id,'正在对照原文核对全部分镜…');
      storyReview=(await storyAIRequest('/api/screenplay/coverage',{story:source.sourceStory,storyUnderstanding:source.storyUnderstanding,shots:result.shots,model:result.model})).review;
      if(storyReview?.status!=='checked'){draft.review=storyReview;draft.failedParts=draft.parts;draft.parts=[];draft.feedback=(storyReview?.issues||['核对结果不完整']).join('\n');localStorage.setItem(draftKey,JSON.stringify(draft));throw Error('分镜尚未通过故事核对：'+draft.feedback+'。点击重新生成可按这些问题修正。')}
      if(storyReview.beatIds)result.shots=StoryUnderstanding.annotate(result.shots.map((s,i)=>({...s,beatIds:storyReview.beatIds[i]})),source.storyUnderstanding);
    }
    if(!D.projects.includes(p)||source.content!==content)throw Error('剧本已变化，未保存过期分镜');
    const batch={id:uid('BOARD'),projectId:p.id,sourceScriptId:sourceId,sourceTitle,sourceContent:content,sourceStory:source.sourceStory,storyUnderstanding:source.storyUnderstanding,storyReview,notes,timing,model:result.model,createdAt:new Date().toISOString()};
    const shots=result.shots.map((s,i)=>({id:uid('SH'),projectId:p.id,scriptId:sourceId,storyboardBatchId:batch.id,sequence:i+1,sourceExcerpt:s.sourceExcerpt,beatIds:s.beatIds,storyBinding:s.storyBinding,screenCards:s.screenCards,script:s.action,visual:s.visual,desc:s.visual,camera:s.camera,char:s.characters,scene:s.scene,dialogue:s.dialogue,dur:s.duration,assetStates:s.assetStates||{},status:'待制作',prompt:'',characterIds:validatedShotAssetIds(s,'characters','characterIds',p.id),sceneIds:validatedShotAssetIds(s,'scenes','sceneIds',p.id),propIds:validatedShotAssetIds(s,'props','propIds',p.id)}));
    for(let i=0;i<shots.length;i++)if(result.shots[i].continuePrevious){if(!i)throw Error('第一镜不能承接上一镜');shots[i].continueFromShotId=shots[i-1].id;}
    const batches=[...(D.storyboardBatches||[]),batch],allShots=[...D.shots,...shots];
    localStorage.setItem('aimovie_data',JSON.stringify({...D,shots:allShots,storyboardBatches:batches,projects:D.projects.map(item=>item===p?{...p,storyboardBatchId:batch.id}:item)}));
    D.shots=allShots;D.storyboardBatches=batches;p.storyboardBatchId=batch.id;try{localStorage.removeItem(draftKey)}catch{}
    storyboardMessages.set(p.id,`已生成 ${shots.length} 条分镜，保存为新批次。可以继续编辑并加入生成队列。`);
    return batch;
  }catch(error){storyboardMessages.set(p.id,/timeout|abort/i.test(error.name)?'生成超时，已有分镜保留，请稍后重试。':error.message)}
  finally{storyboardRequests.delete(p.id);if(D.activeProjectId===p.id)renderShots2()}
}
function saveStoryboardShot(id){
  const shot=D.shots.find(s=>s.id===id&&s.projectId===D.activeProjectId);if(!shot)return;
  const value=key=>document.getElementById('board_'+key).value.trim(),duration=Number(value('dur'));
  if(!Number.isFinite(duration)||duration<4||duration>15)return alert('镜头时长需在 4 到 15 秒之间。');
  const updated={...shot,soundscape:(document.getElementById('board_soundscape')?.value?.trim()??shot.soundscape??''),characterPositions:typeof readCharacterPositions==='function'?readCharacterPositions():shot.characterPositions,firstFrameSpeakerPosition:document.getElementById('board_firstFrameSpeakerPosition')?.value||'',audioAsset:document.getElementById('board_audioAsset')?.value||'',firstFrameUrl:document.getElementById('board_firstFrameUrl')?.value?.trim()||'',audioMode:document.getElementById('board_audioMode')?.value||'model',renderMode:document.getElementById('board_renderMode')?.value||'model',scene:value('scene'),char:value('char'),camera:value('camera'),dur:duration,script:value('script'),visual:value('visual'),dialogue:value('dialogue'),prompt:value('prompt'),characterIds:selectedCharacterIds('shot_'+id),sceneIds:selectedSceneIds('shot_'+id),propIds:selectedPropIds('shot_'+id)};
  if(updated.actionReviewRequired){
    if(!updated.script||!updated.visual||updated.script===shot.script||updated.visual===shot.visual)return alert('请分别修订拆镜后的人物行动和画面设计，明确当前唯一说话人及其他人的无声反应。');
    delete updated.actionReviewRequired;
  }
  try{ShotAudio.validate(updated.audioMode,updated.audioMode!=='model'?shotDialogueEvents(updated):undefined,updated.audioAsset);if(typeof readAssetStateEditor==='function')updated.assetStates=readAssetStateEditor(updated)}catch(error){return alert(error.message)}
  updated.continueFromShotId=document.getElementById('board_continueFromShotId')?.value||'';
  if(updated.continueFromShotId&&(updated.firstFrameUrl||updated.renderMode==='black'))return alert('承接镜头不能设置独立首帧或纯黑画面');
  updated.screenAssetId=document.getElementById('board_screenAssetId')?.value||'';
  updated.screenSource=document.getElementById('board_screenSource')?.value||'image';
  updated.screenImagePercent=Number(document.getElementById('board_screenImagePercent')?.value||100);
  if(updated.renderMode==='screen'){
    if(updated.firstFrameUrl||updated.continueFromShotId||shotDialogueEvents(updated).some(e=>e.type==='speech'))return alert('屏幕资产展示不能含口头对白、首帧或尾帧承接');
    if(!updated.propIds.includes(updated.screenAssetId))return alert('请选择本镜已引用的屏幕道具');
    if(updated.screenSource==='text'&&!updated.assetStates?.[updated.screenAssetId]?.screenText)return alert('请先为所选屏幕道具填写本镜屏幕原文');
    if(!Number.isFinite(updated.screenImagePercent)||updated.screenImagePercent<20||updated.screenImagePercent>100)return alert('图片展示高度须为20–100%');
  }
  updated.firstFrameIntent=document.getElementById('board_firstFrameIntent')?.value?.trim()||'';
  if(updated.firstFrameUrl&&typeof FrameProvenance!=='undefined'){try{updated.firstFrameSpeakerPosition=FrameProvenance.reconcileSpeaker(shot,updated,shotDialogueEvents(shot),shotDialogueEvents(updated));}catch{updated.firstFrameSpeakerPosition='';}}
  const provenanceField=document.getElementById('board_firstFrameProvenance');
  if(provenanceField){try{const provenance=JSON.parse(provenanceField.value||'null');updated.firstFrameProvenance=provenance?.imageUrl===updated.firstFrameUrl?provenance:null;}catch{updated.firstFrameProvenance=null;}}
  updated.desc=updated.visual||updated.script;
  if(updated.firstFrameUrl&&!updated.firstFrameProvenance&&updated.firstFrameUrl!==shot.firstFrameUrl&&typeof FrameProvenance!=='undefined')updated.firstFrameProvenance=FrameProvenance.create(updated,shotReferenceAssets(updated),updated.firstFrameUrl);
  const shots=FilmSourceSync.replaceWithDependents(D.shots,shot,updated).shots;
  try{localStorage.setItem('aimovie_data',JSON.stringify({...D,shots}));D.shots=shots;editingShotId=null;renderShots2();return true}
  catch{alert('保存失败，请检查浏览器存储空间。')}
}
renderShots2=renderStoryboardWorkspace;
