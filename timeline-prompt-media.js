(function(root){
 function references(shot){return (shot.promptMedia||[]).map(m=>({assetId:m.id,kind:m.type==='video'?'videos':'images',name:m.name,imageUrl:m.url,...(m.file?{file:m.file}:{}),notes:'State for this shot only: '+(m.note||'Use as visual reference for the requested subjects, action and composition. Preserve existing character identity references; do not add unrelated people or copy text, logos or watermarks.')}))}
 function validate(shot,media,imageCount=0){
  if(!Array.isArray(media)||media.filter(m=>m.type==='image').length+imageCount>9||media.filter(m=>m.type==='video').length>3)throw Error('每镜最多 9 张图片（含资产图片）、3 个视频');
  const ids=new Set();for(const m of media){if(!m||!['image','video'].includes(m.type)||typeof m.id!=='string'||ids.has(m.id)||typeof m.name!=='string'||typeof m.note!=='string'||m.note.length>2000)throw Error('参考素材信息无效');ids.add(m.id);
   if(m.type==='video'?!/^ams-video-[a-f0-9]{64}\.mp4$/.test(m.file||'')||m.url!=='/assets/imported/'+m.file:!/^\/assets\/imported\/asset-[a-f0-9]{64}\.(png|jpg|webp)$/.test(m.url))throw Error('参考素材地址无效');
  }
  if(media.length&&(shot.firstFrameUrl||shot.continueFromShotId||['black','screen'].includes(shot.renderMode)))throw Error('参考素材模式不能与独立首帧、段间引导或本地合成同时使用，请先关闭相应设置');
  return media;
 }
 const api={references,validate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TimelinePromptMedia=api;
})(typeof globalThis!=='undefined'?globalThis:this);
