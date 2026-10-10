// Local sound-only exports. A sound mix is never counted as a completed episode.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('./sound-design'),R=require('./sound-design-render');
const ROOT=path.join(__dirname,'sound-runs'),active=new Set();
const store=require('./workspace-api').createStore();
function save(run){fs.mkdirSync(path.join(ROOT,run.id),{recursive:true});fs.writeFileSync(path.join(ROOT,run.id,'run.json'),JSON.stringify(run,null,2));}
function publicRun(r){return {id:r.id,projectId:r.projectId,scopeId:r.scopeId,title:r.title,status:r.status,message:r.message,createdAt:r.createdAt,seconds:r.plan?.duration,soundOnly:true,...(r.status==='complete'?{url:'/sound-runs/'+r.id+'/mix.wav',stems:M.TRACKS.map(t=>({...t,url:'/sound-runs/'+r.id+'/'+t.id+'.wav'})),reviewStatus:r.report?.reviewStatus,peakDb:r.report?.peakDb}:{}),sourceFingerprint:r.sourceFingerprint};}
function list(projectId){if(!projectId)return [];if(!fs.existsSync(ROOT))return [];return fs.readdirSync(ROOT).filter(n=>/^snd_[a-f0-9]{16}$/.test(n)).flatMap(n=>{try{const r=JSON.parse(fs.readFileSync(path.join(ROOT,n,'run.json'),'utf8'));return r.projectId===projectId?[r]:[]}catch{return []}}).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50);}
async function work(run){active.add(run.id);try{run.status='rendering';save(run);run.report=await R.renderStems(run.plan,path.join(ROOT,run.id),{onProgress:message=>{run.message=message;save(run)}});run.status='complete';run.message='五轨声音候选已导出；不是视频成片，仍需听审与画面对点。';}catch(e){run.status='failed';run.message=e.message;}finally{active.delete(run.id);save(run);}}
async function api(req,res,pathname){
 if(!pathname.startsWith('/api/sound-design'))return false;
 const send=(code,out)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(out));};
 try{
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw Error('请从本地AMS操作');
  const url=new URL(req.url,'http://localhost');
  if(pathname==='/api/sound-design'&&req.method==='GET'){const projectId=url.searchParams.get('projectId');send(200,{version:1,tracks:M.TRACKS,sampleRate:48000,bits:24,soundOnly:true,exports:list(projectId).map(publicRun)});return true;}
  if(pathname==='/api/sound-design'&&req.method==='POST'){
   const body=JSON.parse(await require('./request-body').readUtf8(req,1000000,'声音方案过大'));const data=store.read().data||{},plan=M.assertReady(body.plan,data,body.projectId),scope=data.projects.find(p=>p.id===body.projectId)?.soundDesigns?.[body.scopeId];
   if(!scope||M.signature(scope)!==M.signature(body.plan))throw Error('请先保存当前声音方案；磁盘方案与提交内容不一致');
   for(const lock of Object.values(plan.voiceLocks||{})){if(await R.hash(require('./audio-assets').resolveAudioAsset(lock.sourceFile))!==lock.sha256)throw Error('固定声源文件内容已变化，不能重用旧混音结果');}
   const sourceFingerprint=crypto.createHash('sha256').update(M.signature({projectId:body.projectId,scopeId:body.scopeId,plan})).digest('hex');const prior=list(body.projectId).find(r=>r.sourceFingerprint===sourceFingerprint&&(r.status==='complete'&&fs.existsSync(path.join(ROOT,r.id,'mix.wav'))||active.has(r.id)));
   if(prior){send(200,publicRun(prior));return true;}if(active.size)throw Error('已有声音合成在执行，请完成后再试');
   const run={id:'snd_'+crypto.randomBytes(8).toString('hex'),projectId:body.projectId,scopeId:body.scopeId,title:plan.title,plan,sourceFingerprint,status:'pending',message:'准备本地分轨混音',createdAt:new Date().toISOString()};save(run);void work(run);send(202,publicRun(run));return true;
  }
  const m=/^\/api\/sound-design\/(snd_[a-f0-9]{16})$/.exec(pathname);if(m&&req.method==='GET'){const r=JSON.parse(fs.readFileSync(path.join(ROOT,m[1],'run.json'),'utf8'));if(['pending','rendering'].includes(r.status)&&!active.has(r.id)){r.status='failed';r.message='服务重启中断声音导出，源素材保留，请从已保存方案重新导出。';}send(200,publicRun(r));return true;}
  send(404,{error:'声音接口不存在'});
 }catch(e){send(400,{error:e.message})}return true;
}
module.exports={api,isBusy:()=>active.size>0,publicRun,list,work};
