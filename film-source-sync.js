(function(root){
 const omitted=new Set(['status','filmPrompt','filmPromptVersion','filmPromptSource']);
 function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));return value;}
 async function fingerprint(shot,data){
  const source=Object.fromEntries(Object.entries(shot).filter(([k])=>!omitted.has(k)));
  const assets={};for(const [kind,key] of [['characters','characterIds'],['scenes','sceneIds'],['props','propIds']])assets[kind]=(shot[key]||[]).map(id=>(data[kind]||[]).find(a=>a.id===id&&a.projectId===shot.projectId)||{id,missing:true});
  const bytes=new TextEncoder().encode(JSON.stringify(canonical({source,assets})));
  return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 }
 function apply(shot,validated,expected,actual){
  if(!expected)throw Error('此旧版本未保存来源校验信息，不能安全覆盖；请到分镜页核对修改。');
  if(expected!==actual)throw Error('原分镜或引用资产已修改，已阻止覆盖。请到分镜页核对差异。');
  if(!shot||shot.autoArchived||shot.id!==validated.shotId)throw Error('原分镜已删除或归档');
  const next={...shot,prompt:validated.prompt,dialogue:validated.subtitle,dur:validated.duration,audioMode:validated.audioMode,audioAsset:validated.audioAsset,cropBottomPercent:validated.cropBottomPercent??0,status:'需重做'};
  for(const k of ['filmPrompt','filmPromptSource','filmPromptVersion'])delete next[k];
  return next;
 }
 function replaceWithDependents(shots,current,next){
  if(!shots.includes(current)||current.id!==next.id||current.projectId!==next.projectId)throw Error('来源分镜已改变');
  const affected=new Set([current.id]);
  // Follow actual links rather than storage order. Stop at independent shots and project/batch boundaries.
  let changed=true;while(changed){changed=false;for(const s of shots){
   if(s.autoArchived||s.projectId!==current.projectId||s.storyboardBatchId!==current.storyboardBatchId||affected.has(s.id))continue;
   if(affected.has(s.continueFromShotId)){affected.add(s.id);changed=true;}
  }}
  const result=shots.map(s=>{
   if(s.projectId!==current.projectId||s.storyboardBatchId!==current.storyboardBatchId||s.autoArchived||!affected.has(s.id))return s;
   const updated={...(s===current?next:s),status:'需重做'};
   for(const k of ['filmPrompt','filmPromptSource','filmPromptVersion','videoUrl','subtitleTiming','speechCheck','speechCheckHistory','continuityFrame'])delete updated[k];
   return updated;
  });
  return {shots:result,dependentIds:[...affected].filter(id=>id!==current.id)};
 }
 const api={fingerprint,apply,replaceWithDependents};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilmSourceSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
