const storyFlowRuns=new Map(),storyFlowMessages=new Map();
function storyFlowCommit(p,patch){const next={...D,projects:D.projects.map(x=>x===p?{...p,...patch}:x)};localStorage.setItem('aimovie_data',JSON.stringify(next));Object.assign(p,patch)}
function storyFlowNotice(p,message){storyFlowMessages.set(p.id,message);if(D.activeProjectId===p.id){const el=document.getElementById('storyFlowStatus');if(el)el.textContent=message}}
function storyFlowCheckpoint(p,run){if(!D.projects.includes(p)||D.activeProjectId!==p.id)throw Error('项目已切换，流程已暂停。回到该项目可继续。');if(run.pause)throw Error('已在当前步骤完成后暂停，可继续后续步骤。');if((p.storyText||'').trim()!==run.story)throw Error('故事原文已修改，流程已暂停。请用修改后的原文重新开始。')}
function storyFlowPause(){const run=storyFlowRuns.get(D.activeProjectId);if(run){run.pause=true;storyFlowNotice(activeProject(),'将在当前步骤完成并保存后暂停。')}}
function storyFlowFromScript(){const p=activeProject(),script=currentScreenplay();if(storyFlowRuns.has(p.id))return;if(!script?.content.trim()){storyFlowNotice(p,'请先填写或生成剧本正文。');return}try{storyFlowCommit(p,{storyFlow:{story:(p.storyText??p.bible?.synopsis??'').trim(),scriptId:script.id,stage:'storyboard'}});return storyFlowStart(true)}catch{storyFlowNotice(p,'未能保存流程状态，请备份项目后重试。')}}
async function storyFlowImport(input){
  const file=input.files?.[0],p=activeProject();if(!file)return;
  if(storyFlowRuns.has(p.id)||screenplayRequests.has(p.id)||storyboardRequests.has(p.id)){storyFlowNotice(p,'请等待当前生成结束再上传。');input.value='';return}
  const original=p.storyText||'';input.disabled=true;storyFlowNotice(p,'正在读取文档文字…');
  try{
    if(file.size>10485760)throw Error('文件不能超过 10 MB。');
    const response=await fetch('/api/story-document?ext='+encodeURIComponent(file.name.split('.').pop().toLowerCase()),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(60000)});
    if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error('文件导入服务未启动，请重启本地工作室。');
    const result=await response.json();if(!response.ok)throw Error(result.error||'文件读取失败。');
    if(D.activeProjectId!==p.id||(p.storyText||'')!==original)throw Error('读取期间项目或原文已变化，未覆盖内容，请重新上传。');
    const history=[...(p.storyImports||[]),...(original.trim()?[{text:original,name:p.storyFileName||'手动原文',at:new Date().toISOString()}]:[])].slice(-5);
    storyFlowCommit(p,{storyText:result.text,storyFileName:file.name,storyImports:history,storyFlow:null});
    renderScripts();await storyFlowStart(false);
  }catch(error){storyFlowNotice(p,error.message)}finally{input.disabled=false;input.value=''}
}
function storyFlowRestore(index){const p=activeProject();if(storyFlowRuns.has(p.id))return;const item=p.storyImports?.[index];if(!item)return;
  try{const history=[...p.storyImports,{text:p.storyText||'',name:p.storyFileName||'手动原文',at:new Date().toISOString()}].slice(-5);storyFlowCommit(p,{storyText:item.text,storyFileName:item.name,storyImports:history,storyFlow:null});renderScripts();storyFlowNotice(p,'原文已恢复，可手动修改或重新生成。')}catch{storyFlowNotice(p,'恢复未保存成功，原文保持不变。')}}
