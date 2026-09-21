let pendingProjectBackup=null;
function downloadProjectBackup(){
 try{const blob=new Blob([ProjectBackup.encode(D)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AI_MOVIE_STUDIO_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.getElementById('backupStatus').textContent='已发起备份下载。备份不包含会话密钥或磁盘媒体文件。';}catch(e){document.getElementById('backupStatus').textContent='备份失败：'+e.message}
}
async function previewProjectBackup(input){
 pendingProjectBackup=null;document.getElementById('restoreBackup').disabled=true;
 try{const file=input.files[0];if(!file)return;if(file.size>50*1024*1024)throw Error('备份超过 50MB');const data=ProjectBackup.decode(await file.text());pendingProjectBackup=data;document.getElementById('backupStatus').textContent=`备份可恢复：${data.projects.length} 个项目、${data.shots.length} 个分镜、${data.generations.length} 个审片版本。恢复将替换当前工作区数据，磁盘媒体需仍在原位置。`;document.getElementById('restoreBackup').disabled=false;}catch(e){document.getElementById('backupStatus').textContent='不能恢复：'+e.message}
}
async function restoreProjectBackup(){
 if(!pendingProjectBackup)return;
 if(!confirm('恢复将替换当前所有项目数据。请先下载当前备份。确定继续？'))return;
 const button=document.getElementById('restoreBackup');button.disabled=true;
 try{
  if(typeof editingShotId!=='undefined'&&editingShotId)throw Error('请先保存正在编辑的分镜');
  if(typeof jobIsRunning==='function'&&(D.jobs||[]).some(jobIsRunning))throw Error('请先等待或取消正在运行的渲染任务');
  if(typeof referenceQueueLocks!=='undefined'&&referenceQueueLocks.size)throw Error('正在准备队列，请稍后');
  if(typeof renderJobOperations!=='undefined'&&renderJobOperations.size)throw Error('正在操作任务，请稍后');
  const r=await fetch('/api/film',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('无法核对制作状态');const {runs}=await r.json();
  if(runs.some(r=>['pending','rendering','assembling'].includes(r.status)))throw Error('请先暂停正在制作的成片');
  const data=pendingProjectBackup;if(!data)throw Error('备份已改变，请重新选择');
  localStorage.setItem('aimovie_before_restore',ProjectBackup.encode(D));
  localStorage.setItem('aimovie_data',JSON.stringify(data));D=data;pendingProjectBackup=null;location.reload();
 }catch(e){document.getElementById('backupStatus').textContent='恢复未完成：'+e.message;button.disabled=!pendingProjectBackup;}
}
const settingsBeforeBackup=renderSettings;
renderSettings=function(){settingsBeforeBackup();document.getElementById('settings').insertAdjacentHTML('beforeend',`<div class="card"><h2>工作区备份与恢复</h2><p>备份项目、故事、分镜、资产配置和审片记录。媒体文件仍需保留在本机原目录；不包含会话密钥。</p><button class="btn" onclick="downloadProjectBackup()">下载完整数据备份</button><label>选择备份文件<input type="file" accept="application/json,.json" onchange="previewProjectBackup(this)"></label><button class="btn" id="restoreBackup" disabled onclick="restoreProjectBackup()">恢复所选备份</button><p role="status" id="backupStatus"></p></div>`)};
