const referenceUploads=new Map();
function shotDialogueEvents(shot){
  if(shot.actionReviewRequired)throw Error('此镜按对白轮次拆分后，动作仍待核对；请编辑人物行动和画面设计，只保留本镜说话人的表演。');
  if(shot.renderMode==='black'&&(shot.dialogue?.trim()||Object.values(shot.assetStates||{}).some(s=>s.screenText)))throw Error('纯黑静音镜头请清空对白和屏幕文字');
  const characters=(D.characters||[]).filter(c=>c.projectId===shot.projectId);
  const events=DialogueContract.parseDialogue(shot.dialogue||'',characters);
  DialogueContract.checkSource(events,shot.sourceExcerpt);
  DialogueContract.bindDialogue('visual only',events,Number(shot.dur));
  return events;
}
function auditProductionShots(shots){
  const issues=[];
  shots.forEach((shot,i)=>{
    for(const check of [()=>{if(typeof ShotAudio!=='undefined')ShotAudio.validate(shot.audioMode,shotDialogueEvents(shot),shot.audioAsset);if(shot.renderMode==='black'&&(shot.firstFrameUrl||shot.audioMode==='replacement'))throw Error('纯黑静音镜头不能配置首帧或环境音')},()=>requireShotReferenceImages(shot),()=>shotDialogueEvents(shot),()=>{if(typeof ScreenCards!=='undefined')ScreenCards.fromShot(shot,D)},()=>{if(/<d\b/i.test(shot.prompt||''))throw Error('旧提示词内含台词，请清空或改为纯画面提示，台词统一填写在对白栏。')}]){
      try{check()}catch(error){issues.push({index:i+1,shotId:shot.id,message:error.message})}
    }
  });
  return {total:shots.length,issues,ready:shots.length>0&&!issues.length};
}
function showProductionAudit(button){
  const shots=typeof filmPlanShots==='function'&&document.getElementById('edit')?.classList.contains('on')?filmPlanShots().shots:visibleStoryboardShots();
  const audit=auditProductionShots(shots),root=button.parentElement.querySelector('[data-production-audit]');if(!root)return;
  root.innerHTML=`<p>${audit.total} 个镜头 · ${audit.issues.length} 项需处理。${audit.ready?'生成前检查通过，尚不代表生成质量通过。':''}</p>`+audit.issues.map(x=>`<p>第 ${x.index} 镜：${esc(x.message)}</p>`).join('');
}
function productionAuditControl(){return '<div class="card"><button class="btn" onclick="saveProductionReview(this)">保存制作检查包（本地）</button> <button class="btn" onclick="showProductionAudit(this)">检查制作条件（不渲染）</button> <button class="btn" onclick="repairDialogueBatch(this)">按对白轮次重建批次</button><p class="muted">检查资产图片、说话人物、原文台词和时长；不调用模型，不加入队列。重建仅修复有明确原文依据的文字消息并拆分多人对白，保留原批次；总时长可能增加。生成声音是否说对、画面是否符合剧情，仍须审片。</p><div data-production-audit role="status"></div></div>'}
function repairDialogueBatch(button){
  const output=button.parentElement.querySelector('[data-production-audit]'),p=activeProject();
  try{
    const source=typeof filmPlanShots==='function'&&document.getElementById('edit')?.classList.contains('on')?filmPlanShots().shots:visibleStoryboardShots();
    if(!source.length||editingShotId)throw Error('请先选择分镜批次并保存当前编辑。');
    const batchIds=new Set(source.map(s=>s.storyboardBatchId));if(batchIds.size!==1)throw Error('请先选择单一分镜批次。');
    const parent=(D.storyboardBatches||[]).find(b=>b.id===source[0].storyboardBatchId&&b.projectId===p.id);if(!parent)throw Error('找不到来源剧本批次。');
    const characters=(D.characters||[]).filter(c=>c.projectId===p.id),newBatch={...parent,id:uid('BOARD'),parentBatchId:parent.id,sourceTitle:parent.sourceTitle+' · 对白校正',createdAt:new Date().toISOString()},newShots=[];
    let changed=0;
    for(const shot of source){
      const original=DialogueContract.parseDialogue(shot.dialogue||'',characters),events=DialogueContract.repairEvents(original,shot.sourceExcerpt);
      DialogueContract.checkSource(events,shot.sourceExcerpt);
      const voices=events.filter(e=>e.type==='speech'),split=new Set(voices.map(e=>e.speakerId)).size>1;
      const groups=split?voices.map((e,i)=>i===0?[...events.filter(x=>x.type!=='speech'),e]:[e]):[events];
      if(split||JSON.stringify(original)!==JSON.stringify(events))changed++;
      for(const group of groups){
        const chars=group.filter(e=>e.type==='speech').reduce((n,e)=>n+Array.from(e.text.replace(/[\s，。！？、…,.!?]/g,'')).length,0);
        const duration=split?Math.max(4,Math.ceil(chars/4+0.8)):Number(shot.dur);DialogueContract.bindDialogue('visual',group,duration);
        if(duration>15)throw Error('仍有超过 15 秒的长台词，请先按原句拆分。');
        const copy={...shot,id:uid('SH'),parentShotId:shot.id,storyboardBatchId:newBatch.id,sequence:newShots.length+1,dialogue:group.map(DialogueContract.eventText).join('\n'),dur:duration,status:'待制作',prompt:''};
        if(split){copy.actionReviewRequired=true;for(const key of ['firstFrameUrl','firstFrameProvenance','continueFromShotId','firstFrameSpeakerPosition','firstFrameIntent','localFrameJobId','localFrameResult','localFrameSource'])delete copy[key];}delete copy.filmPrompt;delete copy.filmPromptSource;delete copy.filmPromptVersion;newShots.push(copy);
      }
    }
    const lastByParent=new Map(newShots.map(s=>[s.parentShotId,s.id]));
    for(const copy of newShots){
      if(copy.continueFromShotId){const replacement=lastByParent.get(copy.continueFromShotId);if(!replacement)throw Error('承接镜头的前镜不在此批次，请先修复关联');copy.continueFromShotId=replacement;}
      if(copy.firstFrameUrl&&copy.firstFrameProvenance){const original=source.find(s=>s.id===copy.parentShotId);FrameProvenance.validate(original,shotReferenceAssets(original));copy.firstFrameProvenance=FrameProvenance.create(copy,shotReferenceAssets(copy),copy.firstFrameUrl);}
      for(const key of ['videoUrl','localFrameJobId','localFrameResult','localFrameSource','continuityFrame'])delete copy[key];
    }
    if(!changed){output.textContent='未发现可自动修复的文字消息或多人对白问题，未创建重复批次。';return}
    const next={...D,shots:[...D.shots,...newShots],storyboardBatches:[...D.storyboardBatches,newBatch],projects:D.projects.map(x=>x.id===p.id?{...x,storyboardBatchId:newBatch.id,filmBatchId:newBatch.id}:x)};
    localStorage.setItem('aimovie_data',JSON.stringify(next));D.shots=next.shots;D.storyboardBatches=next.storyboardBatches;D.projects=next.projects;
    go('shots');const result=document.querySelector('#shots [data-production-audit]');if(result)result.textContent=`已校正 ${changed} 个原镜头，新批次共 ${newShots.length} 镜；原批次保留，尚未渲染。`;
  }catch(error){output.textContent='未修改分镜：'+error.message}
}
function shotReferenceAssets(shot){
  if(shot.renderMode==='black')return [];
  const result=[];
  const voices=DialogueContract.parseDialogue(shot.dialogue||'',(D.characters||[]).filter(c=>c.projectId===shot.projectId)).filter(e=>e.type==='speech');
  for(const [kind,key] of [['characters','characterIds'],['scenes','sceneIds'],['props','propIds']]){
    for(const id of new Set(shot[key]||[])){
      let asset=(D[kind]||[]).find(a=>a.id===id&&a.projectId===shot.projectId);
      if(!asset)throw Error('分镜引用的资产已删除或不属于本项目，请重新选择。');
      const presence=kind==='characters'?shot.assetStates?.[id]?.presence:undefined;
      if(presence==='offscreen')continue;
      // Mentioned-only characters are story metadata, not physical subjects.
      if(kind==='characters'&&asset.type==='仅提及'&&presence!=='screen'&&presence!=='onscreen')continue;
      if(kind==='characters'&&presence!=='screen'&&voices.some(e=>e.speakerId===id&&e.delivery==='phone')&&!voices.some(e=>e.speakerId===id&&e.delivery==='onscreen'))continue;
      if(typeof AssetStates!=='undefined'){const states=AssetStates.validate(shot.assetStates||{},[...(shot.characterIds||[]),...(shot.sceneIds||[]),...(shot.propIds||[])],shot.sourceExcerpt);asset=AssetStates.resolve(asset,states[id]);if(asset.screenText&&((shot.renderMode==='screen'&&shot.screenSource==='text'&&id===shot.screenAssetId)||(!states[id]?.imageUrl&&shot.renderMode!=='screen')))asset.imageUrl=screenStateImage(asset.screenEffect==='type-delete'?'输入草稿（未发送）':asset.screenText)}
      if(shot.renderMode==='screen'&&shot.screenSource==='text'&&id===shot.screenAssetId){const canvas=document.createElement('canvas');ScreenLayout.draw(canvas,asset.screenText,{balance:/余额|银行/.test(asset.name),typing:asset.screenEffect==='type-delete'});asset.imageUrl=canvas.toDataURL('image/png');}
      result.push({assetId:id,kind:presence==='screen'?'props':kind,name:String(asset.name||'').slice(0,100)+(presence==='screen'?'（仅屏幕照片）':''),notes:presence==='screen'?'This portrait appears ONLY inside an existing phone screen or photograph. Never place this person physically in the scene. Do not create a separate person, poster or floating panel.':String(asset.notes||asset.prompt||'').slice(0,3000),imageUrl:asset.imageUrl||''});
    }
  }
  return result;
}
function requireShotReferenceImages(shot){
  if(shot.renderMode==='screen'){
    if(shot.firstFrameUrl||shot.continueFromShotId||shotDialogueEvents(shot).some(e=>e.type==='speech'))throw Error('屏幕资产展示不能含口头对白、首帧或尾帧承接');
    if(!(shot.propIds||[]).includes(shot.screenAssetId))throw Error('请选择本镜已引用的屏幕道具');
    if(!Number.isFinite(shot.screenImagePercent)||shot.screenImagePercent<20||shot.screenImagePercent>100)throw Error('图片展示高度须为20–100%');
  }
  if(shot.continueFromShotId){
    const batch=D.shots.filter(s=>s.projectId===shot.projectId&&s.storyboardBatchId===shot.storyboardBatchId&&!s.autoArchived).sort((a,b)=>(a.sequence||0)-(b.sequence||0)),index=batch.findIndex(s=>s.id===shot.id);
    if(index<1||batch[index-1].id!==shot.continueFromShotId)throw Error('承接镜头的前镜已变更，请重新选择动作衔接');
    const identity=s=>JSON.stringify(shotReferenceAssets(s).map(a=>[a.assetId,a.kind,a.imageUrl]).sort((a,b)=>a[0].localeCompare(b[0])));
    if(identity(shot)!==identity(batch[index-1]))throw Error('承接镜头的资产或图片与前镜不同，请改为独立镜头');
    if(shot.firstFrameUrl||shot.renderMode==='black'||batch[index-1].renderMode==='black'||shotDialogueEvents(shot).some(e=>e.type==='speech'))throw Error('尾帧承接需要无对白后镜，且不能配置独立首帧或纯黑镜头');
  }
  if(typeof FrameProvenance!=='undefined')FrameProvenance.validate(shot,shotReferenceAssets(shot));
  if(shot.firstFrameUrl&&shotDialogueEvents(shot).some(e=>e.type==='speech'&&e.delivery==='onscreen')&&!['left','center','right'].includes(shot.firstFrameSpeakerPosition))throw Error('请指定首帧中画内发声者的位置');
  const assets=shotReferenceAssets(shot),missing=assets.filter(a=>!a.imageUrl.trim());
  const misplaced=shotDialogueEvents(shot).filter(e=>e.type==='speech'&&e.delivery==='onscreen'&&['screen','offscreen'].includes(shot.assetStates?.[e.speakerId]?.presence));
  if(misplaced.length)throw Error('画内发声人物被设为屏幕或画外人物：'+misplaced.map(e=>e.speakerName).join('、')+'。请核对人物出现方式和对白类型。');
  if(missing.length)throw Error('请先给以下资产添加参考图片：'+missing.map(a=>a.name).join('、')+'。不在画面中的资产可在编辑分镜中取消引用。');
  if(assets.length>9)throw Error('每镜最多 9 张参考图片，请拆分镜头或调整引用。');
  return assets;
}
async function prepareShotReferences(shot){
  return uploadShotImages(requireShotReferenceImages(shot));
}
async function uploadShotImages(assets){
  const result=[];
  for(const asset of assets){
    const key=D.connector.endpoint+'|'+asset.imageUrl;
    if(!referenceUploads.has(key))referenceUploads.set(key,(async()=>{
      let dataUrl=asset.imageUrl;
      if(!dataUrl.startsWith('data:')){
        if(!/^https?:\/\//i.test(dataUrl)&&!dataUrl.startsWith('/'))throw Error('请使用资产档案中的“导入图片”选择本地图片，不能直接填写文件路径。');
        const response=await fetch(dataUrl,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('图片地址无法访问');
        const blob=await response.blob();if(blob.size>8*1024*1024)throw Error('图片超过 8MB');
        dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
      }
      const response=await fetch(D.connector.endpoint+'/references',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl}),signal:AbortSignal.timeout(40000)}),out=await response.json();
      if(!response.ok)throw Error(out.error||'上传失败');return out.file;
    })());
    try{const file=await referenceUploads.get(key);const {imageUrl,...metadata}=asset;result.push({...metadata,file})}
    catch(error){referenceUploads.delete(key);throw Error(asset.name+'：参考图未能送达渲染器。'+error.message)}
  }
  return result;
}
async function prepareStoryboardJob(shot){
  const job=createStoryboardJob(shot);job.sourceFingerprint=await FilmSourceSync.fingerprint(shot,D);job.references=await prepareShotReferences(shot);job.firstFrame=await prepareShotFirstFrame(shot);job.mode=job.firstFrame?'I2VA':job.references.length?'Ref2VA':'T2VA';if(!await ResultGuard.matches(D.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId),job,D))throw Error('准备期间分镜或资产已修改，请重新入队');return job;
}
const oldAssetSummary=storyboardAssetSummary;
function screenShotSummary(shot){
 try{const ref=shotReferenceAssets(shot).find(r=>r.assetId===shot.screenAssetId);return `<p class="muted">屏幕资产${shot.screenSource==='text'?'原文':'原图'}展示 · 本地合成，不调用视频模型</p>${ref?.imageUrl?`<img src="${esc(ref.imageUrl)}" alt="屏幕展示预览" style="max-width:520px;max-height:320px;object-fit:contain">`:''}`;}catch(error){return '<p class="warn">'+esc(error.message)+'</p>';}
}
storyboardAssetSummary=function(shot){
  if(shot.renderMode==='screen')return screenShotSummary(shot);
  if(shot.renderMode==='black')return '<p class="muted">纯黑静音 · 自动成片时本地合成，无需参考图或模型队列</p>';
  let status;try{const assets=shotReferenceAssets(shot),missing=assets.filter(a=>!a.imageUrl.trim());status=assets.length?(missing.length?'缺少参考图：'+missing.map(a=>a.name).join('、'):`图片引用已配置：${assets.length} 张 · 入队时上传并绑定模型`):'未选择视觉资产：纯文字生成';if(assets.length>9)status+=' · 超过 9 张上限，请拆镜'}catch(error){status=error.message}
  if(shot.continueFromShotId)status='承接前镜尾帧：在自动成片中按顺序生成，重做前镜会更新本镜。';
  if(shot.firstFrameUrl){status='首帧驱动：以确认画面生成动作；原资产关系保留，本次模型图像输入为首帧。';try{if(typeof FrameProvenance!=='undefined')FrameProvenance.validate(shot,shotReferenceAssets(shot));}catch(error){status=error.message;}}
  let audio;try{const events=shotDialogueEvents(shot);audio=events.filter(e=>e.type==='speech').map(e=>`${e.speakerName}（${e.delivery==='phone'?'电话语音':e.delivery==='offscreen'?'画外':'画内'}）：${e.text}`).join('；')||'无口头对白';const screens=events.filter(e=>e.type==='screen').length;if(screens)audio+=` · ${screens} 条屏幕文字，不发声`}catch(error){audio='对白待修正：'+error.message}
  return oldAssetSummary(shot)+`<p class="muted">${esc(status)}</p><p class="muted">${esc(audio)}</p>`;
};

