// Approved speech is a generation input. It is separate from post-production dubbing.
const performanceAudioDrafts=new Map();
function performanceAudioKey(shot){return shot.projectId+'|'+shot.id}
function performanceAudioValues(draft){return JSON.stringify([draft.file,draft.trimIn,draft.trimOut,draft.offset])}
function performanceAudioDirty(draft){return draft.busy||draft.initial!==performanceAudioValues(draft)}
function performanceAudioEvents(shot){const events=DialogueContract.parseDialogue(shot.dialogue,D.characters.filter(c=>c.projectId===shot.projectId));DialogueContract.checkSource(events,shot.sourceExcerpt);return events}
function performanceAudioDraft(shot){
 const key=performanceAudioKey(shot),old=performanceAudioDrafts.get(key);if(old&&performanceAudioDirty(old))return old;
 const source=shot.performanceAudio?.source,draft={file:source?.file||'',trimIn:String(source?.trimIn??0),trimOut:source?String(source.trimOut):'',offset:String(source?.offset??0),expected:JSON.stringify(shot),busy:false};
 draft.initial=performanceAudioValues(draft);performanceAudioDrafts.set(key,draft);return draft;
}
function performanceAudioStatus(message){const node=document.getElementById('performance-audio-status');if(node)node.textContent=message;tlMessage(message)}
function performanceAudioRender(){
 const shot=tlCurrent()?.shot,host=document.getElementById('tl-inspector');if(!shot||!host||!['gen','audio'].includes(TL.mode))return;
 const draft=performanceAudioDraft(shot),assets=(D.audio||[]).filter(a=>a.projectId===shot.projectId&&/^\/audio-assets\/ams-audio-[a-f0-9]{64}\.wav$/.test(a.audioUrl||''));
 const choices=new Map(assets.map(a=>[a.audioUrl.split('/').at(-1),a.name||a.id]));if(draft.file&&!choices.has(draft.file))choices.set(draft.file,'已导入的配音');
 let state='选择已确认的单人配音，保存后用于下次生成。';if(shot.performanceAudio){try{PerformanceAudio.validate(shot.performanceAudio,{...shot,dialogueEvents:performanceAudioEvents(shot)});state='配音已绑定，重新生成后检查口型。'}catch(e){state=e.message}}if(performanceAudioDirty(draft))state=draft.busy?'正在保存，请稍候…':'配音参考草稿未保存。';
 const section=document.createElement('section');section.className='card';section.id='performance-audio-editor';
 section.innerHTML=`<h3>用已确认配音生成画面</h3><p class="muted">先保存本镜对白，再选择对应录音。每镜一位说话人；角色与场景使用参考图。独立首帧、尾帧承接需先移除。生成后仍需听审和检查口型。</p><label>配音素材<select id="performance-audio-file"><option value="">请选择配音</option>${[...choices].map(([file,name])=>`<option value="${esc(file)}" ${file===draft.file?'selected':''}>${esc(name)}</option>`).join('')}</select></label><label>或导入 WAV / MP3<input id="performance-audio-upload" type="file" accept=".wav,.mp3"></label><audio id="performance-audio-preview" controls preload="metadata" ${draft.file?'src="/audio-assets/'+esc(draft.file)+'"':''}></audio><div class="cut-fields">${[['trimIn','录音入点（秒）'],['trimOut','录音出点（空白表示结尾）'],['offset','镜内开始（秒）']].map(([key,label])=>`<label>${label}<input data-performance-field="${key}" type="number" min="0" step="0.001" value="${esc(draft[key])}"></label>`).join('')}</div><p class="muted">本镜可用 ${(PerformanceAudio.frames(shot.dur)/24).toFixed(3)} 秒。保留原语速、停顿与换气；只在前后补静音。录音过长时会提示调整时长。</p><button class="btn gold" id="performance-audio-save" ${draft.busy?'disabled':''}>保存配音参考</button><button class="btn" id="performance-audio-clear" ${draft.busy?'disabled':''}>移除绑定</button><p id="performance-audio-status" role="status">${esc(state)}</p><p class="muted">已绑定的录音会随画面保留，后续剪辑与导出使用原配音。下方声音选项用于生成后的声音处理。</p>`;
 host.prepend(section);
 const change=()=>performanceAudioStatus('配音参考草稿未保存。');
 section.querySelector('select').onchange=e=>{draft.file=e.target.value;draft.trimIn='0';draft.trimOut='';draft.offset='0';performanceAudioRenderRefresh()};
 for(const node of section.querySelectorAll('[data-performance-field]'))node.oninput=()=>{draft[node.dataset.performanceField]=node.value;change()};
 section.querySelector('#performance-audio-upload').onchange=e=>performanceAudioImport(shot,draft,e.target.files[0]);
 section.querySelector('#performance-audio-save').onclick=()=>performanceAudioSave(shot.id);
 section.querySelector('#performance-audio-clear').onclick=()=>performanceAudioSave(shot.id,true);
}
function performanceAudioRenderRefresh(){document.getElementById('performance-audio-editor')?.remove();performanceAudioRender()}
async function performanceAudioImport(shot,draft,file){
 if(!file||draft.busy)return;draft.busy=true;
 try{
  if(file.size>20*1024*1024||!/[.](wav|mp3)$/i.test(file.name))throw Error('请选择20MB以内 WAV 或 MP3');
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)}),dataUrl=data.replace(/^data:[^;]*;/,'data:audio/'+(/mp3$/i.test(file.name)?'mpeg':'wav')+';');
  const response=await fetch('/api/audio-assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})}),out=await response.json();if(!response.ok)throw Error(out.error||'声音导入失败');
  draft.file=out.file;draft.trimIn='0';draft.trimOut='';draft.offset='0';performanceAudioStatus('配音已导入，请核对入出点后保存参考。');
 }catch(e){performanceAudioStatus(e.message)}finally{draft.busy=false;if(tlCurrent()?.shot.id===shot.id&&D.activeProjectId===shot.projectId)performanceAudioRenderRefresh()}
}
function performanceAudioCurrent(shot,draft){
 if(TL.busy||TL.dirty||editingShotId)throw Error('请先保存分镜编辑，再保存配音参考；配音草稿已保留');
 const data=JSON.parse(localStorage.getItem('aimovie_data')),current=data.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId),live=D.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId);
 if(D.activeProjectId!==shot.projectId||data.activeProjectId!==shot.projectId||JSON.stringify(current)!==draft.expected||JSON.stringify(live)!==draft.expected)throw Error('项目或镜头已修改，配音草稿已保留；请核对后重新载入');
 return {data,current};
}
async function performanceAudioSave(id,clear=false){
 const shot=tlCurrent()?.shot;if(!shot||shot.id!==id)return false;const key=performanceAudioKey(shot),draft=performanceAudioDrafts.get(key)||performanceAudioDraft(shot);if(draft.busy)return false;
 try{
  performanceAudioCurrent(shot,draft);let binding;const requested=performanceAudioValues(draft);
  if(!clear){
   const events=performanceAudioEvents(shot);if(!draft.file)throw Error('请先选择配音素材');draft.busy=true;performanceAudioStatus('正在保存配音参考…');
   const response=await fetch('/api/performance-audio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:draft.file,trimIn:Number(draft.trimIn),...(draft.trimOut.trim()?{trimOut:Number(draft.trimOut)}:{}),offset:Number(draft.offset),duration:Number(shot.dur),dialogueEvents:events})}),out=await response.json();
   if(!response.ok)throw Error(out.error||'配音参考未保存，请检查网页服务');binding=PerformanceAudio.validate(out.binding,{...shot,dialogueEvents:events});if(!binding)throw Error('服务没有返回有效配音绑定');
  }
  if(requested!==performanceAudioValues(draft))throw Error('保存期间配音选择已改变，草稿已保留，请重新保存');
  const {data,current}=performanceAudioCurrent(shot,draft),next={...current};if(clear)delete next.performanceAudio;else next.performanceAudio=binding;
  const result=FilmSourceSync.replaceWithDependents(data.shots,current,next);localStorage.setItem('aimovie_data',JSON.stringify({...data,shots:result.shots}));D.shots=result.shots;performanceAudioDrafts.delete(key);
  tlMessage(clear?'配音绑定已移除，录音文件仍保留。':'配音参考已保存。重新生成后核对画面、口型和原配音。');tlRender();return true;
 }catch(e){performanceAudioStatus(e.message);return false}finally{draft.busy=false}
}
async function performanceAudioPreflight(shots){
 for(const shot of shots){const draft=performanceAudioDrafts.get(performanceAudioKey(shot));if(draft&&performanceAudioDirty(draft))throw Error('有未保存的配音参考，请先保存或移除绑定');}
 if(!shots.some(s=>s.performanceAudio))return;
 const response=await fetch('/api/performance-audio',{signal:AbortSignal.timeout(5000)}),out=await response.json();
 if(!response.ok||out.version!==2||!out.connectorReady)throw Error('配音口型修正尚未生效，请重启网页服务和本地 Connector，再刷新工作室');
}
const performanceAudioInspectorBase=tlInspector;
tlInspector=function(){performanceAudioInspectorBase();performanceAudioRender()};
window.addEventListener('beforeunload',event=>{if([...performanceAudioDrafts.values()].some(performanceAudioDirty)){event.preventDefault();event.returnValue=''}});
