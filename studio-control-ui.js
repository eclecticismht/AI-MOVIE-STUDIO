// Keep form drafts as well as the project model; never reload a page with edits.
(function(){
 const dirty=new Map(),baselines=new WeakMap();let saving=false,operation=null,lastStatus='',polling=false;
 const secret=/password|credential|api[-_]?key|token|authorization|secret/i;
 function fieldInfo(el){
  if(!el||!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||['password','file','hidden','button','submit'].includes(el.type)||secret.test((el.id||'')+' '+(el.name||'')+' '+(el.getAttribute('aria-label')||''))||el.closest('#textAISettings'))return null;
  const page=el.closest('.page');if(!page)return null;
   // Director previs owns its draft and persists it through the same workspace adapter.
   if(page.id==='previs'&&globalThis.DirectorPrevisUI)return null;
  const fields=[...page.querySelectorAll('input,textarea,select')],attributes={};
  for(const attr of [...el.attributes])if(attr.name.startsWith('data-')&&!secret.test(attr.name))attributes[attr.name]=attr.value;
  return {projectId:D.activeProjectId,page:page.id,editingShotId:typeof editingShotId==='string'?editingShotId:null,id:el.id||'',label:el.getAttribute('aria-label')||'',name:el.name||'',tag:el.tagName,type:el.type||'',index:fields.indexOf(el),attributes};
 }
 const value=el=>['checkbox','radio'].includes(el.type)?el.checked:el.value;
 const key=info=>JSON.stringify(info);
 document.addEventListener('focusin',event=>{if(fieldInfo(event.target)&&!baselines.has(event.target))baselines.set(event.target,value(event.target))},true);
 document.addEventListener('input',event=>{
  const el=event.target,info=fieldInfo(el);if(!info)return;
  const before=baselines.has(el)?baselines.get(el):['checkbox','radio'].includes(el.type)?el.defaultChecked:el.defaultValue??el.value;
  if(value(el)===before)dirty.delete(key(info));else dirty.set(key(info),{...info,before,value:value(el)});
 },true);
 const toolbar=document.createElement('div');toolbar.id='studioServiceControls';toolbar.setAttribute('aria-label','工作室服务操作');
 toolbar.innerHTML='<div class="studio-service-buttons"><button class="btn" data-action="start" title="启动并检查本地连接服务与H3，不提交生成任务">▶ 启动</button><button class="btn gold" data-action="save" title="保存项目及当前编辑草稿到浏览器和本机磁盘">保存</button><button class="btn" data-action="exit" title="先保存，任务结束后退出网页与连接服务；H3保持运行">退出</button><button class="btn" data-action="restart" title="先保存，任务结束后更新网页与连接服务">重启</button><button class="btn" data-action="cancel" hidden>取消等待</button><button class="btn" data-action="restore" hidden>恢复编辑草稿</button></div><p id="studioServiceMessage" role="status" aria-live="polite">正在检查服务…</p>';
 document.querySelector('main').prepend(toolbar);
 const message=text=>{toolbar.querySelector('#studioServiceMessage').textContent=text};
 const showDraft=()=>{toolbar.querySelector('[data-action="restore"]').hidden=!D.studioEditorDraft?.fields?.length};
 async function api(body){const r=await fetch('/api/studio-control',{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const out=await r.json();if(!r.ok)throw Error(out.error||'服务操作失败');return out}
 async function save(){
  if(saving)throw Error('正在保存，请稍后再操作');saving=true;
  const draft=[...dirty.values()],signature=JSON.stringify(draft);
  try{
   if([...document.querySelectorAll('input[type="password"]')].some(el=>el.value))throw Error('请先使用设置中的保存按钮保存正在填写的密钥');
   // Blur commits existing onchange handlers before writing the model.
   document.activeElement?.blur();
    if(globalThis.DirectorPrevisUI)await globalThis.DirectorPrevisUI.saveUnsaved();
   if(draft.length)D.studioEditorDraft={savedAt:new Date().toISOString(),fields:draft};
   const page=document.querySelector('.page.on')?.id;
   if(typeof TL!=='undefined'&&TL.dirty){tlSaveAudio();if(TL.dirty)throw Error('声音设置尚未保存，请处理编辑区提示')}
   if(typeof editingShotId==='string'&&editingShotId&&document.getElementById('board_script')){if(saveStoryboardShot(editingShotId)!==true)throw Error('当前镜头尚未保存，请处理编辑区提示')}
   else if(typeof editingShotId==='string'&&editingShotId&&document.getElementById('shot_script'))await saveShotDetails(editingShotId);
   else if(page==='stories'&&document.getElementById('b_logline'))saveBible();
   localStorage.setItem('aimovie_data',JSON.stringify(D));
   await workspaceFlush();
   if(signature!==JSON.stringify([...dirty.values()]))throw Error('保存期间新增了编辑，请再保存一次后操作服务');
   dirty.clear();showDraft();message('已保存到本机磁盘'+(D.studioEditorDraft?.fields?.length?'，未提交的表单内容也已保留为编辑草稿。':'。'));
  }finally{saving=false}
 }
 function restore(){
  const fields=D.studioEditorDraft?.fields||[],currentPage=document.querySelector('.page.on')?.id,first=fields.find(f=>f.projectId===D.activeProjectId&&f.page===currentPage)||fields.find(f=>f.projectId===D.activeProjectId);if(!first)throw Error('请先打开草稿所属项目');
  if(dirty.size)throw Error('请先保存本页新增编辑，再恢复已有草稿');
  go(first.page);
  if(first.page==='shots'&&first.editingShotId){if(typeof tlTools==='function')tlTools('shots');editingShotId=first.editingShotId;renderShots2()}
  const page=document.getElementById(first.page),elements=[...page.querySelectorAll('input,textarea,select')];let restored=0,skipped=0;
  for(const draft of fields.filter(f=>f.projectId===D.activeProjectId&&f.page===first.page&&f.editingShotId===first.editingShotId)){
   const el=elements.find(el=>{const info=fieldInfo(el);return info&&info.tag===draft.tag&&info.type===draft.type&&(draft.id?info.id===draft.id:draft.label?info.label===draft.label:info.index===draft.index&&info.name===draft.name)&&JSON.stringify(info.attributes)===JSON.stringify(draft.attributes)});
   if(!el||![draft.before,draft.value].includes(value(el))){skipped++;continue}
   baselines.set(el,value(el));if(['checkbox','radio'].includes(el.type))el.checked=draft.value;else el.value=draft.value;
   dirty.set(key(fieldInfo(el)),{...fieldInfo(el),before:draft.before,value:draft.value});restored++;
  }
  message(`已恢复 ${restored} 项编辑草稿，请检查后使用对应编辑区的保存按钮。${skipped?`另有 ${skipped} 项内容已变化，保留现有内容。`:''}`);
 }
 function setExitMode(enabled){document.querySelectorAll('main>.page,aside nav').forEach(el=>{el.inert=enabled})}
 function display(op){
  operation=op;const active=op&&['queued','waiting','applying','starting'].includes(op.phase);
  toolbar.querySelectorAll('[data-action="start"],[data-action="restart"],[data-action="exit"]').forEach(el=>{el.disabled=!!active});
  toolbar.querySelector('[data-action="cancel"]').hidden=!op||!['queued','waiting'].includes(op.phase);
  setExitMode(!!(active&&op.action==='exit'));
  const stamp=op?op.id+op.phase+op.message:'idle';if(stamp!==lastStatus){lastStatus=stamp;message(op?.message||'工作台已启动。保存、退出与重启均保留项目和历史记录。')}
 }
 async function poll(){
  if(polling)return;polling=true;
  try{const out=await api();display(out.operation)}catch(error){
   if(operation?.action==='exit'&&['applying','starting'].includes(operation.phase))message('网页服务已断开，可以关闭此页。再次使用时，请点击桌面上的 AI Movie Studio 启动入口。');
   else if(operation&&['applying','starting'].includes(operation.phase))message('正在重新连接服务…本页编辑仍保留。');
   else message('服务未连接：'+error.message+'。可用桌面启动入口恢复。');
  }finally{polling=false}
 }
 async function action(name){
  try{
   if(name==='save'){await save();return}
   if(name==='restore'){restore();return}
   if(name==='cancel'){display((await api({action:name,id:operation.id})).operation);return}
   if(name==='exit'||name==='restart')await save();
   display((await api({action:name})).operation);
  }catch(error){message(error.message+'；未继续执行服务操作。')}
 }
 toolbar.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled)void action(button.dataset.action)});
 addEventListener('beforeunload',event=>{if(dirty.size||workspaceSave.pending||workspaceSave.busy){event.preventDefault();event.returnValue=''}});
 showDraft();void poll();setInterval(poll,3000);
 // A small public surface supports keyboard shortcuts and isolated browser tests.
 globalThis.StudioServiceControls={action,save,restore,poll};
})();
