// Scene-first director workspace. Explicit saves only; no render calls, downloads or new models.
(function(){
 'use strict';
 const M=globalThis.DirectorPrevis;if(!M)throw Error('导演预演数据组件未加载');
 const $=id=>document.getElementById(id),h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=x=>Number.isFinite(Number(x))?Number(x):0;
 const state={projectId:null,scopeId:'all',shotId:null,draft:null,baseline:null,spaceBaseline:null,dirty:false,spaceDirty:false,saving:false,selection:{type:'camera',id:''},phase:'start',t:0,playing:false,scenePlay:false,audio:null,raf:null,view:'stage',notice:''};
 const colors=['#a99fff','#f5c782','#88d9c1','#96c9ef','#eaa5c9','#c4d987'];
 const project=()=>D.projects.find(p=>p.id===D.activeProjectId),characters=()=>D.characters.filter(c=>c.projectId===D.activeProjectId),shot=()=>D.shots.find(s=>s.projectId===D.activeProjectId&&s.id===state.shotId);
 const shots=()=>M.listShots(D,D.activeProjectId,state.scopeId),name=id=>characters().find(c=>c.id===id)?.name||id;
 function say(text){state.notice=text;if($('pv-notice'))$('pv-notice').textContent=text;}
 function events(s){return DialogueContract.parseDialogue(s?.dialogue||'',characters());}
 function stop(){if(state.playing&&state.notice.startsWith('正在播放'))say('预演已暂停；未调用生成模型。');state.playing=false;state.scenePlay=false;if(state.raf)cancelAnimationFrame(state.raf);state.raf=null;if(state.audio){state.audio.pause();state.audio=null;}if($('pv-play'))$('pv-play').textContent='播放本镜';}
 function canLeave(){if(state.saving){say('正在保存导演预演，请等待磁盘确认');return false;}if(state.dirty||state.spaceDirty){if(!confirm('导演预演有未保存修改。离开会放弃这些草稿，是否继续？'))return false;state.dirty=false;state.spaceDirty=false;}stop();return true;}
 function ownSpace(s){const spaces=project()?.directorSpaces||[];return spaces.find(x=>x.id===s?.directorPlan?.space.id)||spaces.find(x=>(s?.sceneIds||[]).includes(x.sceneId));}
 function load(s){
  stop();state.shotId=s?.id||null;state.baseline=s?M.signature(s):null;state.dirty=false;state.spaceDirty=false;state.t=0;state.phase='start';
  if(!s){state.draft=null;return;}
  const asset=D.scenes.find(x=>x.projectId===s.projectId&&(s.sceneIds||[]).includes(x.id)),saved=ownSpace(s);
  if(!asset&&!saved&&!s.directorPlan){state.draft=null;return;}
  const space=saved||s.directorPlan?.space||M.newSpace(asset);
  let es=[];try{es=events(s)}catch(e){say('对白需核对：'+e.message);}
  state.draft=s.directorPlan?M.clone(s.directorPlan):M.newPlan(s,space,characters(),es);
  state.spaceBaseline=M.signature((project().directorSpaces||[]).find(x=>x.id===state.draft.space.id)||null);
  state.selection={type:state.draft.actors.length?'actor':'camera',id:state.draft.actors[0]?.characterId||''};
 }
 function activate(){
  mount();if(state.projectId!==D.activeProjectId){state.projectId=D.activeProjectId;state.scopeId=project()?.previsScopeId||(project()?.storyboardBatchId?'batch:'+project().storyboardBatchId:'all');if(!M.scopes(D,D.activeProjectId).some(s=>s.id===state.scopeId))state.scopeId='all';state.shotId=null;}
  const list=shots(),selected=list.find(s=>s.id===state.shotId)||list.find(s=>s.id===globalThis.TL?.shotId)||list[0];
  if(!state.dirty&&!state.spaceDirty)load(selected);render();
 }
 function mount(){if($('previs'))return;const el=document.createElement('section');el.id='previs';el.className='page pv-page';el.innerHTML=`<header class="pv-head"><div><small>AMS · 做分镜</small><h1>导演预演</h1><p id="pv-context"></p></div><div class="pv-actions"><button class="btn" data-pv="export">导出预演方案</button><button class="btn" data-pv="discard">还原未保存修改</button><button class="btn gold" id="pv-apply" data-pv="apply">应用到本镜分镜</button></div></header><div class="pv-layout"><aside class="pv-panel pv-browser"><label>场次 / 分镜批次<select id="pv-scope" aria-label="预演场次"></select></label><div id="pv-shot-list"></div></aside><div class="pv-stage"><div class="pv-tabs"><button class="btn" data-pv="stage">空间与机位</button><button class="btn" data-pv="reference">首帧对照</button><span id="pv-draft-status"></span></div><div id="pv-empty" class="pv-empty" hidden></div><div id="pv-canvases"><div class="pv-canvas-head"><b>场景俯视图</b><span>拖动人物 / 机位 / 固定物件；支持数字微调</span></div><svg id="pv-floor" role="img" aria-label="人物座次与机位平面图"></svg><div class="pv-canvas-head"><b>16:9取景示意</b><span>透视占位预演，不是生成视频或精确三维测量</span></div><svg id="pv-camera-view" viewBox="0 0 960 540" role="img" aria-label="摄影机取景示意"></svg></div><div id="pv-reference" hidden></div><div class="pv-transport"><button class="btn" id="pv-play" data-pv="play">播放本镜</button><button class="btn" data-pv="play-scene">连续预演本场</button><span id="pv-clock"></span><label><input id="pv-sound" type="checkbox" checked>使用已有配音</label></div><input id="pv-scrub" type="range" min="0" max="1" step="0.005" value="0" aria-label="导演预演播放位置"><div id="pv-dialogue"></div></div><aside class="pv-panel pv-inspector"><div id="pv-form"></div></aside></div><section class="pv-bottom"><div class="pv-canvas-head"><b>镜头关系与连续性</b><button class="btn" data-pv="inherit">继承前镜人物终点</button></div><div id="pv-strip"></div><div id="pv-issues"></div></section><p id="pv-notice" role="status" aria-live="polite"></p><p class="pv-disclaimer">保存调度不会开始生成。首帧发声者位置仍需对照真实画面确认；多人轮流发声不等于当前引擎能在同一生成段内稳定完成。旧视频、配音和剧本原文均保留。</p>`;document.querySelector('main').append(el);
  el.addEventListener('click',onClick);el.addEventListener('input',onInput);el.addEventListener('change',onChange);
  $('pv-floor').addEventListener('pointerdown',pointerDown);$('pv-floor').addEventListener('pointermove',pointerMove);$('pv-floor').addEventListener('pointerup',pointerUp);$('pv-floor').addEventListener('pointercancel',pointerUp);
  addEventListener('beforeunload',e=>{if(state.dirty||state.spaceDirty||state.saving){e.preventDefault();e.returnValue='';}});
 }
 function render(){
  const p=project(),s=shot();$('pv-context').textContent=(p?.name||'未选择项目')+(s?' / '+s.id:'')+' · 先排演，再生成';
  $('pv-scope').innerHTML=M.scopes(D,D.activeProjectId).map(x=>`<option value="${h(x.id)}" ${x.id===state.scopeId?'selected':''}>${h(x.name)}</option>`).join('');
  $('pv-shot-list').innerHTML=shots().map((s,i)=>`<button type="button" class="pv-shot" data-pv-shot="${h(s.id)}" aria-pressed="${s.id===state.shotId}"><b>${String(i+1).padStart(2,'0')} · ${h(s.scene||s.desc||s.id)}</b><small>${h(s.id)}</small><span>${num(s.dur)}秒 · ${s.directorPlan?'已有调度':'尚未排演'}${s.directorMediaNeedsReview?' · 旧画面需复核':''}</span></button>`).join('')||'<p>当前范围没有分镜。先在分镜设计中建立镜头。</p>';
  const empty=!state.draft;$('pv-empty').hidden=!empty;$('pv-empty').textContent=s?'本镜尚未引用场景资产。请先在分镜设计里绑定场景，再建立空间布局。':'请选择一个已有分镜；预演不会自动编造项目和镜头。';
  $('pv-canvases').hidden=empty||state.view==='reference';$('pv-reference').hidden=empty||state.view!=='reference';$('pv-apply').disabled=empty||state.saving;
  if(!empty){renderForm();draw();renderReference();}else{$('pv-form').textContent='场景、人物和剧本均来自当前项目。';$('pv-dialogue').textContent=s?.dialogue||'';$('pv-issues').textContent='';}
  $('pv-strip').innerHTML=shots().map((s,i)=>`<button class="btn" data-pv-shot="${h(s.id)}" aria-current="${s.id===state.shotId?'step':'false'}">${i+1}<small>${num(s.dur)}s</small></button>`).join('');
  updateStatus();say(state.notice);
 }
 function field(label,key,value,type='text',step='0.1'){return `<label>${label}<input data-pv-field="${key}" type="${type}" ${type==='number'?`step="${step}"`:''} value="${h(value)}"></label>`;}
 function select(label,key,value,items){return `<label>${label}<select data-pv-field="${key}">${items.map(([v,t])=>`<option value="${h(v)}" ${v===value?'selected':''}>${h(t)}</option>`).join('')}</select></label>`;}
 function renderForm(){const p=state.draft,sp=p.space,sel=state.selection,a=p.actors.find(a=>a.characterId===sel.id),f=sp.fixtures.find(f=>f.id===sel.id);let html=`<h3>本镜导演意图</h3><label>这一镜让观众看见什么变化？<textarea data-pv-field="purpose" rows="2">${h(p.purpose)}</textarea></label><label>人物行动与反应（不作为对白）<textarea data-pv-field="action" rows="3">${h(p.action)}</textarea></label><div class="pv-subtabs"><button class="btn" data-pv="start" aria-pressed="${state.phase==='start'}">起始状态</button><button class="btn" data-pv="end" aria-pressed="${state.phase==='end'}">结束状态</button></div><label>选择人物或机位<select id="pv-select-object"><option value="camera:" ${sel.type==='camera'?'selected':''}>摄影机</option>${p.actors.map(x=>`<option value="actor:${h(x.characterId)}" ${sel.type==='actor'&&sel.id===x.characterId?'selected':''}>${h(name(x.characterId))}</option>`).join('')}${sp.fixtures.map(x=>`<option value="fixture:${h(x.id)}" ${sel.type==='fixture'&&sel.id===x.id?'selected':''}>固定物件 · ${h(x.label)}</option>`).join('')}</select></label>`;
  if(sel.type==='actor'&&a){const v=a[state.phase];html+=select('出现方式','presence',a.presence,[['onscreen','实体人物 · 在画内'],['offscreen','实体人物 · 在场但画外'],['screen','只在屏幕 / 照片内'],['absent','不在现场 / 仅声音']])+`<div class="pv-fields">${field('空间X','x',v.x,'number')}${field('空间Y','y',v.y,'number')}${field('朝向°','facing',v.facing,'number','5')}${select('姿态','pose',v.pose,[['seated','坐着'],['standing','站立'],['walking','行走']])}</div>`+select('注视目标','lookAt',a.lookAt,[['','未指定'],...p.actors.filter(x=>x!==a).map(x=>[x.characterId,name(x.characterId)]),...sp.fixtures.map(x=>[x.id,x.label])])+field('意图 / 无声反应','intent',a.intent)+field('进场 / 离场动作','entryAction',a.entryAction)+`<button class="btn" data-pv="remove-actor">从本镜调度移除</button>`;
  }else if(sel.type==='fixture'&&f){html+=field('物件名称','label',f.label)+`<div class="pv-fields">${field('中心X','fx',f.x,'number')}${field('中心Y','fy',f.y,'number')}${field('宽','fw',f.w,'number')}${field('深','fh',f.h,'number')}</div><button class="btn" data-pv="remove-fixture">移除这个固定物件</button><p class="pv-hint">固定物件属于共用空间；保存后提示关联镜头复核，不自动搬动人物。</p>`;
  }else{const c=p.camera[state.phase];html+=`<div class="pv-fields">${field('机位X','cx',c.x,'number')}${field('机位Y','cy',c.y,'number')}${field('目标X','targetX',c.targetX,'number')}${field('目标Y','targetY',c.targetY,'number')}</div>`+field('水平视角°','fov',p.camera.fov,'number','1')+field('为什么移动摄影机？','moveReason',p.camera.moveReason)+`<button class="btn" data-pv="camera-lock">结束机位＝起始机位</button>`;}
  html+=`<details class="pv-detail"><summary>本镜人物</summary><select id="pv-add-role" aria-label="加入调度的人物">${characters().filter(c=>!p.actors.some(a=>a.characterId===c.id)).map(c=>`<option value="${h(c.id)}">${h(c.name)}</option>`).join('')}</select><button class="btn" data-pv="add-actor">加入调度</button><p class="pv-hint">画内人数与发声人数分别记录；加入人物不会自动生成图像或声音。</p></details><details class="pv-detail"><summary>共用场景结构 · ${h(sp.name)} r${sp.revision}</summary><div class="pv-fields">${field('宽度','width',sp.width,'number')}${field('深度','depth',sp.depth,'number')}</div><p class="pv-hint">规划单位。没有从参考图自动测量。</p><div class="pv-fields">${field('动作轴起点X','ax',sp.axis.ax,'number')}${field('起点Y','ay',sp.axis.ay,'number')}${field('动作轴终点X','bx',sp.axis.bx,'number')}${field('终点Y','by',sp.axis.by,'number')}</div><select id="pv-fixture-kind"><option value="table">桌</option><option value="chair">椅 / 长凳</option><option value="door">门</option><option value="screen">壁屏</option><option value="fixture">其他固定物件</option></select><button class="btn" data-pv="add-fixture">添加固定物件</button><button class="btn" data-pv="save-space">保存共用空间</button><button class="btn" data-pv="reload-space">载入最新共用布局</button></details><details class="pv-detail"><summary>本镜生成约束预览</summary><pre id="pv-prompt"></pre></details><p class="pv-hint">应用会更新本镜画面、机位与人物出现方式。旧提示词保存在调度历史；旧媒体不删除，配音不重做。首帧发声位置需按实际图片重新确认。</p>`;
  $('pv-form').innerHTML=html;renderIssues();
 }
 function renderIssues(){if(!state.draft)return;let es=[],problem='';try{es=events(shot())}catch(e){problem=e.message;}
  const p=state.draft,list=M.issues(p,shot(),project(),characters(),es),ss=shots(),i=ss.findIndex(s=>s.id===state.shotId);
  list.push(...M.continuity(ss[i-1],{...shot(),directorPlan:p}));if(problem)list.unshift({level:'error',message:problem});
  $('pv-issues').innerHTML=list.length?list.map(x=>`<p class="pv-${x.level}">${x.level==='error'?'必须修正':'建议核对'} · ${h(x.message)}</p>`).join(''):'<p class="pv-ok">调度数据未发现明确冲突。尚未证明实际图像、口型或表演通过。</p>';
  try{const preview={...shot(),directorPrevisOnly:false,directorPlan:{...p,binding:undefined}};$('pv-prompt').textContent=M.instructions(preview,{...project(),directorSpaces:[]},characters(),es);}catch(e){$('pv-prompt').textContent='请先修正调度：'+e.message;}
 }
 function updateStatus(){$('pv-draft-status').textContent=state.saving?'正在保存…':state.dirty||state.spaceDirty?'草稿有未保存修改':shot()?.directorPlan?'已保存调度 · 非成片验收':'初始占位 · 尚未保存';$('pv-clock').textContent=(state.t*num(shot()?.dur)).toFixed(2)+' / '+num(shot()?.dur).toFixed(2)+' 秒';$('pv-scrub').value=state.t;}
 function draw(){if(!state.draft)return;const p=state.draft,sp=p.space,w=Math.max(1,num(sp.width)),d=Math.max(1,num(sp.depth)),svg=$('pv-floor');svg.setAttribute('viewBox',`-1 -1 ${w+2} ${d+2.5}`);let s=`<rect x="0" y="0" width="${w}" height="${d}" rx=".1" class="pv-room"/>`;
  for(let x=1;x<w;x++)s+=`<path d="M${x} 0 V${d}" class="pv-grid"/>`;for(let y=1;y<d;y++)s+=`<path d="M0 ${y} H${w}" class="pv-grid"/>`;
  const ax=sp.axis;s+=`<path d="M${num(ax.ax)} ${num(ax.ay)} L${num(ax.bx)} ${num(ax.by)}" class="pv-axis"/><text x="${num(ax.ax)}" y="${num(ax.ay)-.12}" class="pv-floor-label">动作轴（可修改）</text>`;
  for(const f of sp.fixtures)s+=`<g data-pv-object="fixture:${h(f.id)}" class="pv-object ${state.selection.id===f.id?'selected':''}"><rect x="${num(f.x)-num(f.w)/2}" y="${num(f.y)-num(f.h)/2}" width="${Math.max(.05,num(f.w))}" height="${Math.max(.05,num(f.h))}" rx=".05" class="pv-fixture ${h(f.kind)}"/><text x="${num(f.x)}" y="${num(f.y)+.05}" text-anchor="middle" class="pv-floor-label">${h(f.label)}</text></g>`;
  const c=M.cameraAt(p,state.t),angle=Math.atan2(c.targetY-c.y,c.targetX-c.x),fov=(num(p.camera.fov)||65)*Math.PI/180,reach=Math.max(w,d)*1.1;
  s+=`<path d="M${c.x} ${c.y} L${c.x+Math.cos(angle-fov/2)*reach} ${c.y+Math.sin(angle-fov/2)*reach} L${c.x+Math.cos(angle+fov/2)*reach} ${c.y+Math.sin(angle+fov/2)*reach} Z" class="pv-cone"/><path d="M${num(p.camera.start.x)} ${num(p.camera.start.y)} L${num(p.camera.end.x)} ${num(p.camera.end.y)}" class="pv-track"/>`;
  p.actors.forEach((a,i)=>{if(a.presence==='absent')return;const v=M.position(a,state.t);if(!Number.isFinite(v.x+v.y))return;const color=colors[i%colors.length],selected=state.selection.type==='actor'&&state.selection.id===a.characterId,rad=v.facing*Math.PI/180;
   s+=`<path d="M${num(a.start.x)} ${num(a.start.y)} L${num(a.end.x)} ${num(a.end.y)}" stroke="${color}" class="pv-track"/><g data-pv-object="actor:${h(a.characterId)}" class="pv-object ${selected?'selected':''}"><circle cx="${v.x}" cy="${v.y}" r=".19" fill="${color}" fill-opacity="${a.presence==='offscreen'?'.35':'1'}" stroke="${selected?'#fff':color}" stroke-width=".04"/><path d="M${v.x} ${v.y} l${Math.sin(rad)*.34} ${-Math.cos(rad)*.34}" stroke="${color}" stroke-width=".05"/><text x="${v.x}" y="${v.y+.39}" text-anchor="middle" class="pv-floor-label">${h(name(a.characterId))}${a.presence==='screen'?'（屏幕内）':''} · ${v.pose==='seated'?'坐':v.pose==='walking'?'走':'立'}</text><title>${h(name(a.characterId))}：拖动修改${state.phase==='start'?'起点':'终点'}</title></g>`;
  });
  s+=`<g data-pv-object="camera:" class="pv-object"><rect x="${c.x-.2}" y="${c.y-.16}" width=".4" height=".32" rx=".04" class="pv-camera-icon"/><text x="${c.x}" y="${c.y+.38}" text-anchor="middle" class="pv-floor-label">摄影机</text></g><g data-pv-object="target:" class="pv-object"><circle cx="${c.targetX}" cy="${c.targetY}" r=".12" class="pv-target"/><path d="M${c.targetX-.2} ${c.targetY}h.4 M${c.targetX} ${c.targetY-.2}v.4" class="pv-target"/><title>拖动修改取景目标</title></g>`;svg.innerHTML=s;
  let frame='<rect width="960" height="540" class="pv-screen-bg"/><path d="M0 330H960 M320 0V540 M640 0V540" class="pv-screen-grid"/><text x="24" y="34" class="pv-proj-hint">机位取景示意 · 不推断真实遮挡 / 墙体 / 人脸</text>';
  const es=(()=>{try{return events(shot()).filter(e=>e.type==='speech'&&e.delivery==='onscreen').map(e=>e.speakerId)}catch{return []}})();
  const projected=p.actors.map((a,i)=>({a,i,v:M.position(a,state.t),q:M.projectPoint(M.position(a,state.t),c,num(p.camera.fov)||65)})).filter(x=>x.a.presence==='onscreen'&&x.q.inFrame).sort((a,b)=>b.q.depth-a.q.depth);
  for(const x of projected){const px=x.q.u*960,scale=Math.max(.24,Math.min(1.65,3.6/x.q.depth)),body=x.v.pose==='seated'?110:165,py=310+45*scale,color=colors[x.i%colors.length],talk=es.includes(x.a.characterId);frame+=`<g transform="translate(${px},${py}) scale(${scale})"><rect x="-35" y="-${body}" width="70" height="${body}" rx="16" fill="${color}" fill-opacity=".72"/><circle cx="0" cy="-${body+30}" r="27" fill="${color}" stroke="${talk?'#fff':'none'}" stroke-width="3"/><path d="M-23 0l-7 42 M23 0l7 42" stroke="${color}" stroke-width="13"/><text x="0" y="76" text-anchor="middle" class="pv-proj-name">${h(name(x.a.characterId))}</text>${talk?'<text x="0" y="98" text-anchor="middle" class="pv-proj-tag">本段发声者</text>':''}</g>`;}
  if(!projected.length)frame+='<text x="480" y="270" text-anchor="middle" class="pv-proj-name">当前机位没有覆盖画内实体人物</text>';
  const virtual=p.actors.filter(a=>a.presence==='screen');if(virtual.length)frame+=`<text x="24" y="508" class="pv-proj-hint">仅屏幕内：${h(virtual.map(a=>name(a.characterId)).join('、'))}（不计入现场人数）</text>`;
  $('pv-camera-view').innerHTML=frame;$('pv-dialogue').textContent=shot()?.dialogue||'本镜无书面对白；预演不会自动编造旁白。';updateStatus();
 }
 function renderReference(){const s=shot(),first=s?.firstFrameUrl||s?.localFrameResult?.imageUrl||'',asset=D.scenes.find(a=>a.projectId===s?.projectId&&(s?.sceneIds||[]).includes(a.id)),src=first||asset?.imageUrl||'',safe=/^(\/(?!\/)|data:image\/(png|jpeg|webp);base64,)/i.test(src);$('pv-reference').innerHTML=safe?`<img src="${h(src)}" alt="${first?'已存本镜首帧':'场景资产参考，非本镜首帧'}"><p>${first?'本镜首帧。':'这里只显示场景资产，不代表已经生成或批准本镜首帧。'}核对人数、座次、服装、门的位置和实际发声者。调度改变后，旧首帧可能已过期；本视图不会自动批准它。</p>`:'<div class="pv-empty">没有可读取的本镜首帧。当前仅做空间与镜头预演，不自动调用生成模型。</div>';}
 function changed(space=false){if(space)state.spaceDirty=true;else state.dirty=true;stop();state.t=state.phase==='end'?1:0;draw();renderIssues();updateStatus();}
 function onInput(e){const key=e.target.dataset.pvField;if(!key){if(e.target.id==='pv-scrub'){stop();state.t=Number(e.target.value);draw();}return;}if(state.saving||!state.draft)return;const p=state.draft,a=p.actors.find(x=>x.characterId===state.selection.id),f=p.space.fixtures.find(x=>x.id===state.selection.id);const v=e.target.type==='number'?e.target.value===''?NaN:Number(e.target.value):e.target.value;let shared=false;
  if(['purpose','action'].includes(key))p[key]=v;
  else if(['fov','moveReason'].includes(key))p.camera[key]=v;
  else if(['cx','cy','targetX','targetY'].includes(key))p.camera[state.phase][({cx:'x',cy:'y'})[key]||key]=v;
  else if(['width','depth'].includes(key)){p.space[key]=v;shared=true;}
  else if(['ax','ay','bx','by'].includes(key)){p.space.axis[key]=v;shared=true;}
  else if(['label','fx','fy','fw','fh'].includes(key)&&f){f[({fx:'x',fy:'y',fw:'w',fh:'h'})[key]||key]=v;shared=true;}
  else if(a){if(['x','y','facing','pose'].includes(key))a[state.phase][key]=v;else a[key]=v;}
  changed(shared);
 }
 function onChange(e){if(e.target.id==='pv-scope'){const id=e.target.value;if(!canLeave()){e.target.value=state.scopeId;return;}state.scopeId=id;load(shots()[0]);render();}else if(e.target.id==='pv-select-object'){const at=e.target.value.indexOf(':');state.selection={type:e.target.value.slice(0,at),id:e.target.value.slice(at+1)};renderForm();draw();}else if(e.target.id==='pv-sound'&&state.playing){stop();}}
 let drag=null;
 function pointerDown(e){if(state.saving||!state.draft)return;const item=e.target.closest('[data-pv-object]');if(!item)return;stop();const [type,...rest]=item.dataset.pvObject.split(':');drag={type,id:rest.join(':')};state.selection=type==='target'?{type:'camera',id:''}:drag;state.t=state.phase==='end'?1:0;$('pv-floor').setPointerCapture(e.pointerId);renderForm();draw();e.preventDefault();}
 function pointerMove(e){if(!drag||state.saving)return;const svg=$('pv-floor'),matrix=svg.getScreenCTM();if(!matrix)return;const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),p=state.draft,round=n=>Math.round(n*50)/50,x=round(Math.max(-1,Math.min(p.space.width+1,pt.x))),y=round(Math.max(-1,Math.min(p.space.depth+1,pt.y)));if(drag.type==='actor'){const a=p.actors.find(a=>a.characterId===drag.id);a[state.phase].x=x;a[state.phase].y=y;state.dirty=true;}else if(drag.type==='fixture'){const f=p.space.fixtures.find(f=>f.id===drag.id);f.x=x;f.y=y;state.spaceDirty=true;}else{const c=p.camera[state.phase];c[drag.type==='target'?'targetX':'x']=x;c[drag.type==='target'?'targetY':'y']=y;state.dirty=true;}draw();}
 function pointerUp(e){if(!drag)return;drag=null;try{$('pv-floor').releasePointerCapture(e.pointerId)}catch{}renderForm();draw();}
 async function commit(next){
  if(typeof localStorage.setItemAsync==='function')await localStorage.setItemAsync('aimovie_data',JSON.stringify(next));else localStorage.setItem('aimovie_data',JSON.stringify(next));
  Object.assign(D,next); // Only after the storage adapter accepts this revision.
  try{await workspaceFlush();return true;}catch(e){say('草稿已保存在浏览器；磁盘保存未确认：'+e.message);return false;}
 }
 async function save(kind){
  if(state.saving||!state.draft)return;stop();state.saving=true;updateStatus();$('pv-apply').disabled=true;
  try{
   await workspaceFlush();const stored=JSON.parse(localStorage.getItem('aimovie_data')||'null');if(!stored||stored.activeProjectId!==state.projectId)throw Error('项目已切换，未保存');
   if(kind==='space'){
    const result=M.saveSpace(stored,state.projectId,state.draft.space,state.spaceBaseline);
    if(result.affectedIds.length&&!confirm(`共用空间改变会使 ${result.affectedIds.length} 个镜头需要复核，旧媒体保留。保存？`))return;
    const disk=await commit(result.data);state.draft.space=M.clone(result.space);state.spaceBaseline=M.signature(result.space);state.baseline=M.signature(shot());state.spaceDirty=false;state.dirty=true;if(disk)say('共用空间已保存到本机。本镜人物调度仍需点击“应用到本镜分镜”。');
   }else{
    if(state.spaceDirty)throw Error('共用场景结构尚未保存；先保存共用空间，再应用本镜人物调度');
    let source=stored,p=stored.projects.find(p=>p.id===state.projectId);const draft=M.clone(state.draft);
    if(!(p.directorSpaces||[]).some(s=>s.id===draft.space.id)){const created=M.saveSpace(source,state.projectId,draft.space,M.signature(null));source=created.data;draft.space=created.space;}
    const current=source.shots.find(s=>s.projectId===state.projectId&&s.id===state.shotId),es=DialogueContract.parseDialogue(current.dialogue||'',source.characters.filter(c=>c.projectId===state.projectId));
    const result=M.applyPlan(source,state.projectId,state.shotId,draft,state.baseline,es),disk=await commit(result.data);load(result.shot);if(disk)say(`导演预演已保存并应用到本镜；${result.affectedIds.length} 个镜头标记待核对。没有发起生成，旧视频与配音保留。`);
   }
  }catch(e){say('未完成保存：'+e.message+'。当前草稿保留。');}
  finally{state.saving=false;render();}
 }
 function startPlayback(scene=false){
  if(!state.draft||state.saving)return;if(state.playing){stop();return;}let plan=state.draft;
  try{M.validateSpace(plan.space);if(M.issues({...plan,binding:undefined},shot(),{...project(),directorSpaces:[]},characters()).some(x=>['CAMERA','POSITION','VERSION'].includes(x.code)&&x.level==='error'))throw Error('请先修正位置或机位数值');}catch(e){say(e.message);return;}
  state.playing=true;state.scenePlay=scene;if(state.t>=1)state.t=0;$('pv-play').textContent='暂停';
  const seconds=Math.max(.1,num(shot().dur)),start=performance.now()-state.t*seconds*1000,file=shot().performanceAudio?.file||shot().previsAudioFile||(shot().audioMode==='voiceover'?shot().audioAsset:'');
  if($('pv-sound').checked&&/^ams-audio-[a-f0-9]{64}\.wav$/.test(file||'')){const a=new Audio('/audio-assets/'+file);state.audio=a;a.onloadedmetadata=()=>{if(state.audio===a){a.currentTime=Math.min(a.duration-.01,state.t*seconds);a.play().catch(()=>say('已有配音无法播放；空间预演继续，未生成替代声音。'));}};a.onerror=()=>say('已有配音文件读取失败；未调用付费或新模型。');}else say('正在播放空间与机位示意。本镜没有可绑定的本地配音时保持静音，不伪造声音。');
  const tick=now=>{if(!state.playing)return;state.t=Math.min(1,(now-start)/(seconds*1000));draw();if(state.t>=1){const continueScene=state.scenePlay;stop();if(continueScene){const list=shots(),i=list.findIndex(s=>s.id===state.shotId),next=list[i+1];if(next?.directorPlan){load(next);render();startPlayback(true);}else say(next?'连续预演停在尚未排演的镜头，不自动跳过或猜测站位。':'本场预演结束。');}return;}state.raf=requestAnimationFrame(tick);};state.raf=requestAnimationFrame(tick);
 }
 async function onClick(e){
  const shotButton=e.target.closest('[data-pv-shot]');if(shotButton){if(!canLeave())return;load(shots().find(s=>s.id===shotButton.dataset.pvShot));render();return;}
  const button=e.target.closest('[data-pv]');if(!button||state.saving)return;const action=button.dataset.pv;
  if(action==='stage'||action==='reference'){state.view=action;render();return;}
  if(action==='apply'||action==='save-space'){await save(action==='apply'?'plan':'space');return;}
  if(action==='discard'){if((state.dirty||state.spaceDirty)&&!confirm('放弃尚未保存的预演修改？'))return;load(shot());say('已载入本镜已保存状态；没有删除任何媒体。');render();return;}
  if(action==='export'){if(!state.draft)return;const payload={kind:'AMS_DIRECTOR_PREVIS_DRAFT',version:1,projectId:state.projectId,shotId:state.shotId,draft:M.clone(state.draft),unsaved:state.dirty||state.spaceDirty,generatedVideo:false};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='AMS_previs_'+state.shotId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(!state.draft)return;
  if(action==='play'){startPlayback();return;}
  if(action==='play-scene'){if(state.dirty||state.spaceDirty){say('请先保存本镜调度，再连续预演；单镜草稿仍可直接播放。');return;}startPlayback(true);return;}
  if(action==='start'||action==='end'){stop();state.phase=action;state.t=action==='start'?0:1;renderForm();draw();return;}
  if(action==='camera-lock'){state.draft.camera.end=M.clone(state.draft.camera.start);changed();renderForm();return;}
  if(action==='inherit'){try{const list=shots(),i=list.findIndex(s=>s.id===state.shotId);state.draft=M.copyEnd(list[i-1],state.draft);changed();renderForm();say('已把同场人物的前镜终点复制为本镜起点，尚未保存。');}catch(e){say(e.message);}return;}
  if(action==='add-actor'){const id=$('pv-add-role').value;if(!id||state.draft.actors.some(a=>a.characterId===id))return;const base=M.newPlan({...shot(),characterIds:[id]},state.draft.space,characters());state.draft.actors.push(base.actors[0]);state.selection={type:'actor',id};changed();renderForm();return;}
  if(action==='remove-actor'){state.draft.actors=state.draft.actors.filter(a=>a.characterId!==state.selection.id);state.selection={type:'camera',id:''};changed();renderForm();return;}
  if(action==='add-fixture'){const kind=$('pv-fixture-kind').value,id='fixture_'+crypto.randomUUID(),sp=state.draft.space;sp.fixtures.push({id,kind,label:({table:'餐桌',chair:'座椅',door:'入口',screen:'壁屏',fixture:'固定物件'})[kind],x:sp.width/2,y:sp.depth/2,w:kind==='table'?1.8:.8,h:kind==='table'?.9:.25});state.selection={type:'fixture',id};changed(true);renderForm();return;}
  if(action==='remove-fixture'){state.draft.space.fixtures=state.draft.space.fixtures.filter(f=>f.id!==state.selection.id);state.selection={type:'camera',id:''};changed(true);renderForm();return;}
  if(action==='reload-space'){const space=(project().directorSpaces||[]).find(s=>s.id===state.draft.space.id);if(!space){say('尚未保存这份共用空间。');return;}if(state.spaceDirty&&!confirm('放弃未保存的场景结构，载入最新共用空间？'))return;state.draft.space=M.clone(space);state.spaceBaseline=M.signature(space);state.spaceDirty=false;changed();renderForm();say('已载入最新共用空间；人物位置未自动改动，请核对后应用。');}
 }
 function openForShot(id){if(!canLeave()||(typeof tlCanLeave==='function'&&!tlCanLeave()))return;const s=D.shots.find(s=>s.id===id&&s.projectId===D.activeProjectId);if(!s)return;state.projectId=D.activeProjectId;state.scopeId=s.storyboardBatchId?'batch:'+s.storyboardBatchId:'all';if(!M.scopes(D,D.activeProjectId).some(x=>x.id===state.scopeId))state.scopeId='all';load(s);go('previs');}
 async function saveUnsaved(){if(state.saving)throw Error('导演预演正在保存');if(state.spaceDirty)await save('space');if(state.spaceDirty)throw Error('共用空间尚未保存，已保留预演草稿');if(state.dirty)await save('plan');if(state.dirty||state.spaceDirty)throw Error('导演预演尚未保存，请处理右侧检查提示');}
 mount();globalThis.DirectorPrevisUI={saveUnsaved,activate,canLeave,openForShot,stop,state,version:'0.4.0-alpha.2'};
})();
