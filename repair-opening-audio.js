const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {work}=require('./film-api'),{transcribe,compareSpeech}=require('./speech-audit');
async function post(route,body){const r=await fetch('http://127.0.0.1:4173'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const out=await r.json();if(!r.ok)throw Error(out.error);return out}
(async()=>{
 const parent='film_bd9e84f7b300399c',original=JSON.parse(fs.readFileSync(path.join('film-runs',parent,'run.json')));
 const {file}=await post('/api/audio-assets',{dataUrl:'data:audio/wav;base64,'+fs.readFileSync('test-artifacts/construction-ambience-procedural.wav').toString('base64')});
 const shot={...original.shots[0],audioMode:'replacement',audioAsset:file};delete shot.speechCheck;
 const run={id:'film_'+crypto.randomBytes(8).toString('hex'),projectId:'opening-audio-validation',title:'工地开场环境音验证',shots:[shot],status:'pending',compositionOnly:true,qualityGate:true};
 const dir=path.join('film-runs',run.id);fs.mkdirSync(dir,{recursive:true});
 for(const prefix of ['source','clip'])fs.copyFileSync(path.join('film-runs',parent,`${prefix}-0.mp4`),path.join(dir,`${prefix}-0.mp4`));
 await work(run);if(run.status!=='complete')throw Error(run.error);
 const check=compareSpeech([],await transcribe(path.join(dir,'sound-0.mp4'),'','medium'));
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const evidence={parent,testRun:run.id,audioAsset:file,speech:check,originalPreserved:hash(path.join(dir,'source-0.mp4'))===hash(path.join('film-runs',parent,'source-0.mp4')),note:'Procedural non-vocal ambience; not a field recording.'};
 fs.writeFileSync('test-artifacts/opening-audio-repair.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e.message);process.exitCode=1});
