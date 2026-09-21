const fs=require('node:fs');
async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),out=await r.json();if(!r.ok)throw Error(out.error);return out}
(async()=>{
 const {file}=await post('http://127.0.0.1:4173/api/audio-assets',{dataUrl:'data:audio/wav;base64,'+fs.readFileSync('test-artifacts/classroom-ambience.wav').toString('base64')});
 const result=await post('http://127.0.0.1:4173/api/film/film_444fae542c59ce8c/recompose',{changes:[{shotId:'qa-continuity-school',audioMode:'replacement',audioAsset:file}]});
 fs.writeFileSync('test-artifacts/ambience-live.json',JSON.stringify(result,null,2));console.log(result.run.id);
})().catch(e=>{console.error(e.message);process.exitCode=1});
