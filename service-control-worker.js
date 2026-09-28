const {spawn}=require('node:child_process'),path=require('node:path');
const {createOperationStore}=require('./studio-control'),{buildId}=require('./service-lifecycle');
const WEB='http://127.0.0.1:4173',CONNECTOR='http://127.0.0.1:8080',COMFY='http://127.0.0.1:8188';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(base,route,body){
 const r=await fetch(base+route,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
 const out=await r.json();if(!r.ok)throw Error(out.error||'服务暂时不可用');return out;
}
function runScript(name){return new Promise((resolve,reject)=>{
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,name),'-NoBrowser'],{cwd:__dirname,windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';
 child.stderr.on('data',data=>error=(error+data).slice(-3000));child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Object.assign(Error('本地服务未能启动，请查看服务操作记录中的错误详情。'),{detail:error})));
})}
async function runOperation(op,{record,cancelled=()=>false,req=request,pause=sleep,start=()=>runScript('start-local-services.ps1'),startRenderer=()=>runScript('start-renderer-service.ps1'),currentBuild=buildId,now=Date.now}={}){
 const endpoints=[CONNECTOR,WEB],lease=op.id,deadline=now()+12*60*60*1000;
 let draining=false,stopped=false;
 const update=(phase,message,extra={})=>record({...op,...extra,phase,message,updatedAt:new Date(now()).toISOString()});
 const checkCancel=()=>{if(cancelled())throw Object.assign(Error('已取消等待，服务和任务保持运行'),{cancelled:true})};
 async function release(){for(const base of endpoints)try{await req(base,'/api/service-lifecycle',{action:'cancel',lease})}catch{}draining=false}
 async function states(){
  const values=[];for(const base of endpoints){const state=await req(base,'/api/service-lifecycle');if(state.version!==1||state.role!==(base===WEB?'web':'connector')||!Array.isArray(state.busy))throw Error('运行中的服务尚不支持安全更新，请使用桌面按钮激活本次更新');if(state.installation!==op.installation)throw Error('端口属于另一份工作室，未关闭任何服务');values.push(state)}return values;
 }
 async function rendererBusy(){
  let queue;try{queue=await req(COMFY,'/queue')}catch(error){if(error.cause?.code==='ECONNREFUSED')return [];throw error}
  if(!Array.isArray(queue.queue_running)||!Array.isArray(queue.queue_pending))throw Error('无法确认生成队列，未关闭服务');
  return queue.queue_running.length||queue.queue_pending.length?['H3正在生成或排队']:[];
 }
 async function waitStopped(base,oldPid){
  for(let i=0;i<60;i++){
   try{const state=await req(base,'/api/service-lifecycle');if(state.pid!==oldPid)throw Error('服务已被其他操作重新启动，请检查状态')}catch(error){if(error.cause?.code==='ECONNREFUSED')return;if(!['ECONNRESET','UND_ERR_SOCKET'].includes(error.cause?.code))throw error}
   await pause(500);
  }throw Error('服务尚未退出，未强制结束进程');
 }
 async function verify(){
  const live=await states(),audio=await req(WEB,'/api/performance-audio');
  if(!audio.connectorReady||live.some(s=>s.build!==op.expectedBuild))throw Error('服务已启动，但更新版本尚未匹配，请检查状态');
  return {webPid:live[1].pid,connectorPid:live[0].pid,build:live[0].build};
 }
 try{
  checkCancel();
  if(op.action==='start'){
   update('starting','正在启动本地服务…');await start();await startRenderer();
   await states();const audio=await req(WEB,'/api/performance-audio'),renderer=await req(COMFY,'/system_stats');
   if(!audio.connectorReady||!renderer.system)throw Error('服务已启动，版本或渲染器尚未就绪；请查看连接状态');
   update('complete','服务已就绪，可以继续制作。');return;
  }
  for(;;){
   checkCancel();if(now()>deadline)throw Error('等待超过12小时，已取消本次服务操作');
   const before=await states(),busy=[...new Set([...before.flatMap(s=>s.busy),...await rendererBusy()])];
   if(busy.length){update('waiting','等待任务结束：'+busy.join('；'));await pause(5000);continue}
   if(currentBuild()!==op.expectedBuild)throw Error('等待期间程序再次修改，请完成验证后重新执行');
   update('applying',op.action==='exit'?'正在安全退出…':'正在加载已验证的更新…');
   draining=true;for(const base of endpoints)await req(base,'/api/service-lifecycle',{action:'prepare',lease});
   const guarded=await states();
   if(guarded.some(s=>s.busy.length)||(await rendererBusy()).length){await release();update('waiting','检测到新任务，继续等待完成…');await pause(5000);continue}
   checkCancel();
   for(const [index,base] of endpoints.entries()){
    await req(base,'/api/service-lifecycle',{action:'stop',lease});stopped=true;
    await waitStopped(base,guarded[index].pid);
   }
   draining=false;break;
  }
  if(op.action==='exit'){update('complete','网页和连接服务已退出。素材与历史记录保留，H3保持原状态。');return}
  update('starting','正在启动更新后的服务…');await start();
  const result=await verify();update('complete','重启完成，网页与连接服务版本已核验。',result);
 }catch(error){
  if(draining)await release();
  // If only one service closed, restore availability without touching GPU jobs.
  if(stopped)try{await start()}catch{}
  update(error.cancelled?'cancelled':'failed',error.message,error.detail?{errorDetails:error.detail}:{});
 }
}
async function main(id){
 const store=createOperationStore(),op=store.read();if(!op||op.id!==id||op.phase!=='queued')return;
 const record=value=>store.write({...value,workerPid:process.pid});
 record({...op,updatedAt:new Date().toISOString()});
 const heartbeat=setInterval(()=>{const latest=store.read();if(latest?.id===id)record({...latest,updatedAt:new Date().toISOString()})},10000);
 try{await runOperation(op,{record,cancelled:()=>store.cancelled(id)})}finally{clearInterval(heartbeat)}
}
if(require.main===module)main(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={runOperation,WEB,CONNECTOR,COMFY};
