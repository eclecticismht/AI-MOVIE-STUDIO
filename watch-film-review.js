const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {transcribe,compareSpeech}=require('./speech-audit');
const id=process.argv[2];if(!/^film_[a-f0-9]{16}$/.test(id))throw Error('Invalid run ID');
const dir=path.join('film-runs',id),out=path.join('test-artifacts',id+'-audio-review.json');
(async()=>{
 const results=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)).results:[];
 let last='';const deadline=Date.now()+2*60*60*1000;
 while(Date.now()<deadline){
  const response=await fetch('http://127.0.0.1:4173/api/film/'+id);if(!response.ok)throw Error('Unable to read film status');const {run}=await response.json();
  for(const [i,s] of run.shots.entries())if(s.ready&&!results.some(r=>r.index===i+1)){
   execFileSync('C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Scripts\\python.exe',['inspect-film-contact.py',id,String(i)],{windowsHide:true});
   const expected=(s.dialogueEvents||[]).filter(e=>e.type==='speech').map(e=>e.text).join('');
   const transcription=await transcribe(path.join(dir,`source-${i}.mp4`),expected,'medium');
   const result={index:i+1,shotId:s.shotId,...compareSpeech(s.dialogueEvents,transcription)};results.push(result);
   fs.writeFileSync(out,JSON.stringify({runId:id,results},null,2));console.log(JSON.stringify({index:i+1,status:result.status,actual:result.actual}));
  }
  const status=JSON.stringify({status:run.status,ready:run.shots.filter(s=>s.ready).length,current:run.current?.index,phase:run.current?.progress?.phase,error:run.error});
  if(status!==last){console.log(status);last=status;}
  if(['complete','failed','paused'].includes(run.status))return;
  await new Promise(r=>setTimeout(r,30000));
 }
 console.log('Observation deadline reached; renderer was not stopped.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
