// Local-only PCM stem rendering using the already installed FFmpeg. Never generates voices.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const M=require('./sound-design'),A=require('./audio-assets');
const FFMPEG=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
function command(args){return new Promise((resolve,reject)=>{const p=spawn(FFMPEG,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let log='';const timer=setTimeout(()=>{p.kill();reject(Error('声音合成超时，源文件未改动'));},300000);p.stderr.on('data',b=>log=(log+b).slice(-18000));p.once('error',e=>{clearTimeout(timer);reject(e)});p.once('close',code=>{clearTimeout(timer);code===0?resolve(log):reject(Error('声音合成失败：'+log.slice(-1800)))});});}
async function hash(file){const h=crypto.createHash('sha256');for await(const c of fs.createReadStream(file))h.update(c);return h.digest('hex');}
function cueFilter(plan,c,index,label){
 const gain=M.db(c.gainDb+plan.tracks.find(t=>t.id===c.trackId).gainDb),left=c.pan>0?1-c.pan:1,right=c.pan<0?1+c.pan:1;
 const f=[`[${index}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`,`atrim=start=${c.trimIn}:end=${c.trimOut}`,'asetpts=PTS-STARTPTS'];
 if(c.loop)f.push(`aloop=loop=-1:size=${Math.max(1,Math.round((c.trimOut-c.trimIn)*48000))}`);
 f.push(`atrim=duration=${c.duration}`,`volume=${gain}`,`pan=stereo|c0=${left}*c0|c1=${right}*c1`);
 if(c.fadeIn)f.push(`afade=t=in:st=0:d=${c.fadeIn}`);if(c.fadeOut)f.push(`afade=t=out:st=${c.duration-c.fadeOut}:d=${c.fadeOut}`);
 if(c.trackId==='music'&&plan.duckMusic.enabled)f.push(`volume='${M.duckExpression(plan,c.start)}':eval=frame`);
 f.push(`adelay=${Math.round(c.start*48000)}S:all=1`,`apad=whole_dur=${plan.duration}`,`atrim=duration=${plan.duration}[${label}]`);return f.join(',');
}
async function renderStems(input,dir,{resolve=A.resolveAudioAsset,onProgress=()=>{}}={}){
 const plan=M.normalize(input);fs.mkdirSync(dir,{recursive:true});const available=fs.statfsSync(dir);const required=Math.ceil(plan.duration*48000*6*8+128*1024**2);if(Number(available.bavail)*Number(available.bsize)<required)throw Error('声音导出空间不足，请保留原素材后清理空间');
 for(const lock of Object.values(plan.voiceLocks||{})){if(!M.fileName(lock.sourceFile)||!/^[a-f0-9]{64}$/.test(lock.sha256||''))throw Error('固定声源指纹缺失');if(await hash(resolve(lock.sourceFile))!==lock.sha256)throw Error('固定声源文件内容已变化，未继续合成');}
 const sources=[];for(const file of new Set(plan.cues.map(c=>c.file))){const source=resolve(file),actual=A.wavDuration(fs.readFileSync(source));for(const c of plan.cues.filter(c=>c.file===file)){if(Math.abs(actual-c.sourceDuration)>.03||c.trimOut>actual+.001)throw Error('录音实际时长与方案不同：'+c.name);}sources.push({file,path:source,sha256:await hash(source),duration:actual});}
 const stems=[];for(const track of M.TRACKS){
  onProgress('合成'+track.name);const cues=plan.cues.filter(c=>c.trackId===track.id&&M.audible(plan,track.id));const file=path.join(dir,track.id+'.wav');
  if(!cues.length)await command(['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String(plan.duration),'-c:a','pcm_s24le',file]);
  else{const args=cues.flatMap(c=>['-i',sources.find(s=>s.file===c.file).path]),filters=cues.map((c,i)=>cueFilter(plan,c,i,'s'+i));filters.push(cues.map((_,i)=>'[s'+i+']').join('')+`amix=inputs=${cues.length}:duration=longest:normalize=0,atrim=duration=${plan.duration}[stem]`);const script=path.join(dir,track.id+'-filter.txt');fs.writeFileSync(script,filters.join(';\n'));await command(['-y','-hide_banner','-loglevel','error',...args,'-filter_complex_threads','1','-filter_complex_script',script,'-map','[stem]','-ar','48000','-ac','2','-t',String(plan.duration),'-c:a','pcm_s24le',file]);}
  stems.push({trackId:track.id,name:track.name,file:path.basename(file),path:file,seconds:A.wavDuration(fs.readFileSync(file)),sha256:await hash(file),cueCount:cues.length});
 }
 onProgress('合成总混音');const mixed=path.join(dir,'mix.wav');await command(['-y','-hide_banner','-loglevel','error',...stems.flatMap(s=>['-i',s.path]),'-filter_complex',stems.map((_,i)=>`[${i}:a]`).join('')+`amix=inputs=5:duration=longest:normalize=0,volume=${M.db(plan.masterDb)},alimiter=limit=0.95:level=false:latency=true,atrim=duration=${plan.duration}[mix]`,'-map','[mix]','-ar','48000','-ac','2','-c:a','pcm_s24le','-t',String(plan.duration),mixed]);
 const measured=await command(['-hide_banner','-i',mixed,'-af','astats=metadata=0:reset=0','-f','null','-']);const peaks=[...measured.matchAll(/Peak level dB:\s*([-\d.]+)/g)].map(m=>Number(m[1]));
 const report={version:1,seconds:A.wavDuration(fs.readFileSync(mixed)),sampleRate:48000,bits:24,channels:2,mixed,sha256:await hash(mixed),stems,sources,peakDb:peaks.length?Math.max(...peaks):null,duckMethod:'verified dialogue time windows with smooth linear attack/release; not a speaker-quality assessment',noVoiceRegeneration:true,noTimeStretch:true,reviewStatus:'声音候选；音色、音乐审美和动作对点待审',userApproved:false};
 if(Math.abs(report.seconds-plan.duration)>.001)throw Error('混音长度检查失败，未标记完成');fs.writeFileSync(path.join(dir,'sound-report.json'),JSON.stringify(report,null,2));return report;
}
module.exports={renderStems,cueFilter,command,hash};
