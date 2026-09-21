// Local asset fixture generator for the story regression; no cloud service.
const fs=require('node:fs'),path=require('node:path');
const {MODELS}=require('./local-first-frame');
const rows=[
 ['water-bottle','矿泉水瓶','One ordinary transparent 500 ml plastic drinking water bottle, blue screw cap, half filled, no brand or text. Isolated full object on neutral grey tabletop, photorealistic film prop, diffuse light.'],
 ['smoking-set','香烟与打火机','One small unbranded plain cigarette packet, one white cigarette with brown filter, one simple translucent red disposable pocket lighter. Three separate objects lying close together on neutral grey tabletop. Photorealistic film props, no logos, no text, no hands.'],
 ['chopsticks','木筷子','Exactly one pair of simple worn brown wooden chopsticks lying parallel on neutral grey tabletop. Photorealistic film prop, full objects visible, diffuse light, no other objects, no hands, no text.']
];
const base='http://127.0.0.1:8188',node=(class_type,inputs)=>({class_type,inputs});
async function json(url,options){const r=await fetch(base+url,options);const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d}
(async()=>{
 const q=await json('/queue');if(q.queue_running.length||q.queue_pending.length)throw Error('ComfyUI has active tasks; retry after they finish.');
 const dir='assets/laoshiren-v2';fs.mkdirSync(dir,{recursive:true});
 for(const [i,[slug,name,prompt]] of rows.entries()){
  const g={'1':node('UNETLoader',{unet_name:MODELS.unet,weight_dtype:'default'}),'2':node('CLIPLoader',{clip_name:MODELS.clip,type:'krea2',device:'default'}),'3':node('VAELoader',{vae_name:MODELS.vae}),'4':node('CLIPTextEncode',{clip:['2',0],text:prompt}),'5':node('CLIPTextEncode',{clip:['2',0],text:''}),'6':node('EmptySD3LatentImage',{width:768,height:768,batch_size:1}),'7':node('KSampler',{model:['1',0],positive:['4',0],negative:['5',0],latent_image:['6',0],seed:918100+i,steps:10,cfg:1,sampler_name:'euler',scheduler:'simple',denoise:1}),'8':node('VAEDecode',{samples:['7',0],vae:['3',0]}),'9':node('SaveImage',{images:['8',0],filename_prefix:'AI_MOVIE_STUDIO/props/'+slug})};
  const submitted=await json('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:g})});
  fs.writeFileSync('test-artifacts/prop-'+slug+'.json',JSON.stringify({name,prompt,promptId:submitted.prompt_id,graph:g},null,2));console.log('Started '+slug);
  for(;;){const h=(await json('/history/'+submitted.prompt_id))[submitted.prompt_id];if(h?.status?.status_str==='error')throw Error(JSON.stringify(h.status));const img=h?.outputs?.['9']?.images?.[0];if(img){const r=await fetch(base+'/view?'+new URLSearchParams(img));if(!r.ok)throw Error('Image download failed');fs.writeFileSync(path.join(dir,slug+'.png'),Buffer.from(await r.arrayBuffer()));break;}await new Promise(r=>setTimeout(r,4000));}
  console.log('Saved '+slug);
 }
 fs.writeFileSync(path.join(dir,'props-completion.json'),JSON.stringify({createMissing:true,assets:rows.map(([slug,name,prompt])=>({kind:'props',name,type:'核心道具',notes:prompt,imageUrl:'/assets/laoshiren-v2/'+slug+'.png'}))},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
