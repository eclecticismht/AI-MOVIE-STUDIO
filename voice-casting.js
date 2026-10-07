(function(root){
 function fileName(value){const m=/^(?:\/audio-assets\/)?(ams-audio-[a-f0-9]{64}\.wav)$/.exec(String(value||''));return m?.[1]||''}
 function inspect(data,shot,file,events){
  const speakers=[...new Set((events||[]).filter(e=>e.type==='speech').map(e=>e.speakerId))];
  if(speakers.length!==1)return {status:'incompatible',message:'配音参考需要明确的一位说话人。'};
  const character=(data.characters||[]).find(c=>c.projectId===shot.projectId&&c.id===speakers[0]);
  const canonical=character?.voiceProfile?.locked===true?character.voiceProfile.id:null;
  if(canonical&&shot.voiceProfileId&&shot.voiceProfileId!==canonical)return {status:'incompatible',message:'本镜音色与角色跨场次锁定音色不一致。请沿用角色的原声参考重新绑定，不能为新场次另换音色。'};
  const profileId=canonical||shot.voiceProfileId;
  const key=fileName(file),rows=(data.audio||[]).filter(a=>fileName(a.audioUrl)===key&&a.projectId===shot.projectId);
  if(!key)return {status:'incompatible',message:'请选择有效的本地配音文件。'};
  const tagged=rows.filter(a=>a.speakerId),wrong=tagged.filter(a=>a.speakerId!==speakers[0]);
  if(wrong.length)return {status:'incompatible',message:'这份配音标记为其他角色，不能绑定到当前说话人。请重新选择对应角色录音。'};
  if(profileId&&tagged.some(a=>a.voiceProfileId&&a.voiceProfileId!==profileId))return {status:'incompatible',message:'配音音色版本与本镜锁定的角色音色不一致，请核对后选择。'};
  const clean=text=>String(text||'').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,''),expected=clean((events||[]).filter(e=>e.type==='speech').map(e=>e.text).join(''));
  const transcribed=rows.filter(a=>typeof a.transcript==='string'&&clean(a.transcript));
  if(expected&&transcribed.some(a=>!clean(a.transcript).includes(expected)))return {status:'incompatible',message:'所选录音的已登记台词不包含本镜原句，请选择对应配音；不会自动替换或修改原对白。'};
  if(canonical&&tagged.some(a=>!a.voiceProfileId))return {status:'unverified',message:'角色已锁定跨场次音色，但这份录音未标注音色版本；须对照原声试听确认，不能视为已统一。'};
  if(!tagged.length)return {status:'unverified',message:'未标注角色的旧录音或手动导入；须试听确认音色。'};
  return {status:'compatible',speakerId:speakers[0],...(profileId?{voiceProfileId:profileId}:{}),message:canonical?'沿用角色跨场次锁定音色；仍须对照原声听审并检查口型。':'角色与已标注的音色版本一致；仍须听审和检查口型。'};
 }
 function assertSelection(data,shot,file,events){const result=inspect(data,shot,file,events);if(result.status==='incompatible')throw Error(result.message);return result}
 function checkBound(data,shot,events){if(!shot.performanceAudio)return;return assertSelection(data,shot,shot.performanceAudio.source?.file||shot.performanceAudio.file,events)}
 const api={fileName,inspect,assertSelection,checkBound};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VoiceCasting=api;
})(typeof globalThis!=='undefined'?globalThis:this);
