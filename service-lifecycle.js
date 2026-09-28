// A short, renewable drain prevents new work between the idle check and shutdown.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function buildId(root=__dirname){
 const hash=crypto.createHash('sha256');
 for(const name of fs.readdirSync(root).filter(n=>/\.(js|ps1|html|css)$/.test(n)&&!n.endsWith('.test.js')).sort())hash.update(name).update(fs.readFileSync(path.join(root,name)));
 return hash.digest('hex');
}
const installationId=(root=__dirname)=>crypto.createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex');
function createLifecycle({role,busy=()=>[],now=Date.now,exit=()=>process.exit(0),build=buildId(),pid=process.pid,installation=installationId()}={}){
 let server,lease=null,expires=0,stopping=false,requests=0;
 const startedAt=new Date(now()).toISOString();
 const draining=()=>stopping||!!(lease&&expires>now());
 const reasons=()=>[...(requests?['正在处理页面请求或传输素材']:[]),...busy()];
 const status=()=>({version:1,role,pid,build,installation,startedAt,draining:draining(),stopping,busy:reasons()});
 function send(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
 async function control(req,res){
  try{
   if(req.method==='GET'){send(res,200,status());return}
   if(req.method!=='POST'){send(res,405,{error:'请求方式无效'});return}
   const body=JSON.parse(await require('./request-body').readUtf8(req,2048));
   if(!/^[a-f0-9-]{36}$/.test(body.lease||''))throw Error('服务操作编号无效');
   if(body.action==='prepare'){
    if(stopping||(draining()&&lease!==body.lease))throw Error('已有服务操作正在执行');
    lease=body.lease;expires=now()+30000;send(res,200,status());return;
   }
   if(lease!==body.lease||!draining())throw Error('服务操作已过期，请重试');
   if(body.action==='cancel'&&!stopping){lease=null;expires=0;send(res,200,status());return}
   if(body.action!=='stop')throw Error('服务操作无效');
   if(reasons().length){send(res,409,{error:'仍有工作未完成',...status()});return}
   if(!server)throw Error('服务关闭接口尚未就绪');
   stopping=true;send(res,202,{...status(),accepted:true});
   // close() drains connections; never force-kill a renderer, child or HTTP request.
   server.close(()=>exit());server.closeIdleConnections?.();
  }catch(error){send(res,409,{error:error.message})}
 }
 function wrap(handler,{port,origins=[]}={}){return async(req,res)=>{
  const denied=require('./local-request').requestError(req,{port,origins});
  if(denied){send(res,403,{error:denied});return}
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/service-lifecycle'){await control(req,res);return}
  if(draining()&&pathname!=='/api/studio-control'){
   res.setHeader?.('Retry-After','2');send(res,503,{error:'服务正在安全更新，请稍后重试',maintenance:true});return;
  }
  if(pathname==='/api/studio-control'){await handler(req,res);return}
  requests++;let finished=!res.once,handled=false,counted=true;
  const release=()=>{if(counted&&finished&&handled){requests--;counted=false}};
  res.once?.('finish',()=>{finished=true;release()});res.once?.('close',()=>{finished=true;release()});
  try{await handler(req,res)}catch(error){if(!res.headersSent)send(res,500,{error:error.message});else res.destroy?.()}finally{handled=true;release()}
 }};
 return {status,draining,wrap,attach:value=>{server=value}};
}
module.exports={buildId,installationId,createLifecycle};
