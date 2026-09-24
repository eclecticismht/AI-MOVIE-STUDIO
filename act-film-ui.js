const AF={acts:[],key:'',registered:'',busy:false,selected:null,version:null,drafts:new Map(),error:''};
function actFilmContext(){const p=activeProject(),batch=p.storyboardBatchId||(D.storyboardBatches||[]).filter(b=>b.projectId===p.id).at(-1)?.id;return {projectId:p.id,scopeKey:batch||'',acts:ActFilm.groups(D,batch)}}
async function registerActFilms(){const context=actFilmContext();if(!context.scopeKey)return;const r=await fetch('/api/act-films',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(context)}),out=await r.json();if(!r.ok)throw Error(out.error||'场次自动合成注册失败，请重试');AF.registered=JSON.stringify(context)}
async function syncActFilms(){
 const context=actFilmContext();if(!context.scopeKey)return;
 const key=context.projectId+'|'+context.scopeKey,signature=JSON.stringify(context);
 if(AF.busy)return;
 AF.busy=true;
 try{
  const saved=JSON.parse(localStorage.getItem('aimovie_data')||'null');
  if(saved&&JSON.stringify(saved.projects.find(p=>p.id===context.projectId)?.storyActs)!==JSON.stringify(activeProject().storyActs))throw Error('场次已在其他页面修改，请刷新后查看');
  const response=await fetch(AF.registered===signature?'/api/act-films?'+new URLSearchParams({projectId:context.projectId,scopeKey:context.scopeKey}):'/api/act-films',AF.registered===signature?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:signature});
  const out=await response.json();if(!response.ok)throw Error(out.error);
  if(key!==actFilmContext().projectId+'|'+actFilmContext().scopeKey)return;
  if(AF.key!==key){AF.selected=null;AF.version=null}AF.key=key;AF.acts=out.acts;AF.registered=signature;AF.error='';renderActFilms();
 }catch(e){AF.error=e.message;renderActFilms()}finally{AF.busy=false}
}
function actFilmCurrent(){const act=AF.acts.find(a=>a.id===AF.selected)||AF.acts[0];return {act,version:act?.versions.find(v=>v.id===AF.version)||act?.versions.at(-1)}}
function renderActFilms(){
 const page=document.getElementById('timeline');if(!page)return;
 let host=document.getElementById('actFilmPanel');if(!host){host=document.createElement('section');host.id='actFilmPanel';host.className='card act-film-panel';page.querySelector('.tl-head').after(host)}
 const {act,version}=actFilmCurrent(),context=actFilmContext(),key=context.projectId+'|'+context.scopeKey;
 if(AF.key&&AF.key!==key){host.innerHTML='<h2>本场成片</h2><p>正在读取场次…</p>';host.dataset.signature='';return}
 const signature=JSON.stringify([AF.acts,act?.id,version?.id,AF.error]);if(host.dataset.signature===signature)return;
 const oldShot=host.querySelector('#actFilmShot')?.value,oldVideo=host.querySelector('video'),position=oldVideo?.currentTime||0,playing=oldVideo&&!oldVideo.paused,oldUrl=oldVideo?.getAttribute('src');
 // Keep the viewed version stable when a replacement arrives mid-playback.
 if(playing&&oldUrl&&version?.url!==oldUrl){AF.version=act?.versions.find(v=>v.url===oldUrl)?.id;return}
 host.dataset.signature=signature;
 host.innerHTML=`<div class="act-film-head"><div><h2>本场成片</h2><p class="muted">镜头完成后自动合成；写下修改要求，重做后自动更新。</p></div>${AF.acts.length?`<label>场次<select id="actFilmSelect" aria-label="审片场次">${AF.acts.map(a=>`<option value="${esc(a.id)}" ${a.id===act.id?'selected':''}>${esc(a.plan.title)} · ${a.plan.shots.length} 镜</option>`).join('')}</select></label>`:''}</div>${AF.error?`<p class="warn">${esc(AF.error)}</p>`:''}${!act?'<p>本批次还没有场次镜头。生成镜头后，这里会自动出现本场成片。</p>':`<p role="status">${esc(act.message||'镜头完成后自动合成')} ${act.status==='waiting'&&version?'· 当前仍可观看上一版':''}</p>${act.status==='failed'?'<button class="btn" id="actFilmRetry">重新合成（不重新生成镜头）</button>':''}${version?`<video id="actFilmVideo" controls preload="metadata" src="${esc(version.url)}"></video><div class="act-film-actions"><label>成片版本<select id="actFilmVersion" aria-label="场次成片版本">${act.versions.map((v,i)=>`<option value="${esc(v.id)}" ${v.id===version.id?'selected':''}>第 ${i+1} 版 · ${v.approvedAt?'已通过':'待审片'}${i===act.versions.length-1?' · 最新':''}</option>`).join('')}</select></label><a class="btn" href="${esc(version.url)}" download="${esc(act.plan.title)}.mp4">下载本场成片</a><button class="btn gold" id="actFilmApprove" ${act.status!=='ready'||version!==act.versions.at(-1)||version.approvedAt?'disabled':''}>${version.approvedAt?'本场已通过':'本场通过'}</button></div>${version.warnings.length?`<details class="act-film-warnings"><summary>${version.warnings.length} 个声音提示，观看时顺便核对</summary>${version.warnings.map(w=>`<p>第 ${w.index} 镜：${esc(w.message)}</p>`).join('')}</details>`:''}<label>修改哪个镜头？<select id="actFilmShot" aria-label="需要修改的镜头">${version.shots.map((s,i)=>`<option value="${esc(s.shotId)}">第 ${i+1} 镜 · ${esc(s.label)}</option>`).join('')}</select></label><label>哪里需要修改？<textarea id="actFilmRequest" maxlength="10000" rows="3" placeholder="例如：第 4 镜的裤子不要白条，和餐馆镜头保持一致。">${esc(AF.drafts.get(act.id)||'')}</textarea></label><button class="btn gold" id="actFilmRedo">修改这一镜并更新成片</button><p class="muted">播放会自动定位当前镜头，也可以手动选择。其他镜头复用，旧版保留。</p>`:'<p class="muted">无需逐镜点击“通过”或手动导出，后台会在镜头齐全后自动合成本场。</p>'}`}`;
 host.querySelector('#actFilmSelect')?.addEventListener('change',e=>{AF.selected=e.target.value;AF.version=null;host.querySelector('video')?.pause();host.dataset.signature='';renderActFilms()});
 host.querySelector('#actFilmVersion')?.addEventListener('change',e=>{AF.version=e.target.value;host.querySelector('video')?.pause();host.dataset.signature='';renderActFilms()});
 host.querySelector('#actFilmRequest')?.addEventListener('input',e=>AF.drafts.set(act.id,e.target.value));
 const shotSelect=host.querySelector('#actFilmShot');if(shotSelect&&version?.shots.some(s=>s.shotId===oldShot))shotSelect.value=oldShot;
 const video=host.querySelector('video');if(video){video.ontimeupdate=()=>{if(!video.paused){const shot=ActFilm.at(version.shots,video.currentTime);if(shot)host.querySelector('#actFilmShot').value=shot.shotId}};if(oldUrl===version.url)video.onloadedmetadata=()=>{video.currentTime=position;if(playing)video.play().catch(()=>{})}}
 host.querySelector('#actFilmApprove')?.addEventListener('click',async()=>{try{const r=await fetch(`/api/act-films/${act.id}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionId:version.id})}),out=await r.json();if(!r.ok)throw Error(out.error);AF.acts=AF.acts.map(a=>a.id===act.id?out.act:a);renderActFilms()}catch(e){AF.error=e.message;renderActFilms()}});
 host.querySelector('#actFilmRetry')?.addEventListener('click',async()=>{await fetch(`/api/act-films/${act.id}/retry`,{method:'POST'});await syncActFilms()});
 host.querySelector('#actFilmRedo')?.addEventListener('click',()=>actFilmRedo(act,host));
}
function actFilmRedo(act,host){
 const instruction=host.querySelector('#actFilmRequest').value.trim(),shotId=host.querySelector('#actFilmShot').value;
 if(!instruction){host.querySelector('#actFilmRequest').focus();return}
 if(TL.busy||!tlCanLeave())return;
 const shot=D.shots.find(s=>s.id===shotId&&s.projectId===D.activeProjectId&&!s.autoArchived);if(!shot){AF.error='此镜头已删除，请刷新场次';renderActFilms();return}
 host.querySelector('video')?.pause();cutStop();
 if(shot.storyboardBatchId!==cutBatch())tlBatch(shot.storyboardBatchId);
 tlSelect(shotId);timelineOpenRedo();
 if(timelineRedoState?.shot.id===shotId){timelineRedoState.dialog.querySelector('textarea').value=instruction;void timelineSubmitRedo()}
}
function simplifyActWorkspace(){
 const page=document.getElementById('timeline');if(!page)return;
 let details=document.getElementById('actFilmAdvanced');if(!details){details=document.createElement('details');details.id='actFilmAdvanced';details.className='act-film-advanced';details.innerHTML='<summary>精细剪辑、逐镜审片与参数设置</summary>';page.append(details)}
 for(const selector of ['.tl-stage','.tl-timeline','#cut-toolbar','#timelinePromptPanel']){const element=page.querySelector(selector);if(element&&element.parentElement!==details)details.append(element)}
 if(editingShotId||TL.drawer)details.open=true;
}
const actFilmTimelineRender=tlRender;
tlRender=function(){actFilmTimelineRender();renderActFilms();simplifyActWorkspace();void syncActFilms()};
const actFilmTools=tlTools;
tlTools=function(mode){actFilmTools(mode);const details=document.getElementById('actFilmAdvanced');if(details)details.open=true};
const actFilmMasters=renderMasters;
renderMasters=function(){actFilmMasters();const page=document.getElementById('masters');if(!page)return;const node=document.createElement('div');node.className='card';node.innerHTML='<h2>按场次看成片</h2><p>镜头完成后自动合成，修改镜头后自动更新。</p><button class="btn gold" onclick="go(\'timeline\')">打开场次审片</button>';page.prepend(node)};
const actFilmOutline=storyFlowOutline;
storyFlowOutline=function(){return '<div class="card"><b>本场镜头完成后自动生成成片</b><p>无需逐镜通过或手动拼接，可直接看整场并描述修改要求。</p><button class="btn" onclick="go(\'timeline\')">查看场次成片 / 修改</button></div>'+actFilmOutline()};
const actFilmDispatch=dispatchJob;
dispatchJob=async function(id){await registerActFilms();return actFilmDispatch(id)};
setInterval(()=>{if(!TL.busy&&!editingShotId)void syncActFilms()},5000);
