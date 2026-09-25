(function(root){
 function validate(mode,events,audioAsset){
  mode=mode||'model';
  if(!['model','mute','replacement','overlay','voiceover'].includes(mode))throw Error('镜头声音方式无效');
  if(mode==='voiceover'){
   if(!Array.isArray(events)||!events.some(e=>e.type==='speech')||events.some(e=>e.type==='speech'&&!['offscreen','phone'].includes(e.delivery)))throw Error('独立画外声仅用于旁白、电视或电话声音，不能替换画内人物对白');
  }else if(mode!=='model'&&mode!=='overlay'&&(!Array.isArray(events)||events.some(e=>e.type==='speech')))throw Error('替换声音只适用于已确认没有口头对白的镜头');
  if(['replacement','overlay','voiceover'].includes(mode)&&(typeof audioAsset!=='string'||!/^ams-audio-[a-f0-9]{64}\.wav$/.test(audioAsset)))throw Error('请先导入独立声音素材');
  return mode;
 }
 const api={validate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShotAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this);
