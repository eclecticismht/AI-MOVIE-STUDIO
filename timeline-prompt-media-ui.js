const promptMediaBusy=new Set();
let promptMediaPurpose='reference';
const assetsBeforePromptMedia=shotReferenceAssets;
shotReferenceAssets=function(shot){return [...assetsBeforePromptMedia(shot),...TimelinePromptMedia.references(shot)]};
const requireBeforePromptMedia=requireShotReferenceImages;
requireShotReferenceImages=function(shot){TimelinePromptMedia.validate(shot,shot.promptMedia||[],assetsBeforePromptMedia(shot).length);return requireBeforePromptMedia(shot)};
const promptRenderBeforeMedia=timelinePromptRender;
timelinePromptRender=function(){promptRenderBeforeMedia();timelinePromptMediaRender()};
function timelinePromptMediaRender(){
 const panel=document.getElementById('timelinePromptPanel'),shot=tlCurrent()?.shot;if(!panel||!shot)return;
 let box=document.getElementById('timelinePromptMedia');const key=timelinePromptKey(shot);
 if(box&&box.dataset.key===key&&box.contains(document.activeElement))return;
 if(!box){box=document.createElement('section');box.id='timelinePromptMedia';panel.append(box)}box.dataset.key=key;
 const busy=promptMediaBusy.has(key),refs=shotReferenceAssets(shot);let imageIndex=refs.filter(r=>r.kind!=='videos').length-(shot.promptMedia||[]).filter(m=>m.type==='image').length,videoIndex=0;
 box.innerHTML=`<div class="timeline-prompt-heading"><b>照片 / 视频素材</b><div><label class="btn">上传照片<input type="file" aria-label="上传参考照片" accept="image/png,image/jpeg,image/webp" ${busy?'disabled':''} hidden></label><label class="btn">上传视频<input type="file" aria-label="上传参考视频" accept="video/mp4,video/webm,video/quicktime" ${busy?'disabled':''} hidden></label></div></div><p class="muted">照片：PNG / JPEG / WebP，5 MB 以内。视频：MP4 / WebM / MOV，50 MB 以内；生成参考限 15 秒，剪辑素材最长 60 分钟。参考视频不复制原音轨，剪辑视频保留原声。照片可用于生成参考或首帧，视频支持全部三种用途。</p><div class="prompt-media-grid">${(shot.promptMedia||[]).map(m=>`<article><b>${esc(m.type==='video'?'<Video '+(++videoIndex)+'>':'<Picture '+(++imageIndex)+'>')} · ${esc(m.name)}</b>${m.type==='video'?`<video controls preload="metadata" src="${esc(m.url)}"></video>`:`<img alt="${esc(m.name)}" src="${esc(m.url)}">`}<label>参考用途<textarea data-media="${esc(m.id)}" rows="2" maxlength="2000" ${busy?'disabled':''} placeholder="例如：参考骑车动作；人物外貌仍按角色图片">${esc(m.note)}</textarea></label><button class="btn" data-remove="${esc(m.id)}" ${busy?'disabled':''}>移除</button></article>`).join('')}</div><p id="timelinePromptMediaStatus" role="status">${busy?'正在导入参考素材…':'上传后按所选用途保存到当前镜头。'}</p>`;
 box.querySelectorAll('input[type=file]').forEach(input=>input.onchange=()=>timelinePromptMediaUpload(input,shot));
 const controls=document.createElement('label');controls.className='prompt-media-purpose';controls.innerHTML='上传用途 <select aria-label="上传素材用途"><option value="reference">生成参考 · 人物 / 动作 / 画面</option><option value="clip">直接加入剪辑 · 视频素材</option><option value="frame">作为生成首帧 · 照片 / 视频选帧</option></select>';box.prepend(controls);controls.querySelector('select').value=promptMediaPurpose;controls.querySelector('select').onchange=e=>{promptMediaPurpose=e.target.value};
 if(shot.firstFrameUrl){const frame=document.createElement('div');frame.className='prompt-frame-summary';frame.innerHTML=`<img src="${esc(shot.firstFrameUrl)}" alt="当前生成首帧" style="max-height:120px;max-width:200px"><label>画内发声者位置<select aria-label="首帧发声者位置"><option value="">无对白 / 待指定</option><option value="left">左侧</option><option value="center">中间</option><option value="right">右侧</option></select></label><button class="btn">移除首帧</button>`;box.append(frame);frame.querySelector('select').value=shot.firstFrameSpeakerPosition||'';frame.querySelector('select').onchange=e=>{try{timelineSaveFrame(shot,shot.firstFrameUrl,e.target.value);timelinePromptMediaRender()}catch(err){tlMessage(err.message)}};frame.querySelector('button').onclick=()=>{try{timelineSaveFrame(shot,'','');timelinePromptMediaRender()}catch(err){tlMessage(err.message)}};}
 box.querySelectorAll('textarea[data-media]').forEach(input=>input.onchange=()=>timelinePromptMediaEdit(shot,shot.promptMedia.map(m=>m.id===input.dataset.media?{...m,note:input.value}:m)));
 box.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>timelinePromptMediaEdit(shot,shot.promptMedia.filter(m=>m.id!==button.dataset.remove)));
}
function timelinePromptMediaSave(shot,media){
 if(editingShotId)throw Error('请先保存或关闭展开的分镜编辑');
 TimelinePromptMedia.validate(shot,media,assetsBeforePromptMedia(shot).length);
 const stored=JSON.parse(localStorage.getItem('aimovie_data')),current=stored.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId);
 if(!current||JSON.stringify(current)!==JSON.stringify(shot))throw Error('镜头已在其他位置修改，请刷新后重试');
 const updated=FilmSourceSync.replaceWithDependents(stored.shots,current,{...current,promptMedia:media});stored.shots=updated.shots;
 localStorage.setItem('aimovie_data',JSON.stringify(stored));D.shots=stored.shots;
 const draft=timelinePromptDrafts.get(timelinePromptKey(shot));if(draft)draft.expected=JSON.stringify(updated.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId));
}
function timelinePromptMediaEdit(shot,media){try{timelinePromptMediaSave(shot,media);document.activeElement?.blur();timelinePromptMediaRender();tlMessage('参考素材已保存，将用于下次生成；旧视频保留。')}catch(e){document.getElementById('timelinePromptMediaStatus').textContent=e.message}}
async function timelinePromptMediaUpload(input,shot){
 const file=input.files?.[0],key=timelinePromptKey(shot);if(!file||promptMediaBusy.has(key))return;
 promptMediaBusy.add(key);
 try{
  const type=file.type.startsWith('video/')?'video':'image';
  if(!(type==='video'?['video/mp4','video/webm','video/quicktime']:['image/png','image/jpeg','image/webp']).includes(file.type)||file.size>(type==='video'?50:5)*1024*1024)throw Error('文件格式或大小不符合要求');
  const purpose=promptMediaPurpose;
  if(purpose==='clip'&&type!=='video')throw Error('直接加入剪辑需要上传视频；照片可选择生成参考或首帧');
  if(purpose!=='clip'&&(shot.continueFromShotId||['black','screen'].includes(shot.renderMode)||purpose==='reference'&&shot.firstFrameUrl||purpose==='frame'&&shot.promptMedia?.length))throw Error('首帧、生成参考、段间引导分别使用，请先移除当前冲突设置');
  timelinePromptMediaRender();
  const response=await fetch(type==='video'?'/api/prompt-video':'/api/asset-media',{method:'POST',headers:{'Content-Type':file.type,...(type==='video'&&purpose!=='reference'?{'X-Media-Purpose':'source'}:{})},body:file,signal:AbortSignal.timeout(100000)}),out=await response.json();if(!response.ok)throw Error(out.error||'上传失败');
  if(purpose==='clip'){await timelineImportClip(shot,out.url,file.name);return;}
  if(purpose==='frame'){if(type==='video')timelineChooseFrame(shot,out.url);else timelineSaveFrame(shot,out.url,'');return;}
  timelinePromptMediaSave(shot,[...(shot.promptMedia||[]),{id:uid('REF'),type,name:file.name.slice(0,150),url:out.url,...(out.file?{file:out.file}:{}),note:''}]);
  tlMessage('参考素材已保存，生成时会发送到 H3；请填写参考用途。');
 }catch(e){tlMessage('参考素材未添加：'+e.message)}finally{promptMediaBusy.delete(key);input.value='';document.activeElement?.blur();timelinePromptMediaRender()}
}
function timelineMediaCurrent(shot){
 if(editingShotId)throw Error('请先结束展开的分镜编辑');
 const data=JSON.parse(localStorage.getItem('aimovie_data')),current=data.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId&&!s.autoArchived);
 if(!current||JSON.stringify(current)!==JSON.stringify(shot))throw Error('镜头已修改或删除，请重新选择后上传');return {data,current};
}
function timelineSaveFrame(shot,url,position){
 const {data,current}=timelineMediaCurrent(shot);
 if(url&&(shot.promptMedia?.length||shot.continueFromShotId||['black','screen'].includes(shot.renderMode)))throw Error('请先移除生成参考、段间引导或本地合成设置');
 const next={...current,firstFrameUrl:url,firstFrameSpeakerPosition:position};delete next.firstFrameProvenance;
 data.shots=FilmSourceSync.replaceWithDependents(data.shots,current,next).shots;localStorage.setItem('aimovie_data',JSON.stringify(data));D.shots=data.shots;
 const draft=timelinePromptDrafts.get(timelinePromptKey(shot));if(draft)draft.expected=JSON.stringify(data.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId));
 document.activeElement?.blur();const panel=document.getElementById('timelinePromptMedia');if(panel)panel.dataset.key='';
 tlMessage(url?'首帧已保存；有画内对白时请选择发声者位置。':'首帧已移除。');
}
async function timelineImportClip(shot,url,name){
 const duration=await cutProbeDuration(url);if(!Number.isFinite(duration)||duration<.1||duration>3600)throw Error('剪辑素材长度需在 0.1 秒至 60 分钟之间');
 const initial=timelineMediaCurrent(shot),sourceFingerprint=await FilmSourceSync.fingerprint(initial.current,initial.data),{data,current}=timelineMediaCurrent(shot);
 if(await FilmSourceSync.fingerprint(current,data)!==sourceFingerprint)throw Error('引用资产已改变，请重新上传');
 const p=data.projects.find(p=>p.id===shot.projectId),batch=shot.storyboardBatchId||'',edit=structuredClone(p.timelineEdits?.[batch]||{order:[],clips:{},mix:{}}),id=uid('GEN');
 edit.clips||={};edit.clips[shot.id]={sourceDuration:duration,trimIn:0,trimOut:duration,gain:1,transition:'cut',transitionDuration:0,versionId:id};
 const list=TimelineEdit.build(data.shots.filter(s=>s.projectId===shot.projectId&&s.storyboardBatchId===batch),{...edit,clips:{...edit.clips,...Object.fromEntries(Object.keys(edit.clips).map(k=>[k,{...edit.clips[k],transition:'cut',transitionDuration:0}]))}}),index=list.findIndex(c=>c.shot.id===shot.id);
 if(index>0){const previous=list[index-1].shot.id;edit.clips[previous]={...edit.clips[previous],transition:'cut',transitionDuration:0};}
 TimelineEdit.build(data.shots.filter(s=>s.projectId===shot.projectId&&s.storyboardBatchId===batch),edit);
 data.generations||=[];data.generations.push({id,projectId:shot.projectId,shot:shot.id,videoUrl:url,version:'导入 · '+name.slice(0,100),status:'待审核',sourceFingerprint,createdAt:new Date().toISOString(),imported:true});
 p.timelineEdits={...p.timelineEdits,[batch]:edit};localStorage.setItem('aimovie_data',JSON.stringify(data));D.generations=data.generations;D.projects.find(x=>x.id===p.id).timelineEdits=p.timelineEdits;
 if(D.activeProjectId===shot.projectId){cutClear();TL.version=id;tlRender();}tlMessage('视频已加入当前镜头并选为剪辑素材，保留原视频版本；可预览后采用。');
}
function timelineChooseFrame(shot,url){
 document.getElementById('timelineFramePicker')?.remove();const dialog=document.createElement('dialog');dialog.id='timelineFramePicker';
 dialog.innerHTML='<h2>从视频选取生成首帧</h2><p>播放或拖动进度条，停在需要的画面后点击“使用此帧”。</p><video controls preload="auto" style="width:100%;max-height:50vh"></video><p role="status"></p><button class="btn" data-cancel>取消</button><button class="btn gold" data-use>使用此帧</button>';
 document.body.append(dialog);const video=dialog.querySelector('video'),status=dialog.querySelector('[role=status]'),button=dialog.querySelector('[data-use]');video.src=url;
 let busy=false;dialog.oncancel=e=>{if(busy)e.preventDefault()};dialog.onclose=()=>{video.pause();video.removeAttribute('src');video.load();dialog.remove()};dialog.querySelector('[data-cancel]').onclick=()=>{if(!busy)dialog.close()};
 button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;try{
  if(video.readyState<2||video.seeking)throw Error('请等画面加载完成后再选取');video.pause();
  const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('此画面无法读取');
  status.textContent='正在保存所选画面…';const r=await fetch('/api/asset-media',{method:'POST',headers:{'Content-Type':'image/png'},body:blob,signal:AbortSignal.timeout(30000)}),out=await r.json();if(!r.ok)throw Error(out.error);timelineSaveFrame(shot,out.url,'');dialog.close();timelinePromptMediaRender();
 }catch(e){status.textContent=e.message}finally{busy=false;button.disabled=false}};
 dialog.showModal();
}
