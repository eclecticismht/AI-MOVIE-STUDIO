// Rearrange existing controls without replacing their handlers or saved data.
function shotEditorSignature(editor){
 return JSON.stringify([...editor.querySelectorAll('input,textarea,select')].map(e=>[e.id,e.name,e.type,e.value,e.checked,[...(e.files||[])].map(f=>[f.name,f.size,f.lastModified])]));
}
function shotEditorHasChanges(){
 if(!editingShotId)return false;
 const editor=document.querySelector('.simple-shot-editor');
 // Missing editors must never be treated as an unchanged draft.
 return !editor||editor.dataset.baseline!==shotEditorSignature(editor);
}
function simpleFold(parent,nodes,title){
 if(!nodes.length)return;
 const details=document.createElement('details');details.className='simple-fold';
 const summary=document.createElement('summary');summary.textContent=title;details.append(summary);
 parent.insertBefore(details,nodes[0]);nodes.forEach(n=>details.append(n));return details;
}
function simplifyShotWorkspace(){
 const page=document.getElementById('shots');if(!page)return;
 const editor=document.getElementById('board_script')?.closest('.card');
 const title=page.querySelector(':scope > h1');if(title)title.textContent=editor?'镜头编辑':'分镜';
 page.classList.toggle('simplified-editing',!!editor);
 const children=[...page.children],list=children.findIndex(e=>e.querySelector('#boardBatch'));
 if(list>0){const setup=children.slice(0,list).filter(e=>!['H1','NAV'].includes(e.tagName));const fold=simpleFold(page,setup,'生成分镜与制作设置');if(fold&&!page.querySelector('article'))fold.open=true;}
 if(!editor)return;
 editor.classList.add('simple-shot-editor');editor.closest('article')?.classList.add('simple-active-shot');
 const heading=editor.querySelector('h3');if(heading)heading.textContent='编辑当前镜头';
 const form=editor.querySelector('.formgrid'),actions=[...editor.querySelectorAll('p')].find(p=>p.querySelector('button[onclick^="saveStoryboardShot"]'));
 if(!form||!actions)return;
 const childrenBefore=[...editor.children],start=childrenBefore.indexOf(form)+1,end=childrenBefore.indexOf(actions);
 const controls=childrenBefore.slice(start,end),sound=controls.findIndex(e=>e.classList.contains('shot-direction-panel'));
 const continuity=controls.findIndex(e=>e.tagName==='H3'&&e.textContent.includes('段间引导'));
 const prompt=controls.findIndex(e=>e.querySelector('#board_prompt'));
 if(sound>=0&&continuity>sound&&prompt>continuity){
  simpleFold(editor,controls.slice(0,sound),'角色、场景与道具');
  simpleFold(editor,controls.slice(sound,continuity),'声音与音效');
  simpleFold(editor,controls.slice(continuity,prompt),'人物站位与镜头衔接');
  controls[prompt].open=false;
 }
 actions.classList.add('simple-savebar');heading.after(actions);
 const cancel=actions.querySelector('button[onclick*="editingShotId=null"]');if(cancel)cancel.textContent='关闭 / 放弃修改';
 const save=actions.querySelector('button[onclick^="saveStoryboardShot"]');if(save)save.textContent='保存';
 const advanced=actions.querySelector('button[onclick^="saveAndRequeueStoryboard"]');
 if(advanced){const more=document.createElement('details');more.className='simple-more-actions';const summary=document.createElement('summary');summary.textContent='更多操作';more.append(summary,advanced);const sync=editor.querySelector('button[onclick*="saveStoryboardAndOpenSource"]');if(sync){const hint=sync.nextElementSibling;if(hint?.tagName==='SMALL'||hint?.classList.contains('muted'))hint.remove();more.append(sync)}actions.append(more);}
 const status=document.createElement('span');status.className='muted';status.setAttribute('role','status');actions.append(status);
 editor.dataset.baseline=shotEditorSignature(editor);
 const update=()=>{status.textContent=shotEditorHasChanges()?'有未保存修改':'尚未修改，可直接切换镜头'};
 editor.addEventListener('input',update);editor.addEventListener('change',update);update();
}
const simplePreviousShots=renderShots2;
renderShots2=function(){simplePreviousShots();simplifyShotWorkspace()};
function simplifyNavigation(){
 const nav=document.querySelector('aside nav');if(!nav||nav.querySelector('.simple-nav-more'))return;
 const more=document.createElement('details');more.className='simple-nav-more';const summary=document.createElement('summary');summary.textContent='更多';more.append(summary);
 for(const button of [...nav.children]){
  const target=/go\('([^']+)'\)/.exec(button.getAttribute('onclick')||'')?.[1];
  if(['studio','data','settings'].includes(target))more.append(button);
  const label={projects:'项目',scripts:'故事与剧本',assets:'资产',timeline:'时间线',masters:'成片'}[target];if(label)button.textContent=label;
 }nav.append(more);
}
simplifyNavigation();