async function storyFlowStart(resume=true){
  const p=activeProject();if(storyFlowRuns.has(p.id)||screenplayRequests.has(p.id)||storyboardRequests.has(p.id)){storyFlowNotice(p,'当前项目正在生成，请等待完成。');return}
  const story=(p.storyText??p.bible?.synopsis??'').trim();if(!story&&!p.storyFlow?.scriptId){storyFlowNotice(p,'请上传文件或填写故事原文。');return}
  if(story.length>60000){storyFlowNotice(p,'故事超过 60,000 字，请按章节生成。');return}
  const run={story,pause:false};storyFlowRuns.set(p.id,run);
  try{
    if(p.storyText===undefined)storyFlowCommit(p,{storyText:story});
    let state=resume&&p.storyFlow?.story===story?{...p.storyFlow}:{story,stage:'screenplay'};
    storyFlowCommit(p,{storyFlow:state});renderScripts();
    let script=D.scripts.find(s=>s.projectId===p.id&&s.id===state.scriptId);
    if(!script){storyFlowNotice(p,'1 / 3 · 所选模型正在改编剧本并整理资产…');script=await generateScreenplay();if(!script)throw Error(screenplayMessages.get(p.id)||'剧本未完成，请重试。');state={...state,scriptId:script.id,stage:'storyboard'};storyFlowCommit(p,{storyFlow:state});}
    storyFlowCheckpoint(p,run);
    let batch=(D.storyboardBatches||[]).find(b=>b.projectId===p.id&&b.id===state.batchId&&b.sourceContent===script.content);
    if(!batch){
      storyFlowCommit(p,{screenplayId:script.id,storyboardScriptId:script.id});const content=script.content;
      storyFlowNotice(p,'2 / 3 · 所选模型正在按场景拆分镜头…');batch=await generateStoryboard();if(!batch)throw Error(storyboardMessages.get(p.id)||'分镜未完成，请重试。');
      state={...state,batchId:batch.id,stage:'prompts'};storyFlowCommit(p,{storyFlow:state});
      if(script.content!==content)throw Error('生成期间剧本已修改。本次分镜已保留，继续时会按最新剧本新建分镜批次。');
    }
    storyFlowCheckpoint(p,run);
    const shots=D.shots.filter(s=>s.projectId===p.id&&s.storyboardBatchId===batch.id);
    await storyFlowPrompts(p,StoryFlowModel.pending(shots),run);
    storyFlowCheckpoint(p,run);if(script.content!==batch.sourceContent)throw Error('剧本已修改，本批次仍基于修改前的版本。继续时将新建分镜批次。');
    storyFlowCommit(p,{storyboardBatchId:batch.id,storyFlow:{...state,stage:'done'}});
    storyFlowNotice(p,`已完成：${StoryFlowModel.groups(shots,batch.sourceContent).length} 个场景、${shots.length} 个镜头。可继续修改内容或进入时间线。`);
  }catch(error){storyFlowNotice(p,error.message+' 已完成内容会保留。')}
  finally{storyFlowRuns.delete(p.id);if(D.activeProjectId===p.id)renderScripts()}
}
async function storyFlowPrompts(p,shots,run){
  for(let i=0;i<shots.length;i+=6){
    storyFlowCheckpoint(p,run);const chunk=shots.slice(i,i+6),snapshots=chunk.map(s=>JSON.stringify(s));
    storyFlowNotice(p,`3 / 3 · 所选模型正在生成 H3 提示词 ${i+1}–${Math.min(i+6,shots.length)} / ${shots.length}…`);
    const response=await fetch('/api/h3-prompts',{method:'POST',headers:{'Content-Type':'application/json',...(typeof textAIHeaders==='function'?textAIHeaders(p.screenplayModel):(screenplayApiKey?{Authorization:'Bearer '+screenplayApiKey}:{}))},body:JSON.stringify({model:p.screenplayModel||'deepseek-flash',shots:chunk.map(s=>({id:s.id,duration:Number(s.dur),description:compileH3Prompt({...s,prompt:''}),dialogue:s.dialogue||''}))}),signal:AbortSignal.timeout(250000)});
    const out=await response.json();if(!response.ok)throw Error(out.error||'H3 提示词生成失败');
    if(!Array.isArray(out.prompts)||out.prompts.length!==chunk.length||new Set(out.prompts.map(x=>x.id)).size!==chunk.length||out.prompts.some(x=>!chunk.some(s=>s.id===x.id)||!ShotPrompt.isStructured(x.prompt)||/<d\b/i.test(x.prompt)))throw Error('H3 提示词返回不完整，请重试。');
    if(chunk.some((s,j)=>!D.shots.includes(s)||JSON.stringify(s)!==snapshots[j]))throw Error('生成期间镜头被修改，本组提示词未覆盖，请重试。');
    const next=D.shots.map(s=>{const item=out.prompts.find(x=>x.id===s.id&&s.projectId===p.id);return item?{...s,prompt:item.prompt}:s});
    localStorage.setItem('aimovie_data',JSON.stringify({...D,shots:next}));for(const s of chunk)s.prompt=out.prompts.find(x=>x.id===s.id).prompt;
  }
}
async function storyFlowPromptOne(id){const p=activeProject(),s=D.shots.find(x=>x.id===id&&x.projectId===p.id);if(!s||storyFlowRuns.has(p.id))return;const run={story:(p.storyText||'').trim(),pause:false};storyFlowRuns.set(p.id,run);
  try{await storyFlowPrompts(p,[s],run);storyFlowNotice(p,'该镜头的 H3 提示词已生成。')}catch(e){storyFlowNotice(p,e.message)}finally{storyFlowRuns.delete(p.id);renderScripts()}}
