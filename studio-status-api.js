const fs=require('fs'),path=require('path');
const FFMPEG=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const COMFY=process.env.COMFY_URL||'http://127.0.0.1:8188';
async function diagnostics(fetchImpl=fetch){
 const get=async route=>{const r=await fetchImpl(COMFY+route,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json()};
 const results=await Promise.allSettled([get('/system_stats'),get('/queue'),get('/object_info')]);
 const [stats,queue,info]=results.map(r=>r.status==='fulfilled'?r.value:null),missing=[];
 for(const name of ['MiniMaxH3Director','MiniMaxH3DirectorGroupImageToVideo','CreateVideo','SaveVideo'])if(!info?.[name])missing.push(name);
 for(const [node,key,model] of [['UNETLoader','unet_name','Minimax_H3/minimax_h3_fl2va_pruned_int8_convrot.safetensors'],['CLIPLoader','clip_name','qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'],['VAELoader','vae_name','minimax_h3_video_vae_fp16.safetensors'],['VAELoader','vae_name','minimax_h3_audio_vae_fp32.safetensors']])if(!info?.[node]?.input?.required?.[key]?.[0]?.some?.(n=>n.replace(/\\/g,'/')===model))missing.push(model);
 const ffmpeg=fs.existsSync(FFMPEG),renderer=!!stats?.devices?.length;
 return {ready:renderer&&!missing.length&&ffmpeg,renderer,ffmpeg,missing,gpu:stats?.devices?.[0]?.name||null,running:queue?.queue_running?.length??null,queued:queue?.queue_pending?.length??null,nodeVersion:process.version,output:{width:1280,height:720,fps:24}};
}
let cached=null,expiry=0,inflight;
async function studioStatusApi(req,res,url){
 if(url!=='/api/studio-status'||req.method!=='GET')return false;
 if(!cached||Date.now()>expiry){inflight||=diagnostics().then(value=>{cached=value;expiry=Date.now()+10000}).finally(()=>{inflight=null});await inflight}
 const masters=[];const dir=path.join(__dirname,'act-films');
 if(fs.existsSync(dir))for(const name of fs.readdirSync(dir).filter(n=>/^act_[a-f0-9]{32}\.json$/.test(n)))try{const s=JSON.parse(fs.readFileSync(path.join(dir,name))),v=s.versions?.at(-1);if(s.enabled&&s.status==='ready'&&v?.approvedAt)masters.push({projectId:s.plan.projectId,actId:s.plan.actId,seconds:v.duration})}catch{}
 res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({...cached,masters,checkedAt:new Date().toISOString()}));return true;
}
module.exports={diagnostics,studioStatusApi};
