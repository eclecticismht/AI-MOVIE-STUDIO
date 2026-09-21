const fs=require('fs');
const id=process.argv[2];if(!/^film_[a-f0-9]{16}$/.test(id))throw Error('Invalid run');
let previous='';
const timer=setInterval(()=>{
 try{const r=JSON.parse(fs.readFileSync(`film-runs/${id}/run.json`));const state={status:r.status,ready:r.shots.filter(s=>s.ready).length,index:r.current?.index,stage:r.current?.stage,step:r.current?.progress?.value,pending:r.shots.filter(s=>s.speechCheck?.status==='needs_review').map(s=>s.sequence)};
 const key=JSON.stringify({...state,step:Math.floor((state.step||0)/5)*5});if(key!==previous){console.log(JSON.stringify(state));previous=key}
 if(['paused','failed','complete'].includes(r.status)){clearInterval(timer);console.log(JSON.stringify({error:r.error||null,finished:true}));}
 }catch(e){console.error(e.message);clearInterval(timer);process.exitCode=1}
},4000);
