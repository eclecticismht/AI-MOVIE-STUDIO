// Generates screenplay documents and descriptive assets, never production shots.
const screenplayRequests=new Set();
const screenplayMessages=new Map();
let screenplayApiKey='';
let screenplayServerConfigured=false;

function prepareScreenplayAssets(bundle,projectId,scriptId) {
  const collections={},references={},counts=[];
  for(const [kind,prefix,ref,label] of [['characters','CH','characterIds','角色'],['scenes','SC','sceneIds','场景'],['props','PR','propIds','道具']]) {
    if(!Array.isArray(bundle?.[kind]))throw new Error('未收到完整资产清单，请重启本地服务器后重新生成。');
    collections[kind]=[...(D[kind]||[])];references[ref]=[];let added=0;
    const nameKey=name=>name.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
    for(const item of bundle[kind]) {
      if(!item||['name','type','notes'].some(key=>typeof item[key]!=='string'||!item[key].trim()))throw new Error('资产清单格式不正确，请重新生成。');
      let asset=collections[kind].find(a=>a.projectId===projectId&&nameKey(a.name)===nameKey(item.name));
      if(!asset) {
        const used=new Set(collections[kind].filter(a=>a.projectId===projectId).map(a=>a.assetId));let n=1;
        while(used.has(prefix+'_'+String(n).padStart(3,'0')))n++;
        asset={id:uid(prefix),projectId,assetId:prefix+'_'+String(n).padStart(3,'0'),name:item.name.trim(),type:item.type.trim(),notes:item.notes.trim(),prompt:'',imageUrl:'',videoUrl:'',sourceScriptId:scriptId};
        collections[kind].push(asset);added++;
      }
      if(!references[ref].includes(asset.id))references[ref].push(asset.id);
    }
    counts.push(`${label} ${references[ref].length} 个（新增 ${added}）`);
  }
  return {collections,references,summary:counts.join('，')};
}

