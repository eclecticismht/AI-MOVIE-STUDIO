// Keep drafts by project and shot so selecting another frame does not discard typing.
const timelinePromptDrafts=new Map();
function timelinePromptKey(s){return s.projectId+'|'+s.id}
function timelinePromptChanged(d){return d.text!==d.initial}
function timelinePromptRender(){
 const timeline=document.querySelector('#timeline .tl-timeline'),shot=tlCurrent()?.shot;if(!timeline)return;
 let panel=document.getElementById('timelinePromptPanel');
 if(!panel){panel=document.createElement('section');panel.id='timelinePromptPanel';panel.className='timeline-prompt-panel';timeline.after(panel)}
 if(!shot){panel.hidden=true;return}panel.hidden=false;
 const key=timelinePromptKey(shot);
 // Do not replace a focused editor on progress polling or unrelated renders.
 if(panel.dataset.key===key&&panel.contains(document.activeElement))return;
 let draft=timelinePromptDrafts.get(key);
 if(!draft||!timelinePromptChanged(draft)){
  let initial=shot.prompt||'',error='';
  try{const compiled=compileH3Prompt(shot);initial=ShotPrompt.isStructured(shot.prompt)?shot.prompt:shot.filmPromptVersion===2&&shot.filmPromptSource===compiled&&shot.filmPrompt?shot.filmPrompt:compiled}catch(e){error=e.message}
  draft={initial,text:initial,expected:JSON.stringify(shot),error};timelinePromptDrafts.set(key,draft);
 }
 panel.dataset.key=key;
 panel.innerHTML=`<div class="timeline-prompt-heading"><label for="timelineH3Prompt">第 ${esc(shot.sequence||'—')} 镜 · H3 提示词</label><span class="muted">可直接编辑</span></div><textarea id="timelineH3Prompt" rows="7" spellcheck="false" placeholder="填写当前镜头的 H3 提示词">${esc(draft.text)}</textarea><div class="timeline-prompt-actions"><button class="btn gold" id="timelinePromptSave">保存提示词</button><button class="btn" id="timelinePromptReset">撤销修改</button><span id="timelinePromptStatus" role="status">${esc(draft.error|| (timelinePromptChanged(draft)?'未保存草稿 · 切换镜头仍保留':'保存后用于下次生成，已有视频保留'))}</span></div>`;
 document.getElementById('timelineH3Prompt').addEventListener('input',event=>{draft.text=event.target.value;document.getElementById('timelinePromptStatus').textContent=timelinePromptChanged(draft)?'未保存草稿 · 切换镜头仍保留':'尚未修改'});
 document.getElementById('timelinePromptSave').onclick=()=>timelinePromptSave(key,shot.id);
 document.getElementById('timelinePromptReset').onclick=()=>{timelinePromptDrafts.delete(key);panel.dataset.key='';timelinePromptRender()};
}
function timelinePromptSave(key,id){
 const draft=timelinePromptDrafts.get(key);if(!draft)return;
 const status=document.getElementById('timelinePromptStatus');
 try{
  if(editingShotId)throw Error('请先保存或关闭展开的分镜编辑，避免两处修改互相覆盖。');
  if(!timelinePromptChanged(draft)){status.textContent='提示词没有修改';return}
  const stored=JSON.parse(localStorage.getItem('aimovie_data')||'null');if(!stored)throw Error('项目数据暂时无法读取，请先复制提示词备份。');
  const current=tlCurrent()?.shot;if(!current||timelinePromptKey(current)!==key)throw Error('当前镜头已改变，请重新选择。');
  const next=TimelinePrompt.save({...stored,activeProjectId:D.activeProjectId},id,draft.expected,draft.text);
  localStorage.setItem('aimovie_data',JSON.stringify(next));Object.assign(D,next);timelinePromptDrafts.delete(key);
  document.getElementById('timelinePromptPanel').dataset.key='';renderAll();tlMessage('提示词已保存，本镜及相连的承接镜头已标记需重做；旧视频保留。');
 }catch(e){status.textContent=e.message}
}
const inspectorBeforeTimelinePrompt=tlInspector;
tlInspector=function(){inspectorBeforeTimelinePrompt();timelinePromptRender()};
window.addEventListener('beforeunload',event=>{if([...timelinePromptDrafts.values()].some(timelinePromptChanged)){event.preventDefault();event.returnValue=''}});
