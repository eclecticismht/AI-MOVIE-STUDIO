// Import finished automatic-film shots without waiting for the complete movie.
let filmPreviewPolling=false;
let filmPreviewRefreshPending=false;
const filmPreviewCache=new Map();
async function pollFilmPreviews(){
 if(filmPreviewPolling||!document.getElementById('timeline')?.classList.contains('on'))return;
 filmPreviewPolling=true;
 try{
  const projectId=D.activeProjectId,response=await fetch('/api/film',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('无法读取自动成片进度');
  const summaries=(await response.json()).runs.filter(r=>r.projectId===projectId&&r.completed>0),runs=[];
  for(const summary of summaries){
   const signature=JSON.stringify(summary),cached=filmPreviewCache.get(summary.id);
   if(cached?.signature===signature){runs.push(cached.run);continue}
   const r=await fetch('/api/film/'+encodeURIComponent(summary.id),{signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('逐镜结果暂时无法读取');
   const {run}=await r.json();filmPreviewCache.set(summary.id,{signature,run});runs.push(run);
  }
  if(D.activeProjectId!==projectId)return;
  const stored=JSON.parse(localStorage.getItem('aimovie_data'));if(!stored)return;
  const result=FilmPreviewResults.merge(stored,runs);
  if(result.added){stored.generations=result.generations;localStorage.setItem('aimovie_data',JSON.stringify(stored));}
  const changed=JSON.stringify(D.generations)!==JSON.stringify(result.generations);
  D.generations=result.generations;
  filmPreviewRefreshPending||=changed;
  if(filmPreviewRefreshPending&&!TL.dirty&&!TL.busy&&!editingShotId&&!(typeof CUT!=='undefined'&&CUT.playing)){
   tlTracks();tlPreview();tlInspector();
   filmPreviewRefreshPending=false;
   if(result.added)tlMessage('已接入 '+result.added+' 个自动成片镜头，可直接预览；仍需审片确认。');
  }
 }catch(e){if(!TL.dirty&&!editingShotId)tlMessage('自动成片素材同步暂未完成：'+e.message+'，稍后自动重试。')}
 finally{filmPreviewPolling=false}
}
setInterval(pollFilmPreviews,5000);
