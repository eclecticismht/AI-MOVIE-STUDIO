// Resume-safe orchestration of the current authorized production, never bypassing quality holds.
const fs=require('fs');
const sourceId=process.argv[2],stateFile='test-artifacts/finalization-state.json',base='http://127.0.0.1:4173/api/film/';
if(!/^film_[a-f0-9]{16}$/.test(sourceId||''))throw Error('Supply the inspected source run ID');
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{};
if(state.sourceId&&state.sourceId!==sourceId)throw Error('Finalization record belongs to another source; inspect it before starting another version.');
function save(){fs.writeFileSync(stateFile,JSON.stringify(state,null,2));}
async function api(id,action,body){const r=await fetch(base+id+(action?'/'+action:''),body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const out=await r.json();if(!r.ok)throw Error(out.error);return out.run;}
async function wait(id){let previous='';while(true){const run=await api(id);const status=JSON.stringify({id,status:run.status,ready:run.completed,total:run.total,index:run.current?.index,stage:run.current?.stage,pending:run.pendingQuality?.length});if(status!==previous){console.log(status);previous=status;}if(['paused','failed','complete'].includes(run.status)&&!run.rechecking)return run;await new Promise(r=>setTimeout(r,5000));}}
(async()=>{
 if(!state.finalRunId){
  let run=await wait(sourceId);if(run.status==='failed')throw Error(run.error);
  if(run.completed!==run.total)throw Error('Production paused before all shots were ready; preserve pause for inspection.');
  if(run.pendingQuality?.length){await api(sourceId,'recheck-pending',{model:'sensevoice'});run=await wait(sourceId);}
  if(run.pendingQuality?.length){state.unresolved=run.pendingQuality;save();throw Error('Still unresolved speech; no final assembly submitted.');}
  const visualFile=`test-artifacts/${sourceId}-visual-review.json`;
  const visual=fs.existsSync(visualFile)?JSON.parse(fs.readFileSync(visualFile)):null;
  if(!visual||visual.runId!==sourceId||visual.unresolved?.length||visual.ready!==run.total)throw Error('Visual inspection is incomplete; do not assemble an unchecked version.');
  const full=(await fetch(base+sourceId).then(r=>r.json())).run;
  if(!Array.isArray(visual.cropBottomShots)||visual.cropBottomShots.some(n=>!Number.isInteger(n)||n<1||n>full.shots.length))throw Error('Missing inspected framing decisions');
  const changes=visual.cropBottomShots.map(n=>({shotId:full.shots[n-1].shotId,cropBottomPercent:15}));
  changes.push({shotId:full.shots[97].shotId,audioMode:'replacement',audioAsset:require('./test-artifacts/ending-vibration-asset.json').file});
  const child=await api(sourceId,'recompose',{changes});state.finalRunId=child.id;state.sourceId=sourceId;state.changes=changes;delete state.unresolved;save();
 }
 const final=await wait(state.finalRunId);state.status=final.status;state.error=final.error;state.videoUrl=final.videoUrl;save();
 if(final.status!=='complete')throw Error(final.error||'Final version requires review');
 console.log(JSON.stringify({complete:true,id:final.id,videoUrl:final.videoUrl}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
