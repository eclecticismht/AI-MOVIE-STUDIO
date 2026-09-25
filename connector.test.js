const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
test('reference videos reach H3 as frame batches with distinct image and video labels',async()=>{
 const request=harness(async()=>({ok:true,json:async()=>({})}));
 const references=[{assetId:'photo',kind:'images',name:'Photo',notes:'State for this shot only: framing',file:'ams-ref-'+'a'.repeat(64)+'.png'},{assetId:'video',kind:'videos',name:'Motion',notes:'State for this shot only: bicycle movement',file:'ams-video-'+'b'.repeat(64)+'.mp4'}];
 assert.equal((await request('POST','/jobs',{id:'media-test',prompt:'integrated_multimodal_description: Ride.\noverall_soundscape: Traffic.\nnon_diegetic_music: N/A',duration:5,references})).status,202);
 const graph=(await request('GET','/jobs/media-test/graph')).data.prompt;
 assert.equal(graph['40'].class_type,'LoadVideo');assert.equal(graph['41'].class_type,'GetVideoComponents');assert.deepEqual(graph['8'].inputs['ref_videos.ref_video_0'],['41',0]);assert.deepEqual(graph['8'].inputs['ref_images.ref_image_0'],['20',0]);assert.match(graph['5'].inputs.global_prompt,/<Video 1>/);assert.match(graph['5'].inputs.global_prompt,/<Picture 1>/);assert.equal(graph['8'].inputs['ref_video_audios.ref_video_audio_0'],undefined);
});

function harness(fetchImpl) {
  let handler, saved='[]';
  const context=vm.createContext({
    require(name) {
      if(name==='http')return {createServer(fn){handler=fn;return {listen(){}}}};
      if(name==='fs')return {readFileSync(){return saved},writeFileSync(path,value){saved=value},renameSync(){}};
      return require(name);
    },
    __dirname:__dirname,process:{env:{}},console,Buffer,fetch:async(...args)=>{const r=await fetchImpl(...args);if(!r.text)r.text=async()=>JSON.stringify(await r.json());return r;},AbortSignal,URL
  });
  vm.runInContext(fs.readFileSync('local-connector.js','utf8'),context);
  return async function request(method,url,payload) {
    const req=new EventEmitter();Object.assign(req,{method,url});
    const result=new Promise(resolve=>{
      const res={writeHead(status){this.status=status},end(raw){resolve({status:this.status,data:JSON.parse(raw)})}};
      handler(req,res);
    });
    if(payload!==undefined)req.emit('data',JSON.stringify(payload));
    req.emit('end');
    return result;
  };
}
const reply=data=>({ok:true,json:async()=>data});
const job={id:'test',prompt:'A city at dawn',duration:5};
test('successful queue deletion with an empty HTTP body is recorded as cancelled',async()=>{
 const request=harness(async(url,options={})=>{
  if(url.endsWith('/prompt'))return reply({prompt_id:'p1'});
  if(options.method==='POST')return {ok:true,status:200,text:async()=>''};
  return reply({queue_running:[],queue_pending:[[1,'p1']]});
 });
 await request('POST','/jobs',job);await request('POST','/jobs/test/comfy');
 const result=await request('POST','/jobs/test/cancel');assert.equal(result.status,200);assert.ok(result.data.job.cancelledAt);
 assert.equal((await request('GET','/jobs/test/status')).data.job.connectorStatus,'已取消');
});

test('first frame drives I2VA with the actual image, not a reference-only graph',async()=>{
 const request=harness(async()=>reply({})),firstFrame={file:'ams-ref-'+'a'.repeat(64)+'.png'};
 assert.equal((await request('POST','/jobs',{...job,firstFrame,dialogueEvents:[]})).status,202);
 const graph=(await request('GET','/jobs/test/graph')).data.prompt;
 assert.match(graph['1'].inputs.unet_name,/fl2va/);assert.match(graph['5'].inputs.task_type,/^i2v/);
 assert.equal(graph['20'].inputs.image,firstFrame.file);assert.equal(graph['8'].class_type,'MiniMaxH3DirectorGroupImageToVideo');
 assert.match(graph['8'].inputs.prompt,/0.00 seconds/);assert.match(graph['8'].inputs.prompt,/No spoken words/);assert.equal(graph['5'].inputs.r2v_groups,undefined);
 assert.equal((await request('POST','/jobs',{...job,id:'bad-first',firstFrame:{file:'../../file'}})).status,400);
 assert.equal((await request('POST','/jobs',{...job,id:'missing-first',mode:'I2VA'})).status,400);
});

