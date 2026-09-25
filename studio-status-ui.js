let studioLive=null,studioLiveBusy=false;
function renderStudioLive(){
 const node=document.getElementById('nodeStatus');if(node)node.textContent=studioLive?`${studioLive.renderer?'渲染器已连接':'渲染器离线'} · 运行 ${studioLive.running??'未知'} · 等待 ${studioLive.queued??'未知'}${studioLive.missing.length?' · 缺少模型或节点，请看设置':''}`:'正在读取渲染器状态…';
 const masters=document.getElementById('masterCount');if(masters)masters.textContent=String((D.masters||[]).length+(studioLive?.masters.filter(m=>D.projects.some(p=>p.id===m.projectId)).length||0));
 const status=document.getElementById('studioDiagnostics');if(status&&studioLive)status.innerHTML=`<h2>本机生产环境</h2><p>${studioLive.ready?'✓ H3 与视频合成已就绪':'生产环境需要检查'} · Node ${esc(studioLive.nodeVersion)} · FFmpeg ${studioLive.ffmpeg?'可用':'不可用'}</p><p>${esc(studioLive.gpu||'未读取到 GPU')}</p>${studioLive.missing.length?'<p class="warn">缺少：'+studioLive.missing.map(esc).join('、')+'</p>':''}<p>当前导出：1280 × 720 · 24 fps · MP4。项目中选择的 4K 等目标规格不会自动提升生成画质。</p><p class="muted">核对时间：${new Date(studioLive.checkedAt).toLocaleTimeString()}</p>`;
}
async function refreshStudioLive(){if(studioLiveBusy)return;studioLiveBusy=true;try{const r=await fetch('/api/studio-status',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('状态读取失败');studioLive=await r.json();renderStudioLive()}catch{const node=document.getElementById('nodeStatus');if(node)node.textContent='状态连接中断 · 当前队列未知'}finally{studioLiveBusy=false}}
const studioLiveRender=renderStudio;renderStudio=function(){studioLiveRender();renderStudioLive()};
const studioLiveSettings=renderSettings;renderSettings=function(){studioLiveSettings();document.getElementById('settings').insertAdjacentHTML('beforeend','<section class="card" id="studioDiagnostics">正在核对生产环境…</section>');renderStudioLive();void refreshStudioLive()};
setInterval(()=>{if(document.getElementById('studio')?.classList.contains('on')||document.getElementById('settings')?.classList.contains('on'))void refreshStudioLive()},10000);void refreshStudioLive();
