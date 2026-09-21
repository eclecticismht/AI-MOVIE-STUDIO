// Read-only status watcher that prepares contact sheets for newly rendered shots.
const fs=require('fs'),{spawnSync}=require('child_process');
const id=process.argv[2];if(!/^film_[a-f0-9]{16}$/.test(id||''))throw Error('Invalid run ID');
const indexes=[31,40,43,45,46,59,61,63,64,65,66,68,70,71,72,74,75,81,82,84,85,88,91,96];
let last='';
(async()=>{while(true){
 const result=await fetch(`http://127.0.0.1:4173/api/film/${id}`).then(r=>r.json()),run=result.run;
 const stored=JSON.parse(fs.readFileSync(`film-runs/${id}/run.json`));
 for(const n of indexes)if(stored.shots[n-1].ready&&!fs.existsSync(`test-artifacts/${id}-shot-${n}.jpg`)){
  const p=spawnSync('C:/AI/Comfy UI/ComfyUI/.venv/Scripts/python.exe',['inspect-film-contact.py',id,String(n-1)],{encoding:'utf8',windowsHide:true});
  if(p.status!==0)throw Error(p.stderr);console.log(`CONTACT ${n}`);
 }
 const s=JSON.stringify({id,status:run.status,ready:run.completed,total:run.total,current:run.current?.index,pending:(run.pendingQuality||[]).map(q=>({index:q.index,status:q.result?.status,actual:q.result?.actual}))});
 if(s!==last){console.log(s);last=s;}
 if(['complete','paused','failed'].includes(run.status))break;
 await new Promise(r=>setTimeout(r,10000));
}})().catch(e=>{console.error(e);process.exitCode=1});