test('asset images reach LoadImage and Ref2VA conditioning with stable numbered labels',async()=>{
  const request=harness(async()=>reply({prompt_id:'ref-task'}));
  const references=['characters','scenes','props'].map((kind,i)=>({assetId:'a'+i,kind,name:'asset'+i,notes:'keep appearance',file:'ams-ref-'+String(i).repeat(64)+'.png'}));
  assert.equal((await request('POST','/jobs',{...job,references})).status,202);
  const graph=(await request('GET','/jobs/test/graph')).data.prompt;
  assert.match(graph['1'].inputs.unet_name,/ref2va/);
  assert.match(graph['5'].inputs.task_type,/^r2v/);
  assert.deepEqual(Array.from(graph['5'].inputs.r2v_groups),['8',0]);
  references.forEach((ref,i)=>{assert.equal(graph[String(20+i)].inputs.image,ref.file);assert.deepEqual(Array.from(graph['8'].inputs['ref_images.ref_image_'+i]),[String(20+i),0]);assert.ok(graph['8'].inputs.prompt.includes('<Picture '+(i+1)+'>'))});
  assert.equal(graph['8'].inputs.duration_sec,graph['5'].inputs.total_frames/24);
  assert.equal((await request('POST','/jobs',{...job,id:'bad-ref',references:[{...references[0],file:'../../secret.png'}]})).status,400);
  assert.equal((await request('POST','/jobs',{...job,id:'no-ref',mode:'Ref2VA'})).status,400);
});

test('custom H3 dimensions survive acceptance and reach the actual graph',async()=>{
  const request=harness(async()=>reply({}));
  assert.equal((await request('POST','/jobs',{...job,width:736,height:1280})).status,202);
  const graph=(await request('GET','/jobs/test/graph')).data.prompt;
  assert.equal(graph['5'].inputs.width,736);assert.equal(graph['5'].inputs.height,1280);
  assert.equal((await request('POST','/jobs',{...job,id:'bad',width:1920,height:1080})).status,400);
});

test('real queue state distinguishes waiting from execution',async()=>{
  const request=harness(async url=>reply(url.endsWith('/prompt')?{prompt_id:'p1'}:url.endsWith('/queue')?{queue_running:[[0,'other']],queue_pending:[[1,'p1']]}:{}));
  await request('POST','/jobs',job);await request('POST','/jobs/test/comfy');
  const result=await request('GET','/jobs/test/status');
  assert.equal(result.data.job.progress.phase,'queued');assert.equal(result.data.job.progress.ahead,1);
});

test('long audiovisual prompts retain dialogue and audio sections in the render graph',async()=>{
  const request=harness(async()=>reply({}));
  const prompt='integrated_multimodal_description: '+ '画面'.repeat(1200)+'\n\noverall_soundscape: Phone vibrates twice.\n\nnon_diegetic_music: N/A';
  await request('POST','/jobs',{...job,prompt});
  const graph=await request('GET','/jobs/test/graph');
  assert.equal(graph.data.prompt['5'].inputs.global_prompt,prompt);
});

test('concurrent and repeated submissions create only one upstream task',async()=>{
  let calls=0,release;
  const request=harness(async()=>{calls++;await new Promise(r=>release=r);return reply({prompt_id:'p1'})});
  await request('POST','/jobs',job);
  const first=request('POST','/jobs/test/comfy');
  assert.equal((await request('POST','/jobs/test/comfy')).status,409);
  release();assert.equal((await first).status,202);
  assert.equal((await request('POST','/jobs',{...job,prompt:'changed',comfyPromptId:'forged'})).data.job.comfyPromptId,'p1');
  assert.equal((await request('POST','/jobs/test/comfy')).status,200);
  assert.equal(calls,1);
});

