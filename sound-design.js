// Non-destructive five-stem sound edit decisions, shared by preview and local export.
(function(root){
 'use strict';
 const TRACKS=Object.freeze([{id:'dialogue',name:'人物对白'},{id:'narration',name:'旁白 / 广播'},{id:'effects',name:'动作音效'},{id:'ambience',name:'环境底声'},{id:'music',name:'配乐'}]);
 const clone=x=>JSON.parse(JSON.stringify(x));
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,canonical(x[k])])):x;
 const signature=x=>JSON.stringify(canonical(x));
 const num=(x,min,max,label)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw Error(label+'超出有效范围');return x;};
 const text=(x,max,label)=>{if(typeof x!=='string'||x.length>max)throw Error(label+'无效');return x;};
 const fileName=x=>/^(?:\/audio-assets\/)?(ams-audio-[a-f0-9]{64}\.wav)$/.exec(String(x||''))?.[1]||'';
 const db=x=>Math.pow(10,x/20),clamp=x=>Math.max(0,Math.min(1,x));
 function empty(title='声音方案',duration=90){return {version:1,title,duration,fps:24,baseMode:'replace',masterDb:-1,duckMusic:{enabled:true,reductionDb:-10,attack:.12,release:.35},tracks:TRACKS.map(t=>({...t,gainDb:0,mute:false,solo:false})),cues:[],strictVoiceLock:true,reviewStatus:'待听审 / 待画面对点'};}
 function normalize(value){
  if(!value||value.version!==1)throw Error('声音方案版本不支持');
  const p=clone(value);if(typeof p.strictVoiceLock!=='boolean')throw Error('声源锁定策略无效');text(p.title,160,'方案名称');num(p.duration,.1,1800,'方案时长');if(p.fps!==24)throw Error('当前声音时间线采用24fps');
  if(!['preserve','replace'].includes(p.baseMode))throw Error('请选择叠加原声或独立音轨替换原声');num(p.masterDb,-60,6,'主音量');
  if(!Array.isArray(p.tracks)||p.tracks.length!==5||new Set(p.tracks.map(t=>t.id)).size!==5)throw Error('需要五条独立音轨');
  for(const t of p.tracks){if(!TRACKS.some(x=>x.id===t.id))throw Error('未知声音轨道');num(t.gainDb,-60,6,'轨道音量');if(typeof t.mute!=='boolean'||typeof t.solo!=='boolean')throw Error('轨道静音 / 独听状态无效');}
  if(!p.duckMusic||typeof p.duckMusic.enabled!=='boolean')throw Error('配乐压低设置无效');num(p.duckMusic.reductionDb,-30,0,'配乐压低量');num(p.duckMusic.attack,.01,2,'压低过渡');num(p.duckMusic.release,.01,3,'恢复过渡');
  if(!Array.isArray(p.cues)||p.cues.length>200)throw Error('每个声音方案最多200段');const seen=new Set();
  for(const c of p.cues){
   text(c.id,120,'声音片段编号');if(!c.id||seen.has(c.id))throw Error('声音片段编号重复');seen.add(c.id);text(c.name||'',160,'片段名称');
   if(!TRACKS.some(t=>t.id===c.trackId))throw Error('片段轨道无效');if(!fileName(c.file)||fileName(c.file)!==c.file)throw Error('只支持已导入的本地WAV声音');
   num(c.start,0,p.duration,'片段起点');num(c.sourceDuration,.001,600,'原始录音时长');num(c.trimIn,0,c.sourceDuration,'声音入点');num(c.trimOut,0,c.sourceDuration+.0001,'声音出点');
   if(c.trimOut-c.trimIn<.001)throw Error('声音出点必须晚于入点');num(c.duration,.001,p.duration,'片段时长');if(c.start+c.duration>p.duration+.001)throw Error('声音片段超出方案结尾');
   if(typeof c.loop!=='boolean')throw Error('循环设置无效');if(!c.loop&&Math.abs(c.duration-(c.trimOut-c.trimIn))>.001)throw Error('非循环声音必须保持原语速及所选录音长度');
   if(c.loop&&['dialogue','narration'].includes(c.trackId))throw Error('对白和旁白不能循环');num(c.gainDb,-60,12,'片段音量');num(c.pan,-1,1,'左右平衡');num(c.fadeIn,0,c.duration,'淡入');num(c.fadeOut,0,c.duration,'淡出');if(c.fadeIn+c.fadeOut>c.duration+.001)throw Error('淡入淡出合计超过片段时长');
   if(c.text!==undefined)text(c.text,2000,'台词');if(c.speakerId!==undefined)text(c.speakerId,120,'说话人');if(c.voiceProfileId!==undefined)text(c.voiceProfileId,160,'声线版本');
  }
  return p;
 }
 function audible(plan,trackId){const t=plan.tracks.find(t=>t.id===trackId);return !!t&&!t.mute&&(!plan.tracks.some(t=>t.solo&&!t.mute)||t.solo);}
 function speechWindows(plan){return plan.cues.filter(c=>['dialogue','narration'].includes(c.trackId)&&audible(plan,c.trackId)).map(c=>({start:c.start,end:c.start+c.duration}));}
 function duckAt(plan,time){if(!plan.duckMusic.enabled)return 1;const d=plan.duckMusic,low=db(d.reductionDb);let strength=0;for(const w of speechWindows(plan)){const inRamp=clamp((time-w.start+d.attack)/d.attack),outRamp=clamp((w.end+d.release-time)/d.release);strength=Math.max(strength,Math.min(inRamp,outRamp));}return 1-strength*(1-low);}
 function gainAt(plan,c,time,{master=true}={}){if(!audible(plan,c.trackId)||time<c.start||time>=c.start+c.duration)return 0;const t=plan.tracks.find(t=>t.id===c.trackId),local=time-c.start;return db(c.gainDb+t.gainDb+(master?plan.masterDb:0))*Math.min(c.fadeIn?clamp(local/c.fadeIn):1,c.fadeOut?clamp((c.duration-local)/c.fadeOut):1)*(c.trackId==='music'?duckAt(plan,time):1);}
 function duckExpression(plan,offset=0){if(!plan.duckMusic.enabled||!speechWindows(plan).length)return '1';const d=plan.duckMusic,t='(t+'+offset+')',ramps=speechWindows(plan).map(w=>`min(clip((${t}-${w.start}+${d.attack})/${d.attack},0,1),clip((${w.end}+${d.release}-${t})/${d.release},0,1))`);const strength=ramps.reduce((a,b)=>a?`max(${a},${b})`:b,'');return `(1-(1-${db(d.reductionDb)})*${strength})`;}
 function timelineSignature(clips){return signature(clips.map(c=>({id:c.shot?.id||c.shotId,version:c.edit?.versionId??c.versionId??null,performanceFile:c.shot?.performanceAudio?.file||c.performanceAudio?.file||null,start:c.start,trimIn:c.edit?.trimIn??c.trimIn,trimOut:c.edit?.trimOut??c.trimOut,duration:c.duration,overlap:c.overlap||0})));}
 function audit(plan,data,projectId){
  const p=normalize(plan),issues=[],add=(level,code,message,cueId)=>issues.push({level,code,message,cueId});
  if(!(data.projects||[]).some(x=>x.id===projectId))throw Error('声音项目不存在');
  for(const c of p.cues){const records=(data.audio||[]).filter(a=>a.projectId===projectId&&fileName(a.audioUrl)===c.file);if(!records.length){add('error','ASSET','声音未登记在当前项目：'+c.name,c.id);continue;}
   if(['dialogue','narration'].includes(c.trackId)){
    const person=(data.characters||[]).find(a=>a.projectId===projectId&&a.id===c.speakerId),lock=person?.voiceProfile;
    if(!person){add('error','SPEAKER','对白必须绑定本项目角色：'+c.name,c.id);continue;}
    if(p.strictVoiceLock&&(!lock?.locked||!lock.id||!fileName(lock.source)))add('error','VOICE_UNLOCKED',person.name+'尚未固定原始声源',c.id);
    const frozen=p.voiceLocks?.[c.speakerId];if(frozen&&(frozen.profileId!==lock?.id||frozen.sourceFile!==fileName(lock?.source)))add('error','VOICE_SOURCE_CHANGED',person.name+'的原始声源已改变，必须建立新版本后重新核对',c.id);
    if(records.some(a=>a.speakerId&&a.speakerId!==c.speakerId))add('error','VOICE_CONFLICT','同一录音存在不同角色标记，不能自动选用',c.id);
    if(lock?.locked&&c.voiceProfileId!==lock.id)add('error','VOICE_VERSION',person.name+'的音色版本与固定声源不一致',c.id);
    if(!records.some(a=>a.speakerId===c.speakerId&&a.voiceProfileId===c.voiceProfileId))add(p.strictVoiceLock?'error':'warning','VOICE_TAG','录音缺少对应角色及声线版本标记：'+c.name,c.id);
    const clean=s=>String(s||'').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'');const expected=clean(c.text),tagged=records.filter(a=>a.speakerId===c.speakerId&&a.transcript);
    if(!expected||!tagged.some(a=>clean(a.transcript).includes(expected)))add('error','TEXT','录音原句与本段台词未对应：'+c.name,c.id);
    if(lock?.reviewStatus!=='通过听审')add('warning','LISTEN',person.name+'声源固定，但音色与表演仍需听审',c.id);
    if(c.trimIn>0||c.trimOut<c.sourceDuration-.001)add('warning','TRIM','对白裁切需试听完整性，不会自动当作已通过：'+c.name,c.id);
   }else if(!records.some(a=>a.provenance?.origin||a.license||a.source))add('warning','SOURCE','请登记声音来源：'+c.name,c.id);
   if(c.syncStatus!=='picture_checked'&&c.trackId==='effects')add('warning','SYNC','音效时点待对照最终动作：'+c.name,c.id);
  }
  if(p.baseMode==='preserve'&&p.cues.some(c=>['dialogue','narration'].includes(c.trackId)))add('warning','DOUBLE_VOICE','叠加模式下请检查原片是否已有相同人声，避免重复对白');
  return issues;
 }
 function assertReady(plan,data,projectId){const problems=audit(plan,data,projectId).filter(x=>x.level==='error');if(problems.length)throw Error(problems.map(x=>x.message).join('；'));return normalize(plan);}
 function apply(data,projectId,scopeId,plan,expected){const project=data.projects.find(p=>p.id===projectId);if(!project||!scopeId||scopeId.length>160)throw Error('声音方案所属范围无效');const prior=project.soundDesigns?.[scopeId]||null;if(signature(prior)!==expected)throw Error('声音方案已变化，未覆盖；请保留草稿后重新核对');const next=normalize(plan);return {...data,projects:data.projects.map(p=>p===project?{...p,soundDesigns:{...p.soundDesigns,[scopeId]:next}}:p)};}
 const api={TRACKS,clone,signature,fileName,db,empty,normalize,audible,speechWindows,duckAt,gainAt,duckExpression,timelineSignature,audit,assertReady,apply};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SoundDesign=api;
})(typeof globalThis!=='undefined'?globalThis:this);