function screenplayVersions(projectId=D.activeProjectId) {
  return D.scripts.filter(script=>script.projectId===projectId&&script.kind==='screenplay');
}
function currentScreenplay() {
  const versions=screenplayVersions();
  return versions.find(script=>script.id===activeProject().screenplayId)||versions.at(-1);
}
function saveScreenplayField(field,value) {
  const p=activeProject();
  const script=currentScreenplay(),patch=field==='content'?{content:value,status:'已编辑',updatedAt:new Date().toISOString()}:{[field]:value};
  if(field==='content'&&!script||!['content','storyText','screenplayNotes','screenplayModel'].includes(field))return;
  const next=field==='content'?{...D,scripts:D.scripts.map(s=>s===script?{...s,...patch}:s)}:{...D,projects:D.projects.map(x=>x===p?{...p,...patch}:x)};
  try {localStorage.setItem('aimovie_data',JSON.stringify(next));Object.assign(field==='content'?script:p,patch);document.getElementById('screenplaySaveState').textContent='已保存到本机';if(typeof creativeSourceStatus==='function')creativeSourceStatus()}
  catch {document.getElementById('screenplaySaveState').textContent='保存失败：本机存储空间不足，请立即导出剧本'}
}
function selectScreenplay(id) {
  if(!screenplayVersions().some(script=>script.id===id))return;
  activeProject().screenplayId=id;localStorage.setItem('aimovie_data',JSON.stringify(D));renderScripts();
}
function deleteSavedScript(id) {
  const script=D.scripts.find(item=>item.id===id&&item.projectId===D.activeProjectId&&item.kind!=='screenplay');
  if(!script)return;
  if(!confirm(`删除以前保存的剧本《${script.title||'未命名剧本'}》？\n删除后无法恢复。已有分镜、视频和生成记录会保留。`))return;
  const scripts=D.scripts.filter(item=>item!==script);
  const shots=D.shots.map(shot=>shot.projectId===script.projectId&&shot.scriptId===id?{...shot,scriptId:null}:shot);
  try {
    // Commit storage first so a failed save cannot leave a half-deleted project.
    localStorage.setItem('aimovie_data',JSON.stringify({...D,scripts,shots}));
    D.scripts=scripts;D.shots=shots;
    screenplayMessages.set(script.projectId,'已删除该份旧剧本，已有分镜和生成记录已保留。');
  } catch {
    screenplayMessages.set(script.projectId,'删除未保存成功，剧本仍然保留。请检查浏览器存储后重试。');
  }
  renderScripts();
}
function renderScreenplayWorkspace() {
  const p=activeProject(),versions=screenplayVersions(),script=currentScreenplay(),busy=screenplayRequests.has(p.id);
  const legacy=items('scripts').filter(item=>item.kind!=='screenplay'&&!item.autoArchived);
  document.getElementById('scripts').innerHTML=`
    <h1>剧本工作区</h1><p class="muted">将故事改编为完整剧本，同时整理角色、场景和道具并存入本项目资产库。资产为可编辑的文字档案，参考图片与视频可后续添加。</p>
    <div class="card"><h2>故事原文</h2>
      <label for="storyTextInput" class="muted">粘贴你的完整故事</label>
      <textarea id="storyTextInput" style="min-height:220px;line-height:1.8;margin-top:8px" placeholder="把故事原文粘贴到这里…" oninput="saveScreenplayField('storyText',this.value)">${esc(p.storyText??p.bible?.synopsis??'')}</textarea>
      <label for="screenplayNotes" class="muted">改编要求（可选）</label>
      <textarea id="screenplayNotes" style="min-height:70px;margin-top:8px" placeholder="例如：保留原结局，对白自然克制，突出父女关系。" oninput="saveScreenplayField('screenplayNotes',this.value)">${esc(p.screenplayNotes||'')}</textarea>
      <details style="margin:14px 0" ${!screenplayApiKey&&!screenplayServerConfigured?'open':''}><summary>DeepSeek 连接</summary>
        <p class="muted">生成时将故事原文和改编要求发送至 DeepSeek。API Key 仅用于当前会话，刷新后需重新填写。</p>
        <div class="formgrid"><div class="field"><label for="screenplayApiKey">DeepSeek API Key</label><input id="screenplayApiKey" type="password" autocomplete="off" placeholder="${screenplayApiKey?'本次会话已填写，可输入新密钥替换':screenplayServerConfigured?'服务器已配置密钥':'填写你的 API Key'}" oninput="screenplayApiKey=this.value.trim()"></div>
        <div class="field"><label for="screenplayModel">模型</label><input id="screenplayModel" list="screenplayModelList" value="${esc(p.screenplayModel||'deepseek-flash')}" oninput="saveScreenplayField('screenplayModel',this.value)"><datalist id="screenplayModelList"><option value="deepseek-flash"><option value="deepseek-v4-pro"></datalist></div></div>
      </details>
      <div class="toolbar"><button class="btn gold" ${busy?'disabled':''} onclick="generateScreenplay()">${busy?'正在生成剧本与资产…':versions.length?'重新生成剧本与资产（保留旧版）':'生成剧本与资产'}</button><span class="muted" id="screenplaySaveState">原文与编辑内容自动保存到本机</span></div>
      <p class="muted">已有同名资产会复用，保留已编辑的描述与参考素材。</p>
      <p role="status" aria-live="polite" id="screenplayMessage">${esc(screenplayMessages.get(p.id)||'')}</p>
    </div>
    ${script?.assetSummary?`<div class="card"><h2>本版剧本资产</h2><p>${esc(script.assetSummary)}</p><div class="toolbar"><button class="btn" onclick="go('characters')">查看角色</button><button class="btn" onclick="go('scenes')">查看场景</button><button class="btn" onclick="go('propsdb')">查看道具</button></div></div>`:''}
    <div class="card"><div class="toolbar"><h2 style="margin:0">完整剧本</h2>${versions.length?`<label for="screenplayVersion">版本</label><select id="screenplayVersion" onchange="selectScreenplay(this.value)">${versions.map((version,index)=>`<option value="${esc(version.id)}" ${version.id===script?.id?'selected':''}>第 ${index+1} 版 · ${esc(new Date(version.createdAt).toLocaleString())}</option>`).join('')}</select><button class="btn" onclick="copyScreenplay()">复制剧本</button><button class="btn" onclick="exportScreenplay()">导出 TXT</button>`:''}</div>
      ${script?`<label for="screenplayContent" class="muted">可直接修改正文，修改后自动保存</label><textarea id="screenplayContent" oninput="saveScreenplayField('content',this.value)" style="min-height:620px;line-height:1.9;margin-top:12px">${esc(script.content)}</textarea>`:'<div class="empty">粘贴故事原文后点击“生成剧本”，在这里编辑完整正文。</div>'}
    </div>
    ${legacy.length?`<details class="card"><summary>以前保存的剧本内容（${legacy.length} 份）</summary>${legacy.map(item=>`<article id="workcard_${esc(item.id)}"><div class="toolbar"><h3>${esc(item.title)}</h3><button class="btn" data-script-id="${esc(item.id)}" onclick="deleteSavedScript(this.dataset.scriptId)">删除这份剧本</button></div><pre style="white-space:pre-wrap;font:inherit;line-height:1.8">${esc(item.content)}</pre></article>`).join('')}</details>`:''}`;
}
async function generateScreenplay() {
  const p=activeProject();if(screenplayRequests.has(p.id))return;
  const story=document.getElementById('storyTextInput').value.trim();
  const notes=document.getElementById('screenplayNotes').value.trim();
  const model=document.getElementById('screenplayModel').value.trim();
  if(!story){screenplayMessages.set(p.id,'请先粘贴故事原文。');renderScripts();return}
  if(story.length>60000){screenplayMessages.set(p.id,'故事超过 60,000 字，请按章节生成。');renderScripts();return}
  Object.assign(p,{storyText:story,screenplayNotes:notes,screenplayModel:model});
  try {localStorage.setItem('aimovie_data',JSON.stringify(D))}catch{screenplayMessages.set(p.id,'本机存储空间不足，请先备份项目数据。');renderScripts();return}
  if(location.protocol==='file:'){screenplayMessages.set(p.id,'请启动本地服务器，并在 http://127.0.0.1:4173 打开工作室后生成。');renderScripts();return}
  if(!model){screenplayMessages.set(p.id,'请填写 DeepSeek 模型名称。');renderScripts();return}
  screenplayRequests.add(p.id);screenplayMessages.set(p.id,'正在生成剧本并整理角色、场景、道具，请稍候…');renderScripts();
  try {
    const response=await fetch('/api/screenplay',{method:'POST',headers:{'Content-Type':'application/json',...(typeof textAIHeaders==='function'?textAIHeaders(model):(screenplayApiKey?{Authorization:'Bearer '+screenplayApiKey}:{}))},body:JSON.stringify({story,notes,model,includeAssets:true}),signal:AbortSignal.timeout(250000)});
    if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('剧本服务尚未启动，请重启本地服务器。');
    const result=await response.json();if(!response.ok)throw new Error(result.error||'剧本生成失败，请重试。');
    if(typeof result.content!=='string'||!result.content.trim())throw new Error('没有收到剧本正文，请重试。');
    if(!D.projects.includes(p))return;
    const script={id:uid('SCR'),projectId:p.id,kind:'screenplay',title:p.name+' · 剧本',content:result.content,sourceStory:story,notes,model:result.model||model,status:'已生成',createdAt:new Date().toISOString()};
    const prepared=prepareScreenplayAssets(result.assets,p.id,script.id);
    Object.assign(script,prepared.references,{assetSummary:prepared.summary});
    const next={...D,...prepared.collections,scripts:[...D.scripts,script],projects:D.projects.map(project=>project===p?{...p,screenplayId:script.id}:project)};
    try {localStorage.setItem('aimovie_data',JSON.stringify(next))}
    catch {throw new Error('本机存储空间不足，本次剧本与资产未保存，已有版本不变。请备份项目后重试。')}
    Object.assign(D,prepared.collections);D.scripts=next.scripts;p.screenplayId=script.id;
    screenplayMessages.set(p.id,'剧本与资产已保存。'+prepared.summary+'。可在对应资产库继续编辑。');
    if(D.activeProjectId===p.id&&typeof renderModules==='function')renderModules();
    return script;
  } catch(error) {screenplayMessages.set(p.id,/abort|timeout/i.test(error.name)?'生成超时，原文和旧版剧本已保留。':error.message==='Failed to fetch'?'无法连接剧本服务，请检查本地服务器。':error.message)}
  finally {screenplayRequests.delete(p.id);if(D.activeProjectId===p.id)renderScripts()}
}
async function copyScreenplay() {
  const script=currentScreenplay();if(!script)return;
  try{await navigator.clipboard.writeText(script.content);document.getElementById('screenplayMessage').textContent='剧本已复制。'}
  catch{document.getElementById('screenplayContent').select();document.getElementById('screenplayMessage').textContent='请按 Ctrl+C 复制已选中的剧本。'}
}
function exportScreenplay() {
  const script=currentScreenplay();if(!script)return;
  const url=URL.createObjectURL(new Blob(['\uFEFF'+script.content],{type:'text/plain;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=activeProject().name.replace(/[<>:"/\\|?*]/g,'_')+'-剧本.txt';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
renderScripts=renderScreenplayWorkspace;

function saveStoryStage() {
  const p=activeProject(),story=document.getElementById('storyStageText').value;
  const bible={...p.bible};
  for(const key of ['logline','synopsis','theme','genre','style'])bible[key]=document.getElementById('b_'+key).value;
  const next={...D,projects:D.projects.map(item=>item===p?{...p,storyText:story,bible}:item)};
  try{localStorage.setItem('aimovie_data',JSON.stringify(next));p.storyText=story;p.bible=bible;document.getElementById('storyStageStatus').textContent='故事已保存';return true}
  catch{document.getElementById('storyStageStatus').textContent='保存失败，请先复制原文备份';return false}
}
function storyStageNext(){if(saveStoryStage())go('scripts')}
if(typeof renderModules==='function') {
  const renderBeforeStoryStage=renderModules;
  renderModules=function(){
    renderBeforeStoryStage();const p=activeProject();
    document.getElementById('stories').insertAdjacentHTML('beforeend',`<div class="card"><h2>完整故事原文</h2><p class="muted">在这里粘贴故事，再进入剧本生成。此处与剧本页共用同一份原文。</p><textarea id="storyStageText" aria-label="完整故事原文" style="min-height:320px;line-height:1.8" oninput="saveStoryStage()">${esc(p.storyText??p.bible?.synopsis??'')}</textarea><div class="toolbar"><button class="btn" onclick="saveStoryStage()">保存故事</button><button class="btn gold" onclick="storyStageNext()">下一步：生成剧本与资产</button><span id="storyStageStatus" role="status" class="muted">原文自动保存</span></div></div>`);
  };
}

if(location.protocol!=='file:')fetch('/api/screenplay/config').then(response=>response.ok?response.json():null).then(config=>{if(config)screenplayServerConfigured=config.configured}).catch(()=>{});
