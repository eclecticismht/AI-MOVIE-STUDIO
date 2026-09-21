// Read-only probe. Never submits work or changes the renderer queue.
async function rendererReadiness(url, fetchImpl=fetch){
  try{
    const response=await fetchImpl(url+'/system_stats',{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.devices))throw Error('响应不是 ComfyUI 系统状态');
    return {ok:true,message:'渲染器已连接；具体模型与工作流在提交时校验。'};
  }catch(error){
    return {ok:false,message:'无法连接 ComfyUI 渲染器（'+url+'）。请启动本机 ComfyUI，待启动完成后重新检查；现有任务与素材已保留。'};
  }
}
module.exports={rendererReadiness};
