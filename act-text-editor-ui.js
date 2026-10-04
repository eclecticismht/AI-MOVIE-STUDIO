// Scene writing stays local and responsive; only idle saves encode the full workspace.
(function(){
 'use strict';
 const Model=globalThis.ActTextDrafts,PREFIX='ams_act_text_draft_v1:',drafts=new Map(),queued=new Set(),errors=new Map(),composing=new Set(),openActs=new Map();
 let timer=null,saving=null,deferredRender=false;
 const selector='[data-act-text-field]',key=Model.key;
 const diskKey=k=>PREFIX+encodeURIComponent(k);
 const storage=globalThis.localStorage;
 for(let i=0;i<storage.length;i++){
  const name=storage.key(i);if(!name?.startsWith(PREFIX))continue;
  try{const d=JSON.parse(storage.getItem(name));Model.validate(d);drafts.set(key(d),d)}catch{} // Never delete an unreadable recovery copy.
 }
 const label=field=>({storyText:'本场原文',content:'场次内容',title:'场次名称'})[field];
 function identity(el){return {projectId:el.dataset.actTextProject,scope:el.dataset.actTextScope,actId:el.dataset.act,field:el.dataset.actTextField}}
 function inputKey(el){return key(identity(el))}
 function fields(){return [...document.querySelectorAll(selector)]}
 function show(k,text){for(const el of fields())if(inputKey(el)===k){const row=el.parentElement.querySelector('[data-act-text-status]');if(row&&row.textContent!==text)row.textContent=text;row?.classList.toggle('warn',errors.has(k));}}
 function persistDraft(d){storage.setItem(diskKey(key(d)),JSON.stringify(d))}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>void flush(),900)}
 function sourceOf(info){return D.projects.find(p=>p.id===info.projectId)?.storyActs?.[info.scope]?.acts?.find(a=>a.id===info.actId)}
 function getDraft(el){
  const info=identity(el),k=key(info);if(drafts.has(k))return drafts.get(k);
  const c=storyActsContext(),a=c.acts.find(a=>a.id===info.actId);
  if(c.p.id!==info.projectId||c.key!==info.scope||!a)throw Error('输入框所属场次已变化，请保留文字并重新打开。');
  const d={...info,base:String(a[info.field]??''),text:el.value,hadScope:!!c.saved,...(!c.saved?{initialActs:structuredClone(c.acts)}:{})};drafts.set(k,d);return d;
 }
 function changed(el,event){
  const k=inputKey(el);
  try{
   const d=getDraft(el);d.text=el.value;errors.delete(k);
   if(event?.isComposing||composing.has(k)){show(k,'正在输入中文，选词完成后自动保存。');return}
   persistDraft(d);queued.add(k);show(k,'输入草稿已保留 · 停顿后自动保存到工作区');schedule();
  }catch(e){errors.set(k,e.message);show(k,'尚未保存：'+e.message+' 请勿关闭页面。')}
 }
 async function writeBatch(snapshot){
  for(let attempt=0;attempt<3;attempt++){
   const stored=JSON.parse(localStorage.getItem('aimovie_data')||'null');if(!stored?.projects)throw Error('工作区暂时无法读取，草稿已保留。');
   const next=Model.apply(stored,snapshot);
   try{await localStorage.setItemAsync('aimovie_data',JSON.stringify(next));Object.assign(D,next);return}
   catch(e){if(e.code!=='WORKSPACE_LOCAL_CHANGE'||attempt===2)throw e;}
  }
 }
 function flush(){
  clearTimeout(timer);
  if(saving)return saving;
  saving=(async()=>{
   let ok=true;
   for(let cycle=0;cycle<4;cycle++){
    const keys=[...queued].filter(k=>drafts.has(k)&&!composing.has(k));if(!keys.length)break;
    const snapshot=keys.map(k=>structuredClone(drafts.get(k)));
    try{
     if(snapshot.some(d=>storyFlowRuns.has(d.projectId)||actGenerationRuns.has(d.projectId)))throw Error('本项目正在创作，请完成后再保存场次；输入草稿仍保留。');
     if(typeof workspaceSave!=='undefined'&&workspaceSave.conflict)throw Error('工作区存在版本冲突，未覆盖原文；请先核对保存提示。');
     for(const k of keys)show(k,'正在后台保存原文，仍可继续输入…');
     await writeBatch(snapshot);
     for(const d of snapshot){
      const k=key(d),current=drafts.get(k);errors.delete(k);
      if(current?.text===d.text&&!composing.has(k)){
       drafts.delete(k);queued.delete(k);try{storage.removeItem(diskKey(k))}catch{};
       show(k,label(d.field)+'已保存到浏览器 · 正在同步磁盘…');
      }else if(current){current.base=d.text;current.hadScope=true;delete current.initialActs;if(!composing.has(k)){persistDraft(current);queued.add(k)}}
     }
    }catch(e){ok=false;for(const k of keys){errors.set(k,e.message);queued.delete(k);show(k,'保存未完成：'+e.message)}break;}
   }
   if(ok&&typeof workspaceFlush==='function'){
    try{await workspaceFlush();for(const el of fields()){const k=inputKey(el);if(!drafts.has(k)&&!errors.has(k))show(k,label(el.dataset.actTextField)+'已保存到本机磁盘')}}
    catch(e){ok=false;for(const el of fields())if(!drafts.has(inputKey(el)))show(inputKey(el),'已保存在浏览器，磁盘同步未确认：'+e.message)}
   }
   return ok&&!composing.size&&!drafts.size;
  })().finally(()=>{saving=null;if([...queued].some(k=>!composing.has(k)&&!errors.has(k)))schedule()});
  return saving;
 }
 async function saveField(el){const k=inputKey(el);if(composing.has(k)){show(k,'请先完成中文选词，再保存。');return false}if(drafts.has(k))queued.add(k);return flush()}
 function captureOpen(){for(const el of fields()){const act=el.closest('.story-act');if(act)openActs.set(JSON.stringify([el.dataset.actTextProject,el.dataset.actTextScope,el.dataset.act]),act.open)}}
 function decorate(){
  const page=document.getElementById('scripts');if(!page)return;
  const c=storyActsContext();page.dataset.actTextProject=c.p.id;page.dataset.actTextScope=c.key;
  for(const el of page.querySelectorAll('input[data-act],textarea[data-act]')){
   const handler=(el.getAttribute('oninput')||'')+(el.getAttribute('onchange')||'');
   const field=el.dataset.actTextField||/storyActsChange\('(storyText|content|title)'/.exec(handler)?.[1];if(!field)continue;
   el.removeAttribute('oninput');el.removeAttribute('onchange');el.oninput=null;el.onchange=null;
   el.dataset.actTextField=field;el.dataset.actTextProject=c.p.id;el.dataset.actTextScope=c.key;
   const k=inputKey(el),d=drafts.get(k);if(d)el.value=d.text;
   let row=el.parentElement.querySelector('[data-act-text-controls]');
   if(!row){row=document.createElement('span');row.dataset.actTextControls='';row.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0;font-size:12px';const save=document.createElement('button');save.type='button';save.className='btn';save.textContent=field==='storyText'?'保存原文':'保存';save.addEventListener('click',()=>void saveField(el));const status=document.createElement('span');status.dataset.actTextStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');row.append(save,status);el.after(row);}
   show(k,errors.get(k)?'草稿已保留 · '+errors.get(k):d?'已恢复本浏览器的输入草稿，保存后用于生成。':'停顿后自动保存 · 支持中文输入、粘贴与换行');
   const viewKey=JSON.stringify([c.p.id,c.key,el.dataset.act]);if(openActs.has(viewKey))el.closest('.story-act').open=openActs.get(viewKey);
  }
 }
 const focused=()=>{const page=document.getElementById('scripts');return page?.classList.contains('on')&&page.dataset.actTextProject===D.activeProjectId&&page.dataset.actTextScope===storyActsContext().key&&document.activeElement?.matches(selector+',.act-generation textarea[data-script]')};
 const originalRender=renderScripts;
 renderScripts=function(){if(focused()){deferredRender=true;return}captureOpen();originalRender();decorate();deferredRender=false};
 document.addEventListener('input',event=>{const el=event.target;if(el.matches?.(selector))changed(el,event)});
 document.addEventListener('compositionstart',event=>{const el=event.target;if(!el.matches?.(selector))return;composing.add(inputKey(el));clearTimeout(timer)});
 document.addEventListener('compositionend',event=>{const el=event.target;if(!el.matches?.(selector))return;composing.delete(inputKey(el));changed(el)});
 document.addEventListener('focusout',event=>{
  if(event.target.matches?.(selector)){const k=inputKey(event.target);if(drafts.has(k)&&!composing.has(k))schedule();}
  setTimeout(()=>{if(deferredRender&&!focused())renderScripts()},0);
 });
 document.addEventListener('toggle',event=>{if(event.target.matches?.('.story-act'))captureOpen()},true);
 const generate=generateStoryAct;
 generateStoryAct=async function(id){
  const p=D.activeProjectId,c=storyActsContext(),selected=fields().filter(el=>el.dataset.act===id);
  if(selected.some(el=>composing.has(inputKey(el)))){actGenerationNotice(c.p,id,'请先完成中文选词，再生成。');return}
  for(const el of selected)if(drafts.has(inputKey(el)))queued.add(inputKey(el));
  if(!await flush()||selected.some(el=>drafts.has(inputKey(el)))){actGenerationNotice(c.p,id,'本场原文尚未保存，未调用 AI；请处理输入框下方提示。');return}
  if(D.activeProjectId!==p||storyActsContext().key!==c.key)return;
  document.activeElement?.blur();deferredRender=false;return generate(id);
 };
 const controls=globalThis.StudioServiceControls;
 if(controls){const action=controls.action,save=controls.save;controls.save=async()=>{for(const k of drafts.keys())queued.add(k);if(!await flush())throw Error('场次输入尚未保存，草稿仍保留。');return save()};controls.action=async name=>{if(['save','restart','exit'].includes(name)){for(const k of drafts.keys())queued.add(k);if(!await flush()){if(typeof workspaceStatus==='function')workspaceStatus('场次输入尚未保存，未执行保存或服务操作；请查看输入框下方提示。');return false}}return action(name)};
  const toolbar=document.getElementById('studioServiceControls');toolbar?.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&['save','restart','exit'].includes(button.dataset.action)&&drafts.size){event.stopImmediatePropagation();void controls.action(button.dataset.action)}},true);
 }
 addEventListener('beforeunload',event=>{if(drafts.size||saving||composing.size){event.preventDefault();event.returnValue=''}});
 globalThis.ActTextEditor={flush,saveField,drafts,errors,composing,decorate,get saving(){return !!saving}};
 decorate();
})();
