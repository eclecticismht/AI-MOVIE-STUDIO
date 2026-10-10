const {validateFirstFrame,firstFramePrompt}=require('./first-frame');
const DialogueContract=require('./dialogue-contract');
const Performance=require('./performance-audio');
// AI MOVIE STUDIO Local Connector. Runs only on 127.0.0.1:8080.
// It accepts H3 jobs from the web cockpit and keeps them local until a real H3 worker is configured.
const http = require("http");
const fs = require("fs");
const path = require("path");
const jobs = new Map();
const submitting = new Set();
const archiveTasks = new Set();
const port = Number(process.env.CONNECTOR_PORT || 8080);
const queueFile = path.join(__dirname, "connector-queue.json");
const comfyUrl = process.env.COMFY_URL || "http://127.0.0.1:8188";
const {updateProgress}=require('./h3-progress');
const {validateReferences,referencePrompt,uploadReference}=require('./reference-assets');
const AssetArchive=require('./generated-asset-archive');
let liveSocket;
function connectProgress() {
  if(typeof WebSocket==='undefined')return;
  liveSocket=new WebSocket(comfyUrl.replace(/^http/,'ws')+'/ws?clientId=ai-movie-studio');
  liveSocket.addEventListener('message',event=>{
    if(typeof event.data!=='string')return;
    try{const message=JSON.parse(event.data),job=[...jobs.values()].find(j=>j.comfyPromptId===message.data?.prompt_id);
      if(job&&['execution_start','executing','progress'].includes(message.type))job.progress=updateProgress(job.progress,message);
    }catch{}
  });
  liveSocket.addEventListener('error',()=>{});
  liveSocket.addEventListener('close',()=>setTimeout(connectProgress,3000).unref());
}
connectProgress();

function renderDimensions(job) {
  const width=job.width??864,height=job.height??480;
  if(![width,height].every(n=>Number.isInteger(n)&&n>=32&&n<=8192&&n%32===0))throw new Error('H3 宽高需为 32 的整数倍，范围 32–8192。');
  return {width,height};
}

