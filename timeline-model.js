(function(root){
  function clips(shots){let time=0;return shots.filter(s=>!s.autoArchived).slice().sort((a,b)=>(a.sequence||0)-(b.sequence||0)).map(shot=>{const duration=Math.max(0,Number(shot.dur)||0),start=time;time+=duration;return {shot,start,end:time,duration}})}
  function at(clips,time){return clips.find(c=>time>=c.start&&time<c.end)||clips.at(-1)}
  function versions(data,shot){return (data.generations||[]).filter(g=>g.projectId===shot.projectId&&g.shot===shot.id&&g.videoUrl).slice().reverse()}
  function timecode(seconds){const n=Math.max(0,Math.floor(seconds||0));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
  function missingReason(data,shot){
    const jobs=(data.jobs||[]).filter(j=>j.projectId===shot.projectId&&j.shot===shot.id);
    const deleted=(data.deletedGenerationResults||[]).filter(t=>t.projectId===shot.projectId&&jobs.some(j=>j.id===t.jobId));
    if(deleted.length)return '本镜的视频版本已从审片中删除，因此没有可预览画面。同步不会自动恢复已删除版本；可重新生成本镜。';
    if(jobs.some(j=>j.videoUrl))return '本镜已有生成结果，尚未关联到审片版本。请在“生成”中同步结果。';
    return '本镜还没有可用视频。请先完成生成，再同步结果；分镜文字本身不会显示为视频画面。';
  }
  const api={clips,at,versions,timecode,missingReason};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimelineModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
