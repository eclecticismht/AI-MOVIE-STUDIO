(function(root){
 function fileName(value){const m=/^(?:\/audio-assets\/)?(ams-audio-[a-f0-9]{64}\.wav)$/.exec(String(value||''));return m?.[1]||''}
 function inspect(data,shot,file,events){
  const speakers=[...new Set((events||[]).filter(e=>e.type==='speech').map(e=>e.speakerId))];
  if(speakers.length!==1)return {status:'incompatible',message:'配音参考需要明确的一位说话人。'};
  const key=fileName(file),rows=(data.audio||[]).filter(a=>fileName(a.audioUrl)===key&&a.projectId===shot.projectId);
  if(!key)return {status:'incompatible',message:'请选择有效的本地配音文件。'};
  const tagged=rows.filter(a=>a.speakerId),wrong=tagged.filter(a=>a.speakerId!==speakers[0]);
  if(wrong.length)return {status:'incompatible',message:'这份配音标记为其他角色，不能绑定到当前说话人。请重新选择对应角色录音。'};
  if(shot.voiceProfileId&&tagged.some(a=>a.voiceProfileId&&a.voiceProfileId!==shot.voiceProfileId))return {status:'incompatible',message:'配音音色版本与本镜锁定的角色音色不一致，请核对后选择。'};
  const clean=text=>String(text||'').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,''),expected=clean((events||[]).filter(e=>e.type==='speech').map(e=>e.text).join(''));
  const transcribed=rows.filter(a=>typeof a.transcript==='string'&&clean(a.transcript));
  if(expected&&transcribed.some(a=>!clean(a.transcript).includes(expected)))return {status:'incompatible',message:'所选录音的已登记台词不包含本镜原句，请选择对应配音；不会自动替换或修改原对白。'};
  if(!tagged.length)return {status:'unverified',message:'未标注角色的旧录音或手动导入；须试听确认音色。'};
  return {status:'compatible',speakerId:speakers[0],message:'角色与已标注的音色版本一致；仍须听审和检查口型。'};
 }
 function assertSelection(data,shot,file,events){const result=inspect(data,shot,file,events);if(result.status==='incompatible')throw Error(result.message);return result}
 function checkBound(data,shot,events){if(!shot.performanceAudio)return;return assertSelection(data,shot,shot.performanceAudio.source?.file||shot.performanceAudio.file,events)}
 const api={fileName,inspect,assertSelection,checkBound};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VoiceCasting=api;
})(typeof globalThis!=='undefined'?globalThis:this);
