// Generation saves a candidate; applying it is explicit, and never overwrites another editor.
const localFramePolls=new Map();
function localFramePrompt(shot){return `Scene and composition: ${shot.visual||shot.desc||''}\nCamera: ${shot.camera||''}\nOpening-frame state: ${shot.firstFrameIntent||'The people are at rest, before speaking or reaching out. Relaxed hands, no gestures. Do not invent an exchange, a payment, or an object being offered. Preserve only objects explicitly requested in the visual composition. The upcoming story actions will be generated separately as video.'}`}
function localFrameSize(shot){const p=D.projects.find(p=>p.id===shot.projectId),w=p?.h3Width||864,h=p?.h3Height||480,minimum=Math.max(256/w,256/h),maximum=Math.min(1536/Math.max(w,h),Math.sqrt(1048576/(w*h)));if(minimum>maximum)throw Error('当前画面比例不适合本地首帧模型，请调整画面尺寸。');const scale=Math.max(minimum,Math.min(1,maximum));return {width:Math.round(w*scale/16)*16,height:Math.round(h*scale/16)*16}}
function localFrameSnapshot(shot){return JSON.stringify({prompt:localFramePrompt(shot),videoAction:shot.script||'',size:localFrameSize(shot),assets:shotReferenceAssets(shot)})}
function showLocalFrameJob(shot,job){
 const panel=document.getElementById('localFrameStatus');if(!panel||panel.dataset.shot!==shot.id||panel.dataset.project!==shot.projectId)return;
 const stage={queued:'等待本地生成',running:'本地生成中',completed:'生成完成，请检查人物、服装和场景',failed:'生成失败'}[job.status]||job.status;
 panel.innerHTML=`<p>${esc(stage)} · 已完成 ${job.completedPasses||0}/${job.totalPasses} 轮资产处理${job.error?'：'+esc(job.error):''}</p>${job.imageUrl?`<img src="${esc(job.imageUrl)}" alt="本地生成的候选首帧" style="max-width:480px;max-height:300px"><p><button class="btn gold" type="button" onclick="applyLocalFirstFrame()">采用这张首帧</button></p>`:'<p class="muted">按实际完成轮数显示；首次加载模型可能较慢，剩余时间暂无法可靠估计。</p>'}${job.status==='completed'&&job.outputs?.length>1?`<details><summary>比较各轮候选（早期候选可能尚未处理全部资产）</summary>${job.outputs.map((url,i)=>`<div><img src="${esc(url)}" alt="第 ${i+1} 轮候选" style="max-width:360px"><button class="btn" data-url="${esc(url)}" onclick="applyLocalFirstFrame(this.dataset.url)">采用第 ${i+1} 轮候选</button></div>`).join('')}</details>`:''}`;
}
async function pollLocalFirstFrame(projectId,shotId,id){
 if(localFramePolls.has(id))return;localFramePolls.set(id,true);
 try{for(;;){const response=await fetch('/api/first-frames/'+encodeURIComponent(id));const job=await response.json();if(!response.ok)throw Error(job.error);const shot=D.shots.find(s=>s.id===shotId&&s.projectId===projectId);if(!shot||shot.localFrameJobId!==id)return;showLocalFrameJob(shot,job);
 if(['completed','failed'].includes(job.status)){shot.localFrameResult={id:job.id,status:job.status,imageUrl:job.imageUrl,outputs:job.outputs||[],error:job.error,completedPasses:job.completedPasses,totalPasses:job.totalPasses};localStorage.setItem('aimovie_data',JSON.stringify(D));return;}await new Promise(r=>setTimeout(r,3000));}}
 catch(e){const panel=document.getElementById('localFrameStatus');if(panel?.dataset.shot===shotId&&panel.dataset.project===projectId)panel.textContent='状态读取失败：'+e.message+'。重新打开此镜头可继续查看。';}
 finally{localFramePolls.delete(id)}
}
async function generateLocalFirstFrame(){
 const projectId=D.activeProjectId,id=editingShotId;
 if(!saveStoryboardShot(id))return;
 editingShotId=id;renderShots2();const shot=D.shots.find(s=>s.id===id&&s.projectId===projectId),panel=document.getElementById('localFrameStatus');
 try{if(shot.continueFromShotId)throw Error('承接镜头使用前镜尾帧，无需单独生成首帧。');if(shot.renderMode==='black')throw Error('纯黑镜头无需生成首帧。');panel.textContent='正在准备本镜资产…';
 const assets=shotReferenceAssets(shot);if(assets.some(a=>!a.imageUrl))throw Error('请先补齐本镜所有资产图片。');
 const snapshot=localFrameSnapshot(shot),references=await uploadShotImages(assets);
 const response=await fetch('/api/first-frames',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,shotId:id,references,prompt:localFramePrompt(shot),...localFrameSize(shot)})});const job=await response.json();if(!response.ok)throw Error(job.error);
 const current=D.shots.find(s=>s.id===id&&s.projectId===projectId);if(!current)return;current.localFrameJobId=job.id;current.localFrameSource=snapshot;current.localFrameResult=null;localStorage.setItem('aimovie_data',JSON.stringify(D));showLocalFrameJob(current,job);pollLocalFirstFrame(projectId,id,job.id);
 }catch(e){panel.textContent=e.message}
}
function applyLocalFirstFrame(candidateUrl){
 const shot=D.shots.find(s=>s.id===editingShotId&&s.projectId===D.activeProjectId),result=shot?.localFrameResult;
 if(!result?.imageUrl)return;
 const selectedUrl=candidateUrl||result.imageUrl;if(![result.imageUrl,...(result.outputs||[])].includes(selectedUrl))return alert('候选图不属于本次生成');
 try{const current={...shot,firstFrameIntent:document.getElementById('board_firstFrameIntent').value.trim(),visual:document.getElementById('board_visual').value.trim(),script:document.getElementById('board_script').value.trim(),camera:document.getElementById('board_camera').value.trim(),characterIds:selectedCharacterIds('shot_'+shot.id),sceneIds:selectedSceneIds('shot_'+shot.id),propIds:selectedPropIds('shot_'+shot.id)};if(typeof readAssetStateEditor==='function')current.assetStates=readAssetStateEditor(current);if(shot.localFrameSource!==localFrameSnapshot(current))throw Error('分镜或资产已经修改，请按最新内容重新生成首帧。');}catch(e){return alert(e.message)}
 document.getElementById('board_firstFrameUrl').value=selectedUrl;document.getElementById('board_firstFramePreview').src=selectedUrl;
 document.getElementById('board_firstFrameProvenance').value=JSON.stringify(FrameProvenance.create(shot,shotReferenceAssets(shot),selectedUrl));
 document.getElementById('board_firstFrameSpeakerPosition').value='';
 document.getElementById('localFrameStatus').insertAdjacentHTML('beforeend','<p>已填入首帧。若有画内对白，请按新画面指定发声者位置，再保存分镜。</p>');
}
const renderBeforeLocalFrames=renderShots2;
renderShots2=function(){renderBeforeLocalFrames();const shot=D.shots.find(s=>s.id===editingShotId&&s.projectId===D.activeProjectId),field=document.getElementById('board_firstFrameUrl');if(!shot||!field)return;
 field.insertAdjacentHTML('afterend',`<input type="hidden" id="board_firstFrameProvenance" value="${esc(JSON.stringify(shot.firstFrameProvenance||null))}">`);
 field.addEventListener('input',()=>{document.getElementById('board_firstFrameSpeakerPosition').value='';document.getElementById('board_firstFrameProvenance').value='null';});
 field.closest('label').insertAdjacentHTML('beforebegin',`<div><label>首帧起始状态（可选）<textarea id="board_firstFrameIntent" placeholder="默认画动作发生前。需调整时描述人物位置、姿势和物品归属，后续动作仍由视频呈现。">${esc(shot.firstFrameIntent||'')}</textarea></label><button class="btn" type="button" onclick="generateLocalFirstFrame()">保存分镜并用本镜资产生成首帧（本地）</button><p class="muted">使用本镜角色、场景、道具图片生成候选画面。多资产分轮处理，需检查后采用；已有首帧保留。</p><div id="localFrameStatus" data-shot="${esc(shot.id)}" data-project="${esc(shot.projectId)}"></div></div>`);
 if(shot.localFrameResult)showLocalFrameJob(shot,shot.localFrameResult);else if(shot.localFrameJobId)pollLocalFirstFrame(shot.projectId,shot.id,shot.localFrameJobId);
};
