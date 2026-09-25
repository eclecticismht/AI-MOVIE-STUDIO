// Only call missing() after successful reads of BOTH history and queue.
// A timeout/offline renderer is not evidence that an accepted task was lost.
function missing(job,now=Date.now()){
 const prior=job.recovery;
 const since=prior?.since??now,checks=(prior?.checks||0)+1;
 const lost=checks>=3&&now-since>=30000;
 job.recovery={status:lost?'missing':'checking',since,checks,checkedAt:now};
 job.connectorStatus=lost?'渲染任务失联：队列与历史均未找到，已暂停等待恢复。':'ComfyUI 等待状态确认（正在查找原任务）';
 job.progress={phase:lost?'missing':'unknown',updatedAt:now};
 return job;
}
function found(job){if(job.recovery)delete job.recovery;}
function hold(run,index,job){
 if(job.recovery?.status!=='missing')return false;
 run.status='paused';run.lostTask={index,jobId:job.id,checkedAt:job.recovery.checkedAt};
 run.error=`第 ${index+1} 镜任务失联。已完成素材和原任务记录均保留；点击“查找结果 / 重新提交失联镜头”恢复。`;
 return true;
}
const resuming=new WeakSet();
async function resume(run,request){
 if(resuming.has(run))throw Error('正在查找原任务，请稍后');
 if(!run.lostTask)return;
 resuming.add(run);
 try{
 const {index,jobId}=run.lostTask,shot=run.shots[index],{job}=await request('/jobs/'+encodeURIComponent(jobId)+'/status');
 if(!job||job.id!==jobId)throw Error('无法确认原任务状态，未重新提交');
 if(!job.videoUrl&&job.recovery?.status==='missing'){
  shot.previousAttempts=[...(shot.previousAttempts||[]),{jobId,reason:'missing',checkedAt:job.recovery.checkedAt}];
  shot.renderAttempt=(shot.renderAttempt||0)+1;delete shot.jobId;
 }
 delete run.lostTask;
 }finally{resuming.delete(run)}
}
module.exports={missing,found,hold,resume};
