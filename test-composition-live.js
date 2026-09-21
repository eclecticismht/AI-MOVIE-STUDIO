// Integration fixture: reuses an existing silent QA clip; never submits a GPU job.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {validatePlan,work}=require('./film-api');
(async()=>{
 const id='film_'+crypto.randomBytes(8).toString('hex'),dir=path.join(__dirname,'film-runs',id);fs.mkdirSync(dir,{recursive:true});
 const text='好\n我这个月真没了。\n孙嘉俊，高二那年你借我五十块买烟，也没还。';
 const plan=validatePlan({projectId:'AMS-QA-COMPOSITION',title:'动态草稿与纯黑静音 · 合成回归',shots:[
 {shotId:'draft',prompt:'Reuse silent test clip.',duration:15,width:864,height:480,dialogueEvents:[],sourceExcerpt:text,screenCards:[{title:'输入草稿（未发送）',text,effect:'type-delete'}]},
 {shotId:'black',renderMode:'black',prompt:'Pure black silent frame.',duration:4,width:864,height:480,dialogueEvents:[]}
 ]});
 const ffmpeg='C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
 execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i','film-runs/film_31432432082bf266/clip-2.mp4','-vf','tpad=stop_mode=clone:stop_duration=12','-af','apad','-t',String((17*Math.round((15*24-5)/17)+5)/24),'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(dir,'clip-0.mp4')],{windowsHide:true});
 fs.copyFileSync(path.join(dir,'clip-0.mp4'),path.join(dir,'source-0.mp4'));plan.shots[0].ready=true;
 const run={...plan,id,status:'pending',createdAt:new Date().toISOString()};await work(run);
 if(run.status!=='complete')throw Error(run.error);if(run.shots.some(s=>s.jobId))throw Error('合成测试不应产生模型任务');
 fs.writeFileSync('test-artifacts/composition-live.json',JSON.stringify({id,status:run.status},null,2));console.log(JSON.stringify({id,status:run.status}));
})().catch(e=>{console.error(e);process.exitCode=1});
