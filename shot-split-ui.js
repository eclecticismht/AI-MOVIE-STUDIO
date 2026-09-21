function dialogueActionSplitForm(shot){
 if(!shot.dialogue?.trim())return '';
 return `<details><summary>拆为先说话、后行动</summary><p>先保存当前编辑，再拆分已保存的镜头。原对白只留在第一段，第二段不说话并自动承接第一段尾帧。请把递钱等后续行动只写在第二段。每段至少 4 秒，总时长会重新计算；原镜头归档保留。</p><pre style="white-space:pre-wrap">${esc(shot.dialogue)}</pre>${['before','after'].map((phase,i)=>`<fieldset><legend>${i?'第二段：说完后的行动':'第一段：说话与无声倾听'}</legend><label>人物行动<textarea id="split_${phase}_action" placeholder="${i?'谁执行什么动作，道具从谁交给谁':'说话者、倾听者及说话期间的姿态，不包含后续行动'}"></textarea></label><label>画面设计<textarea id="split_${phase}_visual">${esc(shot.visual||shot.desc||'')}</textarea></label><label>秒数<input id="split_${phase}_duration" type="number" min="4" max="15" step="0.1" value="${i?4:Math.max(4,Number(shot.dur)||4)}" oninput="updateDialogueSplitDuration(${Number(shot.dur)||0})"></label></fieldset>`).join('')}<p id="split_duration_summary">原 ${Number(shot.dur)||0} 秒 → 两段合计 ${Math.max(4,Number(shot.dur)||4)+4} 秒</p>${shot.firstFrameUrl?'<label><input type="checkbox" id="split_keep_frame">我已检查原首帧仍适用于第一段，保留此首帧及发声位置</label><p>未勾选时，新镜头不沿用首帧；旧图保留在归档镜头中。</p>':''}<button class="btn gold" data-id="${esc(shot.id)}" onclick="splitDialogueAction(this.dataset.id)">保存两段并设置尾帧衔接</button><p data-dialogue-split-result role="status"></p></details>`;
}
function updateDialogueSplitDuration(oldDuration){const before=Number(document.getElementById('split_before_duration').value),after=Number(document.getElementById('split_after_duration').value);document.getElementById('split_duration_summary').textContent=`原 ${oldDuration} 秒 → 两段合计 ${Math.round((before+after)*10)/10} 秒`;}
function splitDialogueAction(id){
 const output=document.querySelector('[data-dialogue-split-result]');
 try{
  const source=D.shots.find(s=>s.id===id&&s.projectId===D.activeProjectId&&!s.autoArchived);if(!source)throw Error('原镜头不存在');
  const batchIds=new Set(D.shots.filter(s=>s.projectId===source.projectId&&s.storyboardBatchId===source.storyboardBatchId).map(s=>s.id));
  if((D.jobs||[]).some(j=>batchIds.has(j.shot)&&!j.videoUrl&&!/失败|取消/.test(j.status||'')))throw Error('此批次还有队列任务，请先处理任务再拆分');
  if(typeof filmRuns!=='undefined'&&filmRuns.some(r=>r.projectId===source.projectId&&['pending','rendering','assembling'].includes(r.status)))throw Error('此项目正在制作成片，请完成后再拆分');
  const options=Object.fromEntries(['before','after'].map(phase=>[phase,Object.fromEntries(['action','visual','duration'].map(k=>[k,k==='duration'?Number(document.getElementById(`split_${phase}_${k}`).value):document.getElementById(`split_${phase}_${k}`).value]))]));
  const {children}=DialogueActionSplit.split(source,options,(D.characters||[]).filter(c=>c.projectId===source.projectId),[uid('SH'),uid('SH')]);
  if(document.getElementById('split_keep_frame')?.checked){
   FrameProvenance.validate(source,shotReferenceAssets(source));
   Object.assign(children[0],{firstFrameUrl:source.firstFrameUrl,firstFrameSpeakerPosition:source.firstFrameSpeakerPosition,firstFrameIntent:source.firstFrameIntent});
   children[0].firstFrameProvenance=FrameProvenance.create(children[0],shotReferenceAssets(children[0]),source.firstFrameUrl);
  }
  const shots=DialogueActionSplit.replace(D.shots,source,children);
  localStorage.setItem('aimovie_data',JSON.stringify({...D,shots}));D.shots=shots;editingShotId=children[0].id;renderShots2();
 }catch(error){output.textContent=error.message}
}
function splitShotForm(shot,count=3){
  const scenes=(D.scenes||[]).filter(s=>s.projectId===shot.projectId);
  return dialogueActionSplitForm(shot)+`<details><summary>拆成独立镜头</summary><p class="muted">先保存当前编辑。填写每段实际场景、行动与画面；当前入口只处理无对白镜头，原镜头归档保留，不复制旧渲染结果。</p>${Array.from({length:count},(_,i)=>`<fieldset data-split-part><legend>第 ${i+1} 段</legend><label>场景<select data-part="sceneId"><option value="">请选择实际场景</option>${scenes.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label>人物行动<textarea data-part="action"></textarea></label><label>画面设计<textarea data-part="visual"></textarea></label><label>秒数<input data-part="duration" type="number" min="4" max="15" step="0.1" value="${Math.max(4,Number(shot.dur)/count)}"></label></fieldset>`).join('')}<button class="btn" data-id="${esc(shot.id)}" onclick="splitSavedShot(this.dataset.id)">保存拆分并保留原镜头</button><p data-split-result role="status"></p></details>`;
}
function splitSavedShot(id){
  const output=document.querySelector('[data-split-result]');
  try{
    const source=D.shots.find(s=>s.id===id&&s.projectId===D.activeProjectId&&!s.autoArchived);if(!source)throw Error('原镜头不存在');
    if(source.continueFromShotId||D.shots.some(s=>!s.autoArchived&&s.continueFromShotId===source.id))throw Error('此镜属于连续动作，请先解除前后镜的动作衔接再拆成独立镜头');
    if(source.dialogue?.trim())throw Error('请先按说话轮次拆分对白，避免复制或丢失台词');
    if(Object.values(source.assetStates||{}).some(s=>s.screenText))throw Error('请先分配屏幕文字，不能把同一消息复制到多个新镜头');
    if((D.jobs||[]).some(j=>j.shot===id&&!j.videoUrl&&!/失败|取消/.test(j.status||'')))throw Error('原镜头还有队列任务，请先处理该任务');
    const parts=[...document.querySelectorAll('[data-split-part]')].map(node=>Object.fromEntries(['sceneId','action','visual','duration'].map(k=>[k,node.querySelector('[data-part="'+k+'"]').value.trim()]))).filter(p=>p.sceneId||p.action||p.visual);
    if(parts.length<2)throw Error('请至少填写两段镜头，未使用的段落可以留空');
    const scenes=(D.scenes||[]).filter(s=>s.projectId===source.projectId);
    const children=parts.map(part=>{
      const scene=scenes.find(s=>s.id===part.sceneId),dur=Number(part.duration);
      if(!scene||!part.action||!part.visual||!Number.isFinite(dur)||dur<4||dur>15)throw Error('每段需选择场景、填写行动和画面，并设置 4–15 秒');
      const retained=new Set([...(source.characterIds||[]),...(source.propIds||[]),scene.id]);
      const copy={...source,id:uid('SH'),parentShotId:source.id,scene:scene.name,sceneIds:[scene.id],script:part.action,visual:part.visual,desc:part.visual,dur,status:'待制作',prompt:'',assetStates:Object.fromEntries(Object.entries(source.assetStates||{}).filter(([key])=>retained.has(key)))};
      for(const key of ['continueFromShotId','filmPrompt','filmPromptSource','filmPromptVersion','autoArchived','videoUrl','firstFrameUrl','firstFrameProvenance','firstFrameSpeakerPosition','firstFrameIntent','localFrameJobId','localFrameResult','localFrameSource','audioAsset'])delete copy[key];if(copy.audioMode==='replacement')copy.audioMode='model';return copy;
    });
    const nextShots=D.shots.flatMap(s=>s===source?[{...s,autoArchived:true},...children]:[s]);
    let sequence=0;const shots=nextShots.map(s=>s.projectId===source.projectId&&s.storyboardBatchId===source.storyboardBatchId&&!s.autoArchived?{...s,sequence:++sequence}:s);
    localStorage.setItem('aimovie_data',JSON.stringify({...D,shots}));D.shots=shots;editingShotId=null;renderShots2();
  }catch(error){output.textContent=error.message}
}
