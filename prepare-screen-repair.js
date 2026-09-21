const fs=require('fs');
const {uploadReference}=require('./reference-assets');
const id=process.argv[2];if(!/^film_[a-f0-9]{16}$/.test(id||''))throw Error('Invalid source');
(async()=>{
 const run=JSON.parse(fs.readFileSync(`film-runs/${id}/run.json`)),s=run.shots[58];
 const {file}=await uploadReference('data:image/png;base64,'+fs.readFileSync('assets/laoshiren-v2/moments-v2.png').toString('base64'),'http://127.0.0.1:8188');
 const body={revisions:[{index:58,revision:{prompt:s.prompt,subtitle:s.subtitle,duration:s.duration,screenReferenceFile:file}}]};
 fs.writeFileSync('test-artifacts/screen-repair-batch.json',JSON.stringify(body,null,2));
 console.log(JSON.stringify({source:id,file,shot:59}));
})().catch(e=>{console.error(e);process.exitCode=1});
