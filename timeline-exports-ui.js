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
      host.innerHTML='<h2>剪辑导出的完整成片</h2><p class="muted">已保存到本机，重新打开项目后仍可观看和下载。导出完成后仍需审片；上采样只放大画布，不会增加原始素材细节。</p>'+(exports.length?exports.map(film=>`<div class="card"><h3>${esc(film.title||'剪辑版')}</h3><p>${film.clipCount} 镜 · ${film.duration.toFixed(2)} 秒 · ${film.width||1280} × ${film.height||720} · ${esc(film.resolutionLabel||'HD')} · 24 fps</p><video controls preload="metadata" style="width:100%;max-width:960px;border-radius:8px" src="${esc(film.url)}"></video><p><a class="btn gold" href="${esc(film.url)}" download="${esc(film.title||'剪辑版')}.mp4">下载播放版</a>${film.masterUrl?` <a class="btn" href="${esc(film.masterUrl)}" download="${esc(film.title||'剪辑版')}_master.mov">下载保留母版</a><span class="muted"> · 不叠加本次字幕；源片已有文字保留</span>`:''}</p></div>`).join(''):'<p>本项目暂无完整剪辑导出。可在时间线点击“导出当前剪辑”。</p>');
    }).catch(error=>{if(host.isConnected&&D.activeProjectId===projectId)host.innerHTML='<h2>剪辑导出的完整成片</h2><p>'+esc('读取导出记录失败：'+error.message)+'</p>'});
};
