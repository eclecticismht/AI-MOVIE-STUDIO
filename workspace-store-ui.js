// All existing project writes pass through the storage adapter; persist locally first.
const workspaceSave={revision:null,ready:false,busy:false,pending:null,conflict:false,message:'正在核对磁盘备份…',timer:null};
function workspaceStatus(message){workspaceSave.message=message;let el=document.getElementById('workspaceSaveStatus');if(!el){el=document.createElement('aside');el.id='workspaceSaveStatus';el.setAttribute('role','status');el.style.cssText='padding:8px 18px;background:#182332;color:#d8e6ef;font-size:13px;position:sticky;top:0;z-index:90';document.body.prepend(el)}el.textContent=message;
 if(workspaceSave.conflict){const download=document.createElement('button');download.className='btn';download.textContent='下载本页备份';download.onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([ProjectBackup.encode(D)],{type:'application/json'}));a.href=url;a.download='AI_MOVIE_STUDIO_conflict_'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};el.append(' ',download);
 const load=document.createElement('button');load.className='btn';load.textContent='载入磁盘版本';load.onclick=workspaceLoadDisk;el.append(' ',load);
 const keep=document.createElement('button');keep.className='btn';keep.textContent='保留本页并另存磁盘快照';keep.onclick=workspaceKeepLocal;el.append(' ',keep);}
}
function workspaceChanged(value){workspaceSave.pending=value;if(workspaceSave.conflict)return;workspaceStatus('已保存在浏览器 · 正在写入磁盘…');clearTimeout(workspaceSave.timer);workspaceSave.timer=setTimeout(workspaceFlush,350)}
async function workspaceFlush(){
 if(!workspaceSave.ready||workspaceSave.busy||workspaceSave.conflict||!workspaceSave.pending)return;
 workspaceSave.busy=true;const raw=workspaceSave.pending;
 try{
  const r=await fetch('/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:workspaceSave.revision,data:JSON.parse(raw)}),signal:AbortSignal.timeout(15000)}),out=await r.json();
  if(!r.ok){workspaceSave.conflict=r.status===409;throw Error(out.error)}
  workspaceSave.revision=out.revision;if(workspaceSave.pending===raw)workspaceSave.pending=null;
  workspaceStatus('已保存到本机磁盘 · '+new Date(out.savedAt).toLocaleTimeString()+' · 保留最近 20 个历史快照');
 }catch(error){workspaceStatus('浏览器数据已保留 · 磁盘保存未确认：'+error.message)}
 finally{workspaceSave.busy=false;if(workspaceSave.pending&&!workspaceSave.conflict){clearTimeout(workspaceSave.timer);workspaceSave.timer=setTimeout(workspaceFlush,5000)}}
}
async function workspaceReadDisk(){const r=await fetch('/api/workspace',{signal:AbortSignal.timeout(15000)}),out=await r.json();if(!r.ok)throw Error(out.error||'无法读取磁盘项目');return out}
async function workspaceLoadDisk(){
 if(typeof editingShotId!=='undefined'&&editingShotId){workspaceStatus('请先保存分镜编辑内容，再载入磁盘版本');return}
 if(!confirm('载入会替换本页项目数据。请先点击“下载本页备份”保存当前内容；继续？'))return;
 try{const out=await workspaceReadDisk();if(!out.data)throw Error('磁盘尚无项目');globalThis.localStorage.setItem('aimovie_before_disk_restore',ProjectBackup.encode(D));localStorage.accept(JSON.stringify(out.data));location.reload()}catch(error){workspaceStatus(error.message)}
}
async function workspaceKeepLocal(){
 try{const out=await workspaceReadDisk();workspaceSave.revision=out.revision;workspaceSave.conflict=false;workspaceSave.pending=JSON.stringify(D);localStorage.accept(workspaceSave.pending);workspaceSave.ready=true;await workspaceFlush()}catch(error){workspaceStatus(error.message)}
}
async function workspaceStart(){
 try{const out=await workspaceReadDisk();workspaceSave.revision=out.revision;workspaceSave.ready=true;
  const raw=localStorage.getItem('aimovie_data');
  if(out.data&&JSON.stringify(out.data)!==raw){workspaceSave.conflict=true;workspaceStatus('浏览器与磁盘项目不同，已停止磁盘同步，两个版本均已保留。');return}
  if(!out.data){workspaceSave.pending=raw;await workspaceFlush()}else workspaceStatus('已保存到本机磁盘 · '+new Date(out.savedAt).toLocaleString());
 }catch(error){workspaceStatus('本页仍可保存到浏览器 · 磁盘连接失败：'+error.message);setTimeout(workspaceStart,10000)}
}
addEventListener('storage',event=>{if(event.key==='aimovie_data'){workspaceSave.conflict=true;workspaceStatus('其他页面已保存新版本。请先下载本页备份，再载入已保存版本。')}});
void workspaceStart();
