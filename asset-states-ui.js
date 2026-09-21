function assetStateEditor(shot){
  const selected=[...(shot.characterIds||[]),...(shot.sceneIds||[]),...(shot.propIds||[])];
  const assets=['characters','scenes','props'].flatMap(kind=>(D[kind]||[]).filter(a=>a.projectId===shot.projectId&&selected.includes(a.id)).map(a=>({...a,assetKind:kind})));
  return `<details><summary>本镜资产状态（不修改资产库）</summary><p class="muted">填写当前服装、道具状态或屏幕原文。状态图片只用于本镜，并优先保留其中的照片和布局；未指定状态图片时，屏幕文字会生成参考卡，并在自动成片中叠加为清晰信息卡（不跟踪手机屏幕）。新增资产引用后先保存，再设置状态。</p>${assets.map(a=>{const s=shot.assetStates?.[a.id]||{};return `<fieldset data-asset-state="${esc(a.id)}"><legend>${esc(a.name)}</legend>${a.assetKind==='characters'?`<label>人物出现方式<select data-state="presence"><option value="">现场人物（默认）</option><option value="screen" ${s.presence==='screen'?'selected':''}>仅在手机屏幕或照片中</option><option value="offscreen" ${s.presence==='offscreen'?'selected':''}>画外 / 仅提及，不入画</option></select></label>`:''}<label>当前状态<input data-state="description" value="${esc(s.description||'')}" placeholder="例如：转账后余额、回忆中的校服"></label><label>本镜状态图片地址（可选）<input data-state="imageUrl" value="${esc(s.imageUrl||'')}"></label><label>屏幕原文（仅屏幕道具填写）<textarea data-state="screenText">${esc(s.screenText||'')}</textarea></label><label>屏幕显示方式<select data-state="screenEffect"><option value="static">静态文字</option><option value="type-delete" ${s.screenEffect==='type-delete'?'selected':''}>逐字输入后删除（每行一段，均不发送）</option></select></label>${s.screenText?`<img src="${screenStateImage(s.screenText)}" alt="本镜屏幕文字参考" style="width:160px;max-width:100%;display:block">`:''}</fieldset>`}).join('')}</details>`;
}
function readAssetStateEditor(shot){
  const ids=[...(shot.characterIds||[]),...(shot.sceneIds||[]),...(shot.propIds||[])];const states={};document.querySelectorAll('[data-asset-state]').forEach(node=>{if(!ids.includes(node.dataset.assetState))return;states[node.dataset.assetState]=Object.fromEntries(['description','imageUrl','screenText','screenEffect','presence'].map(key=>[key,node.querySelector('[data-state="'+key+'"]')?.value||'']))});
  return AssetStates.validate(states,[...(shot.characterIds||[]),...(shot.sceneIds||[]),...(shot.propIds||[])],shot.sourceExcerpt);
}
function screenStateImage(text){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1024;const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f6f7';ctx.fillRect(0,0,768,1024);ctx.fillStyle='#17191c';ctx.font='32px "Microsoft YaHei", sans-serif';
  let y=90;for(const paragraph of text.split('\n')){let line='';for(const char of paragraph){if(ctx.measureText(line+char).width>648){ctx.fillText(line,60,y);y+=48;line=''}line+=char}ctx.fillText(line,60,y);y+=56}
  if(y>980)throw Error('本镜屏幕文字太多，请拆分镜头，避免参考图截断');return canvas.toDataURL('image/png');
}
compileH3Prompt=function(shot){return ShotPrompt.compile(shot,D.projects.find(p=>p.id===shot.projectId),shotReferenceAssets(shot));};
