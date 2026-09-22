function storyActsContext(){
 const p=activeProject(),script=currentScreenplay(),batches=(D.storyboardBatches||[]).filter(b=>b.projectId===p.id&&b.sourceScriptId===script?.id),batch=batches.find(b=>b.id===p.storyboardBatchId)||batches.at(-1);
 const selected=p.storyActsSelection?.[script?.id||'draft'],key=selected&&p.storyActs?.[selected]?selected:(script?.id||'draft')+'|'+(batch?.id||'unboarded');
 const saved=p.storyActs?.[key],draft=p.storyActs?.[(script?.id||'draft')+'|unboarded'],acts=saved?.acts||draft?.acts,ids=new Set((acts||[]).flatMap(a=>a.shotIds||[])),retired=new Set([...(saved?.retiredShotIds||[]),...(acts||[]).flatMap(a=>a.retiredShotIds||[])]);
 const baseBatch=key.split('|')[1],shots=StoryActs.ordered(D.shots.filter(s=>s.projectId===p.id&&(ids.has(s.id)||(s.storyboardBatchId===baseBatch&&!retired.has(s.id)))));
 return {p,script,batch,key,shots,saved,acts:StoryActs.normalize(acts,shots)};
}
function storyActsCommit(context,acts,backup=false,action=''){
 const {p,key,saved}=context;
 const stored=JSON.parse(localStorage.getItem('aimovie_data')||'null'),latest=stored?.projects.find(x=>x.id===p.id);
 if(!latest||JSON.stringify(latest.storyActs?.[key])!==JSON.stringify(saved))throw Error('场次已在其他页面修改，请刷新后再试。');
 const history=backup?[...(saved?.history||[]),context.acts].slice(-5):(saved?.history||[]);
 if(['delete','restore'].includes(action)){
  const ids=new Set([...context.acts,...acts].flatMap(a=>[...(a.shotIds||[]),...(a.retiredShotIds||[])]));
  if(JSON.stringify(stored.shots.filter(s=>s.projectId===p.id&&ids.has(s.id)))!==JSON.stringify(D.shots.filter(s=>s.projectId===p.id&&ids.has(s.id))))throw Error('镜头已在其他页面修改，请刷新后再试。');
  StoryActDeletion.reconcile(stored,p.id,key,context.acts,acts);
 }
 latest.storyActs={...(latest.storyActs||{}),[key]:{...saved,acts,history,deletionVersion:1}};
 localStorage.setItem('aimovie_data',JSON.stringify(stored));p.storyActs=latest.storyActs;p.timelineEdits=latest.timelineEdits;D.shots=stored.shots;
 if(['delete','restore'].includes(action)&&typeof CUT!=='undefined'){cutClear();CUT.undo.clear();CUT.redo.clear();TL.shotId=null;TL.time=0;TL.version=null;TL.previewKey=null;}
}
function storyActsChange(action,id,value){try{
 if(editingShotId||storyFlowRuns.has(D.activeProjectId))throw Error('请先结束当前分镜编辑或自动创作，再调整场次。');
 const c=storyActsContext();let acts=c.acts;
 if(action==='add')acts=[...acts,{id:uid('ACT'),title:StoryActs.title(acts.length+1),content:'',shotIds:[]}];
 if(action==='delete')acts=StoryActs.remove(acts,id);
 if(action==='move')acts=StoryActs.move(acts,id,value);
 if(['title','content','storyText'].includes(action))acts=acts.map(a=>a.id===id?{...a,[action]:value}:a);
 if(action==='auto'){if(!c.script?.content.trim())throw Error('请先填写剧本。');acts=StoryActs.auto(c.script.content,c.shots)}
 if(action==='restore'){if(!c.saved?.history?.length)throw Error('没有可恢复的场次分组');const prior=c.saved.history.at(-1),ids=new Set(prior.flatMap(a=>a.shotIds||[]));acts=StoryActs.normalize(prior,D.shots.filter(s=>s.projectId===c.p.id&&ids.has(s.id)).map(s=>s.deletedWithAct===c.key?{...s,autoArchived:false}:s))}
 storyActsCommit(c,acts,['auto','delete','restore'].includes(action),action);
 if(action==='title'){const input=[...document.querySelectorAll('.story-act-fields input[data-act]')].find(e=>e.dataset.act===id),summary=input?.closest('.story-act')?.querySelector(':scope > summary');if(summary?.firstChild)summary.firstChild.textContent=(value||StoryActs.title(c.acts.findIndex(a=>a.id===id)+1))+' ';}
 if(!['title','content','storyText'].includes(action))renderScripts();
 storyFlowNotice(c.p,action==='auto'?'已根据剧本标题划分场次；未找到标题时归为一场。请核对镜头归属，可用下拉框调整。':action==='delete'?'场次及对应时间线镜头已删除，可点击“恢复上次分组”恢复。':action==='restore'?'场次与镜头已恢复，剪辑参数请重新核对。':'场次内容已保存。');
 }catch(e){storyFlowNotice(activeProject(),e.message)}
}
function storyActShot(s,i,g,act,acts){
 return `<details class="story-shot"><summary>镜头 ${i+1} · ${esc(s.camera||'景别待定')} · ${s.dur} 秒</summary><label>所属场次<select aria-label="镜头 ${esc(s.sequence||i+1)} 所属场次" data-shot="${esc(s.id)}" onchange="storyActsChange('move',this.dataset.shot,this.value)">${acts.map(a=>`<option value="${esc(a.id)}" ${a.id===act.id?'selected':''}>${esc(a.title)}</option>`).join('')}</select></label><div class="formgrid">${[['scene','场景名称'],['camera','景别与运镜'],['script','人物行动'],['visual','画面设计'],['dialogue','对白 / 声音'],['prompt','H3 提示词']].map(([field,label])=>`<label>${label}<textarea aria-label="${esc(act.title)}场景${g.index}镜头${i+1}${label}" data-id="${esc(s.id)}" oninput="storyFlowEditShot(this.dataset.id,'${field}',this.value)">${esc(s[field]||'')}</textarea></label>`).join('')}</div><label>时长（秒）<input type="number" min="4" max="15" step="0.1" value="${Number(s.dur)||4}" data-id="${esc(s.id)}" onchange="storyFlowEditShot(this.dataset.id,'dur',this.value)"></label><button class="btn" data-id="${esc(s.id)}" onclick="storyFlowPromptOne(this.dataset.id)">生成 / 重写本镜 H3</button><details><summary>对应剧本原文</summary><p>${esc(s.sourceExcerpt||'')}</p></details></details>`;
}
storyFlowOutline=function(){
 const c=storyActsContext();
 return `<section class="story-outline story-acts"><div class="toolbar"><h2>场次内容</h2><button class="btn" onclick="storyActsChange('add')">＋ 添加场次</button><button class="btn gold" onclick="storyActsChange('auto')">根据剧本自动划分</button>${c.saved?.history?.length?'<button class="btn" onclick="storyActsChange(\'restore\')">恢复上次分组</button>':''}</div><p class="muted">场次 → 场景 → 镜头。现有镜头默认归入场次一；自动划分保留镜头和旧分组，不会重新生成视频。${c.batch&&c.batch.sourceContent!==c.script?.content?'当前镜头来自旧版剧本，请核对归属。':''}</p>${c.acts.map((a,index)=>{const shots=c.shots.filter(s=>a.shotIds.includes(s.id)),groups=StoryFlowModel.groups(shots,D.scripts.find(s=>s.id===a.generatedScriptId)?.content||c.batch?.sourceContent||c.script?.content||'');return `<details class="card story-act" ${index===0?'open':''}><summary>${esc(a.title)} <span class="muted">${groups.length} 个场景 · ${shots.length} 个镜头</span><button class="btn act-delete" aria-label="删除${esc(a.title)}" data-act="${esc(a.id)}" onclick="event.preventDefault();event.stopPropagation();storyActsChange('delete',this.dataset.act)">删除场次</button></summary>${typeof actGenerationControls==='function'?actGenerationControls(a,index):''}<div class="story-act-fields"><label>场次名称<input aria-label="场次 ${index+1} 名称" value="${esc(a.title)}" data-act="${esc(a.id)}" onchange="storyActsChange('title',this.dataset.act,this.value)"></label><label>场次内容<textarea aria-label="场次 ${index+1} 内容" data-act="${esc(a.id)}" placeholder="填写这一场发生的事情；不会覆盖剧本或镜头。" onchange="storyActsChange('content',this.dataset.act,this.value)">${esc(a.content)}</textarea></label></div>${groups.map(g=>`<details class="story-scene"><summary>场景 ${g.index} · ${esc(g.title)} · ${g.shots.length} 镜</summary>${g.shots.map((s,i)=>storyActShot(s,i,g,a,c.acts)).join('')}</details>`).join('')||'<p class="muted">暂无镜头。可把其他场次的镜头移入这里；尚未分镜时，可用当前剧本生成场景和镜头。</p>'}</details>`}).join('')}${!c.acts.length?'<div class="card empty">暂无场次。可以添加新场次，或恢复上次分组。删除场次时，所属镜头也会从时间线移除；恢复分组可找回镜头。</div>':''}</section>`;
};
