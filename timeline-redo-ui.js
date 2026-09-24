let timelineRedoState=null;
function timelinePreviewActions(){
 const label=document.getElementById('tl-preview-label');if(!label)return;
 let actions=document.getElementById('timelinePreviewActions');
 if(!actions){actions=document.createElement('span');actions.id='timelinePreviewActions';actions.innerHTML='<button class="btn gold" id="timelineAccept">采用此版本</button><button class="btn" id="timelineRedo">重做</button>';label.before(actions);actions.querySelector('#timelineAccept').onclick=timelineAcceptVersion;actions.querySelector('#timelineRedo').onclick=timelineOpenRedo;}
 const version=tlCurrent()?.shot&&tlMedia(tlCurrent().shot);
 actions.querySelector('#timelineAccept').disabled=!version?.videoUrl||TL.busy;
 actions.querySelector('#timelineRedo').disabled=!tlCurrent()?.shot||TL.busy;
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
 if(TL.busy){tlMessage('正在处理，请等待当前操作完成');return;}
 try{
  const shot=tlCurrent()?.shot;if(!shot)return;
  const draft=timelinePromptDrafts.get(timelinePromptKey(shot));
  let shots=[shot];try{shots=TimelineRedo.scope(D.shots,shot.id)}catch{}cutStop();
  document.getElementById('timelineRedoDialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='timelineRedoDialog';
  dialog.innerHTML=`<h2>重做第 ${esc(shot.sequence)} 镜</h2><label for="timelineRedoRequest">需要怎样调整？</label><textarea id="timelineRedoRequest" rows="5" maxlength="10000" placeholder="例如：去掉多余的文字和声音，保留原有对白与环境音；把摩托车停在画面左边一点。"></textarea><p class="muted">直接描述想要的效果，AI 会自动修改画面、动作、对白、声音、时长及 H3 提示词，再重新制作，旧视频保留。${shots.length>1?'因尾帧承接，需要一起生成第 '+shots.map(s=>esc(s.sequence)).join('、')+' 镜。':'仅重新生成当前镜头。'}新要求优先于旧设定，支持去掉台词、改词或完全静音；本镜修改会保存记录。未保存的提示词也会作为修改依据。</p><p id="timelineRedoStatus" role="status"></p><div class="timeline-redo-buttons"><button class="btn" id="timelineRedoCancel">取消</button><button class="btn" id="timelineRedoSave">仅保存修改</button><button class="btn gold" id="timelineRedoSubmit">修改并重做</button></div>`;
  document.body.append(dialog);timelineRedoState={shot:structuredClone(shot),version:structuredClone(tlMedia(shot)),dialog,expected:JSON.stringify(shot),draftText:draft&&timelinePromptChanged(draft)?draft.text:null};
  dialog.querySelector('#timelineRedoCancel').onclick=()=>dialog.close();dialog.querySelector('#timelineRedoSubmit').onclick=()=>timelineSubmitRedo();dialog.querySelector('#timelineRedoSave').onclick=()=>timelineSubmitRedo(true);
  dialog.oncancel=e=>{if(TL.busy)e.preventDefault()};dialog.showModal();dialog.querySelector('textarea').focus();
 }catch(e){tlMessage(e.message)}
}
async function timelineSubmitRedo(saveOnly=false){
 const f=timelineRedoState;if(!f||TL.busy)return;
 const message=f.dialog.querySelector('#timelineRedoStatus'),button=f.dialog.querySelector('#timelineRedoSubmit'),cancel=f.dialog.querySelector('#timelineRedoCancel');
 const instruction=f.dialog.querySelector('textarea').value;
 const saveButton=f.dialog.querySelector('#timelineRedoSave');
 TL.busy=true;button.disabled=true;cancel.disabled=true;if(saveButton)saveButton.disabled=true;
 try{
  const current=()=>{const data=JSON.parse(localStorage.getItem('aimovie_data')),s=data.shots.find(s=>s.id===f.shot.id&&s.projectId===f.shot.projectId);if(D.activeProjectId!==f.shot.projectId||JSON.stringify(s)!==f.expected)throw Error('分镜已改变，请关闭弹窗后重新打开');return {data,s}};
  if(typeof tlCanLeave==='function'&&!tlCanLeave())throw Error(TL.notice||'请先保存当前编辑，修改要求会保留');
  const {data,s}=current(),p=data.projects.find(p=>p.id===s.projectId),model=p.screenplayModel||'deepseek-flash';
  if(await FilmSourceSync.fingerprint(s,data)!==await FilmSourceSync.fingerprint(s,D))throw Error('资产已在其他页面修改，请刷新后重试');
  if(!instruction.trim()||instruction.length>10000)throw Error('请输入修改要求（最多 10000 字）');
  message.textContent='AI 正在根据你的要求修改镜头内容、对白、声音及 H3 提示词…';
  if(f.instruction!==instruction||f.model!==model||!f.revision){
   const response=await fetch('/api/screenplay/shot-revision',{method:'POST',headers:{'Content-Type':'application/json',...textAIHeaders(model)},body:JSON.stringify({model,...TimelineRedo.editRequest(s,f.draftText||s.prompt||compileH3Prompt({...s,dur:Math.max(4,Math.min(15,Number(s.dur)||5))}),instruction,(data.characters||[]).filter(c=>c.projectId===p.id))}),signal:AbortSignal.timeout(250000)});
   const out=await response.json();if(!response.ok)throw Error(out.error||'AI 修改失败');if(!out.revision)throw Error('AI 没有返回镜头修改结果，请重试');
   f.revision={...out.revision,instruction};f.instruction=instruction;f.model=model;
  }
  const fresh=current();if(await FilmSourceSync.fingerprint(fresh.s,fresh.data)!==await FilmSourceSync.fingerprint(s,data))throw Error('AI 修改期间引用素材已变化，请重新打开重做');
  const next=TimelineRedo.revised(fresh.s,f.revision),update=FilmSourceSync.replaceWithDependents(fresh.data.shots,fresh.s,next),candidate={...fresh.data,shots:update.shots};
  if(saveOnly){
   localStorage.setItem('aimovie_data',JSON.stringify(candidate));D.shots=update.shots;timelinePromptDrafts.delete(timelinePromptKey(s));f.dialog.close();tlMessage('AI 修改已保存：'+f.revision.summary+'。可随时生成新视频。');return;
  }
  const shots=TimelineRedo.scope(candidate.shots,s.id);
  const statuses=await fetch('/api/film').then(r=>{if(!r.ok)throw Error('无法读取制作队列；AI 修改已暂存，可重试或仅保存');return r.json()});
  if(statuses.runs.some(r=>r.projectId===s.projectId&&['pending','rendering','assembling'].includes(r.status)))throw Error('AI 已完成修改：'+f.revision.summary+'。本项目正在制作，暂不能提交新视频；可点击“AI 修改并保存”，或任务结束后再点重做（无需重复调用 AI）。');
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
  const saved=FilmSourceSync.replaceWithDependents(latest.data.shots,latest.s,next);latest.data.shots=saved.shots;
  localStorage.setItem('aimovie_data',JSON.stringify(latest.data));D.shots=saved.shots;f.shot=structuredClone(saved.shots.find(x=>x.id===s.id&&x.projectId===s.projectId));f.expected=JSON.stringify(f.shot);timelinePromptDrafts.delete(timelinePromptKey(s));
  message.textContent='新提示词已保存，正在提交生成…';
  if(typeof registerActFilms==='function')await registerActFilms();
  const response=await fetch('/api/film',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan),signal:AbortSignal.timeout(30000)}),out=await response.json();if(!response.ok)throw Error(out.error||'提交失败，新提示词已保留');
  filmRuns.push(out.run);f.dialog.close();tlMessage('已开始重做；完成后自动更新本场成片，旧版保留。');
 }catch(e){message.textContent=(f.revision?'AI 修改已就绪：'+f.revision.summary+'。':'')+e.message}
 finally{TL.busy=false;button.disabled=false;cancel.disabled=false;if(saveButton)saveButton.disabled=false;tlRender()}
}
