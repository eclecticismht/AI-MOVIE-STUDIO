const fs=require('node:fs'),crypto=require('node:crypto');
const {validatePlan,work}=require('./film-api');
(async()=>{
 const original=JSON.parse(fs.readFileSync('film-runs/film_e7bd45a903055b1b/run.json')).shots[3];
 const image=await require('./reference-assets').uploadReference('data:image/png;base64,'+fs.readFileSync('assets/laoshiren-v2/moments-v2.png').toString('base64'),'http://127.0.0.1:8188',fetch);
 original.references=original.references.map(r=>r.assetId==='PR_mu4cv5kfij02'?{...r,...image}:r);
 const plan=validatePlan({projectId:'screen-render-validation',title:'朋友圈资产展示验收',shots:[{...original,renderMode:'screen',screenAssetId:'PR_mu4cv5kfij02',screenImagePercent:52,firstFrame:undefined,continueFromShotId:undefined}]});
 const run={...plan,id:'film_'+crypto.randomBytes(8).toString('hex'),qualityGate:true,alignSubtitles:true,status:'pending',createdAt:new Date().toISOString()};
 fs.writeFileSync('test-artifacts/screen-render-validation.json',JSON.stringify({id:run.id},null,2));
 await work(run);console.log(JSON.stringify({id:run.id,status:run.status,error:run.error}));if(run.status!=='complete')process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