try { JSON.parse(fs.readFileSync(queueFile, "utf8")).forEach(job => jobs.set(job.id, job)); } catch (error) { if (error.code !== "ENOENT") console.warn("Could not restore connector queue:", error.message); }
function persistQueue() { fs.writeFileSync(queueFile+'.tmp', JSON.stringify([...jobs.values()], null, 2)); require('./replace-file').replaceFileSync(queueFile+'.tmp',queueFile,fs); }
function archiveCompletedVideo(job){
  if(!job.videoUrl||!job.output?.filename||job.archiveOutput||!AssetArchive.isEnabled(__dirname,job.projectId)||archiveTasks.has(job.id))return;
  archiveTasks.add(job.id);job.archiveStatus='pending';
  Promise.resolve().then(()=>AssetArchive.archiveUrl({root:__dirname,projectId:job.projectId,kind:'h3Video',key:job.id,filename:job.output.filename,url:job.videoUrl,fetchImpl:fetch,shotId:job.shot})).then(asset=>{if(asset){job.archiveOutput=asset;job.archiveStatus='archived'}else job.archiveStatus='skipped'}).catch(error=>{job.archiveStatus='failed';job.archiveError=error.message}).then(()=>{archiveTasks.delete(job.id);jobs.set(job.id,job);try{persistQueue()}catch(error){console.warn('Could not persist generated asset archive status:',error.message)}});
}
function attentionMode(value) {
  const mode=value??'pytorch';
  if(!['pytorch','sage'].includes(mode))throw Error('H3 注意力模式仅支持 pytorch 或 sage。');
  return mode;
}
function h3Steps(value) { if (value === undefined || value === null) return 25; if (value !== 20 && value !== 25) throw Error('H3 画质采样仅支持 20 或 25 步'); return value; }
function h3FrameCount(seconds) { return Math.max(5, 17 * Math.round((Math.max(4, Math.min(15, Number(seconds) || 5)) * 24 - 5) / 17) + 5); }
function comfyGraph(job) { if(job.firstFrame&&(job.references||[]).some(r=>['images','videos'].includes(r.kind)))throw Error('上传参考素材不能与独立首帧同时使用'); const performanceAudio=Performance.validate(job.performanceAudio,job),frames=h3FrameCount(job.duration), prompt=job.dialogueEvents?DialogueContract.bindDialogue(job.prompt,job.dialogueEvents,job.duration,job.references||[],undefined,!!performanceAudio):job.prompt, prefix="AI_MOVIE_STUDIO/"+job.id,dimensions=renderDimensions(job),refs=validateReferences(job.references); const graph= {
  "1":{class_type:"UNETLoader",inputs:{unet_name:"Minimax_H3\\minimax_h3_fl2va_pruned_int8_convrot.safetensors",weight_dtype:"default"}},
  "2":{class_type:"CLIPLoader",inputs:{clip_name:"qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",type:"minimax",device:"default"}},
  "3":{class_type:"VAELoader",inputs:{vae_name:"minimax_h3_video_vae_fp16.safetensors"}},
  "4":{class_type:"VAELoader",inputs:{vae_name:"minimax_h3_audio_vae_fp32.safetensors"}},
  "5":{class_type:"MiniMaxH3Director",inputs:{model:["1",0],video_vae:["3",0],audio_vae:["4",0],clip:["2",0],task_type:"t2v — 文生视频(Text to Video)",global_prompt:prompt,bd_grp_sample:"采样设置",cfg:1,seed:Math.floor(Math.random()*2147483647),frame_rate:24,width:dimensions.width,height:dimensions.height,ref_max_size:Math.max(dimensions.width,dimensions.height),total_frames:frames,timeline_data:JSON.stringify({output:{mode:'fixed',...dimensions}}),bd_grp_advanced:"高级采样 Advanced",steps:h3Steps(job.h3Steps),sampler:"res_multistep",scheduler:"simple",shift_video:12,shift_audio:3,bd_grp_perf:"性能 Performance",clear_vram_between_segments:true,export_source_images:false}},
  "6":{class_type:"CreateVideo",inputs:{images:["5",0],audio:["5",1],fps:["5",2],bit_depth:8}},
  "7":{class_type:"SaveVideo",inputs:{video:["6",0],filename_prefix:prefix,format:"auto",codec:"auto"}}
};
  if(job.firstFrame){
    const frame=validateFirstFrame(job.firstFrame),base=firstFramePrompt(job.prompt),anchored=job.dialogueEvents?DialogueContract.bindDialogue(base,job.dialogueEvents,job.duration,[],frame.speakerPosition,!!performanceAudio):base;
    graph['5'].inputs.task_type='i2v — 图生视频(Image to Video)';
    graph['5'].inputs.global_prompt=anchored;graph['5'].inputs.i2v_groups=['8',0];
    graph['8']={class_type:'MiniMaxH3DirectorGroupImageToVideo',inputs:{prompt:anchored,duration_sec:frames/24,first_frame:['20',0]}};
    graph['20']={class_type:'LoadImage',inputs:{image:frame.file}};
  }else if(refs.length||performanceAudio){
    graph['1'].inputs.unet_name='Minimax_H3\\minimax_h3_ref2va_pruned_int8_convrot.safetensors';
    graph['5'].inputs.task_type='r2v — 参考主体生视频(Reference to Video)';
    graph['5'].inputs.global_prompt=referencePrompt(prompt,refs);
    graph['5'].inputs.r2v_groups=['8',0];
    graph['8']={class_type:'MiniMaxH3DirectorGroupReferenceToVideo',inputs:{prompt:referencePrompt(prompt,refs),duration_sec:frames/24}};
    refs.filter(r=>r.kind!=='videos').forEach((r,i)=>{const id=String(20+i);graph[id]={class_type:'LoadImage',inputs:{image:r.file}};graph['8'].inputs['ref_images.ref_image_'+i]=[id,0]});
    refs.filter(r=>r.kind==='videos').forEach((r,i)=>{const id=String(40+i*2),parts=String(41+i*2);graph[id]={class_type:'LoadVideo',inputs:{file:r.file}};graph[parts]={class_type:'GetVideoComponents',inputs:{video:[id,0]}};graph['8'].inputs['ref_videos.ref_video_'+i]=[parts,0]});
  }
  if(attentionMode(job.h3Attention)==='sage'){
    graph['901']={class_type:'PathchSageAttentionKJ',inputs:{model:['1',0],sage_attention:'auto',allow_compile:false}};
    graph['902']={class_type:'MiniMaxH3MemoryEfficientSageAttentionPatch',inputs:{model:['901',0]}};
    graph['5'].inputs.model=['902',0];
  }
  if(performanceAudio){
    const sample=graph['5'].inputs,approved=Performance.prompt(job.firstFrame?graph['5'].inputs.global_prompt:prompt,job.firstFrame?[]:refs,performanceAudio,job.dialogueEvents,job.firstFrame);
    const media=job.firstFrame?{first_frame:['20',0]}:Object.fromEntries(Object.entries(graph['8'].inputs).filter(([key])=>key.startsWith('ref_images.')||key.startsWith('ref_videos.')));
    graph['60']={class_type:'LoadAudio',inputs:{audio:performanceAudio.file}};
    // Reference audio alone leaves target speech free to drift. Lock its latent during sampling.
    graph['61']={class_type:'MiniMaxH3AudioConditioningT8',inputs:{clip:['2',0],video_vae:['3',0],audio_vae:['4',0],prompt:approved,...dimensions,length:frames,task_type:job.firstFrame?'Hybrid':'Ref2VA',audio_mode:'lock_source',audio_denoise_strength:0,add_source_as_reference:true,prompt_primary_audio_ordinal:1,strict_prompt_tags:true,ref_image_size:'match',reference_video_policy:'official_2_to_15s',drive_audio:['60',0],...media}};
    graph['62']={class_type:'MiniMaxH3DualClockSamplerT8',inputs:{model:sample.model,av_latent:['61',1],steps:sample.steps,shift_video:sample.shift_video,shift_audio:sample.shift_audio,sampler_name:sample.sampler,scheduler:sample.scheduler}};
    graph['63']={class_type:'BasicGuider',inputs:{model:['62',0],conditioning:['61',0]}};
    graph['64']={class_type:'RandomNoise',inputs:{noise_seed:sample.seed}};
    graph['65']={class_type:'SamplerCustomAdvanced',inputs:{noise:['64',0],guider:['63',0],sampler:['62',1],sigmas:['62',2],latent_image:['61',1]}};
    graph['66']={class_type:'MiniMaxH3AVDecodeT8',inputs:{av_latent:['65',0],video_vae:['3',0],audio_vae:['4',0]}};
    graph['6'].inputs={...graph['6'].inputs,images:['66',0],audio:['60',0],fps:24};
    delete graph['5'];delete graph['8'];
  }
  return graph;
}
async function comfyRequest(route, options={}) {
  const response=await fetch(comfyUrl+route,{...options,signal:AbortSignal.timeout(8000)});
  const raw=await response.text(),result=raw.trim()?JSON.parse(raw):{};
  if(!response.ok || result.error) throw Object.assign(new Error(result.error?.message||JSON.stringify(result.error)||`ComfyUI HTTP ${response.status}`),{upstreamRejected:response.status>=400&&response.status<500});
  return result;
}
async function submitToComfy(job) {
  require('./production-policy').assertGenerationAllowed(job.projectId);
  if(job.performanceAudio&&!job.submissionPending&&!job.comfyPromptId)await Performance.upload(job.performanceAudio,job,comfyUrl,fetch);
  return require('./connector-submission').submit(job,{request:comfyRequest,persist:persistQueue,graph:comfyGraph});
}
const statusSyncs=new Map();
function syncComfyStatus(job){if(statusSyncs.has(job.id))return statusSyncs.get(job.id);const task=readComfyStatus(job).finally(()=>statusSyncs.delete(job.id));statusSyncs.set(job.id,task);return task}
async function readComfyStatus(job) {
  if(job.cancelledAt)return job;
  if(job.archiveStatus==='pending'&&job.videoUrl)archiveCompletedVideo(job);
  const recovery=require('./connector-recovery');
  if(job.submissionPending&&!job.comfyPromptId){const result=await require('./connector-submission').reconcile(job,comfyRequest);if(result){recovery.found(job);job.connectorStatus='已找回 ComfyUI 任务'}else recovery.missing(job);persistQueue();}
  if(job.originalVideoUrl){require('./face-refine').processResult(job,{request:comfyRequest,persist:persistQueue,comfyUrl});return job;}
  if(!job.comfyPromptId || job.cancelledAt || job.videoUrl) return job;
  const history=await comfyRequest("/history/"+encodeURIComponent(job.comfyPromptId)),record=history[job.comfyPromptId];
  if(!record) {
    const queue=await comfyRequest('/queue'),pending=(queue.queue_pending||[]).findIndex(x=>x[1]===job.comfyPromptId),running=(queue.queue_running||[]).some(x=>x[1]===job.comfyPromptId);
    if(pending>=0){job.connectorStatus='ComfyUI 排队中';job.progress={phase:'queued',ahead:pending+(queue.queue_running||[]).length,updatedAt:Date.now()}}
    else if(running){job.connectorStatus='ComfyUI 运行中';if(!job.progress||['queued','unknown','missing'].includes(job.progress.phase))job.progress={phase:'loading',updatedAt:Date.now()};job.progress.connected=liveSocket?.readyState===1}
    else recovery.missing(job);
    if(pending>=0||running)recovery.found(job);
    persistQueue();return job;
  }
  recovery.found(job);
  const output=Object.values(record.outputs||{}).flatMap(x=>[...(x.videos||[]),...(x.gifs||[]),...(x.images||[])])
    .find(x=>typeof x.filename==="string" && /\.(mp4|webm|mov|mkv|avi)$/i.test(x.filename));
  job.comfyStatus=record.status?.status_str||"unknown";
  if(job.comfyStatus==="error") {
    const failure=(record.status?.messages||[]).find(x=>x[0]==="execution_error");
    job.connectorStatus="ComfyUI 生成失败："+(failure?.[1]?.exception_message||"请检查 ComfyUI 执行日志");
  } else if(record.status?.completed && output) {
    job.progress={phase:'complete',percent:100};
    const start=record.status.messages?.find(m=>m[0]==='execution_start')?.[1]?.timestamp;
    const end=record.status.messages?.find(m=>m[0]==='execution_success')?.[1]?.timestamp;
    if(start&&end)job.actualSeconds=(end-start)/1000;
    job.connectorStatus="ComfyUI H3 已完成";job.output=output;
    job.completedAt=job.completedAt||new Date().toISOString();
    job.videoUrl=comfyUrl+"/view?filename="+encodeURIComponent(output.filename)+"&subfolder="+encodeURIComponent(output.subfolder||"")+"&type="+encodeURIComponent(output.type||"output");
    archiveCompletedVideo(job);
    if(job.faceRefineMode&&job.faceRefineMode!=='off')require('./face-refine').processResult(job,{request:comfyRequest,persist:persistQueue,comfyUrl});
  } else if(record.status?.completed) job.connectorStatus="ComfyUI 已结束，未找到视频输出";
  jobs.set(job.id,job);persistQueue();return job;
}
const lifecycle=require('./service-lifecycle').createLifecycle({role:'connector',busy:()=>[...(submitting.size?['正在提交生成任务']:[]),...(statusSyncs.size?['正在同步生成结果或修复画面']:[]),...(archiveTasks.size?['正在归档已完成素材']:[])]});
// Continue opted-in post-processing even when the user leaves the queue page.
if(typeof setInterval==='function'){
 let checkingFaces=false;
 setInterval(async()=>{if(checkingFaces||lifecycle.draining())return;checkingFaces=true;try{for(const job of jobs.values())if(job.comfyPromptId&&!job.cancelledAt&&job.faceRefineMode&&job.faceRefineMode!=='off'&&!job.videoUrl&&!['error'].includes(job.comfyStatus)){try{await syncComfyStatus(job)}catch{}}}finally{checkingFaces=false}},5000).unref();
}

