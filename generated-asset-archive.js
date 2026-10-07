const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

const categories={firstFrame:'首帧',h3Video:'H3镜头',master:'成片'};
const contentTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska'};
function safePart(value){return String(value||'asset').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^\.+|\.+$/g,'').slice(0,100)||'asset'}
function projectRoot(root,projectId){
 if(typeof projectId!=='string'||!projectId||projectId.length>128||/[\\/\x00-\x1f]/.test(projectId))return null;
 try{const config=JSON.parse(fs.readFileSync(path.join(root,'.runtime','generated-assets-archive.json'),'utf8')),target=config.projects?.[projectId];if(typeof target!=='string'||!path.isAbsolute(target))return null;return path.resolve(target)}catch{return null}
}
function isEnabled(root,projectId){return !!projectRoot(root,projectId)}
function digestFile(file){return new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',chunk=>hash.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')))})}
async function uniqueDestination(base,category,key,filename,hash){
 const dir=path.join(base,category);fs.mkdirSync(dir,{recursive:true});const stem=safePart(key),name=safePart(filename),ext=path.extname(name),withoutExt=ext?name.slice(0,-ext.length):name;
 for(let i=1;i<1000;i++){const suffix=i===1?'':'-'+String(i).padStart(2,'0'),file=path.join(dir,stem+'_'+withoutExt+suffix+ext);if(!fs.existsSync(file))return file;if(await digestFile(file)===hash)return file}
 throw Error('归档文件名冲突过多');
}
async function writeRecord(base,projectId,kind,key,filename,file,metadata={}){
 const relativePath=path.relative(base,file).split(path.sep).join('/'),assetId=crypto.createHash('sha256').update([projectId,kind,key,relativePath].join('\0')).digest('hex').slice(0,24),record={assetId,projectId,kind,name:filename,relativePath,bytes:fs.statSync(file).size,sha256:await digestFile(file),createdAt:new Date().toISOString(),...(metadata.shotId?{shotId:safePart(metadata.shotId)}:{}),...(metadata.runId?{runId:safePart(metadata.runId)}:{})};
 const index=path.join(base,'.index');fs.mkdirSync(index,{recursive:true});const dest=path.join(index,assetId+'.json'),temporary=dest+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';fs.writeFileSync(temporary,JSON.stringify(record,null,2));fs.renameSync(temporary,dest);return record;
}
function publicRecord(root,record){return {...record,url:'/api/generated-assets/'+encodeURIComponent(record.projectId)+'/'+encodeURIComponent(record.assetId)}}
async function archiveBuffer({root=__dirname,projectId,kind,key,filename,bytes,shotId,runId}){
 const base=projectRoot(root,projectId);if(!base)return null;if(!categories[kind])throw Error('未知的生成资产类型');const ext=path.extname(filename||'').toLowerCase();if(!contentTypes[ext])throw Error('不支持归档此生成资产格式');const data=Buffer.from(bytes);if(!data.length)throw Error('不能归档空资产');
 const hash=crypto.createHash('sha256').update(data).digest('hex'),dest=await uniqueDestination(base,categories[kind],key,filename,hash),temporary=dest+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';
 if(!fs.existsSync(dest)){fs.writeFileSync(temporary,data);fs.renameSync(temporary,dest)}
 return publicRecord(root,await writeRecord(base,projectId,kind,key,filename,dest,{shotId,runId}));
}
async function archiveFile({root=__dirname,projectId,kind,key,filename,sourcePath,shotId,runId}){
 const base=projectRoot(root,projectId);if(!base)return null;if(!categories[kind])throw Error('未知的生成资产类型');const ext=path.extname(filename||sourcePath||'').toLowerCase();if(!contentTypes[ext])throw Error('不支持归档此生成资产格式');if(!fs.statSync(sourcePath).isFile())throw Error('归档来源不是文件');
 const hash=await digestFile(sourcePath),dest=await uniqueDestination(base,categories[kind],key,filename||path.basename(sourcePath),hash),temporary=dest+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';
 if(!fs.existsSync(dest)){fs.copyFileSync(sourcePath,temporary);fs.renameSync(temporary,dest)}
 return publicRecord(root,await writeRecord(base,projectId,kind,key,filename||path.basename(sourcePath),dest,{shotId,runId}));
}
async function archiveUrl({root=__dirname,projectId,kind,key,filename,url,fetchImpl=fetch,shotId,runId}){
 const base=projectRoot(root,projectId);if(!base)return null;if(!categories[kind])throw Error('未知的生成资产类型');const ext=path.extname(filename||'').toLowerCase();if(!contentTypes[ext])throw Error('不支持归档此生成资产格式');
 const response=await fetchImpl(url,{signal:AbortSignal.timeout(300000)});if(!response.ok||!response.body)throw Error('无法读取已生成的视频，归档未完成');const dir=path.join(base,categories[kind]);fs.mkdirSync(dir,{recursive:true});const temporary=path.join(dir,'.'+crypto.randomBytes(8).toString('hex')+'.tmp');
 try{await require('node:stream/promises').pipeline(require('node:stream').Readable.fromWeb(response.body),fs.createWriteStream(temporary));const hash=await digestFile(temporary),dest=await uniqueDestination(base,categories[kind],key,filename,hash);if(fs.existsSync(dest))fs.unlinkSync(temporary);else fs.renameSync(temporary,dest);return publicRecord(root,await writeRecord(base,projectId,kind,key,filename,dest,{shotId,runId}))}catch(error){if(fs.existsSync(temporary))fs.unlinkSync(temporary);throw error}
}
function list(root,projectId){
 const base=projectRoot(root,projectId);if(!base)return {enabled:false,assets:[]};const index=path.join(base,'.index'),assets=[];
 if(fs.existsSync(index))for(const filename of fs.readdirSync(index).filter(x=>/^[a-f0-9]{24}\.json$/.test(x))){try{const record=JSON.parse(fs.readFileSync(path.join(index,filename),'utf8')),file=path.resolve(base,...record.relativePath.split('/'));if(record.projectId===projectId&&file.startsWith(base+path.sep)&&fs.existsSync(file))assets.push(publicRecord(root,record))}catch{}}
 assets.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.assetId.localeCompare(b.assetId));return {enabled:true,assets};
}
function resolveAsset(root,projectId,assetId){
 const base=projectRoot(root,projectId);if(!base)return null;const item=list(root,projectId).assets.find(x=>x.assetId===assetId);if(!item)return null;const file=path.resolve(base,...item.relativePath.split('/'));if(!file.startsWith(base+path.sep)||!fs.existsSync(file))return null;return {file,type:contentTypes[path.extname(file).toLowerCase()]||'application/octet-stream',name:path.basename(file)};
}
async function api(root,req,res,pathname){
 if(pathname!=='/api/generated-assets'&&!pathname.startsWith('/api/generated-assets/'))return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 if(req.method==='GET'&&pathname==='/api/generated-assets'){const url=new URL(req.url,'http://localhost');const projectId=url.searchParams.get('projectId')||'';return send(200,{projectId,...list(root,projectId)})}
 const match=pathname.match(/^\/api\/generated-assets\/([^/]+)\/([a-f0-9]{24})$/);if(!match||!['GET','HEAD'].includes(req.method)){send(404,{error:'生成资产不存在'});return true}
 let projectId;try{projectId=decodeURIComponent(match[1])}catch{send(404,{error:'生成资产不存在'});return true}const asset=resolveAsset(root,projectId,match[2]);if(!asset){send(404,{error:'生成资产不存在'});return true}
 require('./media-response').sendFile(req,res,asset.file,asset.type);return true;
}
module.exports={archiveBuffer,archiveFile,archiveUrl,list,resolveAsset,isEnabled,api};
