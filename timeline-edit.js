(function(root){
  const transitions=['cut','dissolve','fadeblack','wipeleft'];
  const finite=(v,min,max,label)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error(label+'超出范围');return v};
  function entry(shot,value={}){
    const sourceDuration=finite(Number(value.sourceDuration??shot.dur),0.1,3600,'素材时长');
    const trimIn=finite(Number(value.trimIn??0),0,sourceDuration,'入点');
    const trimOut=finite(Number(value.trimOut??sourceDuration),0.1,sourceDuration,'出点');
    if(trimOut-trimIn<0.1-1e-6)throw Error('裁切后至少保留 0.1 秒');
    const transition=value.transition||'cut';if(!transitions.includes(transition))throw Error('不支持的转场');
    return {sourceDuration,trimIn,trimOut,gain:finite(Number(value.gain??1),0,1,'镜头音量'),transition,transitionDuration:transition==='cut'?0:finite(Number(value.transitionDuration??0.5),0.1,2,'转场时长'),versionId:value.versionId||null};
  }
  function mix(value={}){return {master:finite(Number(value.master??1),0,1,'总音量'),musicVolume:finite(Number(value.musicVolume??0.25),0,1,'音乐音量'),musicOffset:finite(Number(value.musicOffset??0),0,600,'音乐起点'),musicFile:value.musicFile||'',normalizeDialogue:value.normalizeDialogue===true}}
  function build(shots,edit={}){
    const available=shots.filter(s=>!s.autoArchived).slice().sort((a,b)=>(a.sequence||0)-(b.sequence||0));
    const ids=new Set(available.map(s=>s.id)),order=[...new Set((edit.order||[]).filter(id=>ids.has(id)))];
    for(const s of available)if(!order.includes(s.id))order.push(s.id);
    const result=[];let end=0;
    for(const id of order){const shot=available.find(s=>s.id===id),e=entry(shot,edit.clips?.[id]),duration=e.trimOut-e.trimIn,prev=result.at(-1);let overlap=prev?.edit.transitionDuration||0;
      if(prev&&overlap>Math.min(prev.duration,duration)/2+1e-6)throw Error('转场不能超过相邻较短镜头的一半，请缩短转场或恢复裁切');
      const start=end-overlap;end=start+duration;result.push({shot,edit:e,start,end,duration,overlap});
    }return result;
  }
  function active(clips,time){return clips.filter(c=>time>=c.start&&time<c.end)}
  function graph(clips){
    let duration=clips[0].duration,video='v0',audio='a0';const filters=[];
    for(let i=1;i<clips.length;i++){const d=clips[i].overlap,transition=clips[i-1].edit.transition;
      if(d){filters.push(`[${video}]fps=24,settb=AVTB[vl${i}]`,`[v${i}]fps=24,settb=AVTB[vr${i}]`,`[vl${i}][vr${i}]xfade=transition=${transition==='dissolve'?'fade':transition}:duration=${d}:offset=${duration-d}[vx${i}]`,`[${audio}][a${i}]acrossfade=d=${d}:c1=tri:c2=tri[ax${i}]`)}
      else filters.push(`[${video}][${audio}][v${i}][a${i}]concat=n=2:v=1:a=1[vx${i}][ax${i}]`);
      video='vx'+i;audio='ax'+i;duration+=clips[i].duration-d;
    }return {filters,video,audio,duration};
  }
  const api={entry,mix,build,active,graph,transitions};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimelineEdit=api;
})(typeof globalThis!=='undefined'?globalThis:this);
