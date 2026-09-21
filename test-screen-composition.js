// Reuse existing QA clips; this test performs only local composition, no model generation.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {makeAss}=require('./film-api');
const run=JSON.parse(fs.readFileSync('film-runs/film_85cecde483a0e862/run.json','utf8'));
run.shots[2].sourceExcerpt='再转五百呗\n我在买单';run.shots[2].screenCards=[{title:'微信消息',text:'再转五百呗\n我在买单'}];
fs.writeFileSync('test-artifacts/screen-composition.ass',makeAss(run.shots));
const assPath=path.resolve('test-artifacts/screen-composition.ass').replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
const ffmpeg=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
const result=spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i','film-runs/film_85cecde483a0e862/joined.mp4','-vf',`ass=filename='${assPath}'`,'-c:v','libx264','-preset','fast','-crf','20','-c:a','copy','-movflags','+faststart','test-artifacts/screen-composition.mp4'],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status;
