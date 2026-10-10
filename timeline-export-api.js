const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const Edit=require('./timeline-edit'),{resolveAudioAsset}=require('./audio-assets');
const Subtitles=require('./timeline-subtitles');
const ROOT=path.join(__dirname,'timeline-exports'),FFMPEG=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const OUTPUTS=Object.freeze({
  '854x480':Object.freeze({width:854,height:480,label:'480p 横屏',upscaled:false,sampleAspect:'1280/1281',displayAspect:'16:9'}),
  '1280x720':Object.freeze({width:1280,height:720,label:'HD',upscaled:false}),
  '1920x1080':Object.freeze({width:1920,height:1080,label:'Full HD',upscaled:true}),
  '2560x1440':Object.freeze({width:2560,height:1440,label:'2K QHD（常规缩放）',upscaled:true}),
  '3840x2160':Object.freeze({width:3840,height:2160,label:'4K UHD（上采样）',upscaled:true})
});
const running=new Set();
function outputSettings(value){
  const preset=value||'1280x720',settings=OUTPUTS[preset];
  if(!settings)throw Error('请选择支持的成片分辨率：854x480、1280x720、1920x1080、2560x1440 或 3840x2160');
  return {preset,...settings};
}
function outputResolutions(){return Object.keys(OUTPUTS)}
function deliveryModes(){return ['review','master_and_review']}
function deliveryMode(value='review'){
  if(!deliveryModes().includes(value))throw Error('请选择播放版，或母版与播放版');
  return value;
}
function encodingArgs(mode){
  return mode==='master'
    ? ['-c:v','prores_ks','-profile:v','3','-pix_fmt','yuv422p10le','-r','24','-c:a','pcm_s24le','-ar','48000','-ac','2']
    : ['-c:v','libx264','-preset','fast',...(mode==='distribution'?['-b:v','20M','-maxrate','25M','-bufsize','40M']:['-crf','18']),'-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','320k','-ar','48000','-ac','2','-movflags','+faststart'];
}
async function fileHash(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')}
function requiredExportBytes(plan){
  const seconds=plan.clips.reduce((sum,clip)=>sum+clip.duration,0),{width,height}=plan.output;
  // Budget uncompressed 10-bit intermediates plus source copies and output;
  // FFV1 usually needs less. Keep 8 GiB free for the rest of the studio.
  return Math.ceil(seconds*(width*height*3*24+48000*6)*(plan.deliveryMode==='master_and_review'?2.2:1.2)+plan.clips.length*512*1024**2+8*1024**3);
}
function assertExportSpace(plan,root=__dirname,io=fs){
  const stats=io.statfsSync(root),available=Number(stats.bavail)*Number(stats.bsize),required=requiredExportBytes(plan);
  if(available<required)throw Error(`导出空间不足：此次无损中间素材需预留约 ${Math.ceil(required/1024**3)} GB，当前可用 ${Math.floor(available/1024**3)} GB。请先备份并整理已完成导出，再重试。`);
}
function outputScaleFilter(value,pixelFormat='yuv420p'){const output=typeof value==='string'?outputSettings(value):value||outputSettings();return `scale=${output.width}:${output.height}:flags=lanczos,setsar=${output.sampleAspect||1}${output.sampleAspect?':max=10000':''},format=${pixelFormat}`}
function intermediateFilter(output,aspectMode='pad',colorMode='preserve'){
  const {width,height}=output;
  const fit=aspectMode==='crop'?`scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2:flags=lanczos,crop=${width}:${height}`:`scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
  return `fps=24,${colorMode==='bt709'?'colorspace=all=bt709:range=tv:format=yuv420p10,':''}${fit},setsar=${output.sampleAspect||1}${output.sampleAspect?':max=10000':''},format=yuv420p10le`;
}
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
    const movie=/^\/film-runs\/(film_[a-f0-9]+)\/(movie|(?:clip|sound|framed)-\d+)\.mp4$/.exec(u.pathname);
    if(movie&&!u.search)return {file:path.join(__dirname,'film-runs',movie[1],movie[2]+'.mp4')};
  }throw Error('只允许本机工作室或渲染器中的视频');
}
function validate(input){
  if(!input||typeof input.projectId!=='string'||!Array.isArray(input.clips)||!input.clips.length||input.clips.length>100)throw Error('请选择 1–100 个有视频的镜头');
  const ids=new Set(),sources=input.clips.map((c,i)=>{if(typeof c.shotId!=='string'||ids.has(c.shotId))throw Error('镜头编号无效或重复');ids.add(c.shotId);sourceLocation(c.url);if(c.performanceAudio){const binding=require('./performance-audio').validate(c.performanceAudio,{duration:c.performanceDuration,dialogueEvents:c.dialogueEvents,audioMode:c.audioMode});if(Math.abs(c.sourceDuration*24-binding.frames)>1)throw Error('画面与绑定配音长度不匹配，请核对所选视频版本');c={...c,audioMode:'voiceover',audioAsset:binding.file}}if(c.audioMode&&!['model','mute','replacement','voiceover'].includes(c.audioMode))throw Error('声音模式无效');if(['replacement','voiceover'].includes(c.audioMode))resolveAudioAsset(c.audioAsset);return {...c,id:c.shotId,sequence:i+1,dur:c.sourceDuration}});
  const edit={order:sources.map(s=>s.id),clips:Object.fromEntries(sources.map(s=>[s.id,s]))},clips=Edit.build(sources,edit),mix=Edit.mix(input.mix);
  if(mix.musicFile)resolveAudioAsset(mix.musicFile);
  if(clips.at(-1).end>1800)throw Error('单次剪辑导出最长 30 分钟');
  const aspectMode=input.aspectMode||'pad';if(!['pad','crop'].includes(aspectMode))throw Error('画面适配方式无效');
  const colorMode=input.colorMode||'preserve';if(!['preserve','bt709'].includes(colorMode))throw Error('色彩转换方式无效');
  return {projectId:input.projectId,title:String(input.title||'时间线剪辑版').slice(0,120),clips:clips.map(c=>({...c.shot,...c.edit,overlap:c.overlap,duration:c.duration})),mix,output:outputSettings(input.outputResolution),deliveryMode:deliveryMode(input.deliveryMode),aspectMode,colorMode};
}
function command(args){return new Promise((resolve,reject)=>{const p=spawn(FFMPEG,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let log='';p.stderr.on('data',b=>log=(log+b).slice(-20000));p.on('error',reject);p.on('close',code=>code===0?resolve(log):reject(Object.assign(Error('合成失败：'+log.slice(-1200)),{log})))})}
async function download(location,file){if(location.file){await fs.promises.copyFile(location.file,file);return}const r=await fetch(location.url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('视频无法读取：HTTP '+r.status);let size=0;await pipeline(Readable.fromWeb(r.body),new Transform({transform(chunk,encoding,cb){size+=chunk.length;cb(size>512*1024*1024?Error('单个素材超过512MB'):null,chunk)}}),fs.createWriteStream(file))}
function save(run){fs.mkdirSync(ROOT,{recursive:true});fs.writeFileSync(path.join(ROOT,run.id,'run.json'),JSON.stringify(run,null,2))}
function listExports(projectId,root=ROOT,io=fs){
  if(typeof projectId!=='string'||!projectId.trim()||projectId.length>200)throw Error('请选择有效项目');
  if(!io.existsSync(root))return [];
  const exports=[];
  for(const id of io.readdirSync(root)){
    if(!/^cut_[a-f0-9]{16}$/.test(id))continue;
    try{
      const run=JSON.parse(io.readFileSync(path.join(root,id,'run.json'),'utf8'));
      if(run.status!=='complete'||run.plan?.projectId!==projectId||!Number.isFinite(run.duration)||run.duration<=0||!io.existsSync(path.join(root,id,'movie.mp4')))continue;
      const output=run.plan.output||outputSettings();
      const bundle=run.plan.deliveryMode==='master_and_review';
      if(bundle&&!io.existsSync(path.join(root,id,'master.mov')))continue;
      exports.push({id,title:run.plan.title,duration:run.duration,clipCount:run.plan.clips.length,createdAt:run.createdAt,width:output.width||1280,height:output.height||720,resolutionLabel:output.label||'HD',upscaled:output.upscaled===true,url:'/timeline-exports/'+id+'/movie.mp4',...(bundle?{masterUrl:'/timeline-exports/'+id+'/master.mov',deliveryMode:'master_and_review'}:{})});
    }catch{} // A damaged or incomplete export must not hide other completed films.
  }
  return exports.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||b.id.localeCompare(a.id));
}
function audioFilter(clip,mix,shot){
  const normalize=mix.normalizeDialogue===true&&(!clip.audioMode||['model','voiceover'].includes(clip.audioMode))&&shot?.dialogueEvents?.some(e=>e.type==='speech');
  return (normalize?'loudnorm=I=-18:TP=-1.5:LRA=11,':'')+'volume='+(clip.audioMode==='mute'?0:clip.gain)+',aresample=48000,apad';
}
async function work(run){
  running.add(run.id);const dir=path.join(ROOT,run.id);try{
    run.status='rendering';const output=run.plan.output||outputSettings(),bundle=run.plan.deliveryMode==='master_and_review';run.processing={intermediate:'FFV1 / PCM',workingWidth:output.width,workingHeight:output.height,scaling:'lanczos',aiSuperResolution:false,color:run.plan.colorMode||'preserve',captions:'rendered_at_output_resolution',deliveryMode:run.plan.deliveryMode||'review',masterNewCaptions:bundle?false:null};run.sources=[];save(run);
    const captionShots=run.plan.clips.map(clip=>Subtitles.sourceShot(clip,id=>JSON.parse(fs.readFileSync(path.join(__dirname,'film-runs',id,'run.json'),'utf8'))));
    for(const [i,c] of run.plan.clips.entries()){
      run.message='整理镜头 '+(i+1)+' / '+run.plan.clips.length;save(run);const file=path.join(dir,'source-'+i+'.mp4');await download(sourceLocation(c.url),file);
      run.sources.push({shotId:c.shotId,url:c.url,sha256:await fileHash(file),trimIn:c.trimIn,trimOut:c.trimOut});save(run);
      let info;try{await command(['-hide_banner','-i',file]);throw Error('无法检查视频')}catch(e){info=e.log||''}
      const match=/Duration: (\d+):(\d+):([\d.]+)/.exec(info);if(!match)throw Error('视频缺少可读取的时长');const actual=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
      if(c.trimOut>actual+0.08)throw Error('第 '+(i+1)+' 镜裁切出点超过实际视频时长，请加载预览后重新设置。');
      const hasAudio=/Audio:/.test(info),extra=c.audioMode==='voiceover'?['-ss',String(c.trimIn),'-i',resolveAudioAsset(c.audioAsset)]:c.audioMode==='replacement'?['-stream_loop','-1','-i',resolveAudioAsset(c.audioAsset)]:!hasAudio||c.audioMode==='mute'?['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']:[];
      // Work at delivery size once and retain lossless intermediates. In
      // particular, never downsample an existing HD source to 720p first.
      await command(['-y','-ss',String(c.trimIn),'-i',file,...extra,'-t',String(c.duration),'-map','0:v:0','-map',extra.length?'1:a:0':'0:a:0','-vf',intermediateFilter(output,run.plan.aspectMode,run.plan.colorMode),'-af',audioFilter(c,run.plan.mix,captionShots[i]),'-c:v','ffv1','-level','3','-c:a','pcm_s24le','-ar','48000','-ac','2',path.join(dir,'clip-'+i+'.mkv')]);
    }
    run.message='合成转场与混音';save(run);
    const clips=run.plan.clips.map(c=>({duration:c.duration,overlap:c.overlap,edit:c})),graph=Edit.graph(clips),inputs=run.plan.clips.flatMap((_,i)=>['-i',path.join(dir,'clip-'+i+'.mkv')]);
    const filters=clips.flatMap((_,i)=>[`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=24[v${i}]`,`[${i}:a]atrim=duration=${clips[i].duration},asetpts=PTS-STARTPTS[a${i}]`]).concat(graph.filters),mix=run.plan.mix;
    if(mix.musicFile){inputs.push('-stream_loop','-1','-ss',String(mix.musicOffset),'-i',resolveAudioAsset(mix.musicFile));filters.push(`[${clips.length}:a]atrim=duration=${graph.duration},asetpts=PTS-STARTPTS,volume=${mix.musicVolume}[music]`,`[${graph.audio}][music]amix=inputs=2:duration=first:normalize=0,volume=${mix.master},alimiter=limit=0.95:level=false:latency=true[mixed]`)}
    else filters.push(`[${graph.audio}]volume=${mix.master},alimiter=limit=0.95:level=false:latency=true[mixed]`);
    const captions=Subtitles.timelineAss(run.plan.clips,captionShots,{qhd:output.preset==='2560x1440'});let video='sized',audio='mixed';
    filters.push(`[${graph.video}]${outputScaleFilter(output,bundle?'yuv422p10le':'yuv420p')}[sized]`);
    if(bundle){filters.push('[sized]split=2[masterVideo][reviewVideo]','[mixed]asplit=2[masterAudio][reviewAudio]');video='reviewVideo';audio='reviewAudio'}
    if(captions.cueCount){
      const file=path.join(dir,'subtitles.ass');fs.writeFileSync(file,captions.ass);
      const escaped=file.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
      filters.push('['+video+"]ass='"+escaped+"'[captioned]");video='captioned';
    }
    const colors=run.plan.colorMode==='bt709'?['-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv']:[];
    const outputs=['-map','['+video+']','-map','['+audio+']','-t',String(graph.duration),...encodingArgs(bundle?'distribution':'review'),...colors,path.join(dir,'movie.mp4')];
    if(bundle)outputs.push('-map','[masterVideo]','-map','[masterAudio]','-t',String(graph.duration),...encodingArgs('master'),...colors,path.join(dir,'master.mov'));
    await command(['-y',...inputs,'-filter_complex_threads','1','-filter_complex',filters.join(';'),...outputs]);
    run.artifacts=[];
    for(const name of ['movie.mp4',...(bundle?['master.mov']:[]),...(captions.cueCount?['subtitles.ass']:[])])run.artifacts.push({file:name,bytes:fs.statSync(path.join(dir,name)).size,sha256:await fileHash(path.join(dir,name))});
    if(bundle)run.masterUrl='/timeline-exports/'+run.id+'/master.mov';
    run.status='complete';run.duration=graph.duration;run.url='/timeline-exports/'+run.id+'/movie.mp4';run.message=bundle?'母版与播放版已导出；母版未叠加本次字幕。请完成画面与声音审片。':'剪辑版已导出，请审阅转场、声音和对白完整性。';save(run);
  }catch(e){run.status='failed';run.message=e.message;save(run)}finally{running.delete(run.id)}
}
async function timelineExportApi(req,res,pathname){
  if(!pathname.startsWith('/api/timeline-'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  try{
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw Error('请从本地工作室操作');
    if(pathname==='/api/timeline-export'&&req.method==='GET'){
      send(200,{exports:listExports(new URL(req.url,'http://localhost').searchParams.get('projectId')),outputResolutions:outputResolutions(),deliveryModes:deliveryModes()});return true;
    }
    if(pathname==='/api/timeline-media'&&req.method==='GET'){
      const source=sourceLocation(new URL(req.url,'http://localhost').searchParams.get('url'));if(source.file){require('./media-response').sendFile(req,res,source.file)}else{
        const r=await fetch(source.url,{redirect:'error',headers:req.headers.range?{Range:req.headers.range}:{},signal:AbortSignal.timeout(60000)});res.writeHead(r.status,Object.fromEntries(['content-type','content-length','content-range','accept-ranges'].filter(k=>r.headers.has(k)).map(k=>[k,r.headers.get(k)])));await pipeline(Readable.fromWeb(r.body),res);
      }return true;
    }
    if(pathname==='/api/timeline-export'&&req.method==='POST'){
      if(running.size)throw Error('已有剪辑版正在导出，请完成后再试');const plan=validate(JSON.parse(await require('./request-body').readUtf8(req,400000,'剪辑计划过大'))),id='cut_'+crypto.randomBytes(8).toString('hex'),run={id,status:'pending',plan,createdAt:new Date().toISOString(),message:'准备导出'};
      assertExportSpace(plan);fs.mkdirSync(path.join(ROOT,id),{recursive:true});save(run);void work(run);send(202,{id,status:run.status});return true;
    }
    const match=/^\/api\/timeline-export\/(cut_[a-f0-9]{16})$/.exec(pathname);
    if(match&&req.method==='GET'){const run=JSON.parse(fs.readFileSync(path.join(ROOT,match[1],'run.json'),'utf8'));if(['pending','rendering'].includes(run.status)&&!running.has(run.id)){run.status='failed';run.message='服务重启使此次导出中断，请重新导出；源素材已保留。'}delete run.plan;send(200,run);return true}
    send(404,{error:'剪辑接口不存在'});
  }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.destroy()}return true;
}
module.exports={isBusy:()=>running.size>0,sourceLocation,validate,work,timelineExportApi,audioFilter,listExports,outputSettings,outputResolutions,outputScaleFilter,intermediateFilter,requiredExportBytes,assertExportSpace,deliveryModes,encodingArgs};