function send(response, status, data) {
  response.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Access-Control-Allow-Origin":"http://127.0.0.1:4173", "Access-Control-Allow-Methods":"GET,POST,OPTIONS", "Access-Control-Allow-Headers":"Content-Type"});
  response.end(JSON.stringify(data));
}
function body(request) { return new Promise((resolve, reject) => { const chunks=[];let size=0,failed=false;request.on('error',reject);request.on("data", value => {if(failed)return;const chunk=Buffer.isBuffer(value)?value:Buffer.from(value);size+=chunk.length;if(size>12000000){failed=true;reject(Error("H3 请求过大"));return}chunks.push(chunk)}); request.on("end", () => {if(failed)return;try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || "{}")); } catch (error) { reject(error); } }); }); }

const server=http.createServer(lifecycle.wrap(async (request, response) => {
  const denied=require('./local-request').requestError(request,{port,origins:['http://127.0.0.1:4173']});
  if(denied)return send(response,403,{ok:false,error:denied});
  if (request.method === "OPTIONS") return send(response, 204, {});
  if(request.method==='GET'&&request.url==='/readiness'){
    const state=await require('./renderer-readiness').rendererReadiness(comfyUrl);
    return send(response,state.ok?200:503,state);
  }
  if (request.method === "GET" && request.url === "/health") {let queue=null;try{queue=await comfyRequest("/queue")}catch{}return send(response,200,{ok:true,connector:"AI MOVIE STUDIO Local Connector",node:{name:"NODE_01"},h3WorkerConfigured:true,performanceAudioVersion:2,rendererOnline:!!queue,running:queue?.queue_running?.length??null,queued:queue?.queue_pending?.length??null,historyCount:jobs.size});}
  if (request.method === "GET" && request.url === "/jobs") return send(response, 200, {jobs:[...jobs.values()]});
  if(request.method==='POST'&&request.url==='/reference-videos'){try{const data=await body(request);return send(response,201,await require('./prompt-video').uploadVideo(data.file,comfyUrl))}catch(error){return send(response,400,{error:error.message})}}
  if(request.method==='POST'&&request.url==='/references') {try{const data=await body(request);return send(response,201,await uploadReference(data.dataUrl,comfyUrl))}catch(error){return send(response,400,{error:error.message})}}
  const graphMatch=request.url.match(/^\/jobs\/([^/]+)\/graph$/);
  if (request.method === "GET" && graphMatch) { const job=jobs.get(decodeURIComponent(graphMatch[1])); return job ? send(response,200,{ok:true,prompt:job.executionGraph||comfyGraph(job)}) : send(response,404,{ok:false,error:"Unknown connector job."}); }
  const statusMatch=request.url.match(/^\/jobs\/([^/]+)\/status$/);
  if (request.method === "GET" && statusMatch) { const job=jobs.get(decodeURIComponent(statusMatch[1])); if(!job)return send(response,404,{ok:false,error:"Unknown connector job."}); try{return send(response,200,{ok:true,job:await syncComfyStatus(job)})}catch(error){return send(response,502,{ok:false,error:error.message})} }
  const cancelMatch=request.url.match(/^\/jobs\/([^/]+)\/cancel$/);
  if (request.method === "POST" && cancelMatch) { const job=jobs.get(decodeURIComponent(cancelMatch[1])); if(!job)return send(response,404,{ok:false,error:"Unknown connector job."}); if(submitting.has(job.id))return send(response,409,{ok:false,error:"任务正在提交，请稍后同步状态。"}); if(job.comfyStatus==="success"||job.videoUrl)return send(response,409,{ok:false,error:"Completed H3 jobs cannot be cancelled."}); try { if(job.submissionPending&&!job.comfyPromptId)await require('./connector-submission').reconcile(job,comfyRequest);if(job.comfyPromptId){const queue=await comfyRequest("/queue"),running=(queue.queue_running||[]).some(entry=>entry[1]===job.comfyPromptId);if(running)return send(response,409,{ok:false,error:"H3 is already running; it is not interrupted to protect other GPU work."});await comfyRequest("/queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delete:[job.comfyPromptId]})});}job.connectorStatus="已取消";job.cancelledAt=new Date().toISOString();jobs.set(job.id,job);persistQueue();return send(response,200,{ok:true,job});} catch(error){return send(response,502,{ok:false,error:error.message})} }
  const comfyMatch=request.url.match(/^\/jobs\/([^/]+)\/comfy$/);
  if (request.method === "POST" && comfyMatch) { const job=jobs.get(decodeURIComponent(comfyMatch[1])); if(!job) return send(response,404,{ok:false,error:"Unknown connector job."}); if(job.cancelledAt)return send(response,409,{ok:false,error:"已取消的任务不能重新提交，请创建新任务。"}); if(job.comfyPromptId)return send(response,200,{ok:true,job}); if(submitting.has(job.id))return send(response,409,{ok:false,error:"任务正在提交，请稍后同步状态。"}); submitting.add(job.id); try { const result=await submitToComfy(job); job.connectorStatus="已提交 ComfyUI H3"; job.comfyPromptId=result.prompt_id; job.comfyNumber=result.number; job.submittedAt=new Date().toISOString(); jobs.set(job.id,job); persistQueue(); return send(response,202,{ok:true,job}); } catch(error) { job.connectorStatus=(job.submissionPending?"提交结果待确认：":"ComfyUI 提交失败：")+error.message; jobs.set(job.id,job);persistQueue();return send(response,502,{ok:false,error:error.message,job}); } finally { submitting.delete(job.id); } }
  if (request.method === "POST" && request.url === "/jobs") {
    try { const job = await body(request); if (!job || typeof job.id!=="string" || !job.id.trim() || typeof job.prompt!=="string" || !job.prompt.trim()) return send(response, 400, {ok:false,error:"Job id and H3 prompt are required."}); const prior=jobs.get(job.id); if(prior)return send(response,200,{ok:true,job:prior}); require('./production-policy').assertGenerationAllowed(job.projectId); const h3Attention=attentionMode(job.h3Attention),steps=h3Steps(job.h3Steps),dimensions=renderDimensions(job),references=validateReferences(job.references),firstFrame=validateFirstFrame(job.firstFrame); if(job.mode==='I2VA'&&!firstFrame)throw Error('H3 首帧模式缺少图片'); const dialogueEvents=job.dialogueEvents?DialogueContract.validateEvents(job.dialogueEvents):undefined;const performanceAudio=Performance.validate(job.performanceAudio,{...job,dialogueEvents});if(firstFrame&&dialogueEvents?.some(e=>e.type==='speech'&&e.delivery==='onscreen')&&!firstFrame.speakerPosition)throw Error('H3 首帧镜头请指定画内发声者在画面中的位置');if(dialogueEvents)DialogueContract.bindDialogue(job.prompt,dialogueEvents,job.duration,references,undefined,!!performanceAudio); if(job.mode==='Ref2VA'&&!references.length&&!performanceAudio)throw Error('H3 参考图模式缺少图片'); if(job.sourceFingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(job.sourceFingerprint))throw Error('H3 来源指纹无效'); const {id,prompt,shot,projectId,model,mode,duration,candidates,sourceFingerprint}=job,accepted={id,prompt,shot,projectId,model,mode,duration,candidates,sourceFingerprint,h3Attention,...(job.h3Steps===undefined?{}:{h3Steps:steps}),faceRefineMode:require('./face-refine').mode(job.faceRefineMode),references,...(firstFrame?{firstFrame}:{}),...(dialogueEvents?{dialogueEvents}:{}),...(performanceAudio?{performanceAudio}:{}),...dimensions,mode:firstFrame?'I2VA':references.length||performanceAudio?'Ref2VA':mode,connectorStatus:"已接收，等待 H3 Worker",receivedAt:prior?.receivedAt||new Date().toISOString(),retries:prior?.retries||0}; jobs.set(job.id, accepted); persistQueue(); return send(response, 202, {ok:true,job:accepted}); }
    catch(error) { return send(response, 400, {ok:false,error:error.message.startsWith("H3 ")?error.message:"Invalid JSON job payload."}); }
  }
  send(response, 404, {ok:false,error:"Unknown connector route."});
},{port,origins:['http://127.0.0.1:4173']})).listen(port, "127.0.0.1", () => console.log(`Local Connector: http://127.0.0.1:${port}`));

lifecycle.attach(server);