function storyFlowEditShot(id,field,value){const s=D.shots.find(x=>x.id===id&&x.projectId===D.activeProjectId);if(!s||!['scene','script','visual','camera','dialogue','prompt','dur'].includes(field))return;
  if(field==='dur'){value=Number(value);if(!Number.isFinite(value)||value<4||value>15){storyFlowNotice(activeProject(),'镜头时长请输入 4–15 秒。');return}}
  const patch={[field]:value,...(field==='visual'?{desc:value}:{})};try{localStorage.setItem('aimovie_data',JSON.stringify({...D,shots:D.shots.map(x=>x===s?{...s,...patch}:x)}));Object.assign(s,patch);storyFlowNotice(activeProject(),field==='prompt'?'H3 提示词已保存。':'镜头修改已保存。若画面或动作改变，可点击“重写本镜 H3”更新提示词。')}catch{storyFlowNotice(activeProject(),'镜头保存失败，请复制当前编辑内容备份。')}}
function storyFlowOutline(){const p=activeProject(),script=currentScreenplay(),batches=(D.storyboardBatches||[]).filter(b=>b.projectId===p.id&&b.sourceScriptId===script?.id),batch=batches.find(b=>b.id===p.storyboardBatchId)||batches.at(-1);
  if(!batch)return '<div class="card empty">自动创作完成后，场景一、二、三及各场景内的镜头将在这里展开。</div>';
  const shots=D.shots.filter(s=>s.projectId===p.id&&s.storyboardBatchId===batch.id).sort((a,b)=>(a.sequence||0)-(b.sequence||0)),groups=StoryFlowModel.groups(shots,batch.sourceContent);
  return `<section class="story-outline"><h2>场景与镜头 · ${groups.length} 场 / ${shots.length} 镜</h2><p class="muted">${batch.sourceContent!==script?.content?'剧本已有修改：下方保留旧版分镜，继续自动创作会新建批次。':'按剧本叙事顺序排列；修改不会改写已有视频。'} · ${shots.filter(s=>s.prompt?.trim()).length} 镜已有 H3 提示词</p>${groups.map(g=>`<details class="card story-scene" open><summary>场景 ${g.index} · ${esc(g.title)} <span class="muted">${g.shots.length} 镜</span></summary>${g.shots.map((s,i)=>`<details class="story-shot"><summary>镜头 ${i+1} · ${esc(s.camera||'景别待定')} · ${s.dur} 秒 · ${s.prompt?.trim()?'H3 已填写':'H3 待生成'}</summary><div class="formgrid">${[['scene','场景名称'],['camera','景别与运镜'],['script','人物行动'],['visual','画面设计'],['dialogue','对白 / 声音'],['prompt','H3 提示词']].map(([field,label])=>`<label>${label}<textarea aria-label="场景${g.index}镜头${i+1}${label}" data-id="${esc(s.id)}" oninput="storyFlowEditShot(this.dataset.id,'${field}',this.value)">${esc(s[field]||'')}</textarea></label>`).join('')}</div><label>时长（秒）<input type="number" min="4" max="15" step="1" value="${s.dur}" data-id="${esc(s.id)}" onchange="storyFlowEditShot(this.dataset.id,'dur',this.value)"></label><p class="muted">对白保持原文依据；生成前会核对说话人、时长和素材。改写画面后，请按需重写本镜 H3。</p><button class="btn" data-id="${esc(s.id)}" onclick="storyFlowPromptOne(this.dataset.id)" ${storyFlowRuns.has(p.id)?'disabled':''}>${s.prompt?.trim()?'重写本镜 H3':'生成本镜 H3'}</button><details><summary>剧本原文依据</summary><p>${esc(s.sourceExcerpt||'')}</p></details></details>`).join('')}</details>`).join('')}</section>`;
}
const storyFlowRender=renderScripts;
renderScripts=function(){storyFlowRender();const p=activeProject(),root=document.getElementById('scripts'),busy=storyFlowRuns.has(p.id),history=p.storyImports||[];
  root.querySelector('.creative-columns').insertAdjacentHTML('beforebegin',`<div class="card story-flow"><div class="toolbar"><label class="btn">上传故事文件<input id="storyFileInput" type="file" accept=".txt,.md,.docx,.pdf,.odt,.html,.htm" aria-label="上传故事文件" onchange="storyFlowImport(this)" ${busy?'disabled':''}></label><button class="btn gold" onclick="storyFlowStart(true)" ${busy?'disabled':''}>${p.storyFlow?'继续自动创作':'自动生成剧本、分镜与 H3'}</button>${p.storyFlow?`<button class="btn" onclick="storyFlowStart(false)" ${busy?'disabled':''}>按当前原文重新生成（保留旧版）</button>`:''}${busy?'<button class="btn" onclick="storyFlowPause()">完成当前步骤后暂停</button>':''}</div><p class="muted">上传成功后自动调用 DeepSeek：原文 → 剧本与资产 → 场景 / 镜头 → H3 提示词。支持 DOCX、文字型 PDF、TXT、MD、ODT、HTML，最大 10 MB / 60,000 字。原文与相关素材会发送至已配置的 DeepSeek；不会自动生成视频。</p><p id="storyFlowStatus" role="status" aria-live="polite">${esc(storyFlowMessages.get(p.id)|| (p.storyFlow?'已保存创作进度，可继续未完成步骤。':'可上传文件自动开始，也可粘贴原文后点击自动生成。'))}</p>${history.length?`<details><summary>最近 ${history.length} 份原文备份</summary>${history.map((h,i)=>`<p>${esc(h.name)} · ${esc(new Date(h.at).toLocaleString())} <button class="btn" onclick="storyFlowRestore(${i})" ${busy?'disabled':''}>恢复这份原文</button></p>`).join('')}</details>`:''}</div>`);
  root.insertAdjacentHTML('beforeend',storyFlowOutline());
  if(currentScreenplay())document.getElementById('screenplayContent').insertAdjacentHTML('afterend',`<button class="btn gold" onclick="storyFlowFromScript()" ${busy?'disabled':''}>用当前剧本生成场景、镜头与 H3</button>`);
  if(busy)root.querySelectorAll('button[onclick="generateScreenplay()"],button[onclick="creativeDraft()"],#screenplayVersion').forEach(el=>el.disabled=true);
};
