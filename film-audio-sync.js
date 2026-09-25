(function(root){
 function updates(run,shots,projectId,events,validate){
  if(run.projectId!==projectId)throw Error('请切回该成片所属项目');
  const changes=[];
  for(const s of run.shots||[]){
   if(!s.ready||!['replacement','mute','voiceover'].includes(s.audioMode))continue;
   const original=shots.find(x=>x.id===s.shotId&&x.projectId===projectId&&!x.autoArchived);if(!original)continue;
   validate(s.audioMode,events(original),s.audioAsset);
   if(original.audioMode!==s.audioMode||original.audioAsset!==s.audioAsset)changes.push({id:original.id,audioMode:s.audioMode,audioAsset:['replacement','voiceover'].includes(s.audioMode)?s.audioAsset:undefined});
  }
  return changes;
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={updates};else root.FilmAudioSync={updates};
})(typeof globalThis!=='undefined'?globalThis:this);
