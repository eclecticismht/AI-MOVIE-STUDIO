const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{work}=require('./film-api');
(async()=>{
 const id=process.argv[2]||'film_b9a17b28f2b68b18';if(!/^film_[a-f0-9]{16}$/.test(id))throw Error('Invalid run ID');
 const parent=JSON.parse(fs.readFileSync(path.join('film-runs',id,'run.json')));
 const run={...parent,id:'film_'+crypto.randomBytes(8).toString('hex'),projectId:'screen-render-validation',title:'四镜屏幕展示验收',shots:parent.shots.slice(0,4),compositionOnly:true,status:'pending'};
 if(!run.shots.every(s=>s.ready&&s.renderMode==='screen'))throw Error('Screen clips are not ready');
 delete run.pauseRequested;delete run.qualityHold;
 fs.mkdirSync(path.join('film-runs',run.id),{recursive:true});
 for(let i=0;i<4;i++)for(const prefix of ['source','clip'])fs.copyFileSync(path.join('film-runs',parent.id,`${prefix}-${i}.mp4`),path.join('film-runs',run.id,`${prefix}-${i}.mp4`));
 await work(run);if(run.status!=='complete')throw Error(run.error);fs.writeFileSync('test-artifacts/screen-sequence-validation.json',JSON.stringify({id:run.id},null,2));console.log(run.id);
})().catch(e=>{console.error(e.message);process.exitCode=1});
