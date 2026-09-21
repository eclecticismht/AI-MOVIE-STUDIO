const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {MODELS,validatePlan,buildGraph,executionSteps}=require('./local-first-frame');
const {uploadReference}=require('./reference-assets');
const COMFY='http://127.0.0.1:8188';
function createFirstFrameApi({root=__dirname,fetchImpl=fetch,pollMs=2500}={}){
  const dir=path.join(root,'frame-runs'),assets=path.join(root,'assets','generated-frames');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(assets,{recursive:true});
  const jobs=new Map();let busy=false;
  const save=j=>{const file=path.join(dir,j.id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(j,null,2));fs.renameSync(file+'.tmp',file)};
  for(const file of fs.readdirSync(dir).filter(x=>/^frame_[a-f0-9]+\.json$/.test(x))){try{const j=JSON.parse(fs.readFileSync(path.join(dir,file)));jobs.set(j.id,j)}catch{}}
  const json=async(url,options={})=>{const r=await fetchImpl(COMFY+url,{...options,signal:AbortSignal.timeout(45000)});const out=await r.json();if(!r.ok)throw Error(out.error?.message||out.error||'本地图像服务请求失败');return out};
  async function readiness(){const info=await json('/object_info');const missing=['Krea2EditModelPatch','Krea2EditGroundedEncode'].filter(n=>!info[n]);for(const [node,key,name] of [['UNETLoader','unet_name',MODELS.unet],['CLIPLoader','clip_name',MODELS.clip],['VAELoader','vae_name',MODELS.vae],['LoraLoaderModelOnly','lora_name',MODELS.lora]])if(!info[node]?.input?.required?.[key]?.[0]?.includes(name))missing.push(name);return {ready:!missing.length,missing}}
  async function run(j){
    try{
      j.status='running';j.startedAt||=new Date().toISOString();save(j);
      while(j.pass<j.totalPasses){
        if(!j.promptId){
          if(j.submissionPending)throw Error('上次提交结果未知，已停止重复提交；请先检查 ComfyUI 队列。');
          const graph=buildGraph(j.plan,j.pass,j.previous,j.id);j.graphs[j.pass]=graph;j.submissionPending=true;save(j);
          const result=await json('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:j.id})});if(!result.prompt_id)throw Error('本地服务未返回生成编号');j.promptId=result.prompt_id;j.submissionPending=false;save(j);
        }
        let history;
        for(;;){history=(await json('/history/'+j.promptId))[j.promptId];if(history?.status?.status_str==='error')throw Error('本地模型运行失败：'+JSON.stringify(history.status.messages).slice(-1200));if(history?.outputs?.['15']?.images?.length)break;
          if(history?.status?.completed)throw Error('本地任务结束但没有输出首帧。');
          const queue=await json('/queue');const exists=[...(queue.queue_running||[]),...(queue.queue_pending||[])].some(x=>x[1]===j.promptId);if(!exists&&!history){history=(await json('/history/'+j.promptId))[j.promptId];if(!history)throw Error('本地服务已丢失生成任务，请重新生成。');continue;}await new Promise(r=>setTimeout(r,pollMs));}
        const img=history.outputs['15'].images[0];if(img.type!=='output')throw Error('本地生成结果类型无效');
        const response=await fetchImpl(COMFY+'/view?'+new URLSearchParams(img),{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('无法读取首帧结果');const bytes=Buffer.from(await response.arrayBuffer());
        if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('生成结果不是PNG图片');
        const filename=`${j.id}_${j.pass}.png`;fs.writeFileSync(path.join(assets,filename),bytes);j.outputs[j.pass]='/assets/generated-frames/'+filename;
        if(j.pass+1<j.totalPasses)j.previous=(await uploadReference('data:image/png;base64,'+bytes.toString('base64'),COMFY,fetchImpl)).file;
        j.promptId=null;j.completedPasses=j.pass+1;j.pass++;save(j);
      }
      j.status='completed';j.imageUrl=j.outputs.at(-1);j.finishedAt=new Date().toISOString();save(j);
    }catch(e){j.status='failed';j.error=e.message;save(j)}
  }
  async function pump(){if(busy)return;busy=true;try{for(const j of jobs.values())if(['queued','running'].includes(j.status))await run(j)}finally{busy=false}}
  // A persisted prompt id is polled after restart; it is never blindly resubmitted.
  setImmediate(pump);
  return async(req,res,url)=>{
    if(!url.startsWith('/api/first-frames'))return false;
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true};
    try{
      if(url==='/api/first-frames/status'&&req.method==='GET')return send(200,await readiness());
      if(url==='/api/first-frames'&&req.method==='POST'){
        const body=await require('./request-body').readUtf8(req,600000,'首帧请求过大');
        const plan=validatePlan(JSON.parse(body));const existing=[...jobs.values()].find(j=>['queued','running'].includes(j.status)&&j.plan.projectId===plan.projectId&&j.plan.shotId===plan.shotId);if(existing){if(JSON.stringify(existing.plan)!==JSON.stringify(plan))return send(409,{error:'此镜头已有生成任务。请等待完成后，再用修改后的分镜重新生成。'});return send(200,existing);}
        const ready=await readiness();if(!ready.ready)throw Error('本地图像模型未就绪：'+ready.missing.join('、'));
        const raced=[...jobs.values()].find(j=>['queued','running'].includes(j.status)&&j.plan.projectId===plan.projectId&&j.plan.shotId===plan.shotId);if(raced)return send(409,{error:'此镜头已开始生成，请查看现有任务，避免重复提交。'});
        const j={id:'frame_'+crypto.randomBytes(8).toString('hex'),plan,status:'queued',pass:0,completedPasses:0,totalPasses:executionSteps(plan).length,graphs:[],outputs:[],createdAt:new Date().toISOString()};jobs.set(j.id,j);save(j);setImmediate(pump);return send(202,j);
      }
      const id=url.split('/').at(-1);if(req.method==='GET'&&jobs.has(id))return send(200,jobs.get(id));return send(404,{error:'首帧任务不存在'});
    }catch(e){return send(400,{error:e.message})}
  };
}
module.exports={createFirstFrameApi};
