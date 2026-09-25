// Local project snapshots. Media stays at its existing path; secrets are excluded.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),backup=require('./project-backup');
function createStore(dir=path.join(__dirname,'.runtime','workspace'),io=fs){
 const file=path.join(dir,'current.json');
 function read(){return io.existsSync(file)?JSON.parse(io.readFileSync(file,'utf8')):{revision:null,data:null}}
 function archive(data){
  // Recovery copies preserve even legacy duplicate IDs; promotion still validates.
  const clean=JSON.parse(backup.encode(data)).data;if(!clean||!Array.isArray(clean.projects)||!Array.isArray(clean.shots))throw Error('没有可备份的工作区');
  const revision=crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex'),name='recovery-'+Date.now()+'-'+revision.slice(0,12)+'.json';
  io.mkdirSync(dir,{recursive:true});io.writeFileSync(path.join(dir,name),JSON.stringify({revision,savedAt:new Date().toISOString(),data:clean}));
  return {name,revision,projects:clean.projects.length,shots:clean.shots.length};
 }
 function save(data,baseRevision,{allowProjectReplacement=false}={}){
  const clean=backup.decode(backup.encode(data)),current=read();
  if(baseRevision!==current.revision){const error=Error('磁盘版本已变化，未覆盖。请先下载本页备份，再选择要继续使用的版本。');error.status=409;throw error}
  if(!allowProjectReplacement&&current.data?.projects?.some(p=>p.id!=='P001')&&require('./workspace-bootstrap').isDemo(clean)){const error=Error('已阻止示例数据覆盖现有项目。请载入磁盘版本找回原有内容。');error.status=409;throw error}
  const revision=crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex');
  if(revision===current.revision)return current;
  io.mkdirSync(dir,{recursive:true});
  if(current.data){const previous=path.join(dir,'snapshot-'+Date.now()+'-'+current.revision.slice(0,12)+'.json');io.writeFileSync(previous,JSON.stringify(current));}
  const next={revision,savedAt:new Date().toISOString(),data:clean},temp=file+'.tmp';
  io.writeFileSync(temp,JSON.stringify(next));io.renameSync(temp,file);
  const snapshots=io.readdirSync(dir).filter(n=>/^snapshot-.*\.json$/.test(n)).sort().reverse();
  for(const name of snapshots.slice(20))try{io.unlinkSync(path.join(dir,name))}catch{}
  return next;
 }
 return {read,save,archive};
}
function createWorkspaceApi(store=createStore()){
 return async(req,res,url)=>{
  if(url==='/api/workspace/bootstrap.js'){
   if(req.method!=='GET'){res.writeHead(405);res.end();return true}
   try{res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end('globalThis.workspaceDiskStartup='+JSON.stringify(store.read())+';')}catch{res.end('globalThis.workspaceDiskStartup=null;')}
   return true;
  }
  if(!['/api/workspace','/api/workspace/archive'].includes(url))return false;
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   if(url==='/api/workspace/archive'){
    if(req.method!=='POST'){send(405,{error:'不支持此操作'});return true}
    const body=JSON.parse(await require('./request-body').readUtf8(req,50*1024*1024,'工作区超过 50 MB'));send(200,store.archive(body.data));return true;
   }
   if(req.method==='GET')send(200,store.read());
   else if(req.method==='PUT'){
    const text=await require('./request-body').readUtf8(req,50*1024*1024,'工作区超过 50 MB，请将内嵌媒体导入素材目录');
    const body=JSON.parse(text),saved=store.save(body.data,body.baseRevision,{allowProjectReplacement:body.allowProjectReplacement===true});send(200,{revision:saved.revision,savedAt:saved.savedAt});
   }else send(405,{error:'不支持此操作'});
  }catch(error){send(error.status||400,{error:error.message})}
  return true;
 };
}
module.exports={createStore,createWorkspaceApi};
