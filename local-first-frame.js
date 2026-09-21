const {validateReferences,referenceVisualNotes}=require('./reference-assets');
const MODELS={unet:'Krea2\\krea2_turbo_fp8_scaled.safetensors',clip:'qwen3vl_4b_fp8_scaled.safetensors',vae:'qwen_image_vae.safetensors',lora:'krea2_identity_edit_v1_2_r128.safetensors'};
function validatePlan(input){
  const references=validateReferences(input.references);
  if(!references.length)throw Error('本地首帧至少需要一张资产图片。');
  const prompt=String(input.prompt||'').trim();if(!prompt||prompt.length>16000)throw Error('请填写本镜画面设计（最多16000字）。');
  const width=Number(input.width||1024),height=Number(input.height||576);
  if(![width,height].every(x=>Number.isInteger(x)&&x>=256&&x<=1536&&x%16===0)||width*height>1572864)throw Error('首帧尺寸须为16的倍数，边长256–1536，总像素不超过150万。');
  const projectId=String(input.projectId||''),shotId=String(input.shotId||'');
  if(!projectId||!shotId||projectId.length>120||shotId.length>120)throw Error('缺少项目或分镜标识。');
  // Keep people together in the first pass when possible; every remaining asset gets its own pass.
  const order=references.filter(r=>r.kind==='characters').length>=2?{characters:0,scenes:1,props:2}:{scenes:0,characters:1,props:2};
  references.sort((a,b)=>order[a.kind]-order[b.kind]);
  return {projectId,shotId,prompt,width,height,references,compositionVersion:'paired-scene-v1'};
}
function executionSteps(plan){
 const refs=plan.references,people=refs.filter(r=>r.kind==='characters'),scene=refs.find(r=>r.kind==='scenes');
 if(plan.compositionVersion==='paired-scene-v1'&&people.length===2&&scene){const first=[scene,...people],ids=new Set(first.map(r=>r.assetId));return [first,...refs.filter(r=>!ids.has(r.assetId)).map(r=>[r])];}
 return [refs.slice(0,2),...refs.slice(2).map(r=>[r])];
}
function passReferences(plan,index,previous){
  const steps=executionSteps(plan);if(index===0)return steps[0];
  const composition={name:'上一轮完整构图',kind:'composition',file:previous},next=steps[index][0];
  return next.kind==='scenes'?[next,composition]:[composition,next];
}
function buildGraph(plan,index,previous,id){
  const refs=passReferences(plan,index,previous),node=(class_type,inputs)=>({class_type,inputs});
  // Shot overrides are the visual specification. Biographical history can introduce wrong-era clothes/props.
  const notes=referenceVisualNotes;
  const edit=!refs[1]?'Use Image A as the visual reference. Preserve its subject identity, structure and materials while adapting to the shot.':refs[0].kind==='scenes'?'Use Image A as the exact setting. Place the person or people from Image B naturally into Image A, replacing their old background entirely. Preserve their distinct facial identities and exact clothes from Image B.':index&&refs[1].kind==='props'?'Image B is authoritative for the requested prop. Replace the corresponding placeholder object in Image A with that exact prop, preserving its distinctive shape, material, wear, damage and attachments. Do not preserve a conflicting placeholder design and do not duplicate the object. Preserve every other person, face, garment, object, pose and camera position in Image A. Screen-interface references change only the content inside the existing device screen.':index?'Preserve all people, faces, clothing and objects already present in Image A. Incorporate only the requested subject from Image B.':'Use the two referenced people as distinct individuals. Preserve each face and exact clothing construction from their own image, including sleeve colors and stripe count.';
  const pair=refs.length===3;
  const instruction=`Create one photorealistic cinematic opening frame, not a collage. ${edit}\nShot: ${plan.prompt}\nImage A: ${refs[0].name}. ${notes(refs[0])}\n${pair?`Image B is a joined reference of TWO DIFFERENT people: on the left ${refs[1].name}, ${notes(refs[1])}; on the right ${refs[2].name}, ${notes(refs[2])}. Place BOTH into the setting, preserving their left/right identities, exact separate faces, hairstyles, collar colors, sleeve colors and chest stripe shapes. Each wears only their own clothes from Image B. Remove the studio background and join line; render one continuous scene.`:refs[1]?`Image B: ${refs[1].name}. ${notes(refs[1])}`:''}\n${refs.every(r=>r.kind==='characters')&&refs.length===2?'Keep person A on the left and person B on the right, with their original distinct faces, hairstyles, collars and sleeve designs. Do not dress B in A’s clothes or duplicate A’s face.':''}\nCurrent-shot state overrides all historical biographical details. Prop reference images define identity and materials, not the required orientation or pose. When the shot requires an object turned over, rotated, closed, or held differently, render that specified state rather than copying the reference viewpoint. ${/phone|手机/i.test(plan.prompt)?'A face-down phone shows its opaque back and rear camera, never its display.':''} Keep the object on the specified support surface. Follow the shot composition. No invented badges, logos, captions, speech bubbles or readable text. Screen UI references describe content on an existing device, never a new physical object or floating panel. Do not copy unrelated people from backgrounds. This is a still frame; do not depict sequential actions as multiple panels.`;
  const g={
    '1':node('UNETLoader',{unet_name:MODELS.unet,weight_dtype:'default'}),
    '2':node('CLIPLoader',{clip_name:MODELS.clip,type:'krea2',device:'default'}),
    '3':node('VAELoader',{vae_name:MODELS.vae}),
    '4':node('LoraLoaderModelOnly',{model:['1',0],lora_name:MODELS.lora,strength_model:1}),
    '5':node('LoadImage',{image:refs[0].file}),
    '6':node('VAEEncode',{pixels:['5',0],vae:['3',0]}),
    '9':node('EmptySD3LatentImage',{width:plan.width,height:plan.height,batch_size:1}),
    '10':node('Krea2EditModelPatch',{model:['4',0],source_latent:['6',0],vae:['3',0],source_image:['5',0],target_latent:['9',0],fit_mode:'fit',ref_boost:4,ref_boost_a:refs[0].kind==='characters'?2:1}),
    '11':node('Krea2EditGroundedEncode',{clip:['2',0],prompt:instruction,image:['5',0],grounding_px:768,system_prompt:''}),
    '12':node('Krea2EditGroundedEncode',{clip:['2',0],prompt:'',image:['5',0],grounding_px:768,system_prompt:''}),
    '13':node('KSampler',{model:['10',0],positive:['11',0],negative:['12',0],latent_image:['9',0],seed:parseInt(require('crypto').createHash('sha256').update(id+':'+index).digest('hex').slice(0,12),16),steps:10,cfg:1,sampler_name:'euler',scheduler:'simple',denoise:1}),
    '14':node('VAEDecode',{samples:['13',0],vae:['3',0]}),
    '15':node('SaveImage',{images:['14',0],filename_prefix:`AI_MOVIE_STUDIO/frames/${id}_${index}`})
  };
  if(refs[1]){g['7']=node('LoadImage',{image:refs[1].file});g['8']=node('VAEEncode',{pixels:['7',0],vae:['3',0]});Object.assign(g['10'].inputs,{source_latent_b:['8',0],source_image_b:['7',0]});g['11'].inputs.image_b=['7',0];g['12'].inputs.image_b=['7',0];}
  if(pair){g['16']=node('LoadImage',{image:refs[2].file});g['17']=node('ImageStitch',{image1:['7',0],image2:['16',0],direction:'right',match_image_size:true,spacing_width:0,spacing_color:'white'});g['8'].inputs.pixels=['17',0];g['10'].inputs.source_image_b=['17',0];g['11'].inputs.image_b=['17',0];g['12'].inputs.image_b=['17',0];}
  return g;
}
module.exports={MODELS,validatePlan,buildGraph,passReferences,executionSteps};
