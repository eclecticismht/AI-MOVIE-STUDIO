const assetBulk={projectId:null,rows:[],busy:false};
function assetBulkControls(){return `<p class="muted">选择多张图片，核对每张图对应的角色、场景或道具，再点击导入。同名图片会自动匹配；替换参考图会影响后续生成。</p><input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" multiple aria-label="选择多张参考图" onchange="assetBulkChoose(this)"><div id="assetBulkRows"></div><p role="status" id="assetBulkStatus"></p><details><summary>高级：导入 JSON 资产清单</summary>${assetPackControls('library')}</details>`}
function assetBulkAssets(){return ['characters','scenes','props'].flatMap(kind=>items(kind).map(a=>({...a,kind,label:{characters:'角色',scenes:'场景',props:'道具'}[kind]})))}
function assetBulkChoose(input){if(assetBulk.busy)return;for(const row of assetBulk.rows)URL.revokeObjectURL(row.preview);assetBulk.rows=[];assetBulk.projectId=D.activeProjectId;
  const files=[...input.files||[]],assets=assetBulkAssets(),normal=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  if(files.length>50){document.getElementById('assetBulkStatus').textContent='每次最多选择 50 张图片。';return}
  assetBulk.rows=files.map(file=>{const name=normal(file.name.replace(/\.[^.]+$/,'')),matches=assets.filter(a=>normal(a.name)===name||normal(a.assetId)===name);let error='';try{if(!assetMediaType(file).startsWith('image/'))throw Error('请选择图片');if(file.size>5242880)throw Error('超过 5 MB')}catch(e){error=e.message}return {file,preview:error?'':URL.createObjectURL(file),target:matches.length===1?matches[0].id:'',status:error,error:!!error,done:false}});
  assetBulkRender();document.getElementById('assetBulkStatus').textContent='请核对对应关系。没有匹配的图片可以手动指定，或保留“跳过”。';
}
function assetBulkRender(){const root=document.getElementById('assetBulkRows');if(!root)return;
  if(assetBulk.projectId!==D.activeProjectId){root.innerHTML='';return}
  const assets=assetBulkAssets();root.innerHTML=assetBulk.rows.map((row,i)=>`<div class="bulk-image-row">${row.preview?`<img src="${row.preview}" alt="${esc(row.file.name)} 预览">`:''}<div><b>${esc(row.file.name)}</b><label>对应资产<select aria-label="${esc(row.file.name)} 对应资产" onchange="assetBulk.rows[${i}].target=this.value" ${row.done||row.error||assetBulk.busy?'disabled':''}><option value="">跳过此图片</option>${assets.map(a=>`<option value="${esc(a.id)}" ${row.target===a.id?'selected':''}>${a.label} · ${esc(a.name)}${a.imageUrl?'（替换现有图片）':''}</option>`).join('')}</select></label><span>${esc(row.status||'待导入')}</span></div></div>`).join('')+(assetBulk.rows.length?`<button class="btn gold" onclick="assetBulkImport()" ${assetBulk.busy?'disabled':''}>${assetBulk.busy?'正在导入…':'导入已匹配图片'}</button>`:'');
}
async function assetBulkImport(){if(assetBulk.busy||assetBulk.projectId!==D.activeProjectId)return;
  const rows=assetBulk.rows.filter(r=>r.target&&!r.error&&!r.done),projectId=D.activeProjectId,message=document.getElementById('assetBulkStatus');
  if(!rows.length){message.textContent='请至少为一张图片选择对应资产。';return}
  if(new Set(rows.map(r=>r.target)).size!==rows.length){message.textContent='多张图片不能同时替换同一资产，请调整对应关系。';return}
  assetBulk.busy=true;assetBulkRender();let saved=0;
  for(const row of rows){try{
    if(D.activeProjectId!==projectId)throw Error('项目已切换，未导入。');
    const asset=assetBulkAssets().find(a=>a.id===row.target);if(!asset)throw Error('资产已删除，请重新选择。');const prior=asset.imageUrl||'';
    row.status='正在上传…';assetBulkRender();
    const r=await fetch('/api/asset-media',{method:'POST',headers:{'Content-Type':assetMediaType(row.file)},body:row.file,signal:AbortSignal.timeout(60000)}),out=await r.json();if(!r.ok)throw Error(out.error||'图片上传失败');
    const current=D[asset.kind].find(a=>a.projectId===projectId&&a.id===asset.id);if(!current||D.activeProjectId!==projectId||(current.imageUrl||'')!==prior)throw Error('资产或项目已变化，未覆盖图片。');
    const updated=D[asset.kind].map(a=>a===current?{...a,imageUrl:out.url}:a);localStorage.setItem('aimovie_data',JSON.stringify({...D,[asset.kind]:updated}));D[asset.kind]=updated;row.done=true;row.status='已导入';saved++;
  }catch(e){row.status=e.message}assetBulkRender();if(D.activeProjectId!==projectId)break}
  assetBulk.busy=false;if(D.activeProjectId===projectId){renderModules();assetBulkRender();document.getElementById('assetBulkStatus').textContent=`本次已导入 ${saved} 张，${rows.length-saved} 张未导入。成功项不会重复上传，可修正后重试。`}
}
const assetBulkRenderModules=renderModules;
renderModules=function(){assetBulkRenderModules();assetBulkRender()};
