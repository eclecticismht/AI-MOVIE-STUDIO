async function storyAIRequest(url,body){
 return StoryUnderstanding.checked(storyAIRequestOnce,url,body);
}
async function storyAIRequestOnce(url,body){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(typeof textAIHeaders==='function'?textAIHeaders(body.model):{})},body:JSON.stringify(body),signal:AbortSignal.timeout(250000)}),out=await response.json();
 if(!response.ok)throw Object.assign(Error(out.error||'故事核对失败'),{repair:out.repair});return out;
}
function storyUnderstandingPanel(understanding,review){
 if(!understanding)return '';
 return `<details class="card"><summary>故事理解 · ${understanding.beats.length} 个动作 · ${understanding.facts.length} 条事实${review?.status==='checked'?' · 分镜计划已核对':''}</summary><p class="muted">这是原文与分镜计划的核对，生成后的实际画面仍需观看。</p><p>${understanding.characters.map(c=>esc(c.name)+(c.aliases.length?'（'+c.aliases.map(esc).join('、')+'）':'')).join('；')}</p><ol>${understanding.beats.map(b=>`<li>${esc(b.action)}<br><small>${esc(b.place)} · ${esc(b.time)} · 结果：${esc(b.after)}</small></li>`).join('')}</ol><details><summary>原文事实与依据</summary>${understanding.facts.map(f=>`<p>${esc(f.statement)}<br><small>原文：${esc(f.evidence)}</small></p>`).join('')}</details>${understanding.ambiguities.length?`<p>保持未指定：${understanding.ambiguities.map(esc).join('；')}</p>`:''}${review?.issues?.length?`<p class="warn">${review.issues.map(esc).join('<br>')}</p>`:''}</details>`;
}
async function ensureStoryCoverage(shots){
 const projectId=D.activeProjectId;
 for(const batchId of new Set(shots.map(s=>s.storyboardBatchId))){
  const batch=(D.storyboardBatches||[]).find(b=>b.id===batchId&&b.projectId===projectId);if(!batch?.storyUnderstanding)continue;
  const all=D.shots.filter(s=>s.projectId===projectId&&s.storyboardBatchId===batchId&&!s.autoArchived).sort((a,b)=>(a.sequence||0)-(b.sequence||0)),baseline=StoryUnderstanding.key(batch.storyUnderstanding,all);
  if(batch.storyReview?.status==='checked'&&batch.storyReview.checkedKey===baseline)continue;
  const out=await storyAIRequest('/api/screenplay/coverage',{story:batch.sourceStory,storyUnderstanding:batch.storyUnderstanding,shots:all.map(StoryUnderstanding.shotContent),model:activeProject().screenplayModel||batch.model});
  const current=D.shots.filter(s=>s.projectId===projectId&&s.storyboardBatchId===batchId&&!s.autoArchived).sort((a,b)=>(a.sequence||0)-(b.sequence||0));
  if(D.activeProjectId!==projectId||baseline!==StoryUnderstanding.key(batch.storyUnderstanding,current))throw Error('故事核对期间分镜已修改，请重新检查');
  if(out.review?.status!=='checked')throw Error('分镜与原文尚不一致，未提交视频：\n'+(out.review?.issues||['复核结果不完整']).join('\n'));
  const mapped=StoryUnderstanding.annotate(current.map((s,i)=>({...s,beatIds:out.review.beatIds?.[i]||s.beatIds})),batch.storyUnderstanding);
  if(out.review.checkedKey!==StoryUnderstanding.key(batch.storyUnderstanding,mapped))throw Error('故事复核与当前分镜不匹配，请重新检查');
  const next={...batch,storyReview:out.review},batches=D.storyboardBatches.map(b=>b===batch?next:b),byId=new Map(mapped.map(s=>[s.id,s]));
  localStorage.setItem('aimovie_data',JSON.stringify({...D,shots:D.shots.map(s=>byId.get(s.id)||s),storyboardBatches:batches}));
  // Keep callers' shot references current without changing their creative content.
  current.forEach((s,i)=>{s.beatIds=mapped[i].beatIds;s.storyBinding=mapped[i].storyBinding});D.storyboardBatches=batches;
 }
}
