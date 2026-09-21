(function(root){
 const pick=(object,keys)=>Object.fromEntries(keys.filter(k=>object?.[k]!==undefined).map(k=>[k,object[k]]));
 const image=value=>String(value||'').startsWith('data:')?'[embedded image; available in project]':value||'';
 function audit(doc){
  const normalize=s=>String(s||'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'');
  const story=String(doc.project.storyText||''),quoted=[...story.matchAll(/["“「]([^"”」]+)["”」]/g)].map(m=>m[1]).join('');
  const issues=[],characters=doc.assets.characters||[];
  const dialogue=typeof module!=='undefined'&&module.exports?require('./dialogue-contract'):root.DialogueContract;
  doc.shots.forEach((shot,i)=>{
   if(shot.actionReviewRequired)issues.push({index:i+1,shotId:shot.id,kind:'action-review',message:'拆镜后人物行动与画面设计尚未复核'});
   try{const events=dialogue.parseDialogue(shot.dialogue,characters);dialogue.checkSource(events,shot.sourceExcerpt);dialogue.bindDialogue('visual',events,Number(shot.dur));
    for(const e of events.filter(e=>e.type==='speech'))if(story&&!e.text.split(/[。！？!?]/).filter(t=>normalize(t)).every(t=>normalize(story).includes(normalize(t))||normalize(quoted).includes(normalize(t))))issues.push({index:i+1,shotId:shot.id,kind:'story-dialogue',message:'口头台词未在故事原文或连续引语中找到，需核对是否获得改编授权',text:e.text});
   }catch(e){issues.push({index:i+1,shotId:shot.id,kind:'dialogue',message:e.message})}
   for(const [kind,key] of [['characters','characterIds'],['scenes','sceneIds'],['props','propIds']])for(const id of shot[key]||[])if(!(doc.assets[kind]||[]).some(a=>a.id===id))issues.push({index:i+1,shotId:shot.id,kind:'asset',message:'引用的资产不存在：'+id});
  });
  return {shots:doc.shots.length,plannedSeconds:doc.shots.reduce((n,s)=>n+Number(s.dur),0),issues,note:'文字检查仅提供线索，不能自动证明说话人、视觉一致性、故事覆盖与成片质量。'};
 }
 function snapshot(project,batch,shots,assets,validation){
  if(!project||!batch||batch.projectId!==project.id||!shots.length||shots.some(s=>s.projectId!==project.id||s.storyboardBatchId!==batch.id))throw Error('请选择同一项目的单一分镜批次');
  return {version:1,project:pick(project,['id','name','storyText','screenplayNotes','h3Width','h3Height']),batch:pick(batch,['id','sourceScriptId','sourceTitle','sourceContent','notes','timing']),shots:shots.map(s=>({...pick(s,['id','sequence','actionReviewRequired','sourceExcerpt','script','visual','desc','camera','char','scene','prompt','filmPrompt','filmPromptVersion','filmPromptSource','firstFrameIntent','dialogue','dur','characterIds','sceneIds','propIds','renderMode','screenAssetId','screenImagePercent','screenSource','audioMode','audioAsset','continueFromShotId','firstFrameSpeakerPosition']),firstFrameUrl:image(s.firstFrameUrl),assetStates:Object.fromEntries(Object.entries(s.assetStates||{}).map(([id,state])=>[id,pick(state,['description','imageUrl','screenText','screenEffect','presence'])]))})),assets:Object.fromEntries(['characters','scenes','props'].map(kind=>[kind,(assets[kind]||[]).filter(a=>a.projectId===project.id).map(a=>({...pick(a,['id','name','type','notes','prompt']),imageUrl:image(a.imageUrl)}))])),validation};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={snapshot,audit};else{
  root.ProductionReview={snapshot,audit};
  root.saveProductionReview=async function(button){
   const output=button.parentElement.querySelector('[data-production-audit]');
   try{if(editingShotId)throw Error('请先保存正在编辑的分镜');const shots=document.getElementById('edit')?.classList.contains('on')?filmPlanShots().shots:visibleStoryboardShots();const batch=(D.storyboardBatches||[]).find(b=>b.id===shots[0]?.storyboardBatchId),doc=snapshot(activeProject(),batch,shots,D,auditProductionShots(shots));
    button.disabled=true;const response=await fetch('/api/production-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)}),result=await response.json();if(!response.ok)throw Error(result.error);output.innerHTML=`<p>已保存本地制作检查包：${shots.length} 镜。<a href="${esc(result.url)}" target="_blank" rel="noopener">查看检查包</a>。不含连接密钥，未触发生成。</p>`;
   }catch(error){output.textContent=error.message}finally{button.disabled=false}
  };
 }
})(typeof globalThis!=='undefined'?globalThis:this);
