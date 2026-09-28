(function(root){
 function frames(seconds){return Math.max(5,17*Math.round((Number(seconds)*24-5)/17)+5)}
 function speechKey(events){return JSON.stringify((events||[]).filter(e=>e.type==='speech').map(e=>[e.speakerId,e.delivery,e.text]))}
 function validate(binding,shot){
  if(binding==null)return undefined;
  const duration=Number(shot.duration??shot.dur),events=shot.dialogueEvents||[],speech=events.filter(e=>e.type==='speech');
  if(binding.version!==1||typeof binding.file!=='string'||!/^ams-audio-[a-f0-9]{64}\.wav$/.test(binding.file)||!/^([a-f0-9]{64})$/.test(binding.sha256||''))throw Error('H3 配音绑定无效，请重新保存配音参考');
  if(!Number.isFinite(duration)||duration<4||duration>15||binding.duration!==duration||binding.frames!==frames(duration))throw Error('H3 镜头时长已改变，请重新保存配音参考');
  if(!speech.length||new Set(speech.map(e=>e.speakerId)).size!==1||binding.speechKey!==speechKey(events))throw Error('H3 台词或说话人物已改变，请重新核对配音；每镜只保留一位说话人');
  if(shot.firstFrame||shot.firstFrameUrl||shot.continueFromShotId||['black','screen'].includes(shot.renderMode))throw Error('H3 配音参考当前用于资产参考生成，请清除独立首帧或尾帧承接，使用角色与场景参考图');
  if(shot.audioMode&&shot.audioMode!=='model')throw Error('H3 配音参考会保留已选配音，请将生成后声音方式改为保留原声');
  const source=binding.source;
  if(source&&(!/^ams-audio-[a-f0-9]{64}\.wav$/.test(source.file)||!/^[a-f0-9]{64}$/.test(source.sha256)||![16,24].includes(source.bits)||![source.trimIn,source.trimOut,source.offset].every(Number.isFinite)||source.trimIn<0||source.trimOut<=source.trimIn||source.offset<0))throw Error('H3 配音来源记录无效，请重新保存配音参考');
  return {version:1,file:binding.file,sha256:binding.sha256,duration,frames:binding.frames,speechKey:binding.speechKey,...(source?{source:Object.fromEntries(['file','sha256','bits','trimIn','trimOut','offset'].map(k=>[k,source[k]]))}:{})};
 }
 const api={frames,speechKey,validate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PerformanceAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this);
