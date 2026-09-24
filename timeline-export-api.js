const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const Edit=require('./timeline-edit'),{resolveAudioAsset}=require('./audio-assets');
const Subtitles=require('./timeline-subtitles');
const ROOT=path.join(__dirname,'timeline-exports'),FFMPEG=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const running=new Set();
function sourceLocation(value){
  const u=new URL(value,'http://127.0.0.1:4173');
  if(u.username||u.password||u.hash)throw Error('素材地址无效');
  if(u.origin==='http://127.0.0.1:8188'&&u.pathname==='/view'){
    const filename=u.searchParams.get('filename'),folder=u.searchParams.get('subfolder')||'',type=u.searchParams.get('type')||'output';
    if(!filename||!/^[^/\\\x00]+\.(mp4|webm|mov)$/i.test(filename)||folder.split(/[\\/]/).some(p=>p==='..'||p.startsWith('.'))||type!=='output')throw Error('只支持渲染器输出视频');
    const query=new URLSearchParams({filename,subfolder:folder,type});return {url:'http://127.0.0.1:8188/view?'+query};
  }
  if(u.origin==='http://127.0.0.1:4173'){
    const imported=/^\/assets\/imported\/(asset-[a-f0-9]{64}\.(mp4|webm|mov))$/.exec(u.pathname);
    if(imported&&!u.search)return {file:path.join(__dirname,'assets','imported',imported[1])};
    const preview=/^\/api\/film\/(film_[a-f0-9]+)\/preview$/.exec(u.pathname);
    if(preview&&/^\d{1,4}$/.test(u.searchParams.get('index')||''))return {file:path.join(__dirname,'film-runs',preview[1],'clip-'+u.searchParams.get('index')+'.mp4')};
    const movie=/^\/film-runs\/(film_[a-f0-9]+)\/(movie|clip-\d+)\.mp4$/.exec(u.pathname);
    if(movie)return {file:path.join(__dirname,'film-runs',movie[1],movie[2]+'.mp4')};
  }throw Error('只允许本机工作室或渲染器中的视频');
}
function validate(input){
  if(!input||typeof input.projectId!=='string'||!Array.isArray(input.clips)||!input.clips.length||input.clips.length>100)throw Error('请选择 1–100 个有视频的镜头');
  const ids=new Set(),sources=input.clips.map((c,i)=>{if(typeof c.shotId!=='string'||ids.has(c.shotId))throw Error('镜头编号无效或重复');ids.add(c.shotId);sourceLocation(c.url);if(c.audioMode&&!['model','mute','replacement'].includes(c.audioMode))throw Error('声音模式无效');if(c.audioMode==='replacement')resolveAudioAsset(c.audioAsset);return {...c,id:c.shotId,sequence:i+1,dur:c.sourceDuration}});
  const edit={order:sources.map(s=>s.id),clips:Object.fromEntries(sources.map(s=>[s.id,s]))},clips=Edit.build(sources,edit),mix=Edit.mix(input.mix);
  if(mix.musicFile)resolveAudioAsset(mix.musicFile);
  if(clips.at(-1).end>1800)throw Error('单次剪辑导出最长 30 分钟');
  return {projectId:input.projectId,title:String(input.title||'时间线剪辑版').slice(0,120),clips:clips.map(c=>({...c.shot,...c.edit,overlap:c.overlap,duration:c.duration})),mix};
}
function command(args){return new Promise((resolve,reject)=>{const p=spawn(FFMPEG,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let log='';p.stderr.on('data',b=>log=(log+b).slice(-20000));p.on('error',reject);p.on('close',code=>code===0?resolve(log):reject(Object.assign(Error('合成失败：'+log.slice(-1200)),{log})))})}
async function download(location,file){if(location.file){await fs.promises.copyFile(location.file,file);return}const r=await fetch(location.url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('视频无法读取：HTTP '+r.status);let size=0;await pipeline(Readable.fromWeb(r.body),new Transform({transform(chunk,encoding,cb){size+=chunk.length;cb(size>512*1024*1024?Error('单个素材超过512MB'):null,chunk)}}),fs.createWriteStream(file))}
function save(run){fs.mkdirSync(ROOT,{recursive:true});fs.writeFileSync(path.join(ROOT,run.id,'run.json'),JSON.stringify(run,null,2))}
function audioFilter(clip,mix,shot){
  const normalize=mix.normalizeDialogue===true&&(!clip.audioMode||clip.audioMode==='model')&&shot?.dialogueEvents?.some(e=>e.type==='speech');
  return (normalize?'loudnorm=I=-18:TP=-1.5:LRA=11,':'')+'volume='+(clip.audioMode==='mute'?0:clip.gain)+',aresample=48000,apad';
}
async function work(run){
  running.add(run.id);const dir=path.join(ROOT,run.id);try{
    run.status='rendering';save(run);
    const captionShots=run.plan.clips.map(clip=>Subtitles.sourceShot(clip,id=>JSON.parse(fs.readFileSync(path.join(__dirname,'film-runs',id,'run.json'),'utf8'))));
    for(const [i,c] of run.plan.clips.entries()){
      run.message='整理镜头 '+(i+1)+' / '+run.plan.clips.length;save(run);const file=path.join(dir,'source-'+i+'.mp4');await download(sourceLocation(c.url),file);
      let info;try{await command(['-hide_banner','-i',file]);throw Error('无法检查视频')}catch(e){info=e.log||''}
      const match=/Duration: (\d+):(\d+):([\d.]+)/.exec(info);if(!match)throw Error('视频缺少可读取的时长');const actual=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
      if(c.trimOut>actual+0.08)throw Error('第 '+(i+1)+' 镜裁切出点超过实际视频时长，请加载预览后重新设置。');
      const hasAudio=/Audio:/.test(info),extra=c.audioMode==='replacement'?['-stream_loop','-1','-i',resolveAudioAsset(c.audioAsset)]:!hasAudio||c.audioMode==='mute'?['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']:[];
      await command(['-y','-ss',String(c.trimIn),'-i',file,...extra,'-t',String(c.duration),'-map','0:v:0','-map',extra.length?'1:a:0':'0:a:0','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p','-af',audioFilter(c,run.plan.mix,captionShots[i]),'-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-ac','2',path.join(dir,'clip-'+i+'.mp4')]);
    }
    run.message='合成转场与混音';save(run);
    const clips=run.plan.clips.map(c=>({duration:c.duration,overlap:c.overlap,edit:c})),graph=Edit.graph(clips),inputs=run.plan.clips.flatMap((_,i)=>['-i',path.join(dir,'clip-'+i+'.mp4')]);
    const filters=clips.flatMap((_,i)=>[`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=24[v${i}]`,`[${i}:a]atrim=duration=${clips[i].duration},asetpts=PTS-STARTPTS[a${i}]`]).concat(graph.filters),mix=run.plan.mix;
    if(mix.musicFile){inputs.push('-stream_loop','-1','-ss',String(mix.musicOffset),'-i',resolveAudioAsset(mix.musicFile));filters.push(`[${clips.length}:a]atrim=duration=${graph.duration},asetpts=PTS-STARTPTS,volume=${mix.musicVolume}[music]`,`[${graph.audio}][music]amix=inputs=2:duration=first:normalize=0,volume=${mix.master},alimiter=limit=0.95:level=false:latency=true[mixed]`)}
    else filters.push(`[${graph.audio}]volume=${mix.master},alimiter=limit=0.95:level=false:latency=true[mixed]`);
    const captions=Subtitles.timelineAss(run.plan.clips,captionShots);let video=graph.video;
    if(captions.cueCount){
      const file=path.join(dir,'subtitles.ass');fs.writeFileSync(file,captions.ass);
      const escaped=file.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
      filters.push('['+video+"]ass='"+escaped+"'[captioned]");video='captioned';
    }
    await command(['-y',...inputs,'-filter_complex_threads','1','-filter_complex',filters.join(';'),'-map','['+video+']','-map','[mixed]','-t',String(graph.duration),'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',path.join(dir,'movie.mp4')]);
    run.status='complete';run.duration=graph.duration;run.url='/timeline-exports/'+run.id+'/movie.mp4';run.message='剪辑版已导出，请审阅转场、声音和对白完整性。';save(run);
  }catch(e){run.status='failed';run.message=e.message;save(run)}finally{running.delete(run.id)}
}
async function timelineExportApi(req,res,pathname){
  if(!pathname.startsWith('/api/timeline-'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
  try{
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw Error('请从本地工作室操作');
    if(pathname==='/api/timeline-media'&&req.method==='GET'){
      const source=sourceLocation(new URL(req.url,'http://localhost').searchParams.get('url'));if(source.file){const stat=fs.statSync(source.file);res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':stat.size});await pipeline(fs.createReadStream(source.file),res)}else{
        const r=await fetch(source.url,{redirect:'error',headers:req.headers.range?{Range:req.headers.range}:{},signal:AbortSignal.timeout(60000)});res.writeHead(r.status,Object.fromEntries(['content-type','content-length','content-range','accept-ranges'].filter(k=>r.headers.has(k)).map(k=>[k,r.headers.get(k)])));await pipeline(Readable.fromWeb(r.body),res);
      }return true;
    }
    if(pathname==='/api/timeline-export'&&req.method==='POST'){
      if(running.size)throw Error('已有剪辑版正在导出，请完成后再试');const plan=validate(JSON.parse(await require('./request-body').readUtf8(req,400000,'剪辑计划过大'))),id='cut_'+crypto.randomBytes(8).toString('hex'),run={id,status:'pending',plan,createdAt:new Date().toISOString(),message:'准备导出'};
      fs.mkdirSync(path.join(ROOT,id),{recursive:true});save(run);void work(run);send(202,{id,status:run.status});return true;
    }
    const match=/^\/api\/timeline-export\/(cut_[a-f0-9]{16})$/.exec(pathname);
    if(match&&req.method==='GET'){const run=JSON.parse(fs.readFileSync(path.join(ROOT,match[1],'run.json'),'utf8'));if(['pending','rendering'].includes(run.status)&&!running.has(run.id)){run.status='failed';run.message='服务重启使此次导出中断，请重新导出；源素材已保留。'}delete run.plan;send(200,run);return true}
    send(404,{error:'剪辑接口不存在'});
  }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.destroy()}return true;
}
module.exports={sourceLocation,validate,work,timelineExportApi,audioFilter};
