(function(){
 'use strict';
 const native=globalThis.localStorage,PREFIX='ams_act_text_draft_v1:',Model=WorkspaceRecovery;
 const $=id=>document.getElementById(id),state={snapshot:null,busy:false,done:false};
 function inventory(){
  const raw=native.getItem('aimovie_data'),records=[],invalid=[];let browser=null;
  if(raw){try{browser=JSON.parse(WorkspaceStore.decode(raw));if(!Array.isArray(browser?.projects))throw Error('缺少项目')}catch(e){throw Error('浏览器副本无法解析，未修改任何数据：'+e.message)}}
  for(let i=0;i<native.length;i++){const storageKey=native.key(i);if(!storageKey?.startsWith(PREFIX))continue;const value=native.getItem(storageKey);try{records.push({storageKey,raw:value,draft:JSON.parse(value)})}catch{invalid.push({storageKey,raw:value})}}
  records.sort((a,b)=>a.storageKey.localeCompare(b.storageKey));invalid.sort((a,b)=>a.storageKey.localeCompare(b.storageKey));
  return {raw,browser,records,invalid,signature:JSON.stringify([raw,records.map(r=>[r.storageKey,r.raw]),invalid])};
 }
 async function request(url,method='GET',body){const r=await fetch(url,{method,cache:'no-store',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(45000)}),out=await r.json();if(!r.ok)throw Error(out.error||'本机保存请求失败（'+r.status+'）');return out;}
 const message=(text,kind='')=>{$('status').textContent=text;$('status').parentElement.className='card '+kind;};
 function element(tag,content,className){const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(className)el.className=className;return el;}
 function choices(){return Object.fromEntries([...document.querySelectorAll('[data-recovery-choice]')].map(el=>[el.dataset.recoveryChoice,el.value]));}
 function availability(){
  if(!state.snapshot||state.busy||state.done){$('apply').disabled=true;return;}
  try{Model.apply(state.snapshot.disk.data,state.snapshot.browser,state.snapshot.inspection,choices(),()=> 'ACT_PREVIEW_'+crypto.randomUUID());$('apply').disabled=false;}catch{$('apply').disabled=true;}
 }
 function renderRows(inspection){
  $('rows').replaceChildren();
  for(const row of inspection.rows){
   const card=element('section',undefined,'card'+(row.status==='conflict'||row.status==='missing'?' warning':''));
   card.append(element('h2',row.title+' / '+row.label));
   const names={safe:'磁盘中的此字段未改变，可以只合并你的输入。',same:'本草稿已与磁盘一致，或没有新的文字改动；保留磁盘最新内容。',conflict:'两份文字不同，无法自动判断哪份正确，请明确选择。',missing:'磁盘中未找到这个场次编号：可能是未保存的新建场次，也可能已经删除。不会自动重建。'};
   card.append(element('p',names[row.status]));
   if(row.sameTitle.length)card.append(element('p','磁盘已有同名场次：'+row.sameTitle.join('、')+'。继续写已有场次不需要再新建。','muted'));
   const compare=element('div',undefined,'compare');for(const [title,value] of [['你的浏览器文字 / 输入草稿',row.text],['本机磁盘当前文字',row.status==='missing'?'（未找到同一场次编号）':row.diskText]]){const col=element('div');col.append(element('strong',title),element('pre',value||'（空白）'));compare.append(col)}card.append(compare);
   const label=element('label','处理方式 '),select=element('select');select.dataset.recoveryChoice=row.key;
   const items=[['','请选择，不会默认覆盖'],['disk',row.status==='missing'?'保留磁盘，不重建；本地文字留在备份中':'保留磁盘文字；本地文字留在备份中']];
   if(row.status==='missing'){if(row.canCreate)items.push(['new','另存为新场次（恢复草稿），不复制任何旧镜头']);}else items.push(['local','采用我的文字，仅更新这一字段']);
   for(const [value,title] of items){const option=element('option',title);option.value=value;select.append(option)}select.value=row.defaultChoice;select.onchange=availability;label.append(select);card.append(label);$('rows').append(card);
  }
 }
 async function check(){
  if(state.busy)return;state.snapshot=null;state.done=false;$('apply').disabled=true;$('return').hidden=true;message('正在核对浏览器草稿和磁盘版本…');
  try{
   const local=inventory(),disk=await request('/api/workspace');if(!disk.data)throw Error('没有可读取的磁盘工作区。');
   const requested=$('project').value||new URLSearchParams(location.search).get('projectId')||local.browser?.activeProjectId||disk.data.activeProjectId;
   const projects=new Map([...(local.browser?.projects||[]),...disk.data.projects].map(p=>[p.id,p]));$('project').replaceChildren();for(const p of projects.values()){const option=element('option',p.name||p.id);option.value=p.id;$('project').append(option)}$('project').value=projects.has(requested)?requested:disk.data.activeProjectId;
   if(!local.browser){$('summary').textContent='这个浏览器没有工作室本地副本。请在出现报错的同一浏览器、同一地址（127.0.0.1 与 localhost 不共用存储）打开本页。';throw Error('未找到报错页面的浏览器副本；没有执行恢复。');}
   if(local.invalid.length)throw Error('发现 '+local.invalid.length+' 份无法解析的草稿，均未删除。请先保留这些浏览器数据后进一步检查。');
   const inspection=Model.inspect(disk.data,local.browser,local.records,$('project').value);
   state.snapshot={disk,browser:local.browser,records:local.records,raw:local.raw,localSignature:local.signature,inspection};
   $('summary').replaceChildren(element('h2','当前项目：'+(projects.get(inspection.projectId)?.name||inspection.projectId)),element('p','磁盘保存时间：'+(disk.savedAt?new Date(disk.savedAt).toLocaleString():'未知')+'；需要核对 '+inspection.rows.length+' 个文字字段。'),element('p','磁盘现有场次：'+inspection.diskActs.map(a=>a.title+'（'+a.shots+' 镜，原文 '+a.storyChars+' 字）').join('、'),'muted'));
   renderRows(inspection);message(inspection.rows.length?'核对下方每个字段。提交前会先备份两份工作区和输入草稿。':'没有待合并的场次文字。可以先备份浏览器副本，再载入磁盘版本以解除旧页面冲突；其他本地更改只保存在备份里。');availability();
  }catch(e){message(e.message,'warning');}
 }
 async function submit(){
  if(state.busy||!state.snapshot)return;
  const snapshot=state.snapshot;snapshot.decisions=choices();let merged;
  try{merged=Model.apply(snapshot.disk.data,snapshot.browser,snapshot.inspection,snapshot.decisions,()=> 'ACT_RECOVERY_'+crypto.randomUUID().replace(/-/g,''));merged.data=ProjectBackup.decode(ProjectBackup.encode(merged.data));}catch(e){message(e.message,'warning');return;}
  state.busy=true;$('check').disabled=true;$('project').disabled=true;availability();message('正在把两份工作区和全部输入草稿分别备份到本机，请勿关闭此页…');
  try{
   const encoded=WorkspaceStore.encode(JSON.stringify(merged.data));
   const result=await Model.commit(snapshot,merged,{
    localSignature:()=>inventory().signature,
    archive:data=>request('/api/workspace/archive','POST',{data}),readDisk:()=>request('/api/workspace'),
    saveDisk:(data,baseRevision)=>request('/api/workspace','PUT',{data,baseRevision}),
    acceptBrowser:()=>{if(inventory().signature!==snapshot.localSignature)throw Error('其他页面在保存期间继续编辑，浏览器未覆盖。');native.setItem('aimovie_data',encoded);},
    clearResolved:keys=>{for(const key of keys){const record=snapshot.records.find(r=>r.storageKey===key);if(record&&native.getItem(key)===record.raw)native.removeItem(key);}}
   });
   state.done=true;message('保存恢复完成。仅合并 '+result.changes.filter(x=>x.kind==='field').length+' 个文字字段，另存 '+result.created.length+' 个纯文字场次。\n本机备份：'+result.backups.join('；')+'\n请点击“返回工作室”。旧工作室标签页应关闭或刷新后再编辑，不要再用旧页覆盖磁盘。','success');$('return').hidden=false;
  }catch(e){message((e.diskCommitted?'磁盘已保存，但浏览器同步未完成；两份备份都还在。请重新检查后恢复，勿用旧页覆盖。\n':'未完成恢复，原副本及输入草稿保留。\n')+e.message,'warning');}
  finally{state.busy=false;$('check').disabled=false;$('project').disabled=false;availability();}
 }
 $('check').onclick=check;$('project').onchange=check;$('apply').onclick=submit;
 addEventListener('beforeunload',event=>{if(state.busy){event.preventDefault();event.returnValue=''}});
 addEventListener('storage',event=>{if(!state.busy&&!state.done&&(event.key==='aimovie_data'||event.key?.startsWith(PREFIX))){state.snapshot=null;availability();message('原页面的文字又发生变化。请停止编辑并点击“重新检查版本”，不会覆盖新输入。','warning')}});
 globalThis.WorkspaceRecoveryPage={check,submit,get snapshot(){return state.snapshot},get busy(){return state.busy}};
 void check();
})();
