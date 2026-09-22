const timelineVoiceoverDrafts=new Map();
function timelineVoiceoverKey(s){return s.projectId+'|'+s.id}
function timelineVoiceoverRender(){
 const shot=tlCurrent()?.shot,host=document.getElementById('tl-inspector');if(!shot||!host||TL.mode!=='gen')return;
 const key=timelineVoiceoverKey(shot);let draft=timelineVoiceoverDrafts.get(key);
 if(!draft||draft.text===draft.initial){draft={text:ShotVoiceover.text(shot),initial:ShotVoiceover.text(shot),expected:JSON.stringify(shot)};timelineVoiceoverDrafts.set(key,draft)}
 const section=document.createElement('section');section.className='card';section.id='timelineVoiceover';
 section.innerHTML=`<h3>画外音</h3><label for="timelineVoiceoverText">要朗读的文字</label><textarea id="timelineVoiceoverText" rows="5" placeholder="例如：傍晚的广州，忙碌的一天即将结束。">${esc(draft.text)}</textarea><p class="muted">生成时逐字朗读，画中人物不对口型，保留环境音。启用后本镜使用画外音替代人物对白；清空并保存可恢复原对白。较长文字会自动延长镜头，单镜最多 15 秒。保存后重新生成才会出声，旧视频不变。</p><button class="btn gold" id="timelineVoiceoverSave">保存画外音</button><p id="timelineVoiceoverStatus" role="status">${draft.text!==draft.initial?'未保存，加入队列时会先保存。':draft.text?'画外音已设置，将用于下次生成。':'输入文字即可添加旁白。'}</p>`;
 host.prepend(section);section.querySelector('textarea').oninput=e=>{draft.text=e.target.value;section.querySelector('[role="status"]').textContent='未保存，加入队列时会先保存。'};
 section.querySelector('button').onclick=()=>timelineVoiceoverSave(shot.id);
}
function timelineVoiceoverSave(id){
 const shot=tlCurrent()?.shot;if(!shot||shot.id!==id)return false;
 const key=timelineVoiceoverKey(shot),draft=timelineVoiceoverDrafts.get(key),status=document.getElementById('timelineVoiceoverStatus');
 try{
  if(!draft||draft.text===draft.initial)return true;
  if(TL.busy||!tlCanLeave())throw Error(TL.notice||'请等待当前操作完成再保存画外音');
  if(editingShotId)throw Error('请先保存分镜编辑，画外音草稿已保留');
  const data=JSON.parse(localStorage.getItem('aimovie_data')),current=data.shots.find(s=>s.id===id&&s.projectId===shot.projectId);
  if(data.activeProjectId!==D.activeProjectId||JSON.stringify(current)!==draft.expected)throw Error('镜头已修改，请保留画外音文字并重新载入后保存');
  const next=ShotVoiceover.apply(current,draft.text),result=FilmSourceSync.replaceWithDependents(data.shots,current,next);
  localStorage.setItem('aimovie_data',JSON.stringify({...data,shots:result.shots}));D.shots=result.shots;timelineVoiceoverDrafts.delete(key);
  tlMessage(draft.text.trim()?'画外音已保存，加入队列并提交后生成带画外音的视频。':'画外音已移除，原对白和声音设置已恢复。');tlRender();return true;
 }catch(e){if(status)status.textContent=e.message;tlMessage(e.message);return false}
}
const timelineVoiceoverInspector=tlInspector;
tlInspector=function(){timelineVoiceoverInspector();timelineVoiceoverRender()};
const timelineVoiceoverAction=tlAction;
tlAction=async function(action,id){if(action==='queue'&&!timelineVoiceoverSave(tlCurrent()?.shot.id))return;return timelineVoiceoverAction(action,id)};
window.addEventListener('beforeunload',event=>{if([...timelineVoiceoverDrafts.values()].some(d=>d.text!==d.initial)){event.preventDefault();event.returnValue=''}});
