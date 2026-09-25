const renderMastersBeforeTimelineExports=renderMasters;
renderMasters=function(){
  renderMastersBeforeTimelineExports();
  const page=document.getElementById('masters');if(!page)return;
  const projectId=D.activeProjectId,host=document.createElement('div');
  host.className='card';host.innerHTML='<h2>剪辑导出的完整成片</h2><p class="muted">正在读取本机导出记录…</p>';page.prepend(host);
  fetch('/api/timeline-export?projectId='+encodeURIComponent(projectId),{signal:AbortSignal.timeout(10000)})
    .then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error||'读取失败');return result.exports})
    .then(exports=>{
      if(!host.isConnected||D.activeProjectId!==projectId)return;
      host.innerHTML='<h2>剪辑导出的完整成片</h2><p class="muted">已保存到本机，重新打开项目后仍可观看和下载。导出完成后仍需审片。</p>'+(exports.length?exports.map(film=>`<div class="card"><h3>${esc(film.title||'剪辑版')}</h3><p>${film.clipCount} 镜 · ${film.duration.toFixed(2)} 秒 · 1280 × 720 · 24 fps</p><video controls preload="metadata" style="width:100%;max-width:960px;border-radius:8px" src="${esc(film.url)}"></video><p><a class="btn gold" href="${esc(film.url)}" download="${esc(film.title||'剪辑版')}.mp4">下载完整剪辑</a></p></div>`).join(''):'<p>本项目暂无完整剪辑导出。可在时间线点击“导出当前剪辑”。</p>');
    }).catch(error=>{if(host.isConnected&&D.activeProjectId===projectId)host.innerHTML='<h2>剪辑导出的完整成片</h2><p>'+esc('读取导出记录失败：'+error.message)+'</p>'});
};
