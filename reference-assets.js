// Shared validation and Ref2VA prompt binding. No remote URLs are fetched by the server.
function validateReferences(refs=[]){
  if(!Array.isArray(refs)||refs.length>9)throw Error('H3 每镜最多引用 9 张资产图片，请拆分镜头。');
  const ids=new Set();
  return refs.map(r=>{
    if(!r||typeof r.assetId!=='string'||ids.has(r.assetId)||!['characters','scenes','props'].includes(r.kind)||typeof r.name!=='string'||!/^ams-ref-[a-f0-9]{64}\.(png|jpg|webp)$/.test(r.file||''))throw Error('H3 资产参考图无效，请重新入队。');
    ids.add(r.assetId);return {assetId:r.assetId,kind:r.kind,name:r.name.slice(0,120),notes:String(r.notes||'').slice(0,3000),file:r.file};
  });
}
const referenceVisualNotes=require('./reference-visual-notes');
function referencePrompt(prompt,refs){
  if(!refs.length)return prompt;
  const part=(name,next,fallback)=>{const start=prompt.indexOf(name+':');if(start<0)return fallback;const end=next?prompt.indexOf(next+':',start):-1;return prompt.slice(start+name.length+1,end<0?undefined:end).trim()};
  let detail=part('detailed_description','overall_soundscape',part('integrated_multimodal_description','overall_soundscape',prompt));
  const identityRules=refs.filter(r=>r.kind==='characters').length?'Reference identity and wardrobe lock: match each person to their own reference face, hairstyle, and garment construction throughout the shot. Keep different people distinct; do not blend or swap their faces or costumes. Preserve the visible stripe count, collar and zipper design. Do not invent badges, emblems, text or logos absent from that person’s reference image.':'';
  if(identityRules&&!detail.includes('Reference identity and wardrobe lock:'))detail+='\n\n'+identityRules;
  return `subject_definitions:\n${refs.map((r,i)=>`<Subject ${i+1}> is ${r.name}, the ${r.kind==='characters'?'character':r.kind==='scenes'?'environment':'prop'} from <Picture ${i+1}>. ${referenceVisualNotes(r)}`).join('\n')}\n\nsummary:\nCreate one continuous shot following the action below. Use referenced subjects only where the shot calls for them; off-screen speakers stay off-screen.\n\nretention_analysis:\n${refs.map((r,i)=>`<Subject ${i+1}>: fully_preserved - retain ${r.kind==='characters'?'facial identity, hair, age and clothing':r.kind==='scenes'?'spatial layout, architecture and furnishings':'shape, material and color'} from <Picture ${i+1}>. Adapt camera angle and lighting to the shot. Explicit current-shot state notes override historical states or clothing in the asset profile; screen text reference cards specify content, not a new physical object. Do not copy unrelated people or backgrounds from a character or prop reference.`).join('\n')}\n\ndetailed_description:\n${detail}\n\noverall_soundscape:\n${part('overall_soundscape','non_diegetic_music','Natural location ambience; no added dialogue.')}\n\nnon_diegetic_music:\n${part('non_diegetic_music',null,'N/A')}`;
}
async function uploadReference(dataUrl,comfyUrl,fetchImpl=fetch){
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');
  if(!match)throw Error('请导入 PNG、JPEG 或 WebP 资产图片。');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<12||bytes.length>8*1024*1024)throw Error('资产参考图须小于 8MB。');
  const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid)throw Error('资产图片内容与格式不符。');
  const file='ams-ref-'+require('node:crypto').createHash('sha256').update(bytes).digest('hex')+'.'+(match[1]==='jpeg'?'jpg':match[1]);
  const form=new FormData();form.append('image',new Blob([bytes],{type:'image/'+match[1]}),file);form.append('type','input');form.append('overwrite','true');
  const response=await fetchImpl(comfyUrl+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
  const out=await response.json();if(!response.ok||out.name!==file||out.subfolder)throw Error('参考图上传失败，请检查 ComfyUI。');
  return {file};
}
module.exports={validateReferences,referencePrompt,referenceVisualNotes,uploadReference};
