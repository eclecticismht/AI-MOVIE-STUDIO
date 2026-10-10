// Optional geometric image export. Explicit preview only; never submits a model job.
(function(){
 'use strict';
 const host=document.querySelector('#previs .pv-actions');if(!host||!globalThis.DirectorLayoutGuide)return;
 const button=document.createElement('button');button.id='pv-layout-guide';button.className='btn';button.type='button';button.textContent='空间参考图';button.title='把当前机位和固定桌椅投影为控制图；不是成片，也不自动渲染';host.prepend(button);
 let dialog;
 button.addEventListener('click',()=>{
  const state=globalThis.DirectorPrevisUI?.state;if(!state?.draft)return;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='pv-layout-guide-dialog';dialog.setAttribute('aria-label','空间参考图（非成片）');dialog.style.cssText='max-width:1100px;width:90vw;background:#17212b;color:#eef1f5;border:1px solid #526171;border-radius:12px;padding:20px';
   dialog.innerHTML='<h2>空间参考图 · 非成片</h2><p>只投影已保存或当前草稿的房间、桌椅和机位。没有真实人物、皮肤或嘴形；不能据此判定生成视频已符合调度。</p><canvas width="1024" height="576" style="width:100%;height:auto;display:block"></canvas><p data-state role="status"></p><button type="button" data-export class="btn">保存PNG参考图</button> <button type="button" data-close class="btn">关闭</button>';document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
   dialog.querySelector('[data-export]').onclick=()=>{const c=dialog.querySelector('canvas');c.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AMS_layout_'+(dialog.dataset.shot||'draft')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');};
  }
  const message=dialog.querySelector('[data-state]');dialog.dataset.shot=state.shotId||'';
  try{const shot=D.shots.find(s=>s.id===state.shotId&&s.projectId===state.projectId),project=D.projects.find(p=>p.id===state.projectId);const width=shot?.width??project?.h3Width??1024,height=shot?.height??project?.h3Height??576;const canvas=dialog.querySelector('canvas');canvas.width=width;canvas.height=height;const svg=DirectorLayoutGuide.svg(state.draft,{width,height,phase:state.phase==='end'?1:0}),img=new Image();message.textContent='正在绘制空间参考图…';dialog.querySelector('[data-export]').disabled=true;
   img.onload=()=>{const c=dialog.querySelector('canvas'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);message.textContent=(state.dirty||state.spaceDirty?'当前未保存草稿':'当前调度')+' · '+(state.phase==='end'?'结束机位':'起始机位')+' · 未调用生成模型';dialog.querySelector('[data-export]').disabled=false;};img.onerror=()=>message.textContent='控制图未绘制成功，现有调度和素材均未改变。';img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);dialog.showModal();
  }catch(e){message.textContent=e.message;if(!dialog.open)dialog.showModal();}
 });
})();
