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
   return {shotId:s.shotId,label:String(s.label||'镜头').slice(0,160),sequence:s.sequence};
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
async function render(plan,selections,dir){
 fs.mkdirSync(dir,{recursive:true});const shots=[],warnings=[];let time=0;
 for(const [i,{slot,source}] of selections.entries()){
  let file=source.file;
  if(!file){const location=require('./timeline-export-api').sourceLocation(source.url);if(location.file)file=location.file;else{
   const response=await fetch(location.url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('无法读取第 '+(i+1)+' 镜');
   file=path.join(dir,`input-${i}.mp4`);await require('node:stream/promises').pipeline(require('node:stream').Readable.fromWeb(response.body),fs.createWriteStream(file));
  }}
  let info='';try{await command(['-hide_banner','-i',file])}catch(e){info=e.log||''}
  const match=/Duration: (\d+):(\d+):([\d.]+)/.exec(info);if(!match)throw Error('无法读取第 '+(i+1)+' 镜时长');
  const duration=+match[1]*3600 + +match[2]*60 + +match[3],s=source.shot,mode=s.audioMode||'model';
  if(!Number.isFinite(duration)||duration<=0||duration>3600)throw Error('镜头时长无效');
  const extra=['replacement','overlay'].includes(mode)?['-stream_loop','-1','-i',resolveAudioAsset(s.audioAsset)]:mode==='mute'||!/Audio:/.test(info)?['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']:[];
  const audio=mode==='overlay'?['-filter_complex','[1:a]volume=0.25[fx];[0:a][fx]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[mix]','-map','0:v:0','-map','[mix]']:['-map','0:v:0','-map',extra.length?'1:a:0':'0:a:0'];
  await command(['-y','-i',file,...extra,...audio,'-t',String(duration),'-vf',cropFilter(s.cropBottomPercent||0)+',fps=24,format=yuv420p','-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-ar','48000','-ac','2',path.join(dir,`clip-${i}.mp4`)]);
  shots.push({...s,sequence:i+1,shotId:slot.shotId,label:slot.label,start:time,end:time+duration,actualDuration:duration});time+=duration;
  if(!require('./film-quality').passed(s.speechCheck))warnings.push({index:i+1,shotId:slot.shotId,message:s.speechCheck?.reason||'声音尚未核对，请观看确认'});
 }
 fs.writeFileSync(path.join(dir,'concat.txt'),shots.map((s,i)=>`file 'clip-${i}.mp4'`).join('\n'));
 await command(['-y','-f','concat','-safe','0','-i',path.join(dir,'concat.txt'),'-c','copy',path.join(dir,'joined.mp4')]);
 fs.writeFileSync(path.join(dir,'subtitles.ass'),require('./film-api').makeAss(shots));
 const ass=path.join(dir,'subtitles.ass').replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
 const card=plan.titleCard&&titleCard(plan.titleCard),offset=Math.max(0,time-(card?.seconds||0));
 const filter=card?['-loop','1','-i',path.join(__dirname,card.imageUrl),'-filter_complex',`[0:v]ass=filename='${ass}'[base];[1:v]scale=1024:400:force_original_aspect_ratio=decrease,format=rgba,fade=t=in:st=${offset}:d=1:alpha=1[title];[base][title]overlay=(W-w)/2:(H-h)/2:enable='gte(t,${offset})':shortest=1[v]`,'-map','[v]','-map','0:a:0','-t',String(time)]:['-vf',`ass=filename='${ass}'`];
 await command(['-y','-i',path.join(dir,'joined.mp4'),...filter,'-c:v','libx264','-preset','fast','-crf','20','-c:a','copy','-movflags','+faststart',path.join(dir,'movie.mp4')]);
 return {shots:shots.map(s=>({shotId:s.shotId,label:s.label,start:s.start,end:s.end})),duration:time,warnings};
}
function reviewWarnings(selections){return selections.flatMap(({slot,source},i)=>require('./film-quality').passed(source.shot.speechCheck)?[]:[{index:i+1,shotId:slot.shotId,message:source.shot.speechCheck?.reason||'声音尚未核对，请观看确认'}])}
function signatureFor(plan,selections){return hash([plan,selections.map(({source:s})=>[s.shot.videoUrl||s.id,s.shot.audioMode,s.shot.audioAsset,s.shot.cropBottomPercent,s.shot.subtitle,s.shot.dialogueEvents,s.shot.screenCards,s.shot.subtitleTiming])])}
function createService({root=ROOT,sources=loadSources,assemble=render,autoTick=true}={}){
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
   if(selected.missing.length){state.status='waiting';const active=selected.selections.find(x=>!x.source?.ready&&x.source?.status==='rendering');state.message=active?`镜头正在制作${Number.isFinite(active.source.progress?.percent)?' · '+active.source.progress.percent+'%':''}，完成后自动合成本场`:`等待 ${selected.missing.length} 个镜头，齐全后自动合成`;save(state);continue}
   const signature=signatureFor(plan,selected.selections);
   const latest=state.versions.at(-1);if(latest?.signature===signature){latest.warnings=reviewWarnings(selected.selections);state.status='ready';state.message=latest.approvedAt?'本场已通过':'本场成片已生成，待审片';save(state);continue}
   if(state.failedSignature===signature)continue;
   state.status='assembling';state.message='镜头已齐，正在自动合成本场成片';save(state);
   const versionId='v_'+crypto.randomBytes(12).toString('hex'),dir=path.join(root,state.id,versionId);
   try{const result=await assemble(plan,selected.selections,dir);
    const fresh=choose(state.plan,await sources());
    if(!state.enabled||JSON.stringify(state.plan)!==JSON.stringify(plan)||fresh.missing.length||signatureFor(state.plan,fresh.selections)!==signature){state.status='waiting';save(state);continue}
    state.versions.push({id:versionId,signature,...result,createdAt:new Date().toISOString(),url:`/api/act-films/${state.id}/${versionId}/video`});state.status='ready';state.message='本场成片已生成，待审片';state.failedSignature=null;
   }catch(e){state.status='failed';state.message=e.message;state.failedSignature=signature}save(state);
  }}finally{ticking=false}
 }
 async function approve(id,versionId){const s=states.get(id),v=s?.versions.at(-1);if(!s?.enabled||s.status!=='ready'||v?.id!==versionId)throw Error('场次已更新，请先观看最新成片');const fresh=choose(s.plan,await sources());if(!s.enabled||s.status!=='ready'||s.versions.at(-1)!==v||fresh.missing.length||signatureFor(s.plan,fresh.selections)!==v.signature)throw Error('镜头已更新，请先观看最新成片');v.approvedAt=new Date().toISOString();s.message='本场已通过';save(s);return publicState(s)}
 function retry(id){const s=states.get(id);if(!s?.enabled)throw Error('场次不存在');s.failedSignature=null;save(s);if(autoTick)void tick().catch(()=>{})}
 function file(id,version){const s=states.get(id);if(!s?.versions.some(v=>v.id===version))throw Error('成片版本不存在');return path.join(root,id,version,'movie.mp4')}
 function setTitle(id,value){const s=states.get(id);if(!s?.enabled)throw Error('场次不存在');const card=titleCard(value);if(card)s.plan.titleCard=card;else delete s.plan.titleCard;s.failedSignature=null;s.status='waiting';s.message='片名设置已保存，镜头齐全后自动更新成片';save(s);if(autoTick)void tick().catch(()=>{});return publicState(s)}
 return {sync,list,tick,approve,retry,file,setTitle};
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
   const match=/^\/api\/act-films\/(act_[a-f0-9]{32})\/(?:(v_[a-f0-9]{24})\/video|(approve|retry|title))$/.exec(pathname);
   if(!match)throw Error('场次接口不存在');
   if(match[3]&&req.method==='POST'){const body=JSON.parse(await require('./request-body').readUtf8(req,2000)||'{}');send(200,match[3]==='title'?{act:service.setTitle(match[1],body.titleCard)}:match[3]==='approve'?{act:await service.approve(match[1],body.versionId)}:(service.retry(match[1]),{ok:true}));return true}
   if(match[2]&&['GET','HEAD'].includes(req.method)){
    const file=service.file(match[1],match[2]),size=fs.statSync(file).size,range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||''),start=range?+range[1]:0,end=range?.[2]?Math.min(+range[2],size-1):size-1;
    if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return true}
    res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);return true;
   }throw Error('请求方式无效');
  }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.destroy()}return true;
 };
}
module.exports={titleCard,validate,loadSources,render,createService,createActFilmApi};
