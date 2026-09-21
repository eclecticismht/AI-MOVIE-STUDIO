// Bounded local export check. Existing footage only; compositionOnly forbids GPU dispatch.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{work}=require('./film-api');
(async()=>{
 const parent=require('./film-runs/film_2b2cc5d8e21a4d0d/run.json'),source=parent.shots[6];
 const id='film_'+crypto.randomBytes(8).toString('hex'),dir=path.join('film-runs',id);fs.mkdirSync(dir);
 for(const prefix of ['source','clip'])fs.copyFileSync(path.join('film-runs',parent.id,`${prefix}-6.mp4`),path.join(dir,`${prefix}-0.mp4`));
 const run={id,projectId:'framing-acceptance',title:'画面裁切与原句字幕验证',shots:[{...structuredClone(source),sequence:1,cropBottomPercent:15}],compositionOnly:true,qualityGate:true,alignSubtitles:true,asrModel:'medium',status:'pending',createdAt:new Date().toISOString()};
 await work(run);fs.writeFileSync('test-artifacts/framing-acceptance.json',JSON.stringify({id,status:run.status,error:run.error,path:path.join(dir,'movie.mp4')},null,2));console.log(run.status,run.error||id);if(run.status!=='complete')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
