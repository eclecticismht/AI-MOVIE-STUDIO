const fs=require('node:fs');
const id=process.argv[2];if(!/^film_[a-f0-9]{16}$/.test(id))throw Error('Invalid run ID');
(async()=>{
 const run=JSON.parse(fs.readFileSync(`film-runs/${id}/run.json`)),results=[];
 for(const [index,s] of run.shots.entries()){
  if(!s.ready||s.renderMode==='black'||s.renderMode==='screen')continue;
  const response=await fetch('http://127.0.0.1:8080/jobs/'+s.jobId+'/status');if(!response.ok)throw Error('Missing job');
  const {job}=await response.json(),history=await fetch('http://127.0.0.1:8188/history/'+job.comfyPromptId).then(r=>r.json());
  const record=history[job.comfyPromptId];if(!record)throw Error('Missing execution history');
  const graph=record.prompt[2],actual=Object.values(graph).filter(n=>n.class_type==='LoadImage').map(n=>n.inputs.image).sort();
  const expected=[...new Set(s.continuityFrame?[s.continuityFrame.file]:s.firstFrame?[s.firstFrame.file]:(s.references||[]).map(r=>r.file))].sort();
  const matched=JSON.stringify(actual)===JSON.stringify(expected);
  results.push({index:index+1,shotId:s.shotId,jobId:s.jobId,promptId:job.comfyPromptId,expected,actual,matched});
 }
 fs.writeFileSync(`test-artifacts/${id}-reference-bindings.json`,JSON.stringify({runId:id,results,note:'Executed image inputs only; not a visual-quality approval.'},null,2));
 console.log(JSON.stringify({checked:results.length,matched:results.filter(r=>r.matched).length}));
 if(results.some(r=>!r.matched))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
