// Non-destructive edit decisions, stored separately from generation/source records.
const CUT={undo:new Map(),redo:new Map(),playing:false,last:0,raf:0,slots:[],ctx:null,master:null,music:null,musicNode:null,exportId:null};
function cutKey(){return D.activeProjectId+'|'+cutBatch()}
function cutBatch(){const p=activeProject();return p.storyboardBatchId||(D.storyboardBatches||[]).filter(b=>b.projectId===p.id).at(-1)?.id||''}
function cutSettings(){return activeProject().timelineEdits?.[cutBatch()]||{order:[],clips:{},mix:{}}}
function cutShots(){return D.shots.filter(s=>s.projectId===D.activeProjectId&&s.storyboardBatchId===cutBatch())}
function cutSave(change,history=true){
  try{
    const p=activeProject(),batch=cutBatch(),current=cutSettings(),next=structuredClone(current);change(next);TimelineEdit.build(cutShots(),next);TimelineEdit.mix(next.mix);
    const saved=JSON.parse(localStorage.getItem('aimovie_data')),sp=saved.projects.find(x=>x.id===p.id),prior=sp?.timelineEdits?.[batch]||{order:[],clips:{},mix:{}};
    if(!sp||JSON.stringify(prior)!==JSON.stringify(current))throw Error('其他页面已修改剪辑，请刷新后继续，避免覆盖。');
    sp.timelineEdits={...sp.timelineEdits,[batch]:next};localStorage.setItem('aimovie_data',JSON.stringify(saved));p.timelineEdits=sp.timelineEdits;
    if(history){const list=CUT.undo.get(cutKey())||[];list.push(structuredClone(current));CUT.undo.set(cutKey(),list.slice(-30));CUT.redo.set(cutKey(),[])}
    return true;
  }catch(e){tlMessage('剪辑未保存：'+e.message);return false}
}
function cutPatch(id,changes){return cutSave(e=>{e.clips||={};e.clips[id]={...e.clips[id],...changes}})}
function cutUndo(redo=false){cutStop();const from=(redo?CUT.redo:CUT.undo).get(cutKey())||[],to=(redo?CUT.undo:CUT.redo).get(cutKey())||[];if(!from.length)return tlMessage('没有可以'+(redo?'重做':'撤销')+'的剪辑操作。');const prior=from.at(-1),current=structuredClone(cutSettings());if(cutSave(e=>{for(const key of Object.keys(e))delete e[key];Object.assign(e,prior)},false)){from.pop();to.push(current);(redo?CUT.undo:CUT.redo).set(cutKey(),to);TL.time=tlCurrent()?.start||0;tlMessage(redo?'已重做剪辑操作。':'已撤销剪辑操作。');tlRender()}}
tlClips=function(){try{return TimelineEdit.build(cutShots(),cutSettings())}catch(e){tlMessage(e.message);return []}};
const cutMountBase=tlMount;
tlMount=function(){const section=cutMountBase();if(!document.getElementById('cut-toolbar')){const bar=document.createElement('div');bar.id='cut-toolbar';bar.className='cut-toolbar';bar.innerHTML='<span>剪辑模式</span><button class="btn" onclick="cutUndo()">撤销剪辑</button><button class="btn" onclick="cutUndo(true)">重做剪辑</button><button class="btn gold" onclick="cutExport()">导出当前剪辑</button><span class="muted">拖动镜头排序 · 拖动两端裁切 · 自动保存</span><a id="cut-download" hidden download="timeline.mp4">下载剪辑版</a>';section.querySelector('.tl-timeline').before(bar)}return section};
tlTracks=function(){
  const clips=tlClips(),total=clips.at(-1)?.end||0,width=Math.max(1,total*TL.zoom),host=document.getElementById('tl-lanes');if(!host)return;host.style.width=width+92+'px';
  let ticks='';for(let t=0;t<=total;t+=5)ticks+=`<span class="tl-tick" style="left:${t*TL.zoom}px">${TimelineModel.timecode(t)}</span>`;
  const lane=(type,label,text)=>`<div class="tl-lane ${type} cut-lane"><span class="tl-lane-label">${label}</span>${clips.map((c,i)=>`<div class="tl-clip ${c.shot.id===TL.shotId?'selected':''}" role="button" tabindex="0" style="left:${c.start*TL.zoom}px;width:${c.duration*TL.zoom}px" data-shot="${esc(c.shot.id)}" aria-label="${label} 第 ${i+1} 镜 ${esc(c.shot.scene||'')}" ${type==='video'?'draggable="true" ondragstart="cutDrag(event)" ondragover="event.preventDefault()" ondrop="cutDrop(event)"':''} onclick="tlSelect(this.dataset.shot)" onkeydown="if(event.key==='Enter')tlSelect(this.dataset.shot)">${text(c,i)}${type==='video'?`<span class="cut-edge left" title="拖动裁切入点" onpointerdown="cutTrimDrag(event,'in')"></span><span class="cut-edge right" title="拖动裁切出点" onpointerdown="cutTrimDrag(event,'out')"></span>`:''}</div>`).join('')}</div>`;
  host.innerHTML='<div class="tl-ruler">'+ticks+'</div>'+lane('video','V1 画面',(c,i)=>`<b>${i+1} ${esc(c.shot.scene||'镜头')}</b><small>${c.edit.trimIn.toFixed(1)}–${c.edit.trimOut.toFixed(1)}s${c.edit.transition!=='cut'?' · '+({dissolve:'叠化',fadeblack:'黑场',wipeleft:'擦除'})[c.edit.transition]:''}</small>`)+lane('audio','A1 原声',c=>'♫ '+Math.round(c.edit.gain*100)+'%')+lane('dialogue','T1 对白',c=>esc(c.shot.dialogue||'无对白'))+`<div class="cut-music">A2 背景音乐 · ${cutSettings().mix?.musicFile?'已载入 · '+Math.round((cutSettings().mix?.musicVolume??0.25)*100)+'%':'在右侧混音区导入'}</div><div class="tl-playhead" id="tl-playhead"></div>`;
  document.getElementById('tl-total').textContent=clips.length+' 镜 · '+total.toFixed(2)+' 秒（含转场重叠）';document.getElementById('tl-scrub').max=total||1;tlClock();
};
let cutDragged=null;
function cutDrag(event){cutStop();cutDragged=event.currentTarget.dataset.shot;event.dataTransfer.setData('text/plain',cutDragged);event.dataTransfer.effectAllowed='move'}
function cutDrop(event){event.preventDefault();if(!tlCanLeave())return;const target=event.currentTarget.dataset.shot,id=cutDragged;if(!id||id===target)return;const order=tlClips().map(c=>c.shot.id).filter(x=>x!==id),rect=event.currentTarget.getBoundingClientRect(),index=order.indexOf(target)+(event.clientX>rect.left+rect.width/2?1:0);order.splice(index,0,id);if(cutSave(e=>e.order=order)){TL.shotId=id;TL.time=tlCurrent().start;tlMessage('镜头顺序已保存，原始分镜顺序不变。');tlRender()}cutDragged=null}
function cutTrimDrag(event,edge){
  event.preventDefault();event.stopPropagation();if(!tlCanLeave())return;cutStop();const clip=tlClips().find(c=>c.shot.id===event.target.parentElement.dataset.shot),start=event.clientX,node=event.target.parentElement;let value;
  const move=e=>{const delta=(e.clientX-start)/TL.zoom;value=Math.round(Math.max(edge==='in'?0:clip.edit.trimIn+0.1,Math.min(edge==='in'?clip.edit.trimOut-0.1:clip.edit.sourceDuration,(edge==='in'?clip.edit.trimIn:clip.edit.trimOut)+delta))*24)/24;node.style.opacity='.65';tlMessage((edge==='in'?'入点 ':'出点 ')+value.toFixed(2)+' 秒 · 松开保存')};
  const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointercancel',cancel);node.style.opacity='';if(value!==undefined&&cutPatch(clip.shot.id,{[edge==='in'?'trimIn':'trimOut']:value})){TL.shotId=clip.shot.id;TL.time=tlCurrent().start;tlMessage('裁切已保存，源视频保留。');tlRender()}};
  const cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);node.style.opacity='';tlMessage('已取消裁切')};
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});document.addEventListener('pointercancel',cancel,{once:true});
}
const cutInspectorBase=tlInspector;
tlInspector=function(){cutInspectorBase();const c=tlCurrent();if(!c)return;const host=document.getElementById('tl-inspector'),mix=TimelineEdit.mix(cutSettings().mix);
  host.insertAdjacentHTML('beforeend',`<div class="cut-properties"><h3>裁切与转场</h3><div class="cut-fields"><label>入点（秒）<input id="cut-in" type="number" step="0.04" min="0" value="${c.edit.trimIn.toFixed(3)}"></label><label>出点（秒）<input id="cut-out" type="number" step="0.04" max="${c.edit.sourceDuration}" value="${c.edit.trimOut.toFixed(3)}"></label></div><button class="btn" onclick="cutTrimFields()">应用入出点</button><p class="muted">源长 ${c.edit.sourceDuration.toFixed(2)} 秒 · 裁切可能截断对白，请试听。</p><label>到下一镜的转场<select id="cut-transition" onchange="cutTransition()">${[['cut','直接切换'],['dissolve','叠化'],['fadeblack','淡入黑场'],['wipeleft','左向擦除']].map(([v,t])=>`<option value="${v}" ${c.edit.transition===v?'selected':''}>${t}</option>`).join('')}</select></label><label>转场时长（秒）<input id="cut-transition-duration" type="number" min="0.1" max="2" step="0.1" value="${c.edit.transitionDuration||0.5}" onchange="cutTransition()"></label><p class="muted">最后一镜的转场不生效；转场最长为相邻较短镜头的一半。</p><h3>实时混音</h3><label>本镜原声 <output id="cut-gain-value">${Math.round(c.edit.gain*100)}%</output><input aria-label="本镜原声音量" type="range" min="0" max="1" step="0.01" value="${c.edit.gain}" oninput="cutLiveGain('gain',Number(this.value))" onchange="cutCommitGain('gain',Number(this.value))"></label><label>背景音乐 <output id="cut-musicVolume-value">${Math.round(mix.musicVolume*100)}%</output><input aria-label="背景音乐音量" type="range" min="0" max="1" step="0.01" value="${mix.musicVolume}" oninput="cutLiveGain('musicVolume',Number(this.value))" onchange="cutCommitGain('musicVolume',Number(this.value))"></label><label>总音量 <output id="cut-master-value">${Math.round(mix.master*100)}%</output><input aria-label="总音量" type="range" min="0" max="1" step="0.01" value="${mix.master}" oninput="cutLiveGain('master',Number(this.value))" onchange="cutCommitGain('master',Number(this.value))"></label><label>导入背景音乐（WAV / MP3）<input type="file" accept=".wav,.mp3" onchange="cutImportMusic(this)"></label><button class="btn" onclick="cutRemoveMusic()">移除背景音乐</button><p class="muted">原声与背景音乐同时试听，转场自动交叉淡化。音量参数自动保存；导出不会修改源视频。</p></div>`);
  host.querySelector('.cut-properties').insertAdjacentHTML('beforeend','<label><input type="checkbox" '+(mix.normalizeDialogue?'checked ':'')+'onchange="cutNormalizeDialogue(this.checked)">导出时均衡对白响度</label>');
  const versions=host.querySelector('[aria-label="本镜视频版本"]');if(versions)versions.onchange=()=>{cutStop();if(cutPatch(c.shot.id,{versionId:versions.value,trimIn:0,trimOut:undefined,sourceDuration:undefined})){TL.version=versions.value;TL.previewKey=null;tlRender()}};
};
function cutTrimFields(){cutStop();if(cutPatch(TL.shotId,{trimIn:Number(document.getElementById('cut-in').value),trimOut:Number(document.getElementById('cut-out').value)})){TL.time=tlCurrent().start;tlRender();tlMessage('入出点已保存。')}}
function cutNormalizeDialogue(value){if(cutSave(e=>{e.mix={...e.mix,normalizeDialogue:value}}))tlMessage(value?'已开启导出对白响度均衡；预览音量不变。':'已关闭导出对白响度均衡。')}
function cutTransition(){cutStop();if(cutPatch(TL.shotId,{transition:document.getElementById('cut-transition').value,transitionDuration:Number(document.getElementById('cut-transition-duration').value)})){tlRender();tlMessage('转场已保存。')}}
function cutLiveGain(key,value){document.getElementById('cut-'+key+'-value').textContent=Math.round(value*100)+'%';if(key==='gain'){for(const slot of CUT.slots)if(slot.id===TL.shotId)slot.gainOverride=value}else CUT[key+'Override']=value;cutApplyMix()}
function cutCommitGain(key,value){const ok=key==='gain'?cutPatch(TL.shotId,{gain:value}):cutSave(e=>{e.mix={...e.mix,[key]:value}});if(ok){for(const slot of CUT.slots)delete slot.gainOverride;delete CUT[key+'Override'];tlTracks();cutApplyMix();tlMessage('混音参数已保存。')}else tlInspector()}
async function cutImportMusic(input){const file=input.files[0];if(!file)return;const key=cutKey();try{if(file.size>20*1024*1024||!/[.](wav|mp3)$/i.test(file.name))throw Error('请选择20MB以内 WAV 或 MP3');tlMessage('正在导入背景音乐…');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)}),dataUrl=data.replace(/^data:[^;]*;/,'data:audio/'+(/mp3$/i.test(file.name)?'mpeg':'wav')+';');const r=await fetch('/api/audio-assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})}),out=await r.json();if(!r.ok)throw Error(out.error);if(key!==cutKey())throw Error('项目已切换，请回原项目重新选择音乐');cutStop();if(cutSave(e=>e.mix={...e.mix,musicFile:out.file})){tlRender();tlMessage('背景音乐已导入，点击播放即可混音试听。')}}catch(e){tlMessage(e.message)}}
function cutRemoveMusic(){cutStop();if(cutSave(e=>e.mix={...e.mix,musicFile:''})){tlRender();tlMessage('背景音乐已移除，文件仍保留。')}}
const cutMediaBase=tlMedia;
tlMedia=function(shot){const id=cutSettings().clips?.[shot.id]?.versionId;return TimelineModel.versions(D,shot).find(g=>g.id===id)||cutMediaBase(shot)};
function cutProxy(url){return '/api/timeline-media?url='+encodeURIComponent(url)}
function cutAudioContext(){
  if(!CUT.ctx){CUT.ctx=new AudioContext();CUT.master=CUT.ctx.createGain();const limiter=CUT.ctx.createDynamicsCompressor();limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=0.003;limiter.release.value=0.1;CUT.master.connect(limiter);limiter.connect(CUT.ctx.destination)}return CUT.ctx;
}
function cutAttachAudio(element){element.volume=1;const ctx=cutAudioContext(),source=ctx.createMediaElementSource(element),gain=ctx.createGain();source.connect(gain);gain.connect(CUT.master);return gain}
function cutStop(){CUT.playing=false;cancelAnimationFrame(CUT.raf);for(const slot of CUT.slots){slot.video.pause();slot.audio?.pause()}CUT.music?.pause()}
function cutClear(){cutStop();for(const slot of CUT.slots){slot.node?.disconnect();slot.audioNode?.disconnect()}CUT.slots=[];document.getElementById('tl-screen')?.replaceChildren();}
function cutSetSlot(slot,c,time){
  const g=tlMedia(c.shot),url=g?.videoUrl||c.shot.videoUrl;if(!url)throw Error('第 '+(tlClips().findIndex(x=>x.shot.id===c.shot.id)+1)+' 镜：'+TimelineModel.missingReason(D,c.shot));
  const proxy=cutProxy(url);
  if(slot.id!==c.shot.id||slot.url!==url){slot.video.pause();slot.audio?.pause();slot.audioNode?.disconnect();slot.audio=null;slot.audioNode=null;slot.id=c.shot.id;slot.url=url;slot.video.src=proxy;
    slot.video.onerror=()=>{cutStop();tlMessage('视频读取失败，请检查连接。')};
    const batchKey=cutKey();slot.video.onloadedmetadata=()=>{
      slot.video.currentTime=Math.min(c.edit.trimIn+Math.max(0,TL.time-c.start),slot.video.duration-0.001);
      if(batchKey!==cutKey()||!Number.isFinite(slot.video.duration))return;
      const latest=tlClips().find(x=>x.shot.id===c.shot.id);if(latest&&Math.abs(latest.edit.sourceDuration-slot.video.duration)>.03){
        const actual=slot.video.duration;if(latest.edit.trimIn>=actual-.1)return tlMessage('已选版本比裁切入点短，请重设入出点。');
        if(cutSave(e=>{e.clips||={};e.clips[c.shot.id]={...e.clips[c.shot.id],sourceDuration:actual,trimOut:Math.min(latest.edit.trimOut,actual)}},false)){tlTracks();if(!TL.dirty&&!CUT.playing)tlInspector()}
      }
    };
    if(c.shot.audioMode==='replacement'&&c.shot.audioAsset){slot.audio=new Audio('/audio-assets/'+encodeURIComponent(c.shot.audioAsset));slot.audio.loop=true;if(CUT.ctx)slot.audioNode=cutAttachAudio(slot.audio)}
  }
  slot.clip=c;slot.video.style.display='block';slot.video.style.opacity='1';slot.video.style.clipPath='none';
  const seek=c.edit.trimIn+Math.max(0,time-c.start);
  if(Number.isFinite(slot.video.duration)&&Math.abs(slot.video.currentTime-seek)>0.18)slot.video.currentTime=Math.min(seek,slot.video.duration-0.001);
  if(slot.audio&&Number.isFinite(slot.audio.duration)){const t=(time-c.start)%slot.audio.duration;if(Math.abs(slot.audio.currentTime-t)>0.2)slot.audio.currentTime=Math.max(0,t)}
}
function cutUpdate(time){
  const clips=tlClips(),active=TimelineEdit.active(clips,Math.min(time,Math.max(0,(clips.at(-1)?.end||0)-0.001)));
  if(!active.length)return;
  const screen=document.getElementById('tl-screen');screen.querySelector('.tl-placeholder')?.remove();
  while(CUT.slots.length<2){const video=document.createElement('video');video.preload='auto';video.playsInline=true;video.className='cut-preview-video';screen.append(video);CUT.slots.push({video,node:CUT.ctx?cutAttachAudio(video):null})}
  const old=CUT.slots.slice(),used=new Set();CUT.slots=active.map(c=>{const slot=old.find(s=>s.id===c.shot.id&&!used.has(s))||old.find(s=>!used.has(s)&&!active.some(a=>a.shot.id===s.id));used.add(slot);return slot}).concat(old.filter(s=>!used.has(s)));
  for(let i=0;i<2;i++){const slot=CUT.slots[i],c=active[i];if(!c){slot.video.pause();slot.video.style.display='none';slot.audio?.pause();slot.clip=null;continue}cutSetSlot(slot,c,time);slot.video.style.zIndex=String(i+1)}
  if(active.length===2){const p=(time-active[1].start)/active[1].overlap,type=active[0].edit.transition,a=CUT.slots[0].video,b=CUT.slots[1].video;if(type==='dissolve')b.style.opacity=String(p);if(type==='fadeblack'){a.style.opacity=String(Math.max(0,1-p*2));b.style.opacity=String(Math.max(0,p*2-1))}if(type==='wipeleft')b.style.clipPath=`inset(0 0 0 ${(1-p)*100}%)`}
  const mix=TimelineEdit.mix(cutSettings().mix);if(mix.musicFile){const url='/audio-assets/'+encodeURIComponent(mix.musicFile);if(!CUT.music||CUT.music.dataset.file!==mix.musicFile){CUT.music?.pause();CUT.musicNode?.disconnect();CUT.music=new Audio(url);CUT.music.dataset.file=mix.musicFile;CUT.music.loop=true;CUT.musicNode=CUT.ctx?cutAttachAudio(CUT.music):null}if(Number.isFinite(CUT.music.duration)){const seek=(mix.musicOffset+time)%CUT.music.duration;if(Math.abs(CUT.music.currentTime-seek)>0.2)CUT.music.currentTime=seek}}else CUT.music?.pause();
  cutApplyMix();
}
function cutApplyMix(){const mix=TimelineEdit.mix(cutSettings().mix),active=CUT.slots.filter(s=>s.clip),master=CUT.masterOverride??mix.master;if(CUT.master)CUT.master.gain.value=master;
  for(const [i,slot] of active.entries()){const c=slot.clip,p=active.length===2?(TL.time-active[1].clip.start)/active[1].clip.overlap:0,envelope=active.length===2?(i===0?1-p:p):1,gain=(slot.gainOverride??c.edit.gain)*Math.max(0,Math.min(1,envelope));if(slot.node)slot.node.gain.value=c.shot.audioMode==='mute'||c.shot.audioMode==='replacement'?0:gain;else slot.video.volume=gain*master;if(slot.audioNode)slot.audioNode.gain.value=gain}
  if(CUT.musicNode)CUT.musicNode.gain.value=CUT.musicVolumeOverride??mix.musicVolume;
}
tlPreview=function(){const c=tlCurrent();if(!c)return;const key=cutKey();if(CUT.projectKey!==key){cutClear();CUT.projectKey=key}try{cutUpdate(TL.time);const v=tlMedia(c.shot);document.getElementById('tl-preview-label').textContent='剪辑预览 · '+(v?.version||'素材')+' · 实时混音'}catch(e){cutClear();const placeholder=document.createElement('div');placeholder.className='tl-placeholder';placeholder.textContent=e.message;document.getElementById('tl-screen').append(placeholder)}};
tlSelect=function(id,seek=true){if(!tlCanLeave())return;cutStop();const c=tlClips().find(x=>x.shot.id===id);if(!c)return;TL.shotId=id;TL.version=null;if(seek)TL.time=c.start;tlRender()};
tlSeek=function(time){if(!tlCanLeave())return;cutStop();TL.time=Math.max(0,Math.min(time,tlClips().at(-1)?.end||0));const c=TimelineEdit.active(tlClips(),TL.time).at(-1)||tlClips().at(-1);TL.shotId=c?.shot.id;tlRender()};
tlPlay=async function(){if(CUT.playing)return cutStop();try{cutAudioContext();await CUT.ctx.resume();for(const slot of CUT.slots){slot.node||=cutAttachAudio(slot.video);if(slot.audio)slot.audioNode||=cutAttachAudio(slot.audio)}if(CUT.music)CUT.musicNode||=cutAttachAudio(CUT.music);const total=tlClips().at(-1)?.end||0;if(TL.time>=total)TL.time=0;cutUpdate(TL.time);CUT.playing=true;CUT.last=performance.now();CUT.raf=requestAnimationFrame(cutTick)}catch(e){cutStop();tlMessage('无法开始混音预览：'+e.message)}};
function cutTick(now){if(!CUT.playing)return;try{const slots=CUT.slots.filter(s=>s.clip),ready=slots.every(s=>s.video.readyState>=3);if(ready)TL.time+=Math.min(.1,(now-CUT.last)/1000);CUT.last=now;const total=tlClips().at(-1)?.end||0;if(TL.time>=total){TL.time=total;tlClock();return cutStop()}cutUpdate(TL.time);for(const slot of CUT.slots.filter(s=>s.clip)){if(slot.video.paused)slot.video.play().catch(e=>{cutStop();tlMessage('预览播放失败：'+e.message)});if(slot.audio?.paused)slot.audio.play().catch(()=>{})}if(CUT.music&&cutSettings().mix?.musicFile&&CUT.music.paused)CUT.music.play().catch(()=>{});tlClock();CUT.raf=requestAnimationFrame(cutTick)}catch(e){cutStop();tlMessage(e.message)}}
const cutGoBase=go;go=function(id){cutStop();return cutGoBase(id)};
window.addEventListener('pagehide',cutStop);
async function cutExport(){
  if(!tlCanLeave()||CUT.exportPreparing)return;cutStop();let clips=tlClips();if(!clips.length)return tlMessage('时间线没有镜头。');
  CUT.exportPreparing=true;
  try{
    const key=cutKey(),baseline=JSON.stringify(cutSettings()),durations=[];
    const sources=clips.map((c,i)=>{const url=tlMedia(c.shot)?.videoUrl||c.shot.videoUrl;if(!url)throw Error('第 '+(i+1)+' 镜缺少视频，请先生成或同步。');return url});
    tlMessage('正在核对所有源视频的实际时长…');
    for(const url of sources)durations.push(await cutProbeDuration(url));
    if(key!==cutKey()||JSON.stringify(cutSettings())!==baseline)throw Error('核对期间剪辑发生变化，请重新导出。');
    if(!cutSave(e=>{e.clips||={};clips.forEach((c,i)=>{const actual=durations[i];if(c.edit.trimIn>=actual-.1)throw Error('第 '+(i+1)+' 镜入点超过实际素材长度');e.clips[c.shot.id]={...e.clips[c.shot.id],sourceDuration:actual,trimOut:Math.min(c.edit.trimOut,actual)}})},false))return;
    clips=tlClips();tlTracks();
    const plan={projectId:D.activeProjectId,title:activeProject().name+' · 剪辑版',mix:TimelineEdit.mix(cutSettings().mix),clips:clips.map((c,i)=>({shotId:c.shot.id,url:sources[i],...c.edit,versionId:tlMedia(c.shot)?.id,filmRunId:tlMedia(c.shot)?.filmRunId,audioMode:c.shot.audioMode||'model',audioAsset:c.shot.audioAsset}))};
    const r=await fetch('/api/timeline-export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan)}),out=await r.json();if(!r.ok)throw Error(out.error);CUT.exportId=out.id;sessionStorage.setItem('timeline-export:'+D.activeProjectId,out.id);tlMessage('剪辑版正在导出，使用现有视频，无需重新生成。');cutPollExport();
  }catch(e){tlMessage(e.message)}finally{CUT.exportPreparing=false}
}
function cutProbeDuration(url){return new Promise((resolve,reject)=>{const video=document.createElement('video');video.preload='metadata';const done=(error)=>{clearTimeout(timer);const duration=video.duration;video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();error?reject(error):resolve(duration)},timer=setTimeout(()=>done(Error('素材时长读取超时，请检查渲染器连接')),15000);video.onloadedmetadata=()=>done(Number.isFinite(video.duration)?null:Error('素材时长无效'));video.onerror=()=>done(Error('素材无法读取'));video.src=cutProxy(url)})}
async function cutPollExport(){const id=CUT.exportId||sessionStorage.getItem('timeline-export:'+D.activeProjectId);if(!id)return;try{const r=await fetch('/api/timeline-export/'+id),out=await r.json();if(!r.ok)throw Error(out.error);tlMessage(out.message);if(out.status==='complete'){const a=document.getElementById('cut-download');a.href=out.url;a.hidden=false;a.textContent='下载剪辑版 · '+out.duration.toFixed(2)+' 秒';CUT.exportId=null;return}if(out.status==='failed'){CUT.exportId=null;return}setTimeout(cutPollExport,2500)}catch(e){tlMessage('导出状态读取失败：'+e.message)}}
const cutToolsBase=tlTools;
tlTools=function(mode){cutStop();cutToolsBase(mode);if(mode==='edit')tlMessage('这里按原始分镜制作素材；要应用时间线裁切、转场和混音，请点击“导出当前剪辑”。')};