for(const key of ['videos','gifs','images'])test(`sync recognizes video in ${key}, ignoring preview images`,async()=>{
  const request=harness(async url=>reply(url.endsWith('/prompt')?{prompt_id:'p1'}:{p1:{status:{completed:true,status_str:'success'},outputs:{preview:{images:[{filename:'preview.png'}]},save:{[key]:[{filename:'final clip.mp4',subfolder:'studio',type:'output'}]}}}}));
  await request('POST','/jobs',job);await request('POST','/jobs/test/comfy');
  const result=await request('GET','/jobs/test/status');
  assert.equal(result.data.job.connectorStatus,'ComfyUI H3 已完成');
  assert.match(result.data.job.videoUrl,/final%20clip.mp4/);
  assert.ok(result.data.job.completedAt);
});

test('execution errors surface and completed images are not treated as videos',async()=>{
  let record={status:{status_str:'error',messages:[['execution_error',{exception_message:'Out of memory'}]]}};
  const request=harness(async url=>reply(url.endsWith('/prompt')?{prompt_id:'p1'}:{p1:record}));
  await request('POST','/jobs',job);await request('POST','/jobs/test/comfy');
  assert.match((await request('GET','/jobs/test/status')).data.job.connectorStatus,/Out of memory/);
  record={status:{completed:true},outputs:{preview:{images:[{filename:'preview.png'}]}}};
  const result=(await request('GET','/jobs/test/status')).data.job;
  assert.match(result.connectorStatus,/未找到视频/);assert.equal(result.videoUrl,undefined);
});

test('cancelled tasks cannot be sent and invalid payloads are rejected',async()=>{
  const request=harness(async()=>{throw Error('Unexpected upstream request')});
  for(const invalid of [null,{}, {id:2,prompt:'hello'}, {id:'test',prompt:[]}])assert.equal((await request('POST','/jobs',invalid)).status,400);
  await request('POST','/jobs',job);await request('POST','/jobs/test/cancel');
  assert.equal((await request('POST','/jobs/test/comfy')).status,409);
});

test('failed upstream cancellation never records a successful cancellation',async()=>{
  const request=harness(async(url,options)=>{
    if(url.endsWith('/prompt'))return reply({prompt_id:'p1'});
    if(!options.method)return reply({queue_running:[]});
    return {ok:false,status:500,json:async()=>({error:'Queue unavailable'})};
  });
  await request('POST','/jobs',job);await request('POST','/jobs/test/comfy');
  assert.equal((await request('POST','/jobs/test/cancel')).status,502);
  assert.equal((await request('GET','/jobs')).data.jobs[0].cancelledAt,undefined);
});

test('application inline scripts parse',()=>{
  const html=fs.readFileSync('AI_MOVIE_STUDIO.html','utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(match[1]));
});

test('sync failures preserve state and repeated results create one review entry',async()=>{
  const html=fs.readFileSync('AI_MOVIE_STUDIO.html','utf8');
  const source=html.split('\n').find(line=>line.startsWith('async function syncComfyJob(id)'));
  let fail=true;
  const data={jobs:[{id:'test',projectId:'project',shot:'shot',status:'已提交 ComfyUI H3'}],generations:[],shots:[{id:'shot',projectId:'project',status:'等待 Worker'}],connector:{endpoint:'http://local'}};
  data.jobs[0].sourceFingerprint=await require('./film-source-sync').fingerprint(data.shots[0],data);
  const context=vm.createContext({ResultGuard:require('./result-guard'),D:data,AbortSignal,alert(){},persist(){},go(){},uid:()=> 'gen1',fetch:async()=>{
    if(fail)throw Error('Offline');
    return reply({job:{connectorStatus:'ComfyUI H3 已完成',comfyPromptId:'p1',videoUrl:'http://local/video.mp4'}});
  }});
  vm.runInContext(source,context);
  await vm.runInContext('syncComfyJob("test")',context);
  assert.equal(data.jobs[0].status,'已提交 ComfyUI H3');
  fail=false;
  await vm.runInContext('syncComfyJob("test")',context);
  await vm.runInContext('syncComfyJob("test")',context);
  assert.equal(data.generations.length,1);
  assert.equal(data.shots[0].status,'待审核');
  assert.equal(data.jobs[0].comfyPromptId,'p1');
});
