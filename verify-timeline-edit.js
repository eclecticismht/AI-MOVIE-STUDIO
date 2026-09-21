// Integration fixture: actual video trimming, three transitions, and mixed music.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),crypto=require('node:crypto');
const {validate,work}=require('./timeline-export-api'),{importAudio}=require('./audio-assets');
const ff=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const fixture=path.join(__dirname,'film-runs','film_fade2026');fs.mkdirSync(fixture,{recursive:true});
function command(args){return execFileSync(ff,['-hide_banner','-loglevel','error',...args],{windowsHide:true,maxBuffer:8000000,stdio:['ignore','pipe','pipe']})}
(async()=>{
 for(const [i,color] of ['red','blue'].entries())command(['-y','-f','lavfi','-i',`color=${color}:s=320x180:r=24:d=3`,'-f','lavfi','-i',`sine=frequency=${i?880:440}:duration=3`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(fixture,`clip-${i}.mp4`)]);
 const wav=command(['-f','lavfi','-i','sine=frequency=220:duration=5','-f','wav','pipe:1']);
 const {file}=await importAudio('data:audio/wav;base64,'+wav.toString('base64')),results=[];
 for(const transition of ['dissolve','fadeblack','wipeleft','mixed']){
  const id='cut_'+crypto.randomBytes(8).toString('hex'),plan=validate({projectId:'integration-test',title:'剪辑验证 '+transition,mix:{master:.8,musicVolume:.25,musicFile:file},clips:(transition==='mixed'?[0,1,2]:[0,1]).map(i=>({shotId:'s'+i,url:`/film-runs/film_fade2026/clip-${i%2}.mp4`,sourceDuration:3,trimIn:.5,trimOut:2.5,gain:.5,transition:transition==='mixed'?(i===1?'dissolve':'cut'):i?'cut':transition,transitionDuration:.5}))});
  fs.mkdirSync(path.join(__dirname,'timeline-exports',id),{recursive:true});const run={id,plan,status:'pending'};await work(run);if(run.status!=='complete')throw Error(run.message);
  const movie=path.join(__dirname,'timeline-exports',id,'movie.mp4');command(['-i',movie,'-f','null','-']);
  const video=command(['-i',movie,'-map','0:v','-f','rawvideo','-pix_fmt','rgb24','-vf','scale=1:1','pipe:1']);
  const seconds=video.length/3/24;if(Math.abs(seconds-(transition==='mixed'?5.5:3.5))>.1)throw Error('Unexpected duration '+seconds);
  const audio=command(['-i',movie,'-map','0:a','-f','f32le','-ac','1','pipe:1']);let energy=0;for(let i=0;i<audio.length;i+=4)energy+=audio.readFloatLE(i)**2;const rms=Math.sqrt(energy/(audio.length/4));if(rms<.005)throw Error('Mixed audio missing');
  results.push({transition,id,seconds,rms,decoded:true,url:run.url});
 }
 fs.writeFileSync(path.join(__dirname,'test-artifacts','timeline-edit-integration.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
