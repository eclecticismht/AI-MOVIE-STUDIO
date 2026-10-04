const Quality=require('./film-quality');
function pendingQuality(run){
 if(!run.qualityGate)return [];
 return run.shots.flatMap((shot,index)=>shot.ready&&!Quality.passed(shot.speechCheck)?[{index:index+1,shotId:shot.shotId,result:shot.speechCheck||{status:'check_failed',reason:'缺少声音检查结果'}}]:[]);
}
function holdBeforeAssembly(run){
 const pending=pendingQuality(run);if(!pending.length)return false;
 Quality.holdForReview(run,pending[0].index-1,pending[0].result);
 const completed=run.shots.filter(shot=>shot.ready).length,total=run.shots.length;
 run.error=completed===total?`全部镜头素材已生成，${pending.length} 镜声音检查待处理；解决后才能合成成片。`:`已生成 ${completed}/${total} 镜，其中 ${pending.length} 镜声音检查待处理；其余 ${total-completed} 镜尚未生成，当前不是完整成片。`;
 return true;
}
function visiblePendingQuality(run){
 // A ready clip awaiting recognition (including a recomposed audio track) has
 // not failed a check. This affects
 // display only: the assembly gate continues to require a real result.
 return pendingQuality(run).filter(item=>!(run.status==='rendering'&&!run.shots[item.index-1].speechCheck));
}
module.exports={pendingQuality,visiblePendingQuality,holdBeforeAssembly};
