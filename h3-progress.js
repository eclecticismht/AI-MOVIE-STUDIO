function updateProgress(current,event,now=Date.now()) {
  const d=event.data||{},p={...current,updatedAt:now};
  if(event.type==='execution_start')return {phase:'loading',startedAt:now,updatedAt:now};
  if(event.type==='executing') {
    if(d.node==null||['6','7'].includes(String(d.node)))return {...p,phase:'saving',etaSeconds:null};
    return {...p,phase:'loading',node:String(d.node),etaSeconds:null};
  }
  if(event.type==='progress'&&Number.isFinite(d.value)&&Number.isFinite(d.max)&&d.max>0) {
    const same=p.phase==='sampling'&&p.max===d.max&&p.node===String(d.node)&&d.value>=p.value;
    const sampleStart=same?p.sampleStart:now,initialValue=same?p.initialValue:d.value;
    const advanced=d.value-initialValue,seconds=(now-sampleStart)/1000;
    return {...p,phase:'sampling',node:String(d.node),value:d.value,max:d.max,sampleStart,initialValue,
      percent:Math.min(100,Math.round(d.value/d.max*100)),etaSeconds:advanced>=2&&seconds>0?Math.ceil(seconds/advanced*(d.max-d.value)):null};
  }
  return p;
}
module.exports={updateProgress};
