(function(root){
  function clips(shots){let time=0;return shots.filter(s=>!s.autoArchived).slice().sort((a,b)=>(a.sequence||0)-(b.sequence||0)).map(shot=>{const duration=Math.max(0,Number(shot.dur)||0),start=time;time+=duration;return {shot,start,end:time,duration}})}
  function at(clips,time){return clips.find(c=>time>=c.start&&time<c.end)||clips.at(-1)}
  function versions(data,shot){return (data.generations||[]).filter(g=>g.projectId===shot.projectId&&g.shot===shot.id&&g.videoUrl).slice().reverse()}
  function timecode(seconds){const n=Math.max(0,Math.floor(seconds||0));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
  const api={clips,at,versions,timecode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimelineModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
