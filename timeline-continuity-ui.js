function timelineContinuityRender(){
 const head=document.querySelector('.tl-timeline-head'),clip=tlCurrent();if(!head)return;
 let label=document.getElementById('timelineContinuityControl');if(!label){label=document.createElement('label');label.id='timelineContinuityControl';label.innerHTML='段间引导 <select aria-label="段间引导"><option value="">关闭 · 独立镜头</option></select>';head.insertBefore(label,head.querySelector('label'));label.querySelector('select').onchange=e=>timelineContinuitySave(e.target.value)}
 const select=label.querySelector('select'),clips=tlClips(),index=clips.findIndex(c=>c.shot.id===clip?.shot.id),previous=clips[index-1]?.shot,s=clip?.shot;
 select.innerHTML='<option value="">关闭 · 独立镜头</option>'+(previous?`<option value="${esc(previous.id)}">开启 · 承接上一镜尾帧</option>`:'')+(s?.continueFromShotId&&s.continueFromShotId!==previous?.id?`<option value="${esc(s.continueFromShotId)}">原承接关系（请核对镜头顺序）</option>`:'');select.value=s?.continueFromShotId||'';select.disabled=!s||(!previous&&!s.continueFromShotId);label.title=previous?'自动成片时使用上一镜尾帧；前后镜须一起制作，资产与尺寸一致。':'第一镜没有可承接的前镜';
}
function timelineContinuitySave(value){
 try{
  if(!tlCanLeave())return;const shot=tlCurrent()?.shot;if(!shot)return;
  if(value&&(shot.firstFrameUrl||['black','screen'].includes(shot.renderMode)))throw Error('本镜已有独立首帧或使用本地合成，请先在分镜编辑中调整后再开启。');
  if((shot.continueFromShotId||'')===value)return;
  const stored=JSON.parse(localStorage.getItem('aimovie_data')),source=stored.shots.find(s=>s.id===shot.id&&s.projectId===shot.projectId);
  if(!source||JSON.stringify(source)!==JSON.stringify(shot))throw Error('镜头已在其他页面修改，请刷新后重试。');
  const result=FilmSourceSync.replaceWithDependents(stored.shots,source,{...source,continueFromShotId:value});stored.shots=result.shots;stored.activeProjectId=D.activeProjectId;localStorage.setItem('aimovie_data',JSON.stringify(stored));Object.assign(D,stored);tlRender();tlMessage(value?'已开启尾帧承接。请连同前镜一起自动成片；有画内对白时需设置发声者位置。':'已关闭尾帧承接，本镜独立生成。');
 }catch(e){tlMessage(e.message)}finally{timelineContinuityRender()}
}
const tracksBeforeContinuity=tlTracks;
tlTracks=function(){tracksBeforeContinuity();timelineContinuityRender()};
