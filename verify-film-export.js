const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),{work}=require('./film-api');
const id='film_0000000000000001',dir=path.join(__dirname,'film-runs',id);
fs.mkdirSync(dir,{recursive:true});
const exe='C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const names=['JOB_mu4cdi044u55','JOB_mu4cexit5d08','JOB_mu4cgmzu1blr'];
for(const [i,name] of names.entries()){
 const r=spawnSync(exe,['-y','-i',path.join('C:\\AI\\Comfy UI\\ComfyUI\\output\\AI_MOVIE_STUDIO',name+'_00001_.mp4'),'-vf','scale=1280:720','-c:v','libx264','-preset','fast','-c:a','aac','-ar','48000','-ac','2',path.join(dir,`clip-${i}.mp4`)],{windowsHide:true,encoding:'utf8'});
 if(r.status!==0)throw Error(r.stderr.slice(-1000));
}
const run={id,projectId:'export-integration-test',title:'合成器验证（三个已有试镜）',shots:names.map((name,i)=>({shotId:name,duration:5,ready:true,subtitle:['广州，七月。','余额：603.72 元','手机又震了一下。他没翻。'][i]}))};
work(run).then(()=>{console.log(JSON.stringify({status:run.status,error:run.error,file:path.join(dir,'movie.mp4')}));if(run.status!=='complete')process.exitCode=1});
