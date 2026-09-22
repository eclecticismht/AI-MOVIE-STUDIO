(function(root){
 const ids=acts=>new Set(acts.flatMap(a=>[...(a.shotIds||[]),...(a.retiredShotIds||[])]));
 function reconcile(data,projectId,key,before,after){
  const p=data.projects.find(p=>p.id===projectId),old=ids(before),keep=ids(after),removed=new Set([...old].filter(id=>!keep.has(id)));
  data.shots=data.shots.map(s=>{
   if(s.projectId!==projectId)return s;
   if(removed.has(s.id)&&!s.autoArchived)return {...s,autoArchived:true,deletedWithAct:key};
   if(keep.has(s.id)&&s.deletedWithAct===key){const next={...s};delete next.autoArchived;delete next.deletedWithAct;return next;}
   return s;
  });
  for(const [batch,edit] of Object.entries(p.timelineEdits||{})){
   const source=data.shots.filter(s=>s.projectId===projectId&&s.storyboardBatchId===batch).slice().sort((a,b)=>a.sequence-b.sequence).map(s=>s.id);
   const order=[...new Set(edit.order||[])],clips={...edit.clips};
   for(let i=0;i<source.length;i++)if(!order.includes(source[i])){const successor=source.slice(i+1).find(id=>order.includes(id));order.splice(successor?order.indexOf(successor):order.length,0,source[i]);}
   for(let i=0;i<order.length;i++){if(removed.has(order[i]))delete clips[order[i]];else if(removed.has(order[i+1]))clips[order[i]]={...clips[order[i]],transition:'cut',transitionDuration:0};}
   const active=new Set(data.shots.filter(s=>s.projectId===projectId&&!s.autoArchived&&s.storyboardBatchId===batch).map(s=>s.id));
   p.timelineEdits[batch]={...edit,order:order.filter(id=>active.has(id)),clips};
  }
  return removed;
 }
 // Recognize only the exact old delete operation; auto-regrouping is not deletion.
 function migrate(data){let changed=false;
  for(const p of data.projects||[])for(const [key,saved] of Object.entries(p.storyActs||{})){
   if(saved.deletionVersion||!Array.isArray(saved.acts)||!saved.history?.length)continue;
   const prior=saved.history.at(-1);if(!Array.isArray(prior)||prior.length!==saved.acts.length+1)continue;
   const deleted=prior.find(a=>!saved.acts.some(b=>b.id===a.id));if(!deleted)continue;
   const index=prior.indexOf(deleted),legacy=structuredClone(prior);legacy.splice(index,1);if(legacy.length)legacy[Math.max(0,index-1)].shotIds.push(...deleted.shotIds);
   if(JSON.stringify(legacy)!==JSON.stringify(saved.acts))continue;
   const next=prior.filter(a=>a.id!==deleted.id);reconcile(data,p.id,key,prior,next);saved.acts=next;saved.deletionVersion=1;changed=true;
  }return changed;
 }
 const api={reconcile,migrate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StoryActDeletion=api;
})(typeof globalThis!=='undefined'?globalThis:this);
