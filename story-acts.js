(function(root){
 const names=['一','二','三','四','五','六','七','八','九','十'];
 const title=i=>'场次'+(names[i-1]||i);
 const ordered=shots=>shots.filter(s=>!s.autoArchived).slice().sort((a,b)=>(a.sequence||0)-(b.sequence||0));
 function normalize(saved,shots){
  shots=ordered(shots);const ids=new Set(shots.map(s=>s.id)),seen=new Set();
  if(Array.isArray(saved)&&!saved.length)return [];
  const acts=(saved?.length?saved:[{id:'act-1',title:title(1),content:'',shotIds:shots.map(s=>s.id)}]).map((a,i)=>({...a,title:a.title||title(i+1),content:a.content||'',shotIds:(a.shotIds||[]).filter(id=>{if(!ids.has(id)||seen.has(id))return false;seen.add(id);return true})}));
  acts[0].shotIds.push(...shots.filter(s=>!seen.has(s.id)).map(s=>s.id));return acts;
 }
 function auto(source,shots){
  const regex=/^\s*(?:(?:第[0-9一二三四五六七八九十百]+场(?!景))|(?:场次\s*[0-9一二三四五六七八九十百]+)|(?:场景\s*[0-9一二三四五六七八九十百]+)|(?:(?:INT\.?|EXT\.?)\s*[.．/\-\s])|(?:(?:内景|外景)\s*[·：:—\-]))[^\n]*/gm;
  const headings=[...String(source||'').matchAll(regex)];
  if(!headings.length)return [{id:'act-1',title:title(1),content:source||'',shotIds:ordered(shots).map(s=>s.id)}];
  const acts=headings.map((h,i)=>({id:'act-'+(i+1),title:title(i+1)+' · '+h[0].trim(),content:source.slice(i===0?0:h.index,headings[i+1]?.index??source.length).trim(),shotIds:[]}));
  let last=0;
  for(const s of ordered(shots)){
   const excerpt=(s.sourceExcerpt||'').trim(),at=excerpt?source.indexOf(excerpt):-1;
   if(at>=0){last=Math.max(0,headings.filter(h=>h.index<=at).length-1)}
   else{const matches=acts.map((a,i)=>({a,i})).filter(({a})=>s.scene&&a.title.includes(s.scene));if(matches.length===1)last=matches[0].i;}
   acts[last].shotIds.push(s.id);
  }return acts;
 }
 function remove(acts,id){if(!acts.some(a=>a.id===id))throw Error('场次不存在');return acts.filter(a=>a.id!==id).map(a=>({...a,shotIds:[...a.shotIds]}))}
 function move(acts,shotId,target){if(!acts.some(a=>a.id===target))throw Error('目标场次不存在');return acts.map(a=>({...a,shotIds:[...a.shotIds.filter(id=>id!==shotId),...(a.id===target?[shotId]:[])]}))}
 const api={normalize,auto,remove,move,title,ordered};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StoryActs=api;
})(typeof globalThis!=='undefined'?globalThis:this);
