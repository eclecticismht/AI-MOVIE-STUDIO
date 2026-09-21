// Real local-media smoke test. Uses existing screen assets; never submits a model job.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='http://127.0.0.1:4173';
async function api(route,body){const r=await fetch(base+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),out=await r.json();if(!r.ok)throw Error(out.error);return out;}
async function wait(id){for(let i=0;i<90;i++){const {run}=await api('/api/film/'+id);if(run.status==='complete')return run;if(['failed','paused'].includes(run.status))throw Error(run.error||run.status);await new Promise(r=>setTimeout(r,1000));}throw Error('Local composition timeout');}
(async()=>{
 const original=(await api('/api/film/film_13da8741adfbe5a9')).run;
 const screen=structuredClone(original.shots.find(s=>s.renderMode==='screen'&&s.screenSource==='text'));
 for(const key of ['ready','jobId','videoUrl','speechCheck','sourceFingerprint'])delete screen[key];screen.duration=4;
 const black={shotId:'acceptance-black',renderMode:'black',prompt:'Black silent frame.',duration:4,width:864,height:480,dialogueEvents:[],references:[]};
 const {run}=await api('/api/film',{projectId:'system-acceptance',title:'系统验收：本地合成',shots:[screen,black]});
 const complete=await wait(run.id);assert.equal(complete.completed,2);
 const preview=await fetch(base+'/api/film/'+run.id+'/preview?index=0',{headers:{Range:'bytes=0-127'}});assert.equal(preview.status,206);assert.equal((await preview.arrayBuffer()).byteLength,128);
 const video=await fetch(base+complete.videoUrl,{method:'HEAD'});assert.equal(video.status,200);assert.ok(Number(video.headers.get('content-length'))>1000);
 const check=await api('/api/film/'+run.id+'/validate-revision',{index:0,revision:{prompt:screen.prompt,subtitle:screen.subtitle,duration:4,audioMode:'mute'}});assert.deepEqual(check.impact.redo,[1]);
 const revised=(await api('/api/film/'+run.id+'/recompose',{changes:[{shotId:screen.shotId,audioMode:'mute'}]})).run;await wait(revised.id);
 assert.equal((await fetch(base+'/%2eenv')).status,403);assert.equal((await fetch(base+'/%ZZ')).status,403);
 const untouched=(await api('/api/film/'+original.id)).run;assert.equal(untouched.status,original.status);assert.equal(untouched.completed,original.completed);
 const evidence={at:new Date().toISOString(),passed:true,runId:run.id,recomposedId:revised.id,checks:['screen + black composition','MP4 HEAD','preview byte range','revision preflight','sound recomposition','private and malformed paths rejected','production run unchanged'],production:{id:original.id,status:original.status,completed:original.completed,total:original.total}};
 fs.writeFileSync('test-artifacts/system-acceptance.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e.message);process.exitCode=1});
