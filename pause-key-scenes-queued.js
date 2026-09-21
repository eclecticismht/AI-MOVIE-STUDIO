// Stop this regression batch only at a safe queued-job boundary. Never interrupt GPU execution.
const fs=require('node:fs');
const runId='film_b166c83674e2ac8b',expectedShot='SH_mu4yhv4yfxlv';
(async()=>{
 const deadline=Date.now()+30*60*1000;
 while(Date.now()<deadline){
  const r=JSON.parse(fs.readFileSync('film-runs/'+runId+'/run.json'));
  if(['failed','complete','paused'].includes(r.status)){console.log('Batch already stopped: '+r.status);return;}
  if(r.current?.index>4){console.log('Safe boundary missed; nothing cancelled.');return;}
  if(r.current?.index===4){
   const id=`FILM_${runId}_3`,res=await fetch('http://127.0.0.1:8080/jobs/'+id+'/status');
   if(res.ok){const {job}=await res.json();if(job.shot!==expectedShot||job.projectId!=='AMS-003')throw Error('Unexpected job');
    const q=await fetch('http://127.0.0.1:8188/queue').then(x=>x.json());
    if((q.queue_running||[]).some(x=>x[1]===job.comfyPromptId)){console.log('Target already running; nothing cancelled.');return;}
    if((q.queue_pending||[]).some(x=>x[1]===job.comfyPromptId)){
     const c=await fetch('http://127.0.0.1:8080/jobs/'+id+'/cancel',{method:'POST'}),v=await c.json();if(!c.ok)throw Error(v.error);
     fs.writeFileSync('test-artifacts/key-scenes-safe-stop.json',JSON.stringify({runId,jobId:id,shotId:expectedShot,reason:'Known visual continuity and asset-history contamination; revise before further render',cancelledAt:v.job.cancelledAt},null,2));console.log('Cancelled only the queued fourth shot; current GPU task untouched.');return;
    }
   }
  }
  await new Promise(r=>setTimeout(r,2000));
 }
 console.log('No safe boundary reached; nothing cancelled.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