async function prepareShotFirstFrame(shot){
 if(shot.continueFromShotId)throw Error('承接镜头请从自动成片入口连同前镜制作，独立队列不能保证顺序');
 if(!shot.firstFrameUrl)return undefined;
 if(typeof FrameProvenance!=='undefined')FrameProvenance.validate(shot,shotReferenceAssets(shot));
 if(shot.renderMode==='black')throw Error('纯黑镜头不能指定首帧');
 const [frame]=await uploadShotImages([{name:'镜头首帧',imageUrl:shot.firstFrameUrl}]);const speech=shotDialogueEvents(shot).some(e=>e.type==='speech'&&e.delivery==='onscreen');if(speech&&!shot.firstFrameSpeakerPosition)throw Error('请设置首帧中画内发声者的位置');return {file:frame.file,...(shot.firstFrameSpeakerPosition?{speakerPosition:shot.firstFrameSpeakerPosition}:{})};
}
async function importShotFirstFrame(input){
 const field=document.getElementById('board_firstFrameUrl');
 try{const file=input.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('请选择5MB以内的PNG、JPEG或WebP图片');
 const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
 if(document.getElementById('board_firstFrameUrl')!==field)return;field.value=url;document.getElementById('board_firstFramePreview').src=url;
 const position=document.getElementById('board_firstFrameSpeakerPosition');if(position)position.value='';const provenance=document.getElementById('board_firstFrameProvenance');if(provenance)provenance.value='null';
 }catch(e){alert(e.message)}
}
