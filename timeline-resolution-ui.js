function timelineResolutionRender(){
 const anchor=document.getElementById('timelineContinuityControl');if(!anchor)return;
 let panel=document.getElementById('timelineResolutionControl');
 if(!panel){panel=document.createElement('details');panel.id='timelineResolutionControl';anchor.before(panel)}
 const p=activeProject(),{width,height}=h3JobSettings();
 if(panel.open&&panel.dataset.project===p.id)return;
 panel.dataset.project=p.id;panel.innerHTML=`<summary>分辨率 <b>${width} × ${height}</b></summary><div class="tl-resolution-popover"><label>常用分辨率<select id="tlResolutionPreset" onchange="if(this.value){const [w,h]=this.value.split('x');document.getElementById('tlResolutionWidth').value=w;document.getElementById('tlResolutionHeight').value=h}"><option value="">自定义尺寸</option>${[['864x480','横屏预览'],['1280x736','横屏'],['1920x1088','高清横屏'],['480x864','竖屏预览'],['736x1280','竖屏'],['1024x1024','方形']].map(([v,label])=>`<option value="${v}" ${v===width+'x'+height?'selected':''}>${v.replace('x',' × ')} · ${label}</option>`).join('')}</select></label><div class="tl-resolution-fields"><label>宽（像素）<input id="tlResolutionWidth" type="number" min="32" max="8192" step="32" value="${width}"></label><label>高（像素）<input id="tlResolutionHeight" type="number" min="32" max="8192" step="32" value="${height}"></label></div><p>项目生成尺寸，仅影响之后新入队的镜头。宽高须为 32 的整数倍。</p><button class="btn gold" onclick="timelineResolutionSave()">保存分辨率</button><span id="tlResolutionStatus" role="status"></span></div>`;
}
function timelineResolutionSave(){
 const status=document.getElementById('tlResolutionStatus');
 try{
  const width=Number(document.getElementById('tlResolutionWidth').value),height=Number(document.getElementById('tlResolutionHeight').value);
  if(![width,height].every(n=>Number.isInteger(n)&&n>=32&&n<=8192&&n%32===0))throw Error('宽高须为 32 的整数倍，范围 32–8192。');
  const p=activeProject(),stored=JSON.parse(localStorage.getItem('aimovie_data')||'null'),latest=stored?.projects.find(x=>x.id===p.id);
  if(!latest||(latest.h3Width||864)!==(p.h3Width||864)||(latest.h3Height||480)!==(p.h3Height||480))throw Error('分辨率已在其他页面修改，请刷新后核对。');
  latest.h3Width=width;latest.h3Height=height;localStorage.setItem('aimovie_data',JSON.stringify(stored));p.h3Width=width;p.h3Height=height;
  document.getElementById('timelineResolutionControl').open=false;timelineResolutionRender();
  for(const [id,value] of [['h3Width',width],['h3Height',height]]){const field=document.getElementById(id);if(field)field.value=value}
  tlMessage(`生成分辨率已保存：${width} × ${height}，之后新入队的镜头使用此尺寸。`);
 }catch(e){status.textContent=e.message}
}
const tracksBeforeResolution=tlTracks;
tlTracks=function(){tracksBeforeResolution();timelineResolutionRender()};
