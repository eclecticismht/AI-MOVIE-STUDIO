const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const ACTIVE=new Set(['queued','waiting','applying','starting']);
function createOperationStore(root=__dirname){
 const dir=path.join(root,'.runtime','service-control'),file=path.join(dir,'operation.json');
 const read=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 function write(value){
  if(!/^[a-f0-9-]{36}$/.test(value.id))throw Error('操作编号无效');
  fs.mkdirSync(dir,{recursive:true});const text=JSON.stringify(value,null,2);
  // Retain completed and failed operations when a later button press becomes current.
  for(const target of [path.join(dir,value.id+'.json'),file]){const temp=target+'.'+process.pid+'.tmp';fs.writeFileSync(temp,text);fs.renameSync(temp,target)}return value;
 }
 const cancelFile=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('操作编号无效');return path.join(dir,id+'.cancel')};
 return {dir,read,write,cancel:id=>fs.writeFileSync(cancelFile(id),'cancel'),cancelled:id=>fs.existsSync(cancelFile(id))};
}
function launchWorker(id,root=__dirname){
 const child=spawn(process.execPath,[path.join(root,'service-control-worker.js'),id],{cwd:root,detached:true,windowsHide:true,stdio:'ignore'});child.unref();
 return new Promise((resolve,reject)=>{child.once('spawn',()=>resolve(child.pid));child.once('error',reject)});
}
function createControlApi(lifecycle,{store=createOperationStore(),launch=launchWorker,now=Date.now,alive=pid=>{try{process.kill(pid,0);return true}catch{return false}}}={}){
 let launching=false;
 function operation(){const op=store.read();if(op&&ACTIVE.has(op.phase)&&now()-Date.parse(op.updatedAt)>120000&&!alive(op.workerPid))return {...op,phase:'failed',message:'服务操作未完成；原任务保留，请重试。'};return op}
 return async(req,res,pathname)=>{
  if(pathname!=='/api/studio-control')return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true};
  try{
   if(req.method==='GET')return send(200,{service:lifecycle.status(),operation:operation()});
   if(req.method!=='POST')return send(405,{error:'请求方式无效'});
   const body=JSON.parse(await require('./request-body').readUtf8(req,4096));
   if(!['start','restart','exit','cancel'].includes(body.action))throw Error('请选择启动、重启或退出');
   const current=operation();
   if(body.action==='cancel'){
    if(!current||body.id!==current.id||!['queued','waiting'].includes(current.phase))throw Error('此操作已开始执行，无法取消');
    store.cancel(current.id);return send(202,{operation:{...current,message:'正在取消等待…'}});
   }
   if(launching)throw Error('正在登记服务操作，请稍后查看状态');
   if(current&&ACTIVE.has(current.phase)){
    if(current.action===body.action)return send(202,{operation:current});
    throw Error('已有服务操作在等待或执行，请先取消等待');
   }
   launching=true;
   try{
    const stamp=new Date(now()).toISOString(),op={id:crypto.randomUUID(),action:body.action,phase:'queued',message:'操作已登记，正在检查服务…',createdAt:stamp,updatedAt:stamp,expectedBuild:require('./service-lifecycle').buildId(),installation:require('./service-lifecycle').installationId()};
    store.write(op);
    try{await launch(op.id)}catch(error){store.write({...op,phase:'failed',message:'无法启动服务操作：'+error.message,updatedAt:new Date(now()).toISOString()});throw error}
    return send(202,{operation:store.read()});
   }finally{launching=false}
  }catch(error){return send(409,{error:error.message})}
 };
}
module.exports={ACTIVE,createOperationStore,createControlApi,launchWorker};
