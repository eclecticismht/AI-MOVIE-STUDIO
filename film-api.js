const {resolveAudioAsset}=require('./audio-assets');
const {validateFirstFrame}=require('./first-frame');
const {alignSubtitles,checkedSubtitleTiming}=require('./subtitle-timing');
const ScreenCards=require('./screen-cards');
const ShotAudio=require('./shot-audio');
const FilmQuality=require('./film-quality');
const PendingQuality=require('./film-pending-quality');
const Framing=require('./film-framing');
const ScreenShot=require('./screen-shot');
const {compareSpeech,transcribe}=require('./speech-audit');
const DialogueContract=require('./dialogue-contract');
const {validateReferences,uploadReference}=require('./reference-assets');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const ROOT=path.join(__dirname,'film-runs');
const FFMPEG=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const runs=new Map(),busy=new Set(),auditing=new Set();
function save(run){fs.mkdirSync(path.join(ROOT,run.id),{recursive:true});const f=path.join(ROOT,run.id,'run.json');fs.writeFileSync(f+'.tmp',JSON.stringify(run,null,2));fs.renameSync(f+'.tmp',f)}
function publicRun(run){return {id:run.id,deferQualityReview:!!run.deferQualityReview,pendingQuality:PendingQuality.visiblePendingQuality(run),rechecking:!!run.rechecking,pauseRequested:!!run.pauseRequested,qualityGate:!!run.qualityGate,qualityHold:run.qualityHold,parentRunId:run.parentRunId,retriedShot:run.retriedShot,retriedShots:run.retriedShots,projectId:run.projectId,title:run.title,status:run.status,error:run.error,createdAt:run.createdAt,completedAt:run.completedAt,completed:run.shots.filter(s=>s.ready).length,total:run.shots.length,plannedSeconds:run.shots.reduce((n,s)=>n+s.duration,0),current:run.current,audit:run.audit,subtitleAlignment:run.subtitleAlignment,videoUrl:run.status==='complete'?'/api/film/'+run.id+'/video':null}}
function pauseAtBoundary(run){
  if(!run.pauseRequested)return false;
  run.status='paused';run.error=null;run.current={stage:'已在镜头之间暂停，已生成素材保留'};return true;
}
function validatePlan(input){
  if(!input||typeof input.projectId!=='string'||typeof input.title!=='string'||!Array.isArray(input.shots)||!input.shots.length||input.shots.length>160)throw Error('请选择一批完整分镜后再开始成片。');
  const ids=new Set();
  const shots=input.shots.map((s,index)=>{
    if(!s||typeof s.shotId!=='string'||ids.has(s.shotId)||typeof s.prompt!=='string'||!s.prompt.trim()||s.prompt.length>30000)throw Error('分镜提示词缺失或镜头重复。');
    ids.add(s.shotId);
    if(s.renderMode!==undefined&&!['model','black','screen'].includes(s.renderMode))throw Error('镜头制作方式无效');
    Framing.validateBottomCrop(s.cropBottomPercent);
    if(s.renderMode==='black'&&(['replacement','overlay'].includes(s.audioMode)||s.firstFrame||(s.dialogueEvents||[]).length||(s.screenCards||[]).length||(s.references||[]).length||s.subtitle?.trim()))throw Error('纯黑静音镜头不能附带对白、文字卡或参考图');
    if(!Number.isFinite(s.duration)||s.duration<4||s.duration>15)throw Error('每镜时长必须在 4–15 秒之间。');
    if(![s.width,s.height].every(n=>Number.isInteger(n)&&n>=32&&n<=8192&&n%32===0))throw Error('生成宽高必须是 32 的整数倍。');
    const dialogueEvents=s.dialogueEvents?DialogueContract.validateEvents(s.dialogueEvents):undefined;if(dialogueEvents)DialogueContract.bindDialogue(s.prompt,dialogueEvents,s.duration,s.references||[]);
    const screen=ScreenShot.validateScreenShot({...s,dialogueEvents},validateReferences(s.references));
    if(s.firstFrame&&dialogueEvents?.some(e=>e.type==='speech'&&e.delivery==='onscreen')&&!s.firstFrame.speakerPosition)throw Error('首帧镜头请指定画内发声者位置，避免说话人物错位');
    if(s.continuitySpeakerPosition&&!['left','center','right'].includes(s.continuitySpeakerPosition))throw Error('尾帧发声者位置无效');
    if(s.continueFromShotId){
      if(index===0||s.continueFromShotId!==input.shots[index-1].shotId)throw Error('承接镜头必须紧跟所引用的上一镜，请同时选择前镜');
      if(s.firstFrame||s.renderMode==='black'||input.shots[index-1].renderMode==='black')throw Error('承接尾帧不能同时指定独立首帧或纯黑镜头');
      if(dialogueEvents?.some(e=>e.type==='speech'&&e.delivery==='onscreen')&&!['left','center','right'].includes(s.continuitySpeakerPosition))throw Error('尾帧承接有画内对白，请指定本镜发声者在画面中的位置');
      if(s.width!==input.shots[index-1].width||s.height!==input.shots[index-1].height)throw Error('承接镜头的画面尺寸必须与前镜一致');
      const identity=refs=>JSON.stringify(validateReferences(refs).map(r=>[r.assetId,r.kind,r.file]).sort((a,b)=>a[0].localeCompare(b[0])));
      if(identity(s.references)!==identity(input.shots[index-1].references))throw Error('承接镜头的参考资产或图片已改变，请使用独立镜头生成新画面');
    }
    if(s.sourceFingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(s.sourceFingerprint))throw Error('来源校验信息无效');
    return {faceRefineMode:require('./face-refine').mode(s.faceRefineMode),cropBottomPercent:Framing.validateBottomCrop(s.cropBottomPercent),...(s.sourceFingerprint?{sourceFingerprint:s.sourceFingerprint}:{}),...(s.continueFromShotId?{continueFromShotId:s.continueFromShotId,continuitySpeakerPosition:s.continuitySpeakerPosition}:{}),firstFrame:validateFirstFrame(s.firstFrame),...(['replacement','overlay'].includes(s.audioMode)?{audioAsset:(resolveAudioAsset(s.audioAsset),s.audioAsset)}:{}),audioMode:ShotAudio.validate(s.audioMode,dialogueEvents,s.audioAsset),...(s.renderMode==='black'?{renderMode:'black'}:{}),...(screen?{renderMode:'screen',...screen}:{}),screenCards:ScreenCards.validate(s.screenCards||[],s.sourceExcerpt),sourceExcerpt:typeof s.sourceExcerpt==='string'?s.sourceExcerpt.slice(0,30000):'',...(dialogueEvents?{dialogueEvents}:{}),references:validateReferences(s.references),shotId:s.shotId,sequence:index+1,prompt:s.prompt,duration:s.duration,width:s.width,height:s.height,subtitle:typeof s.subtitle==='string'?s.subtitle.slice(0,5000):''};
  });
  return {projectId:input.projectId,title:input.title.slice(0,120),shots};
}
async function connector(route,body){const r=await fetch('http://127.0.0.1:8080'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const out=await r.json();if(!r.ok)throw Error(out.error||'本地渲染器连接失败');return out}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(args,log){return new Promise((resolve,reject)=>{const proc=spawn(FFMPEG,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let tail='';proc.stderr.on('data',b=>{tail=(tail+b).slice(-5000)});proc.on('error',reject);proc.on('close',code=>{fs.writeFileSync(log,tail);code===0?resolve():reject(Error('视频合成失败，请查看成片日志：'+tail.slice(-600)))})})}
function assTime(seconds){const c=Math.round(seconds*100);return `${Math.floor(c/360000)}:${String(Math.floor(c/6000)%60).padStart(2,'0')}:${String(Math.floor(c/100)%60).padStart(2,'0')}.${String(c%100).padStart(2,'0')}`}
function subtitleLines(text){return text.replace(/\{[^}]*\}/g,'').replace(/\\/g,'').split(/\n|(?<=[。！？])/).map(x=>x.trim()).filter(Boolean).flatMap(line=>line.match(/.{1,26}/gu)||[])}
function makeAss(shots){let start=0;const events=[];for(const s of shots.map(s=>s.renderMode==='screen'?{...s,dialogueEvents:[],subtitle:'',screenCards:s.screenSource==='text'&&s.screenCards?.some(c=>c.effect)?s.screenCards:[]}:s)){const duration=(17*Math.round((s.duration*24-5)/17)+5)/24,lines=subtitleLines(s.dialogueEvents?s.dialogueEvents.filter(e=>(e.type==='speech'&&s.subtitleTiming?.status!=='aligned')||(e.type==='screen'&&!(s.screenCards||[]).some(c=>(c.title+c.text).replace(/[\s，。！？、：:]/g,'').includes(e.text.replace(/[\s，。！？、：:]/g,''))))).map(e=>e.text).join('\n'):s.subtitle);lines.forEach((line,i)=>events.push(`Dialogue: 0,${assTime(start+i*duration/lines.length)},${assTime(start+(i+1)*duration/lines.length)},Default,,0,0,0,,${line}`));
    if(s.subtitleTiming?.status==='aligned')for(const cue of s.subtitleTiming.cues){const wrapped=subtitleLines(cue.text).join('\\N');events.push(`Dialogue: 0,${assTime(start+cue.start)},${assTime(start+cue.end)},Default,,0,0,0,,${wrapped}`)}
    if(s.screenCards?.length){
      const validatedCards=ScreenCards.validate(s.screenCards,s.sourceExcerpt);for(const frame of ScreenCards.timeline(validatedCards,duration)){const cards=frame.cards,textRows=cards.flatMap(c=>[...(s.renderMode==='screen'?[]:ScreenCards.rows(c.title)),...ScreenCards.rows(c.text),'']).slice(0,-1),layoutRows=validatedCards.flatMap(c=>[...ScreenCards.rows(c.title),...ScreenCards.rows(c.effect?c.text.split('\n').sort((a,b)=>b.length-a.length)[0]:c.text),'']).slice(0,-1),panelHeight=40+layoutRows.length*36,top=s.renderMode==='screen'?280:validatedCards.some(c=>c.effect)?720-panelHeight-30:30,bottom=top+panelHeight,width=Math.max(240,Math.min(550,40+Math.max(...layoutRows.map(t=>Array.from(t).length))*28)),left=s.renderMode==='screen'?160:1250-width,right=s.renderMode==='screen'?1120:1250;
      events.push(`Dialogue: 1,${assTime(start+frame.start)},${assTime(start+frame.end)},Screen,,0,0,0,,{\\an7\\pos(0,0)\\p1\\1c&H201A16&\\1a&H18&}m ${left} ${top} l ${right} ${top} ${right} ${bottom} ${left} ${bottom}{\\p0}`);
      events.push(`Dialogue: 2,${assTime(start+frame.start)},${assTime(start+frame.end)},Screen,,0,0,0,,{\\an7\\pos(${left+20},${top+20})\\q2}${textRows.join('\\N')}`);
    }}
    start+=duration}
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,30,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1\nStyle: Screen,Microsoft YaHei,28,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
}
async function checkReadyShot(run,index,dir){
 if(!run.qualityGate)return true;
 const shot=run.shots[index];
 if(!shot.speechCheck||shot.speechCheck.status==='check_failed'){
  run.current={index:index+1,shotId:shot.shotId,stage:'本地核对本镜实际声音'};save(run);
  const fallback=fs.existsSync(path.join(__dirname,'.runtime/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx'))?'sensevoice':undefined;
  shot.speechCheck=await FilmQuality.checkShotWithFallback(shot,path.join(dir,`source-${index}.mp4`),run.asrModel,fallback);save(run);
 }
 if(FilmQuality.passed(shot.speechCheck))return true;
 if(run.deferQualityReview){save(run);return true;}
 FilmQuality.holdForReview(run,index,shot.speechCheck);save(run);return false;
}
async function work(run){
  if(busy.has(run.id))return;busy.add(run.id);const dir=path.join(ROOT,run.id);
  try{
    if(!fs.existsSync(FFMPEG))throw Error('本地视频合成器未安装，请配置 FFMPEG_PATH。');
    if(!run.asrModel)run.asrModel=fs.existsSync(path.join(__dirname,'.runtime/models/whisper-medium/model.bin'))?'medium':'small';
    run.status='rendering';run.error=null;save(run);
    for(const [i,shot] of run.shots.entries()){
      if(pauseAtBoundary(run)){save(run);return;}
      if(shot.ready&&fs.existsSync(path.join(dir,`clip-${i}.mp4`))){if(!await checkReadyShot(run,i,dir))return;continue;}
      if(run.compositionOnly)throw Error('复用素材缺失，已停止合成；不会自动发起模型渲染。');
      if(shot.renderMode==='screen'){
        const ref=shot.references.find(r=>r.assetId===shot.screenAssetId);
        run.current={index:i+1,shotId:shot.shotId,stage:'直接展示屏幕资产（不调用模型）'};save(run);
        const imageResponse=await fetch('http://127.0.0.1:8188/view?'+new URLSearchParams({filename:ref.file,type:'input'}),{signal:AbortSignal.timeout(30000)});
        if(!imageResponse.ok)throw Error('无法读取已绑定的屏幕资产');
        const imageFile=path.join(dir,`screen-${i}.png`);fs.writeFileSync(imageFile,Buffer.from(await imageResponse.arrayBuffer()));
        await command(['-y','-loop','1','-i',imageFile,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String((17*Math.round((shot.duration*24-5)/17)+5)/24),'-vf',ScreenShot.screenImageFilter(shot.screenImagePercent),'-r','24','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(dir,`source-${i}.mp4`)],path.join(dir,`clip-${i}.log`));
        fs.copyFileSync(path.join(dir,`source-${i}.mp4`),path.join(dir,`clip-${i}.mp4`));shot.ready=true;shot.speechCheck={status:'not_applicable',reason:'屏幕资产原图，本地合成静音，无模型对白。'};save(run);continue;
      }
      if(shot.renderMode==='black'){
        run.current={index:i+1,shotId:shot.shotId,stage:'本地合成纯黑静音镜头（不调用模型）'};save(run);
        await command(['-y','-f','lavfi','-i','color=c=black:s=1280x720:r=24','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String((17*Math.round((shot.duration*24-5)/17)+5)/24),'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(dir,`source-${i}.mp4`)],path.join(dir,`clip-${i}.log`));
        fs.copyFileSync(path.join(dir,`source-${i}.mp4`),path.join(dir,`clip-${i}.mp4`));shot.ready=true;shot.speechCheck={status:'not_applicable',reason:'本地纯黑静音镜头'};save(run);continue;
      }
      run.current={index:i+1,shotId:shot.shotId,stage:'准备提交'};save(run);
      const jobId=`FILM_${run.id}_${i}${shot.renderAttempt?"_v"+shot.renderAttempt:""}`;
      let firstFrame=shot.firstFrame;
      if(shot.continueFromShotId){
        const previous=run.shots[i-1];
        if(!previous?.ready||previous.shotId!==shot.continueFromShotId)throw Error('前镜尚未完成，不能提取承接画面');
        run.current.stage='提取上一镜最后一帧';save(run);
        const framePath=path.join(dir,`continuity-${i}.png`);
        await command(['-y','-i',path.join(dir,`source-${i-1}.mp4`),'-map','0:v:0','-an','-update','1',framePath],path.join(dir,`continuity-${i}.log`));
        firstFrame=await uploadReference('data:image/png;base64,'+fs.readFileSync(framePath).toString('base64'),'http://127.0.0.1:8188',fetch);
        if(shot.continuitySpeakerPosition)firstFrame.speakerPosition=shot.continuitySpeakerPosition;
        shot.continuityFrame={...firstFrame,fromShotId:previous.shotId,fromJobId:previous.jobId};save(run);
      }
      await connector('/jobs',{id:jobId,projectId:run.projectId,shot:shot.shotId,prompt:shot.prompt,faceRefineMode:shot.faceRefineMode,firstFrame,references:shot.references,dialogueEvents:shot.dialogueEvents,duration:shot.duration,width:shot.width,height:shot.height,model:'Minimax H3',candidates:1});
      await connector('/jobs/'+jobId+'/comfy',{});
      let job;
      for(;;){
        job=(await connector('/jobs/'+jobId+'/status')).job;
        run.current={index:i+1,shotId:shot.shotId,stage:job.connectorStatus,progress:job.progress};save(run);
        if(job.videoUrl){shot.faceRefine=job.faceRefine;shot.originalVideoUrl=job.originalVideoUrl;break;}
        if(/失败|已取消|未找到视频/.test(job.connectorStatus||'')){shot.renderAttempt=(shot.renderAttempt||0)+1;save(run);throw Error(`第 ${i+1} 镜：${job.connectorStatus}`)}
        await sleep(4000);
      }
      const url=new URL(job.videoUrl);if(url.origin!=='http://127.0.0.1:8188'||url.pathname!=='/view')throw Error('渲染输出地址异常。');
      const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('无法读取生成视频');
      fs.writeFileSync(path.join(dir,`source-${i}.mp4`),Buffer.from(await response.arrayBuffer()));
      run.current.stage='规范画面与声音';save(run);
      await command(['-y','-i',path.join(dir,`source-${i}.mp4`),'-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1','-r','24','-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-ar','48000','-ac','2','-af','afade=t=in:d=0.06',path.join(dir,`clip-${i}.mp4`)],path.join(dir,`clip-${i}.log`));
      shot.ready=true;shot.jobId=jobId;shot.videoUrl=job.videoUrl;save(run);
      if(!await checkReadyShot(run,i,dir))return;
    }
    if(pauseAtBoundary(run)){save(run);return;}
    if(PendingQuality.holdBeforeAssembly(run)){save(run);return;}
    if(run.alignSubtitles){
      for(const [i,shot] of run.shots.entries()){
        if(!shot.dialogueEvents?.some(e=>e.type==='speech')||shot.subtitleTiming?.status==='aligned')continue;
        const checkedTiming=checkedSubtitleTiming(shot);
        if(checkedTiming){shot.subtitleTiming=checkedTiming;save(run);continue;}
        run.current={index:i+1,stage:'按实际发声时间对齐字幕'};save(run);
        const expected=shot.dialogueEvents.filter(e=>e.type==='speech').map(e=>e.text).join('');
        try{const transcription=await transcribe(path.join(dir,`source-${i}.mp4`),expected,run.asrModel||'small');shot.subtitleTiming=alignSubtitles(shot.dialogueEvents,transcription,(17*Math.round((shot.duration*24-5)/17)+5)/24)}catch(error){shot.subtitleTiming={status:'needs_review',reason:error.message,cues:[]}}
        save(run);
      }
      run.subtitleAlignment={model:run.asrModel||'small',aligned:run.shots.filter(s=>s.subtitleTiming?.status==='aligned').length,issues:run.shots.flatMap((s,i)=>s.subtitleTiming?.status==='needs_review'?[{index:i+1,reason:s.subtitleTiming.reason}]:[])};save(run);
    }
    // Keep original model audio intact; create a reversible composition-only silent track.
    for(const [i,shot] of run.shots.entries())if(ShotAudio.validate(shot.audioMode,shot.dialogueEvents,shot.audioAsset)!=='model'){
      const soundInput=['replacement','overlay'].includes(shot.audioMode)?['-stream_loop','-1','-i',resolveAudioAsset(shot.audioAsset)]:['-f','lavfi','-i','anullsrc=r=48000:cl=stereo'];
      run.current={index:i+1,stage:shot.audioMode==='overlay'?'叠加音效并保留对白':['replacement','overlay'].includes(shot.audioMode)?'合成独立环境音（不保留模型人声）':'生成整镜静音版本（同时移除环境声）'};save(run);
      await command(['-y','-i',path.join(dir,`clip-${i}.mp4`),...soundInput,...(shot.audioMode==='overlay'?['-filter_complex','[1:a]volume=0.25[fx];[0:a][fx]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[mix]','-map','0:v:0','-map','[mix]']:['-map','0:v:0','-map','1:a:0']),'-c:v','copy','-c:a','aac','-shortest',path.join(dir,`sound-${i}.mp4`)],path.join(dir,`sound-${i}.log`));
    }
    for(const [i,shot] of run.shots.entries())if(Framing.validateBottomCrop(shot.cropBottomPercent)>0){
      run.current={index:i+1,stage:'整理画面边缘（保留原始素材）'};save(run);
      const source=shot.audioMode&&shot.audioMode!=='model'?'sound':'clip';
      await command(['-y','-i',path.join(dir,source+'-'+i+'.mp4'),'-vf',Framing.cropFilter(shot.cropBottomPercent),'-c:v','libx264','-preset','fast','-crf','20','-c:a','copy',path.join(dir,'framed-'+i+'.mp4')],path.join(dir,'framed-'+i+'.log'));
    }
    run.status='assembling';run.current={stage:'自动拼接与添加字幕'};save(run);
    fs.writeFileSync(path.join(dir,'concat.txt'),run.shots.map((s,i)=>`file '${Framing.compositionFile(s,i)}'\nduration ${(17*Math.round((s.duration*24-5)/17)+5)/24}`).join('\n'));
    fs.writeFileSync(path.join(dir,'subtitles.ass'),makeAss(run.shots));
    await command(['-y','-f','concat','-safe','1','-i',path.join(dir,'concat.txt'),'-c','copy',path.join(dir,'joined.mp4')],path.join(dir,'concat.log'));
    // Filter paths are fixed generated paths, not user-provided filter expressions.
    const assPath=path.join(dir,'subtitles.ass').replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
    await command(['-y','-i',path.join(dir,'joined.mp4'),'-vf',`ass=filename='${assPath}'`,'-c:v','libx264','-preset','fast','-crf','20','-c:a','copy','-movflags','+faststart',path.join(dir,'movie.mp4')],path.join(dir,'export.log'));
    if(fs.statSync(path.join(dir,'movie.mp4')).size<1000)throw Error('成片文件无效。');
    run.status='complete';run.completedAt=new Date().toISOString();run.current={stage:'MP4 已生成，待观看验收'};save(run);
  }catch(error){run.status='failed';run.error=error.message;save(run)}finally{busy.delete(run.id)}
}
function retryPlan(run,index,revision){
  if(!Number.isInteger(index)||index<0||index>=run.shots.length)throw Error('请选择有效镜头');
  if(!['complete','paused','failed'].includes(run.status))throw Error('请等待当前镜头完成或暂停后重做');
  if(!Array.isArray(run.shots[index].dialogueEvents))throw Error('旧版镜头缺少结构化对白，请从已校正的分镜批次制作，避免沿用错误台词。');
  const original=run.shots[index];let replacement=original;
  if(revision){
    if(typeof revision.subtitle!=='string'||revision.subtitle.length>5000)throw Error('对白内容无效');
    const characters=[...(original.references||[]).filter(r=>r.kind==='character'||r.kind==='characters').map(r=>({id:r.assetId,name:r.name})),...original.dialogueEvents.filter(e=>e.type==='speech').map(e=>({id:e.speakerId,name:e.speakerName}))];
    const events=DialogueContract.parseDialogue(revision.subtitle,characters);
    if(JSON.stringify(events)!==JSON.stringify(original.dialogueEvents)&&!original.sourceExcerpt?.trim())throw Error('旧镜头没有原文依据，不能修改对白；请从校正后的分镜制作。');
    DialogueContract.checkSource(events,original.sourceExcerpt);
    if(JSON.stringify(events)!==JSON.stringify(original.dialogueEvents))for(const event of events.filter(e=>e.type==='screen'))require('./asset-states').validate({screen:{screenText:event.text}},['screen'],original.sourceExcerpt);
    const visible=items=>items.filter(e=>e.type==='speech'&&e.delivery==='onscreen').map(e=>e.speakerId).join('|');
    if(original.firstFrame&&visible(events)!==visible(original.dialogueEvents))throw Error('首帧镜头的画内发声人物已改变，请回分镜重新确认人物位置后制作');
    replacement={...original,...(revision.cropBottomPercent!==undefined?{cropBottomPercent:Framing.validateBottomCrop(revision.cropBottomPercent)}:{}),...(revision.renderMode!==undefined?{renderMode:revision.renderMode,screenAssetId:revision.screenAssetId,screenSource:revision.screenSource,screenImagePercent:revision.screenImagePercent,screenCards:revision.screenCards??original.screenCards}:{}),prompt:revision.prompt,duration:revision.duration,subtitle:revision.subtitle,dialogueEvents:events,...(revision.firstFrame!==undefined?{firstFrame:validateFirstFrame(revision.firstFrame)}:{}),...(revision.audioMode!==undefined?{audioMode:revision.audioMode,audioAsset:revision.audioAsset}: {})};
  }
  if(revision?.screenReferenceFile!==undefined){
    if(replacement.renderMode!=='screen'||replacement.screenSource==='text')throw Error('只有屏幕原图展示镜头可以替换展示图片');
    if(!(replacement.references||[]).some(r=>r.assetId===replacement.screenAssetId&&r.kind==='props'))throw Error('屏幕道具引用缺失');
    replacement={...replacement,references:validateReferences(replacement.references.map(r=>r.assetId===replacement.screenAssetId?{...r,file:revision.screenReferenceFile}:r))};
  }
  const validated=validatePlan({projectId:run.projectId,title:run.title,shots:run.shots.map((s,i)=>i===index?replacement:s)}).shots[index];
  const shots=structuredClone(run.shots),affected=[index+1];shots[index]={...validated,sequence:index+1,ready:false};
  for(let i=index+1;i<shots.length&&shots[i].continueFromShotId===shots[i-1].shotId;i++){affected.push(i+1);shots[i].ready=false;for(const key of ['jobId','videoUrl','subtitleTiming','renderAttempt','continuityFrame','speechCheck','speechCheckHistory'])delete shots[i][key];}
  return {id:'film_'+crypto.randomBytes(8).toString('hex'),projectId:run.projectId,title:run.title+' · 单镜重做',parentRunId:run.id,revision:revision?{index:index+1,previousPrompt:original.prompt,previousSubtitle:original.subtitle,previousDuration:original.duration}:undefined,deferQualityReview:!!run.deferQualityReview,qualityGate:!!run.qualityGate,alignSubtitles:true,asrModel:run.audit?.model==='medium'?'medium':run.asrModel||'small',retriedShot:index+1,retriedShots:affected,shots,status:'pending',createdAt:new Date().toISOString()};
}
function batchRetryPlan(run,revisions){
 if(!Array.isArray(revisions)||!revisions.length||revisions.length>run.shots.length)throw Error('请选择有效的批量修订镜头');
 const seen=new Set(),affected=new Set();let child=run;
 for(const entry of [...revisions].sort((a,b)=>a.index-b.index)){
  if(seen.has(entry.index))throw Error('批量修订镜头重复');seen.add(entry.index);
  child=retryPlan({...child,status:run.status},entry.index,entry.revision);
  child.retriedShots.forEach(i=>affected.add(i));
 }
 child.parentRunId=run.id;child.title=run.title.replace(/(?: · 单镜重做)+$/,'')+' · 批量修订';
 child.retriedShots=[...affected].sort((a,b)=>a-b);child.retriedShot=child.retriedShots[0];child.batchRevisions=structuredClone(revisions);return child;
}
function recomposePlan(run,changes){
  const partial=run.status==='paused'||run.status==='failed';
  if(!partial&&(run.status!=='complete'||!run.shots.every(s=>s.ready)))throw Error('请等待本版完成或暂停后更新声音');
  if(!Array.isArray(changes)||!changes.length||changes.length>run.shots.length)throw Error('没有可更新的屏幕信息卡');
  const shots=structuredClone(run.shots),seen=new Set();
  for(const change of changes){
    const shot=shots.find(s=>s.shotId===change.shotId);if(!shot||seen.has(change.shotId))throw Error('镜头不属于该版成片或重复，请选择制作时的原批次');seen.add(change.shotId);
    if(partial&&(!shot.ready||(change.audioMode===undefined&&change.cropBottomPercent===undefined)||change.screenCards!==undefined))throw Error('暂停版本只能更新已生成镜头的声音或画面裁切');
    if(change.cropBottomPercent!==undefined)shot.cropBottomPercent=Framing.validateBottomCrop(change.cropBottomPercent);
    const source=shot.sourceExcerpt||(shot.dialogueEvents||[]).filter(e=>e.type==='screen').map(e=>e.text).join('\n');
    if(change.screenCards!==undefined)shot.screenCards=ScreenCards.validate(change.screenCards,source);shot.sourceExcerpt=source;
    if(change.audioMode!==undefined){if(shot.renderMode==='black'&&['replacement','overlay'].includes(change.audioMode))throw Error('纯黑静音镜头不能添加环境音');const asset=change.audioAsset??shot.audioAsset;shot.audioMode=ShotAudio.validate(change.audioMode,shot.dialogueEvents,asset);if(['replacement','overlay'].includes(shot.audioMode)){resolveAudioAsset(asset);shot.audioAsset=asset}delete shot.speechCheck;};
  }
  return {id:'film_'+crypto.randomBytes(8).toString('hex'),projectId:run.projectId,title:run.title+(changes.some(c=>c.cropBottomPercent!==undefined)?' · 画面整理':changes.some(c=>c.audioMode!==undefined)?' · 声音更新':' · 文字更新'),parentRunId:run.id,deferQualityReview:!!run.deferQualityReview,qualityGate:!!run.qualityGate,alignSubtitles:true,asrModel:run.audit?.model==='medium'?'medium':run.asrModel||'small',compositionOnly:!partial,shots,status:'pending',createdAt:new Date().toISOString()};
}
async function auditRun(run,model='small'){
  if(auditing.has(run.id))return;auditing.add(run.id);
  if(run.audit)run.auditHistory=[...(run.auditHistory||[]),run.audit].slice(-5);
  run.audit={model,status:'running',completed:0,total:run.shots.length,results:[],startedAt:new Date().toISOString()};save(run);
  try{
    for(const [index,shot] of run.shots.entries()){
      const file=path.join(ROOT,run.id,`${shot.audioMode&&shot.audioMode!=='model'?'sound':'source'}-${index}.mp4`);
      if(!shot.ready||!fs.existsSync(file))throw Error(`第 ${index+1} 镜尚未生成，暂不能检查。`);
      const transcription=await transcribe(file,(shot.dialogueEvents||[]).filter(e=>e.type==='speech').map(e=>e.text).join(''),model);
      run.audit.results.push({index:index+1,shotId:shot.shotId,...compareSpeech(shot.dialogueEvents,transcription)});
      run.audit.completed=index+1;save(run);
    }
    run.audit.status='complete';run.audit.completedAt=new Date().toISOString();
  }catch(error){run.audit.status='failed';run.audit.error=error.message}
  finally{auditing.delete(run.id);save(run)}
}
async function recheckPending(run,model){
 if(run.rechecking)throw Error('正在复核');run.rechecking=true;save(run);
 try{const pending=PendingQuality.pendingQuality(run);
 for(const item of pending){const shot=run.shots[item.index-1];run.current={index:item.index,stage:'增强复核实际对白'};save(run);
 shot.speechCheckHistory=[...(shot.speechCheckHistory||[]),{at:new Date().toISOString(),result:shot.speechCheck}];
 shot.speechCheck=await FilmQuality.checkShot(shot,path.join(ROOT,run.id,`source-${item.index-1}.mp4`),model);save(run);}
 delete run.qualityHold;run.error=null;run.status='paused';
 if(!PendingQuality.holdBeforeAssembly(run))run.current={stage:'声音检查通过，可继续合成；画面仍需审片'};
 }finally{delete run.rechecking;save(run)}
}
function createFilmApi(){
  if(fs.existsSync(ROOT))for(const name of fs.readdirSync(ROOT)){if(!/^film_[a-f0-9]{16}$/.test(name))continue;try{const run=JSON.parse(fs.readFileSync(path.join(ROOT,name,'run.json'),'utf8'));let recovered=false;if(!['complete','failed','paused'].includes(run.status)){run.status='paused';run.error='服务重启，点击继续制作恢复。';recovered=true}if(run.audit?.status==='running'){run.audit.status='interrupted';run.audit.error='服务重启，检查已中断，可重新检查。';recovered=true}if(run.rechecking){delete run.rechecking;run.error='服务重启，声音复核已中断，可重新检查。';recovered=true}runs.set(name,run);if(recovered)save(run)}catch{}}
  return async(req,res,pathname)=>{
    if(!pathname.startsWith('/api/film'))return false;
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
    if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'请从本地工作室操作。'});return true}
    try{
      if(req.method==='GET'&&pathname==='/api/film'){send(200,{runs:[...runs.values()].map(publicRun)});return true}
      if(req.method==='POST'&&pathname==='/api/film'){
        const raw=await require('./request-body').readUtf8(req,8000000,'分镜计划过大');
        const plan=validatePlan(JSON.parse(raw)),existing=[...runs.values()].find(r=>r.projectId===plan.projectId&&['rendering','assembling'].includes(r.status));
        if(existing){send(409,{error:'此项目已有制作任务，请先查看当前进度。',run:publicRun(existing)});return true}
        const run={...plan,qualityGate:true,alignSubtitles:true,id:'film_'+crypto.randomBytes(8).toString('hex'),status:'pending',createdAt:new Date().toISOString()};runs.set(run.id,run);save(run);void work(run);send(202,{run:publicRun(run)});return true;
      }
      const match=pathname.match(/^\/api\/film\/(film_[a-f0-9]{16})(?:\/(video|resume|pause|audit|retry|recompose|align|accept-review|recheck|recheck-pending|retry-batch|validate-revision|preview))?$/),run=match&&runs.get(match[1]);
      if(!run){send(404,{error:'没有找到成片任务'});return true}
      if(req.method==='DELETE'&&!match[2]){
        const {projectId}=JSON.parse(await require('./request-body').readUtf8(req,2000));
        const deletion=require('./film-delete');deletion.canDeleteFilm(run,projectId,busy.has(run.id)||auditing.has(run.id));
        deletion.deleteFilmFiles(ROOT,run.id);runs.delete(run.id);send(200,{deleted:run.id});return true;
      }
      if(req.method==='POST'&&run.rechecking)throw Error('正在重新检查声音，请稍后');
      if(req.method==='POST'&&match[2]==='recheck-pending'){
        if(!['paused','failed'].includes(run.status))throw Error('请先等待制作结束或暂停');
        const {model='medium'}=JSON.parse(await require('./request-body').readUtf8(req,1000)||'{}');
        const modelFile=model==='sensevoice'?'.runtime/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx':`.runtime/models/whisper-${model}/model.bin`;
        if(!['small','medium','large-v3','sensevoice'].includes(model)||!fs.existsSync(path.join(__dirname,modelFile)))throw Error('本地复核模型未安装');
        void recheckPending(run,model).catch(e=>{run.error=e.message;save(run)});send(202,{run:publicRun(run)});return true;
      }
      if(req.method==='POST'&&match[2]==='recheck'){
        if(run.status!=='paused'||!run.qualityHold)throw Error('没有待复核的镜头');
        const index=run.qualityHold.index-1,file=path.join(ROOT,run.id,`source-${index}.mp4`);
        if(!fs.existsSync(file))throw Error('原始镜头素材缺失');
        void FilmQuality.recheckHeldShot(run,file).then(()=>save(run)).catch(error=>{run.error=error.message;save(run)});
        send(202,{run:publicRun(run)});return true;
      }
      if(req.method==='POST'&&['recompose','align'].includes(match[2])){
        if([...runs.values()].some(r=>r.projectId===run.projectId&&['pending','rendering','assembling'].includes(r.status)))throw Error('此项目已有制作任务，请等待完成');
        const raw=await require('./request-body').readUtf8(req,500000);
        const changes=match[2]==='align'?[{shotId:run.shots[0].shotId,screenCards:run.shots[0].screenCards||[]}]:JSON.parse(raw).changes;const child=recomposePlan(run,changes);if(match[2]==='align')child.title=run.title+' · 字幕对齐';const dir=path.join(ROOT,child.id);
        for(let i=0;i<run.shots.length;i++)if(child.shots[i].ready)for(const prefix of ['source','clip'])if(!fs.existsSync(path.join(ROOT,run.id,`${prefix}-${i}.mp4`)))throw Error('原始镜头素材缺失，无法复用');
        fs.mkdirSync(dir,{recursive:true});for(let i=0;i<run.shots.length;i++)if(child.shots[i].ready)for(const prefix of ['source','clip'])fs.copyFileSync(path.join(ROOT,run.id,`${prefix}-${i}.mp4`),path.join(dir,`${prefix}-${i}.mp4`));
        runs.set(child.id,child);save(child);void work(child);send(202,{run:publicRun(child)});return true;
      }
      if(req.method==='POST'&&match[2]==='validate-revision'){
        const {index,revision}=JSON.parse(await require('./request-body').readUtf8(req,200000));
        const plan=retryPlan(run,index,revision);
        const affected=plan.retriedShots;
        send(200,{revision:plan.shots[index],impact:{redo:affected,reuse:plan.shots.flatMap((s,i)=>s.ready?[i+1]:[]),pending:plan.shots.flatMap((s,i)=>!s.ready&&!affected.includes(i+1)?[i+1]:[])}});return true;
      }
      if(req.method==='POST'&&match[2]==='retry-batch'){
        if([...runs.values()].some(r=>r.projectId===run.projectId&&['pending','rendering','assembling'].includes(r.status)))throw Error('此项目已有制作任务');
        const {revisions}=JSON.parse(await require('./request-body').readUtf8(req,1800000));
        const child=batchRetryPlan(run,revisions),dir=path.join(ROOT,child.id);
        for(let i=0;i<run.shots.length;i++)if(child.shots[i].ready)for(const prefix of ['source','clip'])if(!fs.existsSync(path.join(ROOT,run.id,`${prefix}-${i}.mp4`)))throw Error('原版素材缺失，无法复用');
        fs.mkdirSync(dir,{recursive:true});for(let i=0;i<run.shots.length;i++)if(child.shots[i].ready)for(const prefix of ['source','clip'])fs.copyFileSync(path.join(ROOT,run.id,`${prefix}-${i}.mp4`),path.join(dir,`${prefix}-${i}.mp4`));
        runs.set(child.id,child);save(child);void work(child);send(202,{run:publicRun(child)});return true;
      }
      if(req.method==='POST'&&match[2]==='retry'){
        if([...runs.values()].some(r=>r.projectId===run.projectId&&['pending','rendering','assembling'].includes(r.status)))throw Error('此项目已有制作任务，请先等待完成');
        const raw=await require('./request-body').readUtf8(req,200000);
        const {index,revision}=JSON.parse(raw),child=retryPlan(run,index,revision),dir=path.join(ROOT,child.id);
        // Verify every reusable source before creating a new version. Never overwrite the parent.
        for(let i=0;i<run.shots.length;i++)if(child.shots[i].ready)for(const prefix of ['source','clip'])if(!fs.existsSync(path.join(ROOT,run.id,`${prefix}-${i}.mp4`)))throw Error('原版素材缺失，无法复用');
        fs.mkdirSync(dir,{recursive:true});
        for(let i=0;i<run.shots.length;i++)if(child.shots[i].ready)for(const prefix of ['source','clip'])fs.copyFileSync(path.join(ROOT,run.id,`${prefix}-${i}.mp4`),path.join(dir,`${prefix}-${i}.mp4`));
        runs.set(child.id,child);save(child);void work(child);send(202,{run:publicRun(child)});return true;
      }
      if(req.method==='POST'&&match[2]==='audit'){if(!['complete','failed','paused'].includes(run.status)||!run.shots.every(s=>s.ready))throw Error('请等待所有镜头完成后检查');if(auditing.size)throw Error('正在检查成片，请稍后再试');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000)throw Error('检查请求过大')}const options=raw?JSON.parse(raw):{},model=options.model||'small';if(!['small','medium'].includes(model))throw Error('本地语音模型选项无效');if(!fs.existsSync(path.join(__dirname,`.runtime/models/whisper-${model}/model.bin`)))throw Error('所选本地语音识别模型尚未安装');void auditRun(run,model);send(202,{run:publicRun(run)});return true}
      if(req.method==='POST'&&match[2]==='pause'){if(!['pending','rendering'].includes(run.status))throw Error('当前阶段无需暂停，请等待合成完成或查看已暂停任务');run.pauseRequested=true;save(run);send(202,{run:publicRun(run)});return true}
      if(req.method==='POST'&&match[2]==='accept-review'){
        const {note}=JSON.parse(await require('./request-body').readUtf8(req,5000));FilmQuality.acceptReview(run,note);save(run);send(200,{run:publicRun(run)});return true;
      }
      if(req.method==='POST'&&match[2]==='resume'){if(!['failed','paused'].includes(run.status))throw Error('该任务无需恢复');if([...runs.values()].some(r=>r.id!==run.id&&r.projectId===run.projectId&&['pending','rendering','assembling'].includes(r.status)))throw Error('此项目已有制作任务');const raw=await require('./request-body').readUtf8(req,1000);const options=JSON.parse(raw||'{}');if(options.deferQualityReview===true)run.deferQualityReview=true;if(run.qualityHold&&run.qualityHold.result.status!=='check_failed'&&!run.deferQualityReview)throw Error('请先处理声音检查问题，不能直接跳过');delete run.qualityHold;delete run.pauseRequested;void work(run);send(202,{run:publicRun(run)});return true}
      if(['GET','HEAD'].includes(req.method)&&['video','preview'].includes(match[2])){
        const preview=match[2]==='preview',index=Number(new URL(req.url,'http://localhost').searchParams.get('index'));
        if(preview&&(!Number.isInteger(index)||index<0||!run.shots[index]?.ready))throw Error('该镜头尚未生成');
        if(!preview&&run.status!=='complete')throw Error('成片尚未生成');const file=path.join(ROOT,run.id,preview?`source-${index}.mp4`:'movie.mp4'),size=fs.statSync(file).size;
        const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
        if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return true}
        res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);return true;
      }
      send(200,{run:{...publicRun(run),parentRunId:run.parentRunId,retriedShot:run.retriedShot,shots:run.shots}});
    }catch(error){send(400,{error:error.message})}return true;
  };
}
module.exports={batchRetryPlan,createFilmApi,validatePlan,makeAss,publicRun,work,retryPlan,recomposePlan,pauseAtBoundary};
