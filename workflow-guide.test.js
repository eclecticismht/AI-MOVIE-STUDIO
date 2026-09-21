const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summary,pace}=require('./workflow-guide');
const {rendererReadiness}=require('./renderer-readiness');
test('renderer probe distinguishes unavailable and non-Comfy services without submitting work',async()=>{
  assert.equal((await rendererReadiness('http://local',async()=>{throw Error('offline')})).ok,false);
  assert.equal((await rendererReadiness('http://local',async()=>({ok:true,json:async()=>({})}))).ok,false);
  assert.equal((await rendererReadiness('http://local',async(url,options)=>{assert.equal(url,'http://local/system_stats');assert.equal(options.method,undefined);return {ok:true,json:async()=>({devices:[]})}})).ok,true);
});
test('project guidance separates saved queue, remote submissions, failures and review',()=>{
  const data={projects:[{id:'p',storyText:'开场'}],scripts:[{projectId:'p'}],shots:[{projectId:'p'},{projectId:'p',autoArchived:true}],jobs:[{projectId:'p',status:'等待本地 H3 Connector'},{projectId:'p',comfyPromptId:'remote',status:'已提交'},{projectId:'p',status:'发送失败'},{projectId:'other',status:'发送失败'},{projectId:'p',status:'已取消'}]};
  const s=summary(data,'p');assert.deepEqual([s.shots,s.pending,s.running,s.failed],[1,1,1,1]);assert.equal(s.next.page,'gen');
  data.jobs=[];data.generations=[{projectId:'p',status:'历史结果'},{projectId:'p',status:'待审核'}];assert.equal(summary(data,'p').review,1);assert.equal(summary(data,'p').next.page,'review');
});
test('pacing recommendations leave dialogue unchanged and ignore screen text',()=>{
  const events=[{type:'speech',text:'我不是西门庆，我叫西门清，明月松间照，清泉石上流的清。'}],before=JSON.stringify(events);
  assert.match(pace(events,8),/对白节奏建议/);assert.equal(pace(events,12),'');assert.equal(pace([{type:'screen',text:'a'.repeat(80)}],4),'');assert.equal(JSON.stringify(events),before);
});
test('failed preflight blocks batch before images are uploaded or jobs saved',async()=>{
  const vm=require('node:vm'),fs=require('node:fs');let uploads=0,saves=0,message='';
  const p={id:'p'},shot={id:'s',projectId:'p',status:'待制作'};
  const context=vm.createContext({D:{activeProjectId:'p',jobs:[],shots:[shot]},activeProject:()=>p,projectShots:()=>[shot],document:{getElementById:()=>({set textContent(v){message=v}})},editingShotId:null,renderShots2:()=>{},localStorage:{setItem(){saves++}},workflowPreflight:async()=>{throw Error('渲染器未启动')},prepareStoryboardJob:async()=>{uploads++}});
  vm.runInContext(fs.readFileSync('storyboard.js','utf8'),context);
  await vm.runInContext('queueVisibleStoryboardShots()',context);
  assert.equal(uploads,0);assert.equal(saves,0);assert.match(message,/渲染器未启动/);assert.equal(shot.status,'待制作');
});
test('retry submits only unsent current-project jobs and preserves remote jobs',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),sent=[];
  const jobs=[{id:'wait',projectId:'p',status:'等待本地 H3 Connector'},{id:'retry',projectId:'p',status:'发送失败：fetch failed'},{id:'remote',projectId:'p',status:'发送失败',comfyPromptId:'remote-id'},{id:'cancel',projectId:'p',status:'已取消'},{id:'other',projectId:'other',status:'发送失败'},{id:'blocked',projectId:'p',status:'提交已阻止'}];
  const context=vm.createContext({D:{activeProjectId:'p',connector:{endpoint:'http://local'},jobs},fetch:async()=>({ok:true,json:async()=>({ok:true})}),AbortSignal,document:{querySelector:()=>null},renderShots2(){},renderCockpit(){},renderGeneration(){},dispatchJob:async id=>sent.push(id),renderQueueMessages:new Map()});
  vm.runInContext(fs.readFileSync('workflow-guide-ui.js','utf8'),context);
  await vm.runInContext('startRenderQueue()',context);
  assert.deepEqual(sent,['wait','retry']);assert.equal(jobs[2].comfyPromptId,'remote-id');
  sent.length=0;context.fetch=async()=>{throw Error('offline')};await vm.runInContext('startRenderQueue()',context);assert.equal(sent.length,0);
});
