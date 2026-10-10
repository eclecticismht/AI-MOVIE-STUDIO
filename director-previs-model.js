// AMS director previs: pure planning data, not a renderer or a claim of geometric control.
(function(root){
 'use strict';
 const VERSION=1,clone=x=>JSON.parse(JSON.stringify(x));
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,canonical(x[k])])):x;
 const signature=x=>JSON.stringify(canonical(x)); // Change detection, NOT a security hash.
 const finite=x=>typeof x==='number'&&Number.isFinite(x),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const pos=(x,y,pose='seated')=>({x,y,facing:0,pose});
 function newSpace(scene){return {version:VERSION,id:'space_'+scene.id,sceneId:scene.id,name:scene.name||'场景空间',revision:1,width:6,depth:5,fixtures:[],axis:{ax:1,ay:2.5,bx:5,by:2.5},notes:'尺寸与平面待按实际场景核对；不是从图片自动测量。'};}
 function newPlan(shot,space,characters=[],events=[]){
  const ids=[...new Set([...(shot.characterIds||[]),...events.filter(e=>e.type==='speech').map(e=>e.speakerId)])];
  return {version:VERSION,revision:0,space:clone(space),purpose:'',action:shot.script||'',camera:{start:{x:space.width/2,y:space.depth+1,targetX:space.width/2,targetY:space.depth/2},end:{x:space.width/2,y:space.depth+1,targetX:space.width/2,targetY:space.depth/2},fov:65,moveReason:''},actors:ids.map((id,i)=>{const c=characters.find(x=>x.id===id),p=shot.assetStates?.[id]?.presence;const presence=p==='screen'?'screen':p==='offscreen'||c?.type==='仅声音'||c?.type==='仅提及'?'absent':'onscreen';const v=pos((i+1)*space.width/(ids.length+1),space.depth*.45);return {characterId:id,presence,start:{...v},end:{...v},lookAt:'',intent:'',entryAction:''};})};
 }
 function position(actor,t){const a=actor.start,b=actor.end||a,f=clamp(t,0,1);return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,facing:a.facing+((((b.facing-a.facing)+540)%360)-180)*f,pose:f<.5?a.pose:b.pose};}
 function cameraAt(plan,t){const a=plan.camera.start,b=plan.camera.end||a,f=clamp(t,0,1);return Object.fromEntries(['x','y','targetX','targetY'].map(k=>[k,a[k]+(b[k]-a[k])*f]));}
 function projectPoint(point,camera,fov){const dx=camera.targetX-camera.x,dy=camera.targetY-camera.y,len=Math.hypot(dx,dy)||1,fx=dx/len,fy=dy/len;const px=point.x-camera.x,py=point.y-camera.y,depth=px*fx+py*fy,lateral=-px*fy+py*fx;const u=.5+lateral/(2*Math.max(depth,.001)*Math.tan(fov*Math.PI/360));return {u,depth,inFrame:depth>.05&&u>=0&&u<=1,side:u<.34?'left':u>.66?'right':'center'};}
 function validateSpace(s){
  if(!s||s.version!==VERSION||!s.id||!s.sceneId||!Number.isInteger(s.revision)||s.revision<1)throw Error('场景布局标识或版本无效');
  if(![s.width,s.depth].every(x=>finite(x)&&x>=1&&x<=100))throw Error('空间宽度与深度须为1—100');
  if(!Array.isArray(s.fixtures)||s.fixtures.length>80)throw Error('固定物件数量无效');
  const seen=new Set();for(const f of s.fixtures){if(!f.id||seen.has(f.id)||typeof f.label!=='string'||f.label.length>120||![f.x,f.y,f.w,f.h].every(finite)||f.w<=0||f.h<=0)throw Error('固定物件的位置、尺寸或编号无效');seen.add(f.id);}
  if(!s.axis||!['ax','ay','bx','by'].every(k=>finite(s.axis[k]))||Math.hypot(s.axis.ax-s.axis.bx,s.axis.ay-s.axis.by)<.1)throw Error('请给动作轴设置两个不同的端点');
  return true;
 }
 function binding(shot){return {script:shot.script||'',dialogue:shot.dialogue||'',dur:Number(shot.dur),sceneIds:shot.sceneIds||[],characterIds:shot.characterIds||[],visual:shot.visual||'',camera:shot.camera||''};}
 function issues(plan,shot,project={},characters=[],events=[]){
  const out=[],add=(level,code,message)=>out.push({level,code,message});
  if(!plan)return out;
  if(shot.directorPrevisOnly)add('error','PREVIS_ONLY','这是调度样镜，不会自动渲染；核对后点击“应用到本镜分镜”再制作');
  if(plan.version!==VERSION){add('error','VERSION','导演预演版本不支持');return out;}
  try{validateSpace(plan.space)}catch(e){add('error','SPACE',e.message);return out;}
  const own=(project.directorSpaces||[]).find(s=>s.id===plan.space.id);
  if(own&&signature(own)!==signature(plan.space))add('error','SPACE_STALE','共用场景布局已修改，请载入新版布局后重新应用本镜调度');
  if(!(shot.sceneIds||[]).includes(plan.space.sceneId))add('error','SCENE_BINDING','预演布局不属于本镜已引用的场景');
  if(plan.binding&&signature(plan.binding)!==signature(binding(shot)))add('error','SOURCE_CHANGED','对白、时长或分镜已修改，请核对并重新应用导演预演');
  if(!plan.camera||!finite(plan.camera.fov)||plan.camera.fov<20||plan.camera.fov>110){add('error','CAMERA','视角须为20—110度');return out;}
  for(const p of [plan.camera.start,plan.camera.end])if(!p||!['x','y','targetX','targetY'].every(k=>finite(p[k]))||Math.hypot(p.x-p.targetX,p.y-p.targetY)<.1){add('error','CAMERA','机位或目标位置无效');return out;}
  if(!Array.isArray(plan.actors)||plan.actors.length>30){add('error','ACTORS','人物调度列表无效');return out;}
  const known=new Set(characters.map(x=>x.id)),seen=new Set();
  for(const a of plan.actors){
   if(!a.characterId||seen.has(a.characterId)){add('error','DUPLICATE','同一人物不能占据两个独立位置');continue;}seen.add(a.characterId);
   if(characters.length&&!known.has(a.characterId))add('error','FOREIGN_ACTOR','人物不存在或不属于本项目：'+a.characterId);
   if(!['onscreen','offscreen','screen','absent'].includes(a.presence))add('error','PRESENCE','人物出现方式无效');
   const valid=[a.start,a.end].every(p=>p&&[p.x,p.y,p.facing].every(finite)&&['seated','standing','walking'].includes(p.pose));
   if(!valid){add('error','POSITION','人物起止位置或姿态无效：'+a.characterId);continue;}
   if(a.presence==='onscreen')for(const [index,p] of [a.start,a.end].entries())if(!projectPoint(p,cameraAt(plan,index),plan.camera.fov).inFrame)add('warning','FRAMING','预计取景未覆盖'+(characters.find(c=>c.id===a.characterId)?.name||a.characterId)+(index?'的结束位置':'的起始位置')+'；请核对实际构图');
   if(a.start.pose!==a.end.pose&&!plan.action?.trim())add('warning','ACTION','人物姿态改变，但本镜尚未填写动作过程');
   if(a.lookAt&&!plan.actors.some(b=>b.characterId===a.lookAt)&&!plan.space.fixtures.some(f=>f.id===a.lookAt))add('warning','GAZE','注视目标已不在本场调度中');
  }
  for(const e of events.filter(x=>x.type==='speech')){const a=plan.actors.find(x=>x.characterId===e.speakerId);if(e.delivery==='onscreen'&&a?.presence!=='onscreen')add('error','SPEAKER_VISIBILITY','画内发声者必须是画内实体人物：'+(e.speakerName||e.speakerId));}
  if(new Set(events.filter(e=>e.type==='speech').map(e=>e.speakerId)).size>1)add('warning','MULTI_VOICE','预演可以包含多人交替对白；当前配音绑定每个生成段仅支持一位发声者，正式生成前仍须分段');
  if(signature(plan.camera.start)!==signature(plan.camera.end)&&!plan.camera.moveReason?.trim())add('warning','MOTIVATION','机位发生移动，请注明它跟随哪个动作或关系变化');
  if(!plan.purpose?.trim())add('warning','PURPOSE','尚未写明观众在这一镜要看见什么变化');
  return out;
 }
 function assertReady(plan,shot,project,characters,events){const list=issues(plan,shot,project,characters,events).filter(x=>x.level==='error');if(list.length)throw Error('导演预演需要修正：'+list.map(x=>x.message).join('；'));return true;}
 function label(id,characters){return characters.find(c=>c.id===id)?.name||id;}
 function instructions(shot,project={},characters=[],events=shot.dialogueEvents||[]){
  const p=shot.directorPlan;if(!p)return '';assertReady(p,shot,project,characters,events);
  const live=p.actors.filter(a=>a.presence==='onscreen'),physical=p.actors.filter(a=>['onscreen','offscreen'].includes(a.presence)),numbers=n=>Number(n).toFixed(2),point=v=>`(${numbers(v.x)}, ${numbers(v.y)}), ${v.pose||''}`;
  const lines=['SILENT DIRECTOR PREVIS DIRECTIONS. These are staging constraints, NOT spoken words. Floor coordinates are consistent planning units; do not mirror the room. A planning diagram is not an assertion of exact model camera control.',`Physical people in this scene: ${physical.map(a=>label(a.characterId,characters)).join(', ')||'none'}. Visible physical people in this shot: ${live.length}: ${live.map(a=>label(a.characterId,characters)).join(', ')||'none'}. Do NOT turn a one-speaker audio binding into a solo portrait.`, `Audience focus: ${p.purpose||'as in the source scene'}. Action: ${p.action||shot.script||'Only the specified action.'}`];
  for(const a of p.actors){const name=label(a.characterId,characters);if(a.presence==='screen'){lines.push(`${name} appears ONLY inside the existing playback screen or photograph, never as an additional body.`);continue;}if(a.presence==='absent'){lines.push(`${name} is not physically in this scene; a voice does not authorize a visible extra person.`);continue;}const side=projectPoint(a.start,p.camera.start,p.camera.fov).side;lines.push(`${name}: ${a.presence==='offscreen'?'physically present but outside this crop':'visible, approximately screen '+side}; starts at ${point(a.start)}, ends at ${point(a.end)}; facing ${numbers(a.start.facing)} to ${numbers(a.end.facing)} degrees. Gaze target: ${label(a.lookAt,characters)||'not specified'}. Reaction / intention: ${a.intent||'natural silent listening when not speaking'}. ${a.entryAction?'Entry or exit: '+a.entryAction:''}`);}
  for(const f of p.space.fixtures)lines.push(`Fixed ${f.kind||'fixture'} ${f.label}: center ${point(f)}, size ${numbers(f.w)} by ${numbers(f.h)}; never relocate it between cuts.`);
  lines.push(`Camera start (${numbers(p.camera.start.x)},${numbers(p.camera.start.y)}) toward (${numbers(p.camera.start.targetX)},${numbers(p.camera.start.targetY)}); end (${numbers(p.camera.end.x)},${numbers(p.camera.end.y)}) toward (${numbers(p.camera.end.targetX)},${numbers(p.camera.end.targetY)}); horizontal field of view ${p.camera.fov} degrees. Movement reason: ${p.camera.moveReason||'locked camera; performance carries the scene'}. Preserve relative seat locations, sightlines and door positions. Only the separately bound speaker articulates; other visible people react without mouthing that dialogue. No additional people, no floating labels, no reading coordinates aloud.`);
  return lines.join('\n');
 }
 function activeJob(j){return !j.videoUrl&&!['已取消','已完成','已生成，待审核','ComfyUI H3 已完成','completed','cancelled','failed'].includes(j.status)&&!/生成失败|提交已阻止/.test(j.status||'');}
 function impact(data,shot){const ids=new Set([shot.id]);let again=true;while(again){again=false;for(const s of data.shots||[])if(s.projectId===shot.projectId&&s.storyboardBatchId===shot.storyboardBatchId&&!s.autoArchived&&!ids.has(s.id)&&ids.has(s.continueFromShotId)){ids.add(s.id);again=true;}}return [...ids];}
 function checkBusy(data,projectId,ids){if((data.jobs||[]).some(j=>j.projectId===projectId&&ids.includes(j.shot)&&activeJob(j)))throw Error('受影响镜头仍有待提交或执行中的任务，请先完成或取消该任务；没有修改现有媒体');}
 function applyPlan(data,projectId,shotId,draft,expected,events=[]){
  const current=(data.shots||[]).find(s=>s.id===shotId&&s.projectId===projectId),project=(data.projects||[]).find(p=>p.id===projectId);
  if(!current||!project||current.autoArchived)throw Error('当前项目或分镜不存在');
  if(expected!==signature(current))throw Error('分镜已被其他操作修改，草稿保留，请重新核对后保存');
  if(!current.directorPrevisOnly&&current.directorPlan&&signature({...current.directorPlan,revision:undefined,binding:undefined})===signature({...draft,revision:undefined,binding:undefined})&&signature(current.directorPlan.binding)===signature(binding(current)))return {data,shot:current,affectedIds:[],changed:false};
  const affected=impact(data,current);checkBusy(data,projectId,affected);
  const p=clone(draft);delete p.binding;p.revision=(current.directorPlan?.revision||0)+1;
  const characters=(data.characters||[]).filter(c=>c.projectId===projectId);
  if(p.actors.some(a=>!characters.some(c=>c.id===a.characterId)))throw Error('调度人物不属于当前项目');
  const next={...current,directorPrevisOnly:false,characterIds:[...new Set(p.actors.map(a=>a.characterId))],directorPlan:p};
  const required=events.filter(e=>e.type==='speech').map(e=>e.speakerId);if(required.some(id=>!next.characterIds.includes(id)))throw Error('不能从调度中删除已绑定的对白人物，请设为画外或仅声音');
  const states={...current.assetStates};for(const id of current.characterIds||[])if(!next.characterIds.includes(id))delete states[id];
  const positions={};for(const a of p.actors){states[a.characterId]={...(states[a.characterId]||{}),presence:a.presence==='screen'?'screen':a.presence==='onscreen'?'onscreen':'offscreen'};if(['onscreen','screen'].includes(a.presence))positions[a.characterId]=projectPoint(a.start,p.camera.start,p.camera.fov).side;}
  next.assetStates=states;next.characterPositions=positions;next.directorActorNames=Object.fromEntries(p.actors.map(a=>[a.characterId,label(a.characterId,characters)]));
  const visible=p.actors.filter(a=>a.presence==='onscreen');
  next.visibleCharacterIds=visible.map(a=>a.characterId);next.sceneCharacterIds=p.actors.filter(a=>['onscreen','offscreen'].includes(a.presence)).map(a=>a.characterId);
  next.visual=`${visible.length}人画内构图：${visible.map(a=>label(a.characterId,characters)).join('、')||'无实体人物'}。${p.purpose||''} ${p.action||''}`.trim();
  next.camera=`${signature(p.camera.start)===signature(p.camera.end)?'固定机位':'有动机运镜'}，水平视角${p.camera.fov}°；${p.camera.moveReason||'人物表演推进画面'}`;
  next.firstFrameIntent='导演预演起始状态：按已保存空间、人物起点与姿态构图，未发生的后续动作不要提前执行。';
  next.directorHistory=[...(current.directorHistory||[]),{at:new Date().toISOString(),directorPlan:current.directorPlan||null,visual:current.visual||'',camera:current.camera||'',prompt:current.prompt||'',firstFrameIntent:current.firstFrameIntent||'',firstFrameSpeakerPosition:current.firstFrameSpeakerPosition||''}].slice(-20);
  next.prompt='';next.firstFrameSpeakerPosition='';next.directorMediaNeedsReview=true;
  for(const k of ['filmPrompt','filmPromptSource','filmPromptVersion'])delete next[k];
  next.status=current.videoUrl?'需重做':'待制作';p.binding=binding(next);
  assertReady(p,next,project,characters,events);
  const shots=data.shots.map(s=>s===current?next:s.projectId===projectId&&affected.includes(s.id)?{...s,status:'需重做',directorMediaNeedsReview:true}:s);
  return {data:{...data,shots},shot:next,affectedIds:affected};
 }
 function saveSpace(data,projectId,draft,expected){
  const project=data.projects.find(p=>p.id===projectId);if(!project)throw Error('项目不存在');
  const spaces=project.directorSpaces||[],old=spaces.find(s=>s.id===draft.id);
  if(signature(old||null)!==expected)throw Error('共用场景布局已变化，未覆盖');
  if(!(data.scenes||[]).some(s=>s.projectId===projectId&&s.id===draft.sceneId))throw Error('布局只能绑定当前项目的场景资产');
  const next={...clone(draft),revision:(old?.revision||0)+1};validateSpace(next);
  if(old&&signature({...old,revision:undefined})===signature({...next,revision:undefined}))return {space:old,affectedIds:[],data,changed:false};
  const affected=data.shots.filter(s=>s.projectId===projectId&&s.directorPlan?.space.id===next.id).map(s=>s.id);checkBusy(data,projectId,affected);
  return {space:next,affectedIds:affected,data:{...data,projects:data.projects.map(p=>p===project?{...p,directorSpaces:[...spaces.filter(s=>s.id!==next.id),next]}:p),shots:data.shots.map(s=>s.projectId===projectId&&affected.includes(s.id)?{...s,directorMediaNeedsReview:true,status:'需重做'}:s)}};
 }
 function continuity(previous,next){
  if(!previous?.directorPlan||!next?.directorPlan)return [];
  const a=previous.directorPlan,b=next.directorPlan;if(a.space.id!==b.space.id)return [];
  const list=[];for(const p of b.actors){const q=a.actors.find(x=>x.characterId===p.characterId);if(q&&['onscreen','offscreen'].includes(q.presence)&&['onscreen','offscreen'].includes(p.presence)&&Math.hypot(q.end.x-p.start.x,q.end.y-p.start.y)>.35)list.push({level:'warning',code:'POSITION_JUMP',message:p.characterId+'：前镜终点与本镜起点不同，请补足走位或确认时间跳切'});if((!q||q.presence==='absent')&&['onscreen','offscreen'].includes(p.presence)&&!p.entryAction?.trim())list.push({level:'warning',code:'ENTRY',message:p.characterId+'：新进入场景，但未填写进场过程'});}
  const axis=b.space.axis,side=c=>(axis.bx-axis.ax)*(c.y-axis.ay)-(axis.by-axis.ay)*(c.x-axis.ax);if(side(a.camera.end)*side(b.camera.start)<-.04)list.push({level:'warning',code:'AXIS',message:'相邻机位可能跨越动作轴；请用可理解的移动或全景重建方向'});
  return list;
 }
 function copyEnd(previous,draft){if(!previous?.directorPlan||previous.directorPlan.space.id!==draft.space.id)throw Error('上一镜没有同场空间调度，不能猜测承接位置');const next=clone(draft);for(const a of next.actors){const old=previous.directorPlan.actors.find(x=>x.characterId===a.characterId);if(old&&['onscreen','offscreen'].includes(old.presence)&&['onscreen','offscreen'].includes(a.presence))a.start=clone(old.end);}return next;}
 function scopes(data,projectId){const p=data.projects.find(p=>p.id===projectId);return [{id:'all',name:'全部镜头（含保留的历史版本）'},...(p?.storyActs||[]).map(a=>({id:'act:'+a.id,name:a.title||a.id,shotIds:a.shotIds||[]})),...(data.storyboardBatches||[]).filter(b=>b.projectId===projectId).map(b=>({id:'batch:'+b.id,name:b.sourceTitle||b.id,batchId:b.id}))];}
 function listShots(data,projectId,scopeId='all'){const scope=scopes(data,projectId).find(s=>s.id===scopeId);if(!scope)return [];return (data.shots||[]).filter(s=>s.projectId===projectId&&!s.autoArchived&&(!scope.shotIds||scope.shotIds.includes(s.id))&&(!scope.batchId||s.storyboardBatchId===scope.batchId)).slice().sort((a,b)=>(a.sequence??a.autoIndex??0)-(b.sequence??b.autoIndex??0));}
 function frameInstructions(shot,project,characters){if(!shot.directorPlan)return "";const p=clone(shot.directorPlan);p.camera.end=clone(p.camera.start);for(const a of p.actors)a.end=clone(a.start);p.action="Opening pose only. Do not perform future movement or speech in the still reference.";return instructions({...shot,directorPlan:p},project,characters,[]);}
 const api={frameInstructions,VERSION,clone,signature,newSpace,newPlan,position,cameraAt,projectPoint,validateSpace,binding,issues,assertReady,instructions,impact,applyPlan,saveSpace,continuity,copyEnd,scopes,listShots};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DirectorPrevis=api;
})(typeof globalThis!=='undefined'?globalThis:this);
