(function(root){
 const Sync=typeof module!=='undefined'&&module.exports?require('./film-source-sync'):root.FilmSourceSync;
 async function matches(shot,result,data){
  if(!shot||shot.autoArchived||shot.id!==result.shot||shot.projectId!==result.projectId||!result.sourceFingerprint)return false;
  const baseline=JSON.stringify(data),key=await Sync.fingerprint(shot,data);
  return baseline===JSON.stringify(data)&&key===result.sourceFingerprint;
 }
 async function reason(shot,result,data){
  if(!result?.videoUrl)return '这个版本尚未记录视频地址。请先同步生成结果，或检查生成任务是否成功。';
  if(!shot||shot.autoArchived)return '对应分镜已删除或归档。该视频可保留查看，但不能作为当前镜头的采用版本。';
  if(shot.id!==result.shot||shot.projectId!==result.projectId)return '该视频不属于当前项目的这个镜头，请选择对应的生成版本。';
  if(!result.sourceFingerprint)return '这是缺少来源记录的旧版本，工具无法核验它与当前分镜是否一致。视频仍可查看和下载；若要纳入当前制作流程，请从当前分镜重新制作。';
  const baseline=JSON.stringify(data),key=await Sync.fingerprint(shot,data);
  if(baseline!==JSON.stringify(data))return '检查期间项目内容发生了变化，请稍后再试。';
  if(key!==result.sourceFingerprint)return '生成后分镜或引用资产发生了变化，旧视频不能代表当前要求。请核对动作、对白、提示词、时长和参考素材；保留修改时，需要重新制作这个镜头。';
  return '';
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={matches,reason};else root.ResultGuard={matches,reason};
})(typeof globalThis!=='undefined'?globalThis:this);
