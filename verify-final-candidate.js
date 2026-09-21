// Wait for this specific movie, then run read-only delivery checks. No approvals.
const {spawn}=require('child_process');
const id=process.argv[2];if(!/^film_[a-f0-9]{16}$/.test(id||''))throw Error('Invalid ID');
const python='C:/AI/Comfy UI/ComfyUI/.venv/Scripts/python.exe';
function command(exe,args){return new Promise((resolve,reject)=>{
 const p=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
 p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);
 p.on('close',code=>code===0?resolve({check:args[0],output:out.trim()}):reject(Error(args[0]+': '+err+out)));
});}
(async()=>{
 let last='';while(true){
  const response=await fetch(`http://127.0.0.1:4173/api/film/${id}`);if(!response.ok)throw Error('Cannot read candidate');
  const {run}=await response.json();if(run.status!==last){console.log(JSON.stringify({id,status:run.status}));last=run.status;}
  if(run.status==='complete')break;if(['failed','paused'].includes(run.status))throw Error('Candidate needs attention: '+(run.error||run.status));
  await new Promise(r=>setTimeout(r,5000));
 }
 const results=await Promise.allSettled([
  command(python,['verify-completed-film.py',id]),
  command(process.execPath,['verify-model-bindings.js',id]),
  command(python,['inspect-composed-film.py',id])
 ]);
 for(const result of results){if(result.status==='fulfilled')console.log(JSON.stringify(result.value));else{console.error(result.reason.message);process.exitCode=1;}}
})().catch(e=>{console.error(e.message);process.exitCode=1});
