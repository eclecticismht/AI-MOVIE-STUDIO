const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFile}=require('child_process');
const locks=new Set();
function mode(value){if(value===undefined)return 'off';if(!['auto','on','off'].includes(value))throw Error('H3 人脸精修选项无效');return value}
function eligibility(job){
 if(mode(job.faceRefineMode)==='off')return '未启用自动精修';
 if(/背影|背对镜头|人脸不入画|脸不入画|仅.*(?:手部|设备).*特写|back view|back to (?:the )?camera|face.*out of frame/i.test(job.prompt))return '背影或脸部不入画，跳过精修';
 const refs=(job.references||[]).filter(r=>r.kind==='characters');
 if(refs.length!==1)return refs.length?'多人镜头需要手动选脸，避免修错人物':'没有唯一现场角色参考图，跳过精修';
 return '';
}
function decide(analysis,forced=false){
 const samples=analysis?.samples;if(!Array.isArray(samples)||samples.length<3)return {refine:false,reason:'有效抽帧不足，保留原视频'};
 if(samples.some(s=>s.length>1))return {refine:false,reason:'检测到多人脸，需要手动选脸'};
 const faces=samples.flat();if(faces.length<3)return {refine:false,reason:'没有稳定检测到正面或侧面人脸'};
 const small=faces.filter(f=>f.pixels<96).length,blur=faces.filter(f=>f.blur<60).length;
 return forced||small>=Math.ceil(faces.length/2)||blur>=Math.ceil(faces.length/2)?{refine:true,reason:forced?'手动要求精修可见人脸':small>=Math.ceil(faces.length/2)?'多数抽帧人脸小于 96 像素':'多数抽帧人脸清晰度偏低'}:{refine:false,reason:'抽帧人脸尺寸和清晰度达到自动阈值'};
}
function graph(job,file){const g=JSON.parse(fs.readFileSync(path.join(__dirname,'workflows/face-refine-api.json'),'utf8').replace(/^\uFEFF/,''));g['1'].inputs.video=file;g['6'].inputs.image=job.references.find(r=>r.kind==='characters').file;g['9'].inputs.prompt=job.prompt;g['23'].inputs.filename_prefix='AI_MOVIE_STUDIO/FaceRefine/'+crypto.createHash('sha256').update(job.id).digest('hex').slice(0,20);return g}
function detect(file){const root=process.env.COMFY_ROOT||'C:\\AI\\Comfy UI\\ComfyUI';return new Promise((resolve,reject)=>execFile(process.env.FACE_REFINE_PYTHON||path.join(root,'.venv/Scripts/python.exe'),[path.join(__dirname,'face-refine-detect.py'),file,path.join(root,'models/ultralytics/bbox/face_yolov8m.pt')],{windowsHide:true,timeout:60000,maxBuffer:2000000},(e,out)=>{if(e)return reject(Error('人脸检测组件不可用或检测超时'));try{resolve(JSON.parse(out))}catch{reject(Error('人脸检测未返回有效结果'))}}))}
async function advance(job,{request,persist,comfyUrl,detectFaces=detect}){
 if(locks.has(job.id))return;locks.add(job.id);
 const finish=(status,reason,videoUrl=job.originalVideoUrl)=>{job.faceRefine={...job.faceRefine,status,reason};job.videoUrl=videoUrl;job.progress={phase:'complete',percent:100};job.connectorStatus='ComfyUI H3 已完成 · '+reason;persist()};
 try{
  if(job.faceRefine?.promptId){
   if(Date.now()-(job.faceRefine.startedAt||Date.now())>3600000){finish('failed','精修等待超过一小时，已保留原视频');return}
   const record=(await request('/history/'+encodeURIComponent(job.faceRefine.promptId)))[job.faceRefine.promptId];if(!record)return;
   if(record.status?.status_str==='error'){finish('failed','精修未成功，已保留原视频');return}
   if(record.status?.completed){const output=(record.outputs?.['23']?.gifs||[]).find(x=>/\.mp4$/i.test(x.filename));if(!output){finish('failed','精修没有视频输出，已保留原视频');return}job.output=output;finish('complete','人脸精修完成，待审片',comfyUrl+'/view?filename='+encodeURIComponent(output.filename)+'&subfolder='+encodeURIComponent(output.subfolder||'')+'&type=output')}
   return;
  }
  // A lost submission acknowledgement must not submit a second expensive job.
  if(job.faceRefine?.status==='submitting'){finish('failed','精修提交状态无法确认，已保留原视频；请检查渲染器队列');return}
  const reason=eligibility(job);if(reason){finish('skipped',reason);return}
  job.faceRefine={status:'checking',reason:'正在抽帧检查人脸'};job.connectorStatus='正在检查是否需要人脸精修';job.progress={phase:'face-refine'};persist();
  const dir=path.join(__dirname,'.runtime/face-refine');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,crypto.createHash('sha256').update(job.id).digest('hex')+'.mp4');
  if(!fs.existsSync(file)){const response=await fetch(job.originalVideoUrl,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('无法读取原视频');const {pipeline}=require('stream/promises'),{Readable}=require('stream');await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(file+'.part'));fs.renameSync(file+'.part',file)}
  const analysis=await detectFaces(file),decision=decide(analysis,job.faceRefineMode==='on');job.faceRefine.analysis=analysis;
  if(!decision.refine){finish('skipped',decision.reason);return}
  if(job.cancelledAt){finish('skipped','任务已取消，未提交人脸精修');return}
  const prompt=graph(job,file),info=await request('/object_info');if(Object.values(prompt).some(n=>!info[n.class_type]))throw Error('精修节点未安装完整');
  job.faceRefine={...job.faceRefine,status:'submitting',reason:decision.reason};persist();
  const out=await request('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:'ai-movie-studio-face-refine',prompt})});if(!out.prompt_id)throw Error('精修未返回任务编号');
  job.faceRefine={...job.faceRefine,status:'rendering',promptId:out.prompt_id,startedAt:Date.now()};job.connectorStatus='正在进行人脸精修 · 保留原声';persist();
 }catch(e){finish('failed','人脸精修未执行完成：'+e.message+'；已保留原视频')}finally{locks.delete(job.id)}
}
function processResult(job,options){
 if(['complete','skipped','failed'].includes(job.faceRefine?.status))return;
 if(job.videoUrl){job.originalVideoUrl=job.videoUrl;delete job.videoUrl;job.progress={phase:'face-refine'};job.connectorStatus='检查人脸 / 自动精修中';options.persist()}
 void advance(job,options);
}
module.exports={mode,eligibility,decide,graph,advance,processResult};
