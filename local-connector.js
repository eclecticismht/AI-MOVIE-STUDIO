// AI MOVIE STUDIO Local Connector. Runs only on 127.0.0.1:8080.
// It accepts H3 jobs from the web cockpit and keeps them local until a real H3 worker is configured.
const http = require("http");
const fs = require("fs");
const path = require("path");
const jobs = new Map();
const port = Number(process.env.CONNECTOR_PORT || 8080);
const queueFile = path.join(__dirname, "connector-queue.json");
const comfyUrl = process.env.COMFY_URL || "http://127.0.0.1:8188";

try { JSON.parse(fs.readFileSync(queueFile, "utf8")).forEach(job => jobs.set(job.id, job)); } catch (error) { if (error.code !== "ENOENT") console.warn("Could not restore connector queue:", error.message); }
function persistQueue() { fs.writeFileSync(queueFile, JSON.stringify([...jobs.values()], null, 2)); }
function h3FrameCount(seconds) { return Math.max(5, 17 * Math.round((Math.max(4, Math.min(15, Number(seconds) || 5)) * 24 - 5) / 17) + 5); }
function comfyGraph(job) { const frames=h3FrameCount(job.duration), prompt=job.prompt.slice(0, 2000), prefix="AI_MOVIE_STUDIO/"+job.id; return {
  "1":{class_type:"UNETLoader",inputs:{unet_name:"Minimax_H3\\minimax_h3_fl2va_pruned_int8_convrot.safetensors",weight_dtype:"default"}},
  "2":{class_type:"CLIPLoader",inputs:{clip_name:"qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",type:"minimax",device:"default"}},
  "3":{class_type:"VAELoader",inputs:{vae_name:"minimax_h3_video_vae_fp16.safetensors"}},
  "4":{class_type:"VAELoader",inputs:{vae_name:"minimax_h3_audio_vae_fp32.safetensors"}},
  "5":{class_type:"MiniMaxH3Director",inputs:{model:["1",0],video_vae:["3",0],audio_vae:["4",0],clip:["2",0],task_type:"t2v — 文生视频(Text to Video)",global_prompt:prompt,bd_grp_sample:"采样设置",cfg:1,seed:Math.floor(Math.random()*2147483647),frame_rate:24,width:864,height:480,ref_max_size:864,total_frames:frames,timeline_data:"",bd_grp_advanced:"高级采样 Advanced",steps:25,sampler:"res_multistep",scheduler:"simple",shift_video:12,shift_audio:3,bd_grp_perf:"性能 Performance",clear_vram_between_segments:true,export_source_images:false}},
  "6":{class_type:"CreateVideo",inputs:{images:["5",0],audio:["5",1],fps:["5",2],bit_depth:8}},
  "7":{class_type:"SaveVideo",inputs:{video:["6",0],filename_prefix:prefix,format:"auto",codec:"auto"}}
}; }
async function submitToComfy(job) { const response=await fetch(comfyUrl+"/prompt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:"ai-movie-studio",prompt:comfyGraph(job)})}); const result=await response.json(); if(!response.ok || result.error) throw new Error(result.error?.message||result.error||"ComfyUI rejected the H3 graph"); return result; }
async function syncComfyStatus(job) { if(!job.comfyPromptId) return job; const response=await fetch(comfyUrl+"/history/"+encodeURIComponent(job.comfyPromptId)); const history=await response.json(),record=history[job.comfyPromptId]; if(!record) return job; const output=Object.values(record.outputs||{}).flatMap(x=>x.images||[])[0]; job.comfyStatus=record.status?.status_str||"unknown"; if(record.status?.completed&&output){job.connectorStatus="ComfyUI H3 已完成";job.output=output;job.videoUrl=comfyUrl+"/view?filename="+encodeURIComponent(output.filename)+"&subfolder="+encodeURIComponent(output.subfolder||"")+"&type="+encodeURIComponent(output.type||"output");} jobs.set(job.id,job);persistQueue();return job; }

function send(response, status, data) {
  response.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Access-Control-Allow-Origin":"http://127.0.0.1:4173", "Access-Control-Allow-Methods":"GET,POST,OPTIONS"});
  response.end(JSON.stringify(data));
}
function body(request) { return new Promise((resolve, reject) => { let raw=""; request.on("data", chunk => raw += chunk); request.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (error) { reject(error); } }); }); }

http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  if (request.method === "GET" && request.url === "/health") return send(response, 200, {ok:true, connector:"AI MOVIE STUDIO Local Connector", node:{name:"NODE_01",gpu:"RTX Pro 4000 24GB"}, h3WorkerConfigured:false, queued:jobs.size});
  if (request.method === "GET" && request.url === "/jobs") return send(response, 200, {jobs:[...jobs.values()]});
  const graphMatch=request.url.match(/^\/jobs\/([^/]+)\/graph$/);
  if (request.method === "GET" && graphMatch) { const job=jobs.get(decodeURIComponent(graphMatch[1])); return job ? send(response,200,{ok:true,prompt:comfyGraph(job)}) : send(response,404,{ok:false,error:"Unknown connector job."}); }
  const statusMatch=request.url.match(/^\/jobs\/([^/]+)\/status$/);
  if (request.method === "GET" && statusMatch) { const job=jobs.get(decodeURIComponent(statusMatch[1])); if(!job)return send(response,404,{ok:false,error:"Unknown connector job."}); try{return send(response,200,{ok:true,job:await syncComfyStatus(job)})}catch(error){return send(response,502,{ok:false,error:error.message})} }
  const comfyMatch=request.url.match(/^\/jobs\/([^/]+)\/comfy$/);
  if (request.method === "POST" && comfyMatch) { const job=jobs.get(decodeURIComponent(comfyMatch[1])); if(!job) return send(response,404,{ok:false,error:"Unknown connector job."}); try { const result=await submitToComfy(job); job.connectorStatus="已提交 ComfyUI H3"; job.comfyPromptId=result.prompt_id; job.comfyNumber=result.number; job.submittedAt=new Date().toISOString(); jobs.set(job.id,job); persistQueue(); return send(response,202,{ok:true,job}); } catch(error) { job.connectorStatus="ComfyUI 提交失败："+error.message; jobs.set(job.id,job);persistQueue();return send(response,502,{ok:false,error:error.message,job}); } }
  if (request.method === "POST" && request.url === "/jobs") {
    try { const job = await body(request); if (!job.id || !job.prompt) return send(response, 400, {ok:false,error:"Job id and H3 prompt are required."}); const prior=jobs.get(job.id),accepted={...prior,...job,connectorStatus:"已接收，等待 H3 Worker",receivedAt:prior?.receivedAt||new Date().toISOString(),retries:prior?.retries||0}; jobs.set(job.id, accepted); persistQueue(); return send(response, 202, {ok:true,job:accepted}); }
    catch { return send(response, 400, {ok:false,error:"Invalid JSON job payload."}); }
  }
  send(response, 404, {ok:false,error:"Unknown connector route."});
}).listen(port, "127.0.0.1", () => console.log(`Local Connector: http://127.0.0.1:${port}`));
