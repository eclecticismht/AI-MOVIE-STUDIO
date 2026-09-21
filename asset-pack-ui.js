function assetPackControls(section){return `<div class="card"><h3>导入资产图片包</h3><p class="muted">输入本工作室的资产包地址，按当前项目的资产名称匹配图片；可复用于任何故事，不修改剧本和分镜。</p><input id="assetPackUrl_${section}" placeholder="/assets/项目名/manifest.json"><button class="btn" onclick="importAssetImagePack('${section}')">检查并导入图片</button><p id="assetPackMessage_${section}" role="status"></p></div>`}
async function importAssetImagePack(section){
  const projectId=D.activeProjectId,url=document.getElementById('assetPackUrl_'+section).value.trim(),message=document.getElementById('assetPackMessage_'+section);
  try{
    if(!/^\/assets\/[a-zA-Z0-9_/-]+\.json$/.test(url)||url.includes('..'))throw Error('请填写本地 /assets/ 下的 JSON 资产包地址。');
    const response=await fetch(url),pack=await response.json();if(!response.ok||!Array.isArray(pack.assets)||pack.assets.length>200)throw Error('资产包格式无效。');
    const changes=[],created=[],seen=new Set();
    for(const row of pack.assets){
      if(!['characters','scenes','props'].includes(row.kind)||typeof row.name!=='string'||!/^\/assets\/[a-zA-Z0-9_/-]+\.(png|jpg|webp)$/.test(row.imageUrl||'')||row.imageUrl.includes('..'))throw Error('资产包包含无效图片。');
      const candidates=(D[row.kind]||[]).filter(a=>a.projectId===projectId&&a.name===row.name);if(candidates.length>1||(candidates.length===0&&!pack.createMissing))throw Error(row.name+'：当前项目没有唯一匹配资产，请先建立或整理档案。');
      let asset=candidates[0];if(!asset){if(typeof row.notes!=='string'||!row.notes.trim())throw Error('新资产必须提供连续性描述');const prefix={characters:'CH',scenes:'SC',props:'PR'}[row.kind];asset={id:uid(prefix),projectId,name:row.name,type:row.type||'核心资产',notes:row.notes,assetId:prefix+'_'+String((D[row.kind]||[]).filter(a=>a.projectId===projectId).length+created.filter(c=>c.kind===row.kind).length+1).padStart(3,'0')};if(created.some(c=>c.kind===row.kind&&c.asset.name===row.name))throw Error('资产包重复创建：'+row.name);created.push({kind:row.kind,asset})}if(seen.has(asset.id))throw Error('资产包重复引用：'+row.name);seen.add(asset.id);
      await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=()=>reject(Error(row.name+'图片无法读取'));img.src=row.imageUrl});
      changes.push({kind:row.kind,id:asset.id,imageUrl:row.imageUrl});
    }
    if(D.activeProjectId!==projectId)throw Error('项目已切换，未导入，请在目标项目重试。');
    const next={...D};for(const kind of ['characters','scenes','props'])next[kind]=(D[kind]||[]).map(a=>{const change=changes.find(c=>c.kind===kind&&c.id===a.id);return change?{...a,imageUrl:change.imageUrl}:a});
    for(const item of created)next[item.kind].push({...item.asset,imageUrl:changes.find(c=>c.id===item.asset.id).imageUrl});
    localStorage.setItem('aimovie_data',JSON.stringify(next));for(const kind of ['characters','scenes','props'])D[kind]=next[kind];renderModules();
    const output=document.getElementById('assetPackMessage_'+section);if(output)output.textContent=`已导入 ${changes.length} 张图片。分镜引用这些资产时将使用新图片；已排队任务保留原图片快照。`;
  }catch(error){message.textContent=error.message}
}
for(const name of ['renderCharacterAssets','renderSceneAssets','renderPropAssets']){
  const previous=window[name],id={renderCharacterAssets:'characters',renderSceneAssets:'scenes',renderPropAssets:'propsdb'}[name];
  window[name]=function(){previous();document.getElementById(id)?.insertAdjacentHTML('beforeend',assetPackControls(id))};
}
