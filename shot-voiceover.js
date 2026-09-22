(function(root){
 const Dialogue=typeof module!=='undefined'&&module.exports?require('./dialogue-contract'):root.DialogueContract;
 function text(shot){return String(shot.dialogue||'').split('\n').filter(line=>/^旁白(?:（画外）)?[:：]/.test(line.trim())).map(line=>line.trim().replace(/^旁白(?:（画外）)?[:：]\s*/, '')).join('\n')}
 function apply(shot,value){
  value=String(value||'').trim();if(value===text(shot))return shot;
  if(/[<>]/.test(value))throw Error('画外音请输入普通文字，不要包含模型标签');
  if(!value){
   const next={...shot};
   if(shot.voiceoverOriginal){for(const key of ['dialogue','sourceExcerpt','dur','audioMode','audioAsset']){delete next[key];if(shot.voiceoverOriginal[key]!==undefined)next[key]=shot.voiceoverOriginal[key]}}
   else next.dialogue=String(shot.dialogue||'').split('\n').filter(line=>!/^旁白(?:（画外）)?[:：]/.test(line.trim())).join('\n');
   delete next.voiceoverOriginal;return next;
  }
  if(['black','screen'].includes(shot.renderMode))throw Error('当前镜头使用本地静音画面，请先改为 AI 生成画面，再添加画外音');
  const words=Array.from(value.replace(/[\s，。！？、…,.!?]/g,'')).length,required=Math.max(4,Math.ceil((words/4+.8)*10)/10);
  if(required>15)throw Error('这段画外音超过单镜 15 秒可容纳的长度，请缩短文字或分到多个镜头');
  const dialogue=value.split(/\n+/).filter(s=>s.trim()).map(s=>'旁白：'+s.trim()).join('\n');
  const screenTexts=Object.values(shot.assetStates||{}).map(s=>s.screenText).filter(Boolean).map(s=>'屏幕文字：'+s);
  const next={...shot,dialogue,dur:Math.max(Number(shot.dur)||4,required),sourceExcerpt:[shot.script||shot.visual||'',dialogue,...screenTexts].filter(Boolean).join('\n'),audioMode:'model'};
  next.voiceoverOriginal=shot.voiceoverOriginal||Object.fromEntries(['dialogue','sourceExcerpt','dur','audioMode','audioAsset'].map(key=>[key,shot[key]]));
  delete next.audioAsset;
  const events=Dialogue.parseDialogue(dialogue);Dialogue.checkSource(events,next.sourceExcerpt);Dialogue.bindDialogue('visual only',events,next.dur);
  return next;
 }
 const api={text,apply};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShotVoiceover=api;
})(typeof globalThis!=='undefined'?globalThis:this);
