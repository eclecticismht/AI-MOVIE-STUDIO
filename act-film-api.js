const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {choose}=require('./act-film'),{resolveAudioAsset}=require('./audio-assets'),{cropFilter}=require('./film-framing');
const ROOT=path.join(__dirname,'act-films'),FILMS=path.join(__dirname,'film-runs');
const FFMPEG=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validate(input){
 if(!input||typeof input.projectId!=='string'||!input.projectId||typeof input.scopeKey!=='string'||!input.scopeKey||!Array.isArray(input.acts)||input.acts.length>160)throw Error('场次分组无效');
 const seen=new Set(),shots=new Set();
 return input.acts.map(a=>{
  if(!a||typeof a.id!=='string'||!a.id||seen.has(a.id)||typeof a.title!=='string'||!Array.isArray(a.shots)||!a.shots.length||a.shots.length>160)throw Error('场次信息无效或重复');seen.add(a.id);
  return {projectId:input.projectId,scopeKey:input.scopeKey,actId:a.id,title:a.title.slice(0,120),shots:a.shots.map(s=>{
   if(!s||typeof s.shotId!=='string'||!s.shotId||shots.has(s.shotId))throw Error('场次包含无效或重复镜头');shots.add(s.shotId);
   if(s.sourceFingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(s.sourceFingerprint))throw Error('分镜来源指纹无效');
   return {shotId:s.shotId,label:String(s.label||'镜头').slice(0,160),sequence:s.sequence,...(s.sourceFingerprint?{sourceFingerprint:s.sourceFingerprint}:{})};
  })};
 });
}
function titleCard(value){
 if(value===null)return null;
 if(!value||typeof value.imageUrl!=='string'||!/^\/assets\/imported\/asset-[a-f0-9]{64}\.(png|jpg|webp)$/.test(value.imageUrl))throw Error('请选择已导入的片名图片');
 const seconds=Number(value.seconds??5);if(!Number.isFinite(seconds)||seconds<1||seconds>15)throw Error('片名显示时长须为1至15秒');
 const file=path.join(__dirname,value.imageUrl);if(!fs.existsSync(file))throw Error('片名图片不存在，请重新导入');
 return {imageUrl:value.imageUrl,seconds};
}
function loadSources(){
 const result=[];
 if(fs.existsSync(FILMS))for(const name of fs.readdirSync(FILMS)){
  if(!/^film_[a-f0-9]{16}$/.test(name))continue;
  try{const run=JSON.parse(fs.readFileSync(path.join(FILMS,name,'run.json'),'utf8'));if(run.actReview)continue;
   for(const [i,shot] of run.shots.entries()){
    const file=path.join(FILMS,name,`clip-${i}.mp4`);
    result.push({id:name+':'+i,projectId:run.projectId,createdAt:run.createdAt||'',status:run.status,progress:run.current?.index===i+1?run.current.progress:null,ready:!!shot.ready&&fs.existsSync(file),file,shot});
   }
  }catch{}
 }
 try{for(const job of JSON.parse(fs.readFileSync(path.join(__dirname,'connector-queue.json'),'utf8'))){
  if(job.id.startsWith('FILM_')||!job.submittedAt)continue;
  result.push({id:job.id,projectId:job.projectId,createdAt:job.submittedAt,ready:!!job.videoUrl,url:job.videoUrl,shot:{...job,shotId:job.shot,ready:!!job.videoUrl,subtitle:job.dialogue||'',audioMode:job.audioMode||'model'}});
 }}catch{}
 return result;
}
function command(args){return new Promise((resolve,reject)=>{const child=spawn(FFMPEG,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let log='';child.stderr.on('data',b=>log=(log+b).slice(-12000));child.on('error',reject);child.on('close',code=>code===0?resolve(log):reject(Object.assign(Error('合成失败：'+log.slice(-800)),{log})))})}
function encodedDuration(log){
 // The normalized video is CFR 24. Container duration includes AAC padding and
 // is rounded to centiseconds, so use the encoder's actual frame count instead.
 const frames=Number([...log.matchAll(/^frame=(\d+)\s*$/gm)].at(-1)?.[1]);
 if(!Number.isSafeInteger(frames)||frames<=0||frames>86400)throw Error('无法确认镜头实际帧数');
 return frames/24;
}
async function render(plan,selections,dir){
 fs.mkdirSync(dir,{recursive:true});const shots=[];let time=0;
 for(const [i,{slot,source}] of selections.entries()){
  let file=source.file;
  if(!file){const location=require('./timeline-export-api').sourceLocation(source.url);if(location.file)file=location.file;else{
   const response=await fetch(location.url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('无法读取第 '+(i+1)+' 镜');
   file=path.join(dir,`input-${i}.mp4`);await require('node:stream/promises').pipeline(require('node:stream').Readable.fromWeb(response.body),fs.createWriteStream(file));
  }}
  let info='';try{await command(['-hide_banner','-i',file])}catch(e){info=e.log||''}
  const match=/Duration: (\d+):(\d+):([\d.]+)/.exec(info);if(!match)throw Error('无法读取第 '+(i+1)+' 镜时长');
  const inputDuration=+match[1]*3600 + +match[2]*60 + +match[3],s=source.shot,mode=s.audioMode||'model';
  if(!Number.isFinite(inputDuration)||inputDuration<=0||inputDuration>3600)throw Error('镜头时长无效');
  const extra=mode==='voiceover'?['-i',resolveAudioAsset(s.audioAsset)]:['replacement','overlay'].includes(mode)?['-stream_loop','-1','-i',resolveAudioAsset(s.audioAsset)]:mode==='mute'||!/Audio:/.test(info)?['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']:[];
  const audio=mode==='overlay'?['-filter_complex','[1:a]volume=0.25[fx];[0:a][fx]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[mix]','-map','0:v:0','-map','[mix]']:['-map','0:v:0','-map',extra.length?'1:a:0':'0:a:0'];
  // Put fps before scale: FFmpeg 7.1 can lose the final frame in scale,fps order.
  const encoded=await command(['-y','-i',file,...extra,...audio,...(mode==='voiceover'?['-af','apad=whole_dur='+inputDuration]:[]),'-t',String(inputDuration),'-vf','setpts=PTS-STARTPTS,fps=24,'+cropFilter(s.cropBottomPercent||0)+',format=yuv420p','-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-ar','48000','-ac','2','-progress','pipe:2','-nostats',path.join(dir,`clip-${i}.mp4`)]);
  const duration=encodedDuration(encoded);
  shots.push({...s,sequence:i+1,shotId:slot.shotId,label:slot.label,start:time,end:time+duration,actualDuration:duration});time+=duration;
 }
 fs.writeFileSync(path.join(dir,'concat.txt'),shots.map((s,i)=>`file 'clip-${i}.mp4'\nduration ${s.actualDuration}`).join('\n'));
 await command(['-y','-f','concat','-safe','0','-i',path.join(dir,'concat.txt'),'-c','copy',path.join(dir,'joined.mp4')]);
 fs.writeFileSync(path.join(dir,'subtitles.ass'),require('./film-api').makeAss(shots));
 const ass=path.join(dir,'subtitles.ass').replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
 const card=plan.titleCard&&titleCard(plan.titleCard),offset=Math.max(0,time-(card?.seconds||0));
 const base=`setpts=PTS-STARTPTS,fps=24,ass=filename='${ass}'`;
 const filter=card?['-loop','1','-i',path.join(__dirname,card.imageUrl),'-filter_complex',`[0:v]${base}[base];[1:v]scale=1024:400:force_original_aspect_ratio=decrease,format=rgba,fade=t=in:st=${offset}:d=1:alpha=1[title];[base][title]overlay=(W-w)/2:(H-h)/2:enable='gte(t,${offset})':shortest=1[v]`,'-map','[v]','-map','0:a:0']:['-vf',base];
 await command(['-y','-i',path.join(dir,'joined.mp4'),...filter,'-t',String(time),'-c:v','libx264','-preset','fast','-crf','20','-c:a','copy','-movflags','+faststart',path.join(dir,'movie.mp4')]);
 return {shots:shots.map(s=>({shotId:s.shotId,label:s.label,start:s.start,end:s.end})),duration:time,warnings:FilmReview.evaluate(selections).warnings};
}
const FilmReview=require('./film-review');
function signatureFor(plan,selections){return hash([plan,selections.map(({source:s})=>[s.shot.videoUrl||s.id,s.shot.audioMode,s.shot.audioAsset,s.shot.cropBottomPercent,s.shot.subtitle,s.shot.dialogueEvents,s.shot.screenCards,s.shot.subtitleTiming])])}
function createService({root=ROOT,sources=loadSources,assemble=render,autoTick=true,currentData=()=>require('./workspace-api').createStore().read().data}={}){
 const states=new Map();let ticking=false;
 function save(s){fs.mkdirSync(root,{recursive:true});const file=path.join(root,s.id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify(s,null,2));fs.renameSync(file+'.tmp',file)}
 if(fs.existsSync(root))for(const name of fs.readdirSync(root).filter(n=>/^act_[a-f0-9]{32}\.json$/.test(n))){try{const s=JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));if(s.status==='assembling')s.status='waiting';states.set(s.id,s)}catch{}}
 const publicState=s=>({id:s.id,plan:s.plan,status:s.status,message:s.message,missing:s.missing||[],versions:s.versions||[]});
 async function sync(input){
  const plans=validate(input),ids=new Set();
  for(const plan of plans){const id='act_'+hash([plan.projectId,plan.scopeKey,plan.actId]).slice(0,32);ids.add(id);const previous=states.get(id),s=previous||{id,versions:[]};
   if(s.plan?.titleCard)plan.titleCard=s.plan.titleCard;
   if(JSON.stringify(s.plan)!==JSON.stringify(plan)){s.plan=plan;s.failedSignature=null;s.status='waiting'}s.enabled=true;states.set(id,s);save(s);
  }
  for(const s of states.values())if(s.plan.projectId===input.projectId&&s.plan.scopeKey===input.scopeKey&&!ids.has(s.id)){s.enabled=false;save(s)}
  if(autoTick)void tick().catch(()=>{});return list(input.projectId,input.scopeKey);
 }
 function list(projectId,scopeKey){return [...states.values()].filter(s=>s.enabled&&s.plan.projectId===projectId&&(!scopeKey||s.plan.scopeKey===scopeKey)).map(publicState)}
 async function tick(){
  if(ticking)return;ticking=true;
  try{const all=await sources();for(const state of states.values()){
   if(!state.enabled)continue;const plan=structuredClone(state.plan),selected=choose(plan,all);state.missing=selected.missing;
   if(selected.missing.length){state.status='waiting';const active=selected.selections.find(x=>!x.source?.ready&&x.source?.status==='rendering');state.message=selected.stale.length?`${selected.stale.length} 个镜头的分镜或资产已更新，旧视频保留；请生成当前版本后审片`:active?`镜头正在制作${Number.isFinite(active.source.progress?.percent)?' · '+active.source.progress.percent+'%':''}，完成后自动合成本场`:`等待 ${selected.missing.length} 个镜头，齐全后自动合成`;save(state);continue}
   const signature=signatureFor(plan,selected.selections);
   const latest=state.versions.at(-1);if(latest?.signature===signature){FilmReview.update(latest,selected.selections);state.status='ready';state.message=latest.approvedAt&&!latest.approvalStale?'本场已通过':latest.approvalStale?'检查结果已变化，请重新核对本场':'本场成片已生成，待审片';save(state);continue}
   if(state.failedSignature===signature)continue;
   state.status='assembling';state.message='镜头已齐，正在自动合成本场成片';save(state);
   const versionId='v_'+crypto.randomBytes(12).toString('hex'),dir=path.join(root,state.id,versionId);
   try{const result=await assemble(plan,selected.selections,dir);
    const fresh=choose(state.plan,await sources());
    if(!state.enabled||JSON.stringify(state.plan)!==JSON.stringify(plan)||fresh.missing.length||signatureFor(state.plan,fresh.selections)!==signature){state.status='waiting';save(state);continue}
    const version={id:versionId,signature,...result,createdAt:new Date().toISOString(),url:`/api/act-films/${state.id}/${versionId}/video`};FilmReview.update(version,fresh.selections);state.versions.push(version);state.status='ready';state.message='本场成片已生成，待审片';state.failedSignature=null;
   }catch(e){state.status='failed';state.message=e.message;state.failedSignature=signature}save(state);
  }}finally{ticking=false}
 }
 async function approve(id,versionId,confirmation){const s=states.get(id),v=s?.versions.at(-1);if(!s?.enabled||s.status!=='ready'||v?.id!==versionId)throw Error('场次已更新，请先观看最新成片');
  const data=currentData();if(data?.projects.some(p=>p.id===s.plan.projectId))for(const slot of s.plan.shots){const shot=data.shots.find(x=>x.id===slot.shotId&&x.projectId===s.plan.projectId&&!x.autoArchived);if(!shot||await require('./film-source-sync').fingerprint(shot,data)!==slot.sourceFingerprint)throw Error('磁盘分镜已修改，请同步当前场次并生成新版本')}
  const fresh=choose(s.plan,await sources());if(!s.enabled||s.status!=='ready'||s.versions.at(-1)!==v||fresh.missing.length||signatureFor(s.plan,fresh.selections)!==v.signature)throw Error('镜头已更新，请先观看最新成片');
  const review=FilmReview.evaluate(fresh.selections),record=FilmReview.confirmation(review,confirmation),before=structuredClone(v),message=s.message;
  if(v.approvedReview)v.approvalHistory=[...(v.approvalHistory||[]),{...v.approvedReview,approvedAt:v.approvedAt}];
  v.approvedAt=new Date().toISOString();v.approvedReview=record;FilmReview.update(v,fresh.selections);s.message='本场已通过';
  try{save(s)}catch(e){for(const key of Object.keys(v))delete v[key];Object.assign(v,before);s.message=message;throw e}return publicState(s)}
 function retry(id){const s=states.get(id);if(!s?.enabled)throw Error('场次不存在');s.failedSignature=null;save(s);if(autoTick)void tick().catch(()=>{})}
 function file(id,version){const s=states.get(id);if(!s?.versions.some(v=>v.id===version))throw Error('成片版本不存在');return path.join(root,id,version,'movie.mp4')}
 function setTitle(id,value){const s=states.get(id);if(!s?.enabled)throw Error('场次不存在');const card=titleCard(value);if(card)s.plan.titleCard=card;else delete s.plan.titleCard;s.failedSignature=null;s.status='waiting';s.message='片名设置已保存，镜头齐全后自动更新成片';save(s);if(autoTick)void tick().catch(()=>{});return publicState(s)}
 function note(id,input){const s=states.get(id),v=s?.versions.find(v=>v.id===input.versionId);if(!v)throw Error('成片版本不存在');const seconds=Number(input.seconds);if(!Number.isFinite(seconds)||seconds<0||seconds>v.duration||typeof input.text!=='string'||!input.text.trim()||input.text.length>2000)throw Error('请填写有效的时间和审片意见');const notes=v.notes||[];if(notes.length>=200)throw Error('本版审片意见已达上限');v.notes=[...notes,{id:crypto.randomUUID(),seconds,text:input.text.trim(),createdAt:new Date().toISOString()}];try{save(s)}catch(e){v.notes=notes;throw e}return publicState(s)}
 return {sync,list,tick,approve,retry,file,setTitle,note};
}
function createActFilmApi(){
 const service=createService();const timer=setInterval(()=>service.tick().catch(()=>{}),5000);timer.unref();
 return async(req,res,pathname)=>{
  if(!pathname.startsWith('/api/act-films'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  try{
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw Error('请从本地工作室操作');
   const url=new URL(req.url,'http://localhost');
   if(pathname==='/api/act-films'&&req.method==='GET'){send(200,{acts:service.list(url.searchParams.get('projectId'),url.searchParams.get('scopeKey'))});return true}
   if(pathname==='/api/act-films'&&req.method==='POST'){send(200,{acts:await service.sync(JSON.parse(await require('./request-body').readUtf8(req,400000)))});return true}
   const match=/^\/api\/act-films\/(act_[a-f0-9]{32})\/(?:(v_[a-f0-9]{24})\/video|(approve|retry|title|notes))$/.exec(pathname);
   if(!match)throw Error('场次接口不存在');
   if(match[3]&&req.method==='POST'){const body=JSON.parse(await require('./request-body').readUtf8(req,10000)||'{}');send(200,match[3]==='notes'?{act:service.note(match[1],body)}:match[3]==='title'?{act:service.setTitle(match[1],body.titleCard)}:match[3]==='approve'?{act:await service.approve(match[1],body.versionId,body.confirmation)}:(service.retry(match[1]),{ok:true}));return true}
   if(match[2]&&['GET','HEAD'].includes(req.method)){
    require('./media-response').sendFile(req,res,service.file(match[1],match[2]));return true;
   }throw Error('请求方式无效');
  }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.destroy()}return true;
 };
}
module.exports={titleCard,validate,loadSources,render,encodedDuration,createService,createActFilmApi};
