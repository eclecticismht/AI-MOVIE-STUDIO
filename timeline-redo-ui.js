let timelineRedoState=null;
function timelinePreviewActions(){
 const label=document.getElementById('tl-preview-label');if(!label)return;
 let actions=document.getElementById('timelinePreviewActions');
 if(!actions){actions=document.createElement('span');actions.id='timelinePreviewActions';actions.innerHTML='<button class="btn gold" id="timelineAccept">采用此版本</button><button class="btn" id="timelineRedo">重做</button>';label.before(actions);actions.querySelector('#timelineAccept').onclick=timelineAcceptVersion;actions.querySelector('#timelineRedo').onclick=timelineOpenRedo;}
 const version=tlCurrent()?.shot&&tlMedia(tlCurrent().shot);
 actions.querySelector('#timelineAccept').disabled=!version?.videoUrl||TL.busy;
 actions.querySelector('#timelineRedo').disabled=!version?.videoUrl||TL.busy;
}
const timelinePreviewBeforeActions=tlPreview;
tlPreview=function(){timelinePreviewBeforeActions();timelinePreviewActions()};
async function timelineAcceptVersion(){
 if(TL.busy||!tlCanLeave())return;
 const version=tlMedia(tlCurrent().shot);if(!version)return;
 if(JSON.stringify(JSON.parse(localStorage.getItem('aimovie_data')))!==JSON.stringify(D)){tlMessage('项目已在其他页面更新，请刷新后再采用，避免覆盖新修改。');return;}
 await approveCurrentMaster(version.id,true);
 if(D.generations.find(g=>g.id===version.id)?.status==='MASTER'){
  cutSave(e=>{e.clips||={};e.clips[version.shot]={...e.clips[version.shot],versionId:version.id}});
  tlRender();tlMessage('已采用当前版本，剪辑将使用此视频。');
 }
}
function timelineOpenRedo(){
 if(TL.busy||!tlCanLeave())return;
 try{
  const shot=tlCurrent()?.shot;if(!shot)return;
  const draft=timelinePromptDrafts.get(timelinePromptKey(shot));if(draft&&timelinePromptChanged(draft))throw Error('请先保存或撤销时间线下方的提示词草稿');
  const shots=TimelineRedo.scope(D.shots,shot.id);cutStop();
  document.getElementById('timelineRedoDialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='timelineRedoDialog';
  dialog.innerHTML=`<h2>重做第 ${esc(shot.sequence)} 镜</h2><label for="timelineRedoRequest">需要怎样调整？</label><textarea id="timelineRedoRequest" rows="5" maxlength="3000" placeholder="例如：去掉多余的文字和声音，保留原有对白与环境音；把摩托车停在画面左边一点。"></textarea><p class="muted">将使用项目所选 AI 调整 H3 提示词并重新生成，旧视频保留。${shots.length>1?'因尾帧承接，需要一起生成第 '+shots.map(s=>esc(s.sequence)).join('、')+' 镜。':'仅重新生成当前镜头。'}原文和已核对对白保留；如需改写正式台词，请在分镜中编辑。</p><p id="timelineRedoStatus" role="status"></p><div class="timeline-redo-buttons"><button class="btn" id="timelineRedoCancel">取消</button><button class="btn gold" id="timelineRedoSubmit">按要求重做</button></div>`;
  document.body.append(dialog);timelineRedoState={shot:structuredClone(shot),version:structuredClone(tlMedia(shot)),dialog,expected:JSON.stringify(shot)};
  dialog.querySelector('#timelineRedoCancel').onclick=()=>dialog.close();dialog.querySelector('#timelineRedoSubmit').onclick=timelineSubmitRedo;
  dialog.oncancel=e=>{if(TL.busy)e.preventDefault()};dialog.showModal();dialog.querySelector('textarea').focus();
 }catch(e){tlMessage(e.message)}
}
async function timelineSubmitRedo(){
 const f=timelineRedoState;if(!f||TL.busy)return;
 const message=f.dialog.querySelector('#timelineRedoStatus'),button=f.dialog.querySelector('#timelineRedoSubmit'),cancel=f.dialog.querySelector('#timelineRedoCancel');
 const instruction=f.dialog.querySelector('textarea').value;
 TL.busy=true;button.disabled=true;cancel.disabled=true;
 try{
  const current=()=>{const data=JSON.parse(localStorage.getItem('aimovie_data')),s=data.shots.find(s=>s.id===f.shot.id&&s.projectId===f.shot.projectId);if(D.activeProjectId!==f.shot.projectId||JSON.stringify(s)!==f.expected)throw Error('分镜已改变，请关闭弹窗后重新打开');return {data,s}};
  const {data,s}=current(),p=data.projects.find(p=>p.id===s.projectId),model=p.screenplayModel||'deepseek-flash';
  if(await FilmSourceSync.fingerprint(s,data)!==await FilmSourceSync.fingerprint(s,D))throw Error('资产已在其他页面修改，请刷新后重试');
  const request=TimelineRedo.request(s,compileH3Prompt(s),instruction);
  const statuses=await fetch('/api/film').then(r=>r.json());if(statuses.runs.some(r=>r.projectId===s.projectId&&['pending','rendering','assembling'].includes(r.status)))throw Error('本项目正在制作，请等待完成或在自动成片中暂停后再重做。修改要求仍保留。');
  message.textContent='AI 正在根据要求调整画面与声音…';
  if(f.instruction!==instruction||!f.prompt){const response=await fetch('/api/h3-prompts',{method:'POST',headers:{'Content-Type':'application/json',...textAIHeaders(model)},body:JSON.stringify({model,shots:[request]}),signal:AbortSignal.timeout(250000)}),out=await response.json();if(!response.ok)throw Error(out.error||'AI 调整失败');if(out.prompts?.length!==1||out.prompts[0].id!==s.id)throw Error('AI 返回的镜头编号不符');f.prompt=out.prompts[0].prompt;f.instruction=instruction;}
  const fresh=current(),next=TimelineRedo.revised(fresh.s,f.prompt),update=FilmSourceSync.replaceWithDependents(fresh.data.shots,fresh.s,next),candidate={...fresh.data,shots:update.shots},shots=TimelineRedo.scope(candidate.shots,s.id);
  const scopeBaseline=await Promise.all(TimelineRedo.scope(fresh.data.shots,s.id).map(shot=>FilmSourceSync.fingerprint(shot,fresh.data)));
  if(JSON.stringify(scopeBaseline)!==JSON.stringify(await Promise.all(TimelineRedo.scope(fresh.data.shots,s.id).map(shot=>FilmSourceSync.fingerprint(shot,D)))))throw Error('关联镜头资产已在其他页面修改，请刷新后重试');
  if(shots.some(shotHasActiveJob))throw Error('相关镜头已有生成任务，请等待完成后重试');
  message.textContent='正在检查参考素材并准备重做…';await workflowPreflight(shots);
  const settings=h3JobSettings(),plan={projectId:s.projectId,title:p.name+' · 按要求重做第 '+s.sequence+' 镜',shots:[]};
  const expectedAssets=await FilmSourceSync.fingerprint(fresh.s,fresh.data);
  for(const shot of shots){
   requireShotReferenceImages(shot);
   plan.shots.push({shotId:shot.id,...settings,duration:Number(shot.dur),prompt:compileH3Prompt(shot),subtitle:shot.dialogue||'',sourceExcerpt:shot.sourceExcerpt,dialogueEvents:shotDialogueEvents(shot),screenCards:ScreenCards.fromShot(shot,candidate),renderMode:shot.renderMode||'model',screenSource:shot.screenSource,screenAssetId:shot.screenAssetId,screenImagePercent:shot.screenImagePercent,cropBottomPercent:shot.cropBottomPercent||0,audioMode:shot.audioMode||'model',audioAsset:shot.audioAsset,continueFromShotId:shot.continueFromShotId,continuitySpeakerPosition:shot.firstFrameSpeakerPosition,references:await prepareShotReferences(shot),firstFrame:shot.continueFromShotId?undefined:await prepareShotFirstFrame(shot),sourceFingerprint:await FilmSourceSync.fingerprint(shot,candidate)});
  }
  const latest=current();if(await FilmSourceSync.fingerprint(latest.s,latest.data)!==expectedAssets||JSON.stringify(await Promise.all(TimelineRedo.scope(latest.data.shots,s.id).map(shot=>FilmSourceSync.fingerprint(shot,latest.data))))!==JSON.stringify(scopeBaseline))throw Error('准备期间分镜或资产发生变化，请重新打开重做');
  const saved=FilmSourceSync.replaceWithDependents(latest.data.shots,latest.s,TimelineRedo.revised(latest.s,f.prompt));latest.data.shots=saved.shots;
  localStorage.setItem('aimovie_data',JSON.stringify(latest.data));D.shots=saved.shots;f.shot=structuredClone(saved.shots.find(x=>x.id===s.id&&x.projectId===s.projectId));f.expected=JSON.stringify(f.shot);timelinePromptDrafts.delete(timelinePromptKey(s));
  message.textContent='新提示词已保存，正在提交生成…';
  const response=await fetch('/api/film',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan),signal:AbortSignal.timeout(30000)}),out=await response.json();if(!response.ok)throw Error(out.error||'提交失败，新提示词已保留');
  filmRuns.push(out.run);f.dialog.close();tlMessage('已按修改要求开始重做；完成后自动接入预览，旧版本保留。');
 }catch(e){message.textContent=e.message}
 finally{TL.busy=false;button.disabled=false;cancel.disabled=false;tlRender()}
}
