const actGenerationRuns=new Set(),actGenerationMessages=new Map();
function actGenerationNotice(p,id,message){
 actGenerationMessages.set(p.id+'|'+id,message);storyFlowNotice(p,message);
 if(typeof document!=='undefined')document.querySelectorAll('[data-act-status]').forEach(el=>{if(el.dataset.actStatus===id&&D.activeProjectId===p.id)el.textContent=message});
}
function actGenerationRender(id){
 renderScripts();
 if(typeof document!=='undefined')document.querySelectorAll('[data-act-status]').forEach(el=>{if(el.dataset.actStatus===id){const panel=el.closest('.story-act');if(panel)panel.open=true}});
}
function actGenerationAssets(prepared,projectId){
 return Object.fromEntries(['characters','scenes','props'].map((kind,i)=>{
  const ids=new Set(prepared.references?.[['characterIds','sceneIds','propIds'][i]]||[]);
  return [kind,prepared.collections[kind].filter(a=>a.projectId===projectId&&ids.has(a.id)).map(({id,name,type,notes})=>({id,name,type,notes}))];
 }));
}
function actGenerationControls(a,index){const busy=actGenerationRuns.has(D.activeProjectId);const script=D.scripts.find(s=>s.id===a.generatedScriptId&&s.projectId===D.activeProjectId);return `<div class="act-generation"><label>本场故事原文<textarea aria-label="场次 ${index+1} 故事原文" data-act="${esc(a.id)}" oninput="storyActsChange('storyText',this.dataset.act,this.value)" ${busy?'disabled':''} placeholder="输入这一场的故事、动作与对白，只生成当前场次。">${esc(a.storyText||'')}</textarea></label><button class="btn gold" data-act="${esc(a.id)}" onclick="generateStoryAct(this.dataset.act)" ${busy?'disabled':''}>${busy?'正在生成…':a.pipeline?'继续生成剧本、场景、镜头与 H3':'一键生成本场剧本、场景、镜头与 H3'}</button><p role="status" aria-live="polite" data-act-status="${esc(a.id)}">${esc(actGenerationMessages.get(D.activeProjectId+'|'+a.id)|| (a.pipeline?'已保存进度，点击继续完成剩余步骤。':''))}</p><p class="muted">使用页面所选 AI 模型；原文会发送至对应服务。逐步保存进度，失败可继续，不自动生成视频。旧版保留。</p>${script?`<details open><summary>本场剧本（可编辑）</summary><textarea aria-label="场次 ${index+1} 剧本" data-script="${esc(script.id)}" onchange="editActScreenplay(this.dataset.script,this.value)" ${busy?'disabled':''}>${esc(script.content)}</textarea></details>`:''}${a.generatedBatchId?`<button class="btn" data-batch="${esc(a.generatedBatchId)}" onclick="openActTimeline(this.dataset.batch)">本场镜头进入时间线</button>`:''}</div>`}
function editActScreenplay(id,content){try{const stored=JSON.parse(localStorage.getItem('aimovie_data'));const script=stored.scripts.find(s=>s.id===id&&s.projectId===D.activeProjectId);const old=D.scripts.find(s=>s.id===id);if(!script||JSON.stringify(script)!==JSON.stringify(old))throw Error('剧本已在其他页面修改，请刷新后核对。');script.content=content;script.status='已编辑';localStorage.setItem('aimovie_data',JSON.stringify(stored));Object.assign(old,script);storyFlowNotice(activeProject(),'本场剧本已保存；已有镜头保持原版，重新生成请修改本场故事原文。')}catch(e){storyFlowNotice(activeProject(),e.message)}}
function openActTimeline(id){const p=activeProject(),c=storyActsContext();p.storyActsSelection={...(p.storyActsSelection||{}),[c.script?.id||'draft']:c.key};p.storyboardBatchId=id;p.filmBatchId=id;persist();go('timeline')}
async function generateStoryAct(id){
 const c=storyActsContext(),a=c.acts.find(a=>a.id===id),p=c.p;if(!a||actGenerationRuns.has(p.id))return;
 const notice=message=>actGenerationNotice(p,id,message);
 if(editingShotId||storyFlowRuns.has(p.id)||screenplayRequests.has(p.id)||storyboardRequests.has(p.id))return notice('请等待当前创作或分镜编辑结束。');
 const story=(a.storyText||'').trim(),model=p.screenplayModel||'deepseek-flash';if(!story)return notice('请先输入本场故事原文。');
 let expected=JSON.stringify(c.saved);
 const read=()=>{const data=JSON.parse(localStorage.getItem('aimovie_data')),project=data.projects.find(x=>x.id===p.id);if(D.activeProjectId!==p.id||JSON.stringify(project?.storyActs?.[c.key])!==expected)throw Error('项目或场次已变化，生成已暂停，未覆盖编辑。');return {data,project}};
 const write=(state)=>{const {data,project}=read();const base=project.storyActs?.[c.key]||{acts:c.acts,history:[]};project.storyActs={...(project.storyActs||{}),[c.key]:{...base,acts:base.acts.map(x=>x.id===id?{...x,pipeline:state}:x)}};localStorage.setItem('aimovie_data',JSON.stringify(data));p.storyActs=project.storyActs;expected=JSON.stringify(project.storyActs[c.key])};
 actGenerationRuns.add(p.id);storyFlowRuns.set(p.id,{story:(p.storyText||'').trim()});
 try{
  actGenerationRender(id);
  const state=await ActGeneration.run(story,model,a.pipeline,{
   save:write,notice,split:text=>StoryboardSegments.split(text,{mode:'auto'}),validPrompt:text=>ShotPrompt.isStructured(text)&&!/<d\b/i.test(text),
   request:async(url,body)=>{read();const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...textAIHeaders(model)},body:JSON.stringify(body),signal:AbortSignal.timeout(250000)});const out=await r.json();read();if(!r.ok){const e=Error(out.error||'生成失败');e.repair=out.repair;throw e}return out},
   prepare:result=>{const scriptId=uid('SCR'),batchId=uid('BOARD'),prepared=prepareScreenplayAssets(result.assets,p.id,scriptId);return {...prepared,collections:Object.fromEntries(['characters','scenes','props'].map(k=>[k,prepared.collections[k].filter(a=>!D[k]?.some(x=>x.id===a.id))])),scriptId,batchId,assets:actGenerationAssets(prepared,p.id)}},
   makeShots:(raw,prepared)=>{const shots=raw.map((s,i)=>({id:uid('SH'),projectId:p.id,scriptId:prepared.scriptId,storyboardBatchId:prepared.batchId,sequence:i+1,sourceExcerpt:s.sourceExcerpt,script:s.action,visual:s.visual,desc:s.visual,camera:s.camera,char:s.characters,scene:s.scene,dialogue:s.dialogue,dur:s.duration,assetStates:s.assetStates||{},status:'待制作',prompt:'',...Object.fromEntries(['characters','scenes','props'].map((k,j)=>{const key=['characterIds','sceneIds','propIds'][j],ids=s[key]||[];if(!Array.isArray(ids)||ids.some(id=>!prepared.assets[k].some(x=>x.id===id)))throw Error('分镜资产引用无效');return [key,ids]}))}));raw.forEach((s,i)=>{if(s.continuePrevious&&i)shots[i].continueFromShotId=shots[i-1].id});return shots},
   describe:(s,prepared)=>ShotPrompt.compile(s,p,['characters','scenes','props'].flatMap((kind,i)=>(s[['characterIds','sceneIds','propIds'][i]]||[]).map(id=>({...prepared.assets[kind].find(a=>a.id===id),assetId:id,kind}))))
  });
  const {data,project}=read(),v=state.prepared;
  for(const k of ['characters','scenes','props'])data[k]=[...(data[k]||[]),...v.collections[k].filter(a=>!data[k]?.some(x=>x.id===a.id))];
  const script={id:v.scriptId,projectId:p.id,kind:'act-screenplay',title:a.title+' · 剧本',content:state.screenplay.content,sourceStory:story,model,createdAt:new Date().toISOString(),...v.references};
  const batch={id:v.batchId,projectId:p.id,sourceScriptId:script.id,sourceTitle:script.title,sourceContent:script.content,model,createdAt:script.createdAt};
  data.scripts.push(script);data.storyboardBatches=[...(data.storyboardBatches||[]),batch];data.shots.push(...state.shots);
  const saved=project.storyActs[c.key];saved.retiredShotIds=[...new Set([...(saved.retiredShotIds||[]),...(saved.acts.find(x=>x.id===id)?.shotIds||[])])];saved.acts=saved.acts.map(x=>{if(x.id!==id)return x;const next={...x,shotIds:state.shots.map(s=>s.id),retiredShotIds:[...new Set([...(x.retiredShotIds||[]),...x.shotIds])],generatedScriptId:script.id,generatedBatchId:batch.id};delete next.pipeline;return next});
  project.storyActsSelection={...(project.storyActsSelection||{}),[c.script?.id||'draft']:c.key};
  localStorage.setItem('aimovie_data',JSON.stringify(data));Object.assign(D,data);notice(`${a.title}已完成：剧本、场景资产、${state.shots.length} 个镜头及 H3 提示词。旧版保留。`);
 }catch(e){notice(e.message+' 已完成步骤已保留，点击继续可重试。')}
 finally{actGenerationRuns.delete(p.id);storyFlowRuns.delete(p.id);if(D.activeProjectId===p.id)actGenerationRender(id)}
}
