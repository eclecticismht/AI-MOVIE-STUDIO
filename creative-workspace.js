// Unified surfaces reuse the existing editors and preserve all asset IDs.
const libraryKinds=[['characters','角色','characterIds'],['scenes','场景','sceneIds'],['propsdb','道具','propIds']];
const libraryView={kind:'all',query:'',missing:false};
function libraryMount(){
  if(document.getElementById('libraryGroups'))return;
  const page=document.getElementById('assets')||document.createElement('section');page.id='assets';page.classList.add('page');
  page.innerHTML=`<h1>项目资产库</h1><p class="muted">角色、场景与道具统一管理，分镜继续引用同一份档案。</p><div id="librarySummary" class="muted"></div><div class="card library-controls"><div class="toolbar" id="libraryTabs"></div><div class="toolbar"><input id="librarySearch" aria-label="搜索项目资产" placeholder="搜索名称、编号、类型或描述" oninput="libraryView.query=this.value;libraryFilter()"><label><input type="checkbox" onchange="libraryView.missing=this.checked;libraryFilter()"> 只看待补充</label><span id="libraryCount" role="status"></span></div></div><div id="libraryGroups"></div><p id="libraryEmpty" class="empty" hidden>没有符合条件的资产，试试其他关键词或分类。</p><details class="card"><summary>批量导入参考图</summary>${assetBulkControls()}</details>`;
  document.querySelector('main').append(page);
  for(const [id] of libraryKinds){const group=document.getElementById(id);group.classList.remove('page','on');group.classList.add('library-group');document.getElementById('libraryGroups').append(group)}
}
function libraryFilter(){
  let visible=0;const query=libraryView.query.trim().toLocaleLowerCase();
  for(const [id] of libraryKinds){const group=document.getElementById(id);group.hidden=libraryView.kind!=='all'&&libraryView.kind!==id;
    for(const card of group.querySelectorAll('.assetCard')){card.hidden=!!query&&!card.textContent.toLocaleLowerCase().includes(query)||libraryView.missing&&card.dataset.incomplete!=='true';if(!group.hidden&&!card.hidden)visible++}
  }
  document.getElementById('libraryCount').textContent=`显示 ${visible} 项`;
  document.getElementById('libraryEmpty').hidden=visible>0;
  document.querySelectorAll('#libraryTabs button').forEach(b=>{b.classList.toggle('gold',b.dataset.kind===libraryView.kind);b.setAttribute('aria-pressed',String(b.dataset.kind===libraryView.kind))});
}
function librarySelect(kind){libraryView.kind=kind;libraryFilter()}
function libraryRefresh(){
  libraryMount();let total=0,missing=0;
  document.getElementById('libraryTabs').innerHTML=[['all','全部'],...libraryKinds].map(([id,label])=>`<button class="btn" data-kind="${id}" onclick="librarySelect(this.dataset.kind)">${label}${id==='all'?'':` · ${items(id==='propsdb'?'props':id).length}`}</button>`).join('');
  for(const [id,label,ref] of libraryKinds){const group=document.getElementById(id),assets=items(id==='propsdb'?'props':id);total+=assets.length;
    group.querySelector('h1')?.replaceChildren(document.createTextNode(label));
    group.querySelector('#assetPackUrl_'+id)?.closest('.card')?.remove();
    group.querySelectorAll('.assetCard').forEach((card,index)=>{const asset=assets[index];if(!asset)return;card.querySelector('.library-health')?.remove();
      const gaps=[!asset.notes?.trim()&&'缺描述',!asset.imageUrl?.trim()&&'缺参考图'].filter(Boolean);if(gaps.length)missing++;
      const count=items('shots').filter(shot=>(shot[ref]||[]).includes(asset.id)).length;
      card.dataset.incomplete=String(gaps.length>0);card.insertAdjacentHTML('beforeend',`<p class="library-health ${gaps.length?'needs-work':''}">${gaps.length?gaps.join(' · '):'描述与参考图已填写'}<br><span class="muted">${count?`已被 ${count} 个分镜引用`:'尚未被分镜引用'}</span></p>`);
    });
  }
  document.getElementById('librarySummary').textContent=`《${activeProject().name}》 · ${total} 项资产 · ${missing} 项待补充。参考图是否可读取将在生成前检查。`;
  libraryFilter();
}
const creativeRenderModules=renderModules;
renderModules=function(){creativeRenderModules();libraryRefresh()};
const creativeGo=go;
go=function(id){libraryMount();if(libraryKinds.some(([key])=>key===id)){libraryView.kind=id;id='assets'}if(id==='stories')id='scripts';return creativeGo(id)};

