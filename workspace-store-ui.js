// All existing project writes pass through the storage adapter; persist locally first.
const workspaceSave={revision:null,ready:false,busy:false,pending:null,conflict:false,message:'正在核对磁盘备份…',timer:null,inflight:null};
function workspaceStatus(message){workspaceSave.message=message;let el=document.getElementById('workspaceSaveStatus');if(!el){el=document.createElement('aside');el.id='workspaceSaveStatus';el.setAttribute('role','status');el.style.cssText='padding:8px 18px;background:#182332;color:#d8e6ef;font-size:13px;position:sticky;top:0;z-index:90';document.body.prepend(el)}el.textContent=message;
 if(workspaceSave.conflict){const download=document.createElement('button');download.className='btn';download.textContent='下载本页备份';download.onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([ProjectBackup.encode(D)],{type:'application/json'}));a.href=url;a.download='AI_MOVIE_STUDIO_conflict_'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};el.append(' ',download);
 const archive=document.createElement('button');archive.className='btn';archive.textContent='本页另存磁盘备份';archive.onclick=async()=>{try{const copy=await workspaceArchive(D);workspaceStatus(`本页已单独备份：${copy.name}（${copy.projects} 个项目、${copy.shots} 个镜头）。磁盘当前版本保留。`)}catch(error){workspaceStatus('另存备份失败：'+error.message)}};el.append(' ',archive);
 const load=document.createElement('button');load.className='btn';load.textContent='备份本页并载入磁盘版本';load.onclick=workspaceLoadDisk;el.append(' ',load);
 const keep=document.createElement('button');keep.className='btn';keep.textContent='比较版本后使用本页';keep.onclick=workspaceKeepLocal;el.append(' ',keep);}
}
function workspaceSchedule(delay){clearTimeout(workspaceSave.timer);workspaceSave.timer=setTimeout(()=>workspaceFlush().catch(()=>{}),delay)}
function workspaceChanged(value){workspaceSave.pending=value;if(workspaceSave.conflict)return;workspaceStatus('已保存在浏览器 · 正在写入磁盘…');workspaceSchedule(350)}
async function workspaceWriteDisk(data,allowProjectReplacement=false){
 const clean=ProjectBackup.decode(ProjectBackup.encode(data));
 try{
  const r=await fetch('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:workspaceSave.revision,data:clean,allowProjectReplacement}),signal:AbortSignal.timeout(15000)}),out=await r.json();
  if(!r.ok)throw Object.assign(Error(out.error||'磁盘保存失败'),{status:r.status});
  return out;
 }catch(error){
  // A lost response is not a failed commit. Read back before retrying or restoring.
  try{const disk=await workspaceReadDisk();if(JSON.stringify(disk.data)===JSON.stringify(clean))return disk;}catch{}
  if(error.status===409)workspaceSave.conflict=true;throw error;
 }
}
function workspaceFlush(){
 if(workspaceSave.inflight)return workspaceSave.inflight;
 if(!workspaceSave.ready||workspaceSave.conflict)return Promise.reject(Error(workspaceSave.conflict?'浏览器与磁盘版本冲突，请先保留并核对两个版本。':'磁盘连接尚未就绪，请稍后重试。'));
 if(!workspaceSave.pending)return Promise.resolve();
 workspaceSave.busy=true;
 workspaceSave.inflight=Promise.resolve().then(async()=>{
  try{
   while(workspaceSave.pending){
    if(workspaceSave.conflict)throw Error('项目已在其他页面修改，未覆盖。');
    const raw=workspaceSave.pending,out=await workspaceWriteDisk(JSON.parse(raw));
    workspaceSave.revision=out.revision;if(workspaceSave.pending===raw)workspaceSave.pending=null;
    workspaceStatus('已保存到本机磁盘 · '+new Date(out.savedAt).toLocaleTimeString()+' · 保留最近 20 个历史快照');
   }
  }catch(error){workspaceStatus('浏览器数据已保留 · 磁盘保存未确认：'+error.message);throw error}
  finally{workspaceSave.busy=false;workspaceSave.inflight=null;if(workspaceSave.pending&&!workspaceSave.conflict)workspaceSchedule(5000)}
 });
 return workspaceSave.inflight;
}
async function workspaceRestore(data){
 const clean=ProjectBackup.decode(ProjectBackup.encode(data)),before=JSON.stringify(D),browser=localStorage.getItem('aimovie_data'),release=localStorage.suspendWrites();
 let committed=false;
 try{
  await workspaceFlush();clearTimeout(workspaceSave.timer);
  if(before!==JSON.stringify(D)||browser!==localStorage.getItem('aimovie_data'))throw Error('恢复期间项目已变化，未覆盖，请重新核对。');
  const out=await workspaceWriteDisk(clean,true);committed=true;workspaceSave.revision=out.revision;workspaceSave.pending=null;
  localStorage.accept(JSON.stringify(clean),browser);return clean;
 }catch(error){
  if(committed){workspaceSave.conflict=true;workspaceStatus('磁盘已恢复，浏览器副本仍保留：'+error.message+' 请备份本页并载入磁盘版本。');error.diskCommitted=true;}
  throw error;
 }finally{release()}
}
async function workspaceReadDisk(){const r=await fetch('/api/workspace',{signal:AbortSignal.timeout(15000)}),out=await r.json();if(!r.ok)throw Error(out.error||'无法读取磁盘项目');return out}
async function workspaceArchive(data){const r=await fetch('/api/workspace/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:JSON.parse(ProjectBackup.encode(data)).data}),signal:AbortSignal.timeout(15000)}),out=await r.json();if(!r.ok)throw Error(out.error||'备份未保存');return out}
async function workspaceLoadDisk(){
 if(typeof editingShotId!=='undefined'&&editingShotId){workspaceStatus('请先保存分镜编辑内容，再载入磁盘版本');return}
 const before=JSON.stringify(D),browser=localStorage.getItem('aimovie_data'),release=localStorage.suspendWrites();
 try{
  if(workspaceSave.inflight)await workspaceSave.inflight.catch(()=>{});clearTimeout(workspaceSave.timer);
  // Save a durable separate copy even when the browser cannot download blobs.
  await workspaceArchive(JSON.parse(before));const out=await workspaceReadDisk();if(!out.data)throw Error('磁盘尚无项目');
  if(before!==JSON.stringify(D))throw Error('项目已变化，请重新核对');
  localStorage.accept(JSON.stringify(out.data),browser);workspaceSave.pending=null;location.reload();
 }catch(error){workspaceStatus('本页仍保留：'+error.message)}finally{release()}
}
async function workspaceKeepLocal(){
 try{
  const out=await workspaceReadDisk(),before=JSON.stringify(D),removed=(out.data?.projects||[]).filter(p=>!D.projects.some(x=>x.id===p.id));
  workspaceStatus(`本页 ${D.projects.length} 个项目、${D.shots.length} 个镜头；磁盘 ${out.data?.projects?.length||0} 个项目、${out.data?.shots?.length||0} 个镜头。${removed.length?'使用本页后，当前工作区将不再包含：'+removed.map(p=>p.name).join('、')+'。':''}旧磁盘版本会保留在历史快照。`);
  const button=document.createElement('button');button.className='btn';button.textContent='确认使用本页替换磁盘当前版本';button.onclick=async()=>{
   const browser=localStorage.getItem('aimovie_data'),release=localStorage.suspendWrites();let committed=false;
   try{if(workspaceSave.inflight)await workspaceSave.inflight.catch(()=>{});clearTimeout(workspaceSave.timer);
    const fresh=await workspaceReadDisk();if(fresh.revision!==out.revision)throw Error('磁盘已变化，请重新比较');
    if(before!==JSON.stringify(D)||browser!==localStorage.getItem('aimovie_data'))throw Error('本页已变化，请重新比较');workspaceSave.revision=out.revision;
    const saved=await workspaceWriteDisk(JSON.parse(before),true);committed=true;workspaceSave.revision=saved.revision;
    if(before!==JSON.stringify(D))throw Error('本页已变化，请重新核对');localStorage.accept(before,browser);workspaceSave.conflict=false;workspaceSave.pending=null;workspaceSave.ready=true;workspaceStatus('已使用本页版本，旧磁盘版本保留在历史快照');
   }catch(error){if(committed)workspaceSave.conflict=true;workspaceStatus((committed?'磁盘已保存，浏览器副本仍保留，请重新核对：':'')+error.message)}finally{release()}
  };document.getElementById('workspaceSaveStatus').append(' ',button);
 }catch(error){workspaceStatus(error.message)}
}
async function workspaceStart(){
 try{const out=await workspaceReadDisk();workspaceSave.revision=out.revision;workspaceSave.ready=true;
  const raw=localStorage.getItem('aimovie_data');
  if(out.data&&JSON.stringify(out.data)!==raw){
   const initial=localStorage.initial?.();let matchesInitial=false;
   try{matchesInitial=!!initial&&JSON.stringify(ProjectBackup.decode(ProjectBackup.encode(JSON.parse(initial))))===JSON.stringify(out.data)}catch{}
   if(matchesInitial){workspaceSave.pending=raw;await workspaceFlush();return}
   workspaceSave.conflict=true;workspaceStatus('浏览器与磁盘项目不同，已停止磁盘同步，两个版本均已保留。');return;
  }
  if(!out.data){workspaceSave.pending=raw;await workspaceFlush()}else workspaceStatus('已保存到本机磁盘 · '+new Date(out.savedAt).toLocaleString());
 }catch(error){workspaceStatus('本页仍可保存到浏览器 · 磁盘连接失败：'+error.message);setTimeout(workspaceStart,10000)}
}
addEventListener('storage',event=>{if(event.key==='aimovie_data'){workspaceSave.conflict=true;workspaceStatus('其他页面已保存新版本。请先下载本页备份，再载入已保存版本。')}});
void workspaceStart();
