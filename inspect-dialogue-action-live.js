const fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const id=process.argv[2]||JSON.parse(fs.readFileSync('test-artifacts/dialogue-action-live.json')).run.id;
 if(!/^film_[a-f0-9]{16}$/.test(id))throw Error('成片编号无效');
 const run=JSON.parse(fs.readFileSync(`film-runs/${id}/run.json`));
 if(run.status!=='complete')throw Error('样片尚未完成：'+run.current?.stage);
 const results=[];
 for(const [i,s] of run.shots.entries()){
  const state=await(await fetch('http://127.0.0.1:8080/jobs/'+s.jobId+'/status')).json();
  const history=await(await fetch('http://127.0.0.1:8188/history/'+state.job.comfyPromptId)).json(),graph=history[state.job.comfyPromptId]?.prompt?.[2];
  if(!graph)throw Error('缺少真实执行历史');
  const images=Object.values(graph).filter(n=>n.class_type==='LoadImage').map(n=>n.inputs.image);
  const expected=i?s.continuityFrame?.file:s.firstFrame?.file;
  if(images.length!==1||images[0]!==expected)throw Error('首帧没有进入实际渲染图');
  if(i){const hash=crypto.createHash('sha256').update(fs.readFileSync(`film-runs/${id}/continuity-${i}.png`)).digest('hex');if(expected!==`ams-ref-${hash}.png`)throw Error('尾帧图片内容与上传图不符');if(s.continuityFrame.fromJobId!==run.shots[i-1].jobId)throw Error('承接图沿用了旧版任务');}
  results.push({shotId:s.shotId,jobId:s.jobId,promptId:state.job.comfyPromptId,actualImage:images[0],bindingVerified:true,subtitleTiming:s.subtitleTiming});
 }
 const result={id,parentRunId:run.parentRunId,status:run.status,results};fs.writeFileSync(`test-artifacts/${id}-binding.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