const creativeRenderScripts=renderScripts;
renderScripts=function(){
  creativeRenderScripts();const root=document.getElementById('scripts'),p=activeProject();
  root.classList.add('creative-workspace');root.querySelector('h1').textContent='故事与剧本';
  root.querySelector('h1 + p').textContent='从故事原文到完整剧本，在同一处创作；选定版本后进入时间线制作分镜。';
  const source=document.getElementById('storyTextInput').closest('.card'),content=document.getElementById('screenplayContent')?.closest('.card')||[...root.querySelectorAll('.card')].find(c=>c.textContent.includes('完整剧本'));
  const columns=document.createElement('div');columns.className='creative-columns';source.before(columns);columns.append(source);if(content)columns.append(content);
  source.insertAdjacentHTML('beforeend',`<details class="creative-bible"><summary>创作设定：主题、类型与视觉风格</summary>${[['logline','一句话故事'],['synopsis','故事梗概'],['theme','核心命题'],['genre','类型'],['style','视觉风格']].map(([key,label])=>`<label>${label}<textarea aria-label="${label}" oninput="creativeSaveBible('${key}',this.value)">${esc(p.bible?.[key]||'')}</textarea></label>`).join('')}<small class="muted">设定随项目保存，供后续镜头提示词使用；本次剧本的具体改编方向请填写上方改编要求。</small></details>`);
  if(content){content.insertAdjacentHTML('beforeend','<div class="toolbar"><button class="btn" onclick="creativeDraft()">新建空白剧本</button><button class="btn gold" onclick="creativeToStoryboard()">用本版制作分镜 →</button></div><p id="creativeSourceStatus" class="muted"></p>');creativeSourceStatus()}
};
function creativeSourceStatus(){const el=document.getElementById('creativeSourceStatus'),s=currentScreenplay();if(el)el.textContent=s?.sourceStory!==undefined&&s.sourceStory.trim()!==(activeProject().storyText??activeProject().bible?.synopsis??'').trim()?'原文已与本版生成时不同。可继续手动改编，或重新生成并保留旧版。':'已有分镜保留各自的剧本来源，编辑正文不会自动重建分镜。'}
function creativeSaveBible(key,value){const p=activeProject(),bible={...p.bible,[key]:value},bibleManual={...p.bibleManual,[key]:true};try{localStorage.setItem('aimovie_data',JSON.stringify({...D,projects:D.projects.map(x=>x===p?{...p,bible,bibleManual}:x)}));Object.assign(p,{bible,bibleManual});document.getElementById('screenplaySaveState').textContent='创作设定已保存'}catch{document.getElementById('screenplaySaveState').textContent='保存失败，请复制当前内容备份'}}
function creativeDraft(){const p=activeProject(),s={id:uid('SCR'),projectId:p.id,kind:'screenplay',title:p.name+' · 剧本',content:'',status:'草稿',createdAt:new Date().toISOString()};try{localStorage.setItem('aimovie_data',JSON.stringify({...D,scripts:[...D.scripts,s],projects:D.projects.map(x=>x===p?{...p,screenplayId:s.id}:x)}));D.scripts.push(s);p.screenplayId=s.id;renderScripts();document.getElementById('screenplayContent').focus()}catch{document.getElementById('screenplayMessage').textContent='未能保存新剧本，请备份项目后重试。'}}
function creativeToStoryboard(){const s=currentScreenplay();if(!s?.content.trim()){document.getElementById('screenplayMessage').textContent='请先生成或填写剧本正文。';return}const p=activeProject();try{localStorage.setItem('aimovie_data',JSON.stringify({...D,projects:D.projects.map(x=>x===p?{...p,storyboardScriptId:s.id}:x)}));p.storyboardScriptId=s.id;go('shots');if(document.getElementById('timeline')?.classList.contains('on'))tlTools('shots')}catch{document.getElementById('screenplayMessage').textContent='保存剧本选择失败，请重试。'}}
