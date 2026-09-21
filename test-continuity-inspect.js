const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const id=JSON.parse(fs.readFileSync('test-artifacts/continuity-live.json','utf8')).run.id;
const ffmpeg='C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
(async()=>{
 const run=JSON.parse(fs.readFileSync('film-runs/'+id+'/run.json','utf8')),results=[];
 for(const [i,s] of run.shots.entries()){
  if(!s.ready)continue;
  const frame='test-artifacts/continuity-'+i+'.jpg';
  if(!fs.existsSync(frame))execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i',`film-runs/${id}/source-${i}.mp4`,'-vf','fps=1,scale=480:-1,tile=4x1','-frames:v','1',frame],{windowsHide:true});
  const response=await fetch('http://127.0.0.1:8080/jobs/'+s.jobId+'/status'),out=await response.json();if(!response.ok)throw Error(out.error);
  const history=await (await fetch('http://127.0.0.1:8188/history/'+out.job.comfyPromptId)).json();
  const graph=history[out.job.comfyPromptId]?.prompt?.[2];if(!graph)throw Error('缺少真实执行历史，不能确认参考输入');
  const actual=Object.values(graph).filter(n=>n.class_type==='LoadImage').map(n=>n.inputs.image).sort(),expected=s.references.map(r=>r.file).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('参考图未完整进入图：'+s.shotId);
  results.push({shotId:s.shotId,frame,references:actual.length,referenceBinding:'verified'});
 }
 fs.writeFileSync('test-artifacts/continuity-inspection.json',JSON.stringify({id,status:run.status,results},null,2));console.log(JSON.stringify({status:run.status,current:run.current,results}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
