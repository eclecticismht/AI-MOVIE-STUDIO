const TL={shotId:null,projectId:null,mode:'shots',version:null,zoom:22,time:0,dirty:false,busy:false,drawer:false,notice:'',previewKey:null,source:null};
const tlPages=['shots','gen','review','audio','edit'];
const tlRemoteJobs=new Map();
function tlClips(){const p=activeProject(),batches=(D.storyboardBatches||[]).filter(b=>b.projectId===p.id),id=p.storyboardBatchId||batches.at(-1)?.id;return TimelineModel.clips(D.shots.filter(s=>s.projectId===p.id&&s.storyboardBatchId===id))}
function tlCurrent(){return tlClips().find(c=>c.shot.id===TL.shotId)}
function tlMessage(text){TL.notice=text;const el=document.getElementById('tl-notice');if(el)el.textContent=text}
function tlCanLeave(){if(TL.dirty){tlMessage('声音设置尚未保存。请先保存或撤销，再切换镜头或工作区。');return false}if(editingShotId){tlMessage('请先保存或取消展开面板中的分镜编辑，再切换镜头或工作区。');return false}return true}
function tlSelect(id,seek=true){if(!tlCanLeave())return;const c=tlClips().find(c=>c.shot.id===id);if(!c)return;document.getElementById('tl-video')?.pause();TL.shotId=id;TL.notice='' ;TL.version=null;if(seek)TL.time=c.start;TL.previewKey=null;tlRender()}
function tlMode(mode){if(!tlCanLeave())return;TL.mode=mode;tlInspector();if(mode==='edit')tlTools('edit')}
function tlBatch(id){if(!tlCanLeave())return tlRender();const p=activeProject(),next={...p,storyboardBatchId:id,filmBatchId:id};try{localStorage.setItem('aimovie_data',JSON.stringify({...D,projects:D.projects.map(x=>x===p?next:x)}));Object.assign(p,next);TL.shotId=null;TL.version=null;TL.previewKey=null;TL.time=0;tlRender()}catch(e){tlMessage('批次切换保存失败：'+e.message)}}
function tlMount(){
  let section=document.getElementById('timeline');if(section)return section;
  section=document.createElement('section');section.id='timeline';section.className='page';
  section.innerHTML=`<header class="tl-head"><div><h1>时间线工作台</h1><p id="tl-project" class="muted"></p></div><div class="tl-actions"><select id="tl-batch" aria-label="时间线分镜批次" onchange="tlBatch(this.value)"></select><button class="btn" onclick="tlTools('shots')">分镜与检查</button><button class="btn gold" onclick="tlTools('edit')">样片 / 自动成片</button></div></header><div class="tl-stage"><div class="tl-bin" id="tl-bin"></div><div class="tl-monitor"><div class="tl-screen" id="tl-screen"></div><div class="tl-monitor-footer"><button class="btn" onclick="tlPlay()" aria-label="播放或暂停预览">▶ / Ⅱ</button><span id="tl-time">00:00 / 00:00</span><small id="tl-preview-label">镜头预览</small></div></div><div class="tl-inspector"><div class="tl-tabs" role="tablist" aria-label="镜头工作阶段">${[['shots','分镜'],['gen','生成'],['review','审片'],['audio','声音']].map(([id,title])=>`<button role="tab" data-mode="${id}" onclick="tlMode(this.dataset.mode)">${title}</button>`).join('')}</div><div id="tl-inspector"></div></div></div><div class="tl-timeline"><div class="tl-timeline-head"><h2>项目时间线</h2><span class="muted" id="tl-total"></span><button class="btn" onclick="tlStep(-1)">上一镜</button><button class="btn" onclick="tlStep(1)">下一镜</button><label>缩放 <input aria-label="时间线缩放" type="range" min="10" max="60" value="22" oninput="TL.zoom=Number(this.value);tlTracks()"></label></div><input id="tl-scrub" class="tl-scrub" aria-label="时间线播放位置（秒）" type="range" min="0" max="1" step="0.1" value="0" oninput="tlSeek(Number(this.value))"><div class="tl-scroll"><div id="tl-lanes" class="tl-lanes"></div></div></div><p id="tl-notice" class="tl-notice" role="status"></p><div class="tl-drawer" id="tl-drawer" hidden><div class="tl-drawer-top"><b id="tl-tool-title">制作工具</b><button class="btn" onclick="tlCloseTools()">收起工具</button></div><div class="tl-legacy" id="tl-legacy"></div></div>`;
  document.querySelector('main').append(section);return section;
}
function tlRender(){
  tlMount();if(TL.projectId!==D.activeProjectId){Object.assign(TL,{projectId:D.activeProjectId,shotId:null,version:null,previewKey:null,time:0,dirty:false})}
  const clips=tlClips();if(!clips.some(c=>c.shot.id===TL.shotId)){TL.shotId=clips[0]?.shot.id;TL.time=0;TL.previewKey=null}
  const p=activeProject(),batches=(D.storyboardBatches||[]).filter(b=>b.projectId===p.id);
  document.getElementById('tl-project').textContent='《'+p.name+'》 · 分镜 / 生成 / 审片 / 声音 / 成片';
  document.getElementById('tl-batch').innerHTML=batches.map((b,i)=>`<option value="${esc(b.id)}" ${b.id===clips[0]?.shot.storyboardBatchId?'selected':''}>第 ${i+1} 批 · ${esc(b.sourceTitle||'分镜')}</option>`).join('')||'<option>暂无分镜批次</option>';
  document.getElementById('tl-bin').innerHTML='<p class="tl-panel-title">镜头素材 · '+clips.length+'</p>'+clips.map((c,i)=>`<button data-shot="${esc(c.shot.id)}" aria-pressed="${c.shot.id===TL.shotId}" onclick="tlSelect(this.dataset.shot)"><b>${String(i+1).padStart(2,'0')} · ${esc(c.shot.scene||'镜头')}</b><small>${c.duration}s · ${esc(c.shot.status||'待制作')}</small></button>`).join('');
  tlTracks();if(!TL.dirty)tlInspector();tlPreview();tlMessage(TL.notice);
}
function tlTracks(){
  const clips=tlClips(),total=clips.at(-1)?.end||0,width=Math.max(1,total*TL.zoom),host=document.getElementById('tl-lanes');if(!host)return;
  host.style.width=(width+92)+'px';
  let ticks='';for(let t=0;t<=total;t+=5)ticks+=`<span class="tl-tick" style="left:${t*TL.zoom}px">${TimelineModel.timecode(t)}</span>`;
  const lane=(type,label,text)=>`<div class="tl-lane ${type}"><span class="tl-lane-label">${label}</span>${clips.map((c,i)=>`<button class="tl-clip ${c.shot.id===TL.shotId?'selected':''}" style="width:${c.duration*TL.zoom}px" data-shot="${esc(c.shot.id)}" aria-label="${label} 第 ${i+1} 镜 ${esc(c.shot.scene||'')}" onclick="tlSelect(this.dataset.shot)">${text(c,i)}</button>`).join('')}</div>`;
  host.innerHTML='<div class="tl-ruler">'+ticks+'</div>'+lane('video','V1 画面',(c,i)=>`<b>${String(i+1).padStart(2,'0')} ${esc(c.shot.scene||'镜头')}</b><small>${esc(c.shot.status||'待制作')} · ${c.duration}s</small>`)+lane('audio','A1 声音',c=>c.shot.audioMode==='mute'?'静音':c.shot.audioMode==='replacement'?'♫ 独立环境音':'♫ 生成原声')+lane('dialogue','T1 对白',c=>esc(c.shot.dialogue||'无对白'))+'<div class="tl-playhead" id="tl-playhead"></div>';
  document.getElementById('tl-total').textContent=clips.length+' 镜 · '+TimelineModel.timecode(total)+' · 按分镜顺序';
  document.getElementById('tl-scrub').max=total||1;tlClock();
}
function tlClock(){const total=tlClips().at(-1)?.end||0;document.getElementById('tl-time').textContent=TimelineModel.timecode(TL.time)+' / '+TimelineModel.timecode(total);document.getElementById('tl-scrub').value=TL.time;const line=document.getElementById('tl-playhead');if(line)line.style.left=(92+TL.time*TL.zoom)+'px'}
function tlMedia(shot){const versions=TimelineModel.versions(D,shot);return versions.find(g=>g.id===TL.version)||versions.find(g=>g.status==='MASTER')||versions[0]}
function tlPreview(){
  const clip=tlCurrent(),shot=clip?.shot,version=shot&&tlMedia(shot),src=version?.videoUrl||shot?.videoUrl||'',key=shot?.id+'|'+src+'|'+(shot?.firstFrameUrl||'');
  TL.source=src;if(TL.previewKey===key)return;TL.previewKey=key;
  const screen=document.getElementById('tl-screen');screen.replaceChildren();
  if(src){const video=document.createElement('video');video.id='tl-video';video.controls=true;video.preload='metadata';video.src=src;video.onloadedmetadata=()=>{video.currentTime=Math.min(Math.max(0,TL.time-clip.start),Math.max(0,video.duration-0.05))};video.ontimeupdate=()=>{TL.time=Math.min(clip.end,clip.start+video.currentTime);tlClock();if(video.currentTime>=clip.duration&&!video.paused){video.pause();tlNextPreview()}};video.onended=tlNextPreview;video.onerror=()=>tlMessage('该版本视频暂时无法读取，请检查渲染器连接或在生成面板同步结果。');screen.append(video)}
  else if(shot?.firstFrameUrl){const image=document.createElement('img');image.src=shot.firstFrameUrl;image.alt='本镜首帧参考（尚非生成视频）';screen.append(image)}
  else{const p=document.createElement('div');p.className='tl-placeholder';const strong=document.createElement('strong');strong.textContent=shot?'此镜暂无可预览视频':'从故事开始你的时间线';p.append(strong,document.createTextNode(shot?'可以先检查分镜并加入生成队列。生成完成后，在这里预览、审片和调整声音。':'在“分镜与检查”中选择剧本并生成分镜。'));screen.append(p)}
  document.getElementById('tl-preview-label').textContent=version?(version.version||'视频版本')+' · '+version.status:src?'镜头视频':shot?.firstFrameUrl?'首帧参考 · 非视频':'等待素材';
}
function tlSeek(time){const c=TimelineModel.at(tlClips(),time);if(!c)return;if(c.shot.id!==TL.shotId){if(!tlCanLeave())return;tlSelect(c.shot.id,false)}TL.time=time;const video=document.getElementById('tl-video');if(video&&video.readyState)video.currentTime=Math.min(Math.max(0,time-c.start),Math.max(0,video.duration-0.05));tlClock()}
function tlPlay(){const video=document.getElementById('tl-video');if(!video)return tlMessage('本镜尚无视频，先生成素材后再播放。');if(video.paused)video.play().catch(()=>tlMessage('视频无法播放，请检查素材与渲染器连接。'));else video.pause()}
function tlStep(delta){const clips=tlClips(),index=clips.findIndex(c=>c.shot.id===TL.shotId);if(clips[index+delta])tlSelect(clips[index+delta].shot.id)}
function tlNextPreview(){const clips=tlClips(),index=clips.findIndex(c=>c.shot.id===TL.shotId),next=clips[index+1];if(!next)return;if(!tlCanLeave())return;tlSelect(next.shot.id);const video=document.getElementById('tl-video');if(video)video.play().catch(()=>{});else tlMessage('播放停在缺少视频的镜头。时间线预览不会自动跳过缺镜；声音替换与字幕以合成成片为准。')}
function tlInspector(){
  const host=document.getElementById('tl-inspector'),clip=tlCurrent();if(!host)return;
  document.querySelectorAll('.tl-tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===TL.mode));
  if(!clip){host.innerHTML='<p class="muted">请选择或创建一个镜头。</p>';return}
  const s=clip.shot,versions=TimelineModel.versions(D,s),version=tlMedia(s),jobs=D.jobs.filter(j=>j.projectId===s.projectId&&j.shot===s.id).slice().reverse().map(j=>{const remote=tlRemoteJobs.get(j.id);return remote?{...j,status:remote.connectorStatus||j.status,progress:remote.progress||j.progress}:j});
  let body=`<p class="tl-panel-title">${esc(s.id)}</p><h3>${esc(s.scene||'镜头')}</h3><p class="muted">${s.dur} 秒 · ${esc(s.status||'待制作')}</p>`;
  if(TL.mode==='shots')body+=`<p>${esc(s.script||s.desc||'暂无动作描述')}</p><hr><p class="muted">${esc(s.camera||'待设置机位')}</p><p>${esc(s.dialogue||'本镜无口头对白')}</p><button class="btn gold" onclick="tlEditSelected()">编辑本镜分镜与资产</button><button class="btn" onclick="tlTools('shots')">整批分镜 / 生成前检查</button>`;
  if(TL.mode==='gen')body+=`<button class="btn gold" onclick="tlAction('queue')">本镜加入队列</button><p class="muted">入队后点击提交才开始生成。</p>${jobs.map(j=>`<div class="card"><b>${esc(j.version||'任务')}</b><p>${esc(j.status)}</p>${j.progress?.percent!==undefined?`<progress max="100" value="${Number(j.progress.percent)||0}"></progress>`:''}<button class="btn" data-job="${esc(j.id)}" onclick="tlAction('dispatch',this.dataset.job)">提交</button><button class="btn" data-job="${esc(j.id)}" onclick="tlAction('sync',this.dataset.job)">同步结果</button></div>`).join('')||'<p class="muted">本镜尚无生成任务。</p>'}<button class="btn" onclick="tlTools('gen')">查看整批队列</button>`;
  if(TL.mode==='review')body+=`<label>预览版本<select aria-label="本镜视频版本" onchange="TL.version=this.value;TL.previewKey=null;tlPreview();tlInspector()">${versions.map(g=>`<option value="${esc(g.id)}" ${g.id===version?.id?'selected':''}>${esc(g.version||'视频')} · ${esc(g.status)}</option>`).join('')||'<option>暂无视频版本</option>'}</select></label><p class="muted">核对人物、动作、口型与原句后，再批准此版本。</p><p>${esc(s.dialogue||'本镜无口头对白')}</p>${version?`<button class="btn gold" data-version="${esc(version.id)}" onclick="tlAction('approve',this.dataset.version)">采用此版本</button><button class="btn" data-version="${esc(version.id)}" onclick="tlAction('redo',this.dataset.version)">标记需重做</button>`:''}<button class="btn" onclick="tlTools('review')">全部版本与审片记录</button>`;
  if(TL.mode==='audio')body+=`<p class="muted">预览播放生成视频原声；下列声音设置在自动成片时应用。</p><label>本镜声音<select id="tl-audio-mode" onchange="TL.dirty=true"><option value="model">保留生成原声</option><option value="mute" ${s.audioMode==='mute'?'selected':''}>整镜静音</option><option value="replacement" ${s.audioMode==='replacement'?'selected':''}>替换为独立环境音</option></select></label><label>环境音文件<input type="file" accept=".wav,.mp3" onchange="TL.dirty=true;importShotAmbience(this,'tl-audio-file')"></label><input id="tl-audio-file" type="hidden" value="${esc(s.audioAsset||'')}"><p id="tl-audio-file_status" class="muted">${s.audioAsset?'已有环境音素材':'WAV / MP3，20MB 以内'}</p><button class="btn gold" onclick="tlSaveAudio()">保存本镜声音</button><button class="btn" onclick="TL.dirty=false;tlMessage('已撤销未保存的声音设置。');tlInspector()">撤销未保存设置</button><p class="muted">有口头对白时禁止静音或覆盖；保存后将标记本镜及承接镜头需重做，旧视频保留。</p><button class="btn" onclick="tlTools('audio')">项目声音任务</button>`;
  host.innerHTML=body;
}
async function tlAction(action,id){if(TL.busy||!tlCanLeave())return;const s=tlCurrent()?.shot;if(!s)return;TL.busy=true;try{
  if(action==='queue'){await queueById(s.id);tlMessage(shotHasActiveJob(s)?'本镜已有队列任务，可在生成面板提交或同步。':'请查看分镜页的具体检查提示。')}
  if(action==='dispatch'){await checkRendererReady();await dispatchJob(id)}
  if(action==='sync')await syncComfyJob(id);
  if(action==='approve')await approveMaster(id);
  if(action==='redo')await redoGeneration(id);
}catch(e){tlMessage(e.message)}finally{TL.busy=false;tlRender()}}
function tlSaveAudio(){const s=tlCurrent()?.shot;if(!s)return;try{
  const next={...s,audioMode:document.getElementById('tl-audio-mode').value,audioAsset:document.getElementById('tl-audio-file').value};ShotAudio.validate(next.audioMode,shotDialogueEvents(next),next.audioAsset);
  const stored=JSON.parse(localStorage.getItem('aimovie_data')||'null'),source=stored?.shots?.find(x=>x.id===s.id&&x.projectId===s.projectId);
  if(!source||stored.activeProjectId!==D.activeProjectId||JSON.stringify(source)!==JSON.stringify(s))throw Error('项目或镜头已在其他页面变化，请保留设置并重新载入后再保存。');
  const result=FilmSourceSync.replaceWithDependents(stored.shots,source,next);localStorage.setItem('aimovie_data',JSON.stringify({...stored,shots:result.shots}));Object.assign(D,stored,{shots:result.shots});TL.dirty=false;tlMessage('声音设置已保存，'+(result.dependentIds.length+1)+' 镜已标记需重做，旧视频保留。');tlRender();
}catch(e){tlMessage(e.message)}}
function tlEditSelected(){if(!tlCanLeave())return;tlTools('shots');editShot(TL.shotId);document.querySelector('#board_scene')?.scrollIntoView({block:'center'})}
function tlTools(mode){
  if(!tlCanLeave())return;tlMount();TL.drawer=true;TL.mode=mode;
  document.getElementById('tl-drawer').hidden=false;document.getElementById('tl-tool-title').textContent=({shots:'分镜编辑与制作检查',gen:'生成队列',review:'审片版本',audio:'声音任务',edit:'样片与自动成片'})[mode];
  for(const id of tlPages){const el=document.getElementById(id);document.getElementById('tl-legacy').append(el);el.classList.toggle('on',id===mode)}
  if(mode==='edit'){const id=tlCurrent()?.shot.storyboardBatchId;if(id&&activeProject().filmBatchId!==id){activeProject().filmBatchId=id;}renderEdit()}
  tlInspector();document.getElementById('tl-drawer').scrollIntoView({behavior:'smooth',block:'start'});
}
function tlCloseTools(){if(editingShotId){tlMessage('请先保存或取消分镜编辑，再收起工具。');return}TL.drawer=false;if(TL.mode==='edit')TL.mode='shots';document.getElementById('tl-drawer').hidden=true;tlPages.forEach(id=>document.getElementById(id).classList.remove('on'));tlRender()}
const tlOriginalGo=go;
go=function(id){
  if(document.getElementById('timeline')?.classList.contains('on')&&!tlCanLeave())return;
  const integrated=id==='timeline'||tlPages.includes(id);
  if(!integrated){document.getElementById('tl-video')?.pause();document.body.classList.remove('timeline-open');return tlOriginalGo(id)}
  tlMount();if(tlPages.includes(id))TL.mode=id;
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('on'));document.getElementById('timeline').classList.add('on');document.body.classList.add('timeline-open');renderAll();tlRender();
  if(id==='edit')tlTools('edit');else if(TL.drawer)tlTools(TL.mode);
};
const tlOriginalRenderAll=renderAll;
renderAll=function(){tlOriginalRenderAll();if(document.getElementById('timeline')?.classList.contains('on'))tlRender()};
window.addEventListener('beforeunload',event=>{if(TL.dirty||editingShotId){event.preventDefault();event.returnValue=''}});
// Keep the timeline batch and the embedded production controls in sync.
const tlSelectFilmBatch=selectFilmBatch;
selectFilmBatch=function(id){if(document.getElementById('timeline')?.classList.contains('on')){tlBatch(id);renderEdit()}else tlSelectFilmBatch(id)};
const tlStoryboardOption=setStoryboardOption;
setStoryboardOption=function(key,value){if(key==='storyboardBatchId'&&document.getElementById('timeline')?.classList.contains('on')){tlBatch(value);renderShots2()}else tlStoryboardOption(key,value)};
let tlPolling=false;
setInterval(async()=>{
  if(tlPolling||TL.mode!=='gen'||TL.dirty||TL.busy||!document.getElementById('timeline')?.classList.contains('on'))return;
  const shotId=TL.shotId,projectId=D.activeProjectId,jobs=D.jobs.filter(j=>j.projectId===projectId&&j.shot===shotId&&j.comfyPromptId&&!j.videoUrl&&j.status!=='已取消');if(!jobs.length)return;
  tlPolling=true;try{for(const j of jobs){const r=await fetch(D.connector.endpoint+'/jobs/'+encodeURIComponent(j.id)+'/status',{signal:AbortSignal.timeout(8000)});if(r.ok){const out=await r.json();tlRemoteJobs.set(j.id,out.job)}}if(TL.shotId===shotId&&D.activeProjectId===projectId&&TL.mode==='gen'&&!TL.dirty)tlInspector()}catch{if(TL.shotId===shotId)tlMessage('暂时无法读取生成进度，已有任务保留；可检查连接后同步。')}finally{tlPolling=false}
},5000);
