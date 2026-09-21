const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAX_BYTES=5*1024*1024;
const formats={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
async function videoPoster(file){
 const poster=file+'.poster.jpg';if(fs.existsSync(poster))return path.basename(poster);
 const temporary=poster+'.'+crypto.randomBytes(6).toString('hex')+'.jpg';
 const ffmpeg=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
 try{
  await new Promise((resolve,reject)=>require('node:child_process').execFile(ffmpeg,['-y','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',file,'-map','0:v:0','-frames:v','1','-vf','scale=1024:1024:force_original_aspect_ratio=decrease','-q:v','2',temporary],{windowsHide:true,timeout:30000},error=>error?reject(Error('视频无法读取画面，请换用可播放的 MP4、WebM 或 MOV 文件')):resolve()));
  if(!fs.existsSync(temporary)||fs.statSync(temporary).size<32)throw Error('视频中没有可用画面');fs.renameSync(temporary,poster);return path.basename(poster);
 }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
}
function validateMedia(type,bytes){
 if(!formats[type])throw Error('请选择 PNG、JPEG、WebP、GIF 图片或 MP4、WebM、MOV 视频');
 if(!bytes.length||bytes.length>MAX_BYTES)throw Error('单个资产文件不能超过 5 MB');
 const valid=type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:type==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':type==='image/gif'?/^GIF8[79]a/.test(bytes.toString('ascii',0,6)):type==='video/webm'?bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])):bytes.toString('ascii',4,8)==='ftyp';
 if(!valid)throw Error('资产文件内容与格式不符');
 return 'asset-'+crypto.createHash('sha256').update(bytes).digest('hex')+'.'+formats[type];
}
async function assetMediaApi(req,res,pathname){
 if(pathname!=='/api/asset-media')return false;
 const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
 if(req.method!=='POST'){send(405,{error:'请使用上传操作'});return true;}
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'请从本地工作室操作'});return true;}
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BYTES)throw Error('单个资产文件不能超过 5 MB');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks),name=validateMedia(req.headers['content-type'],bytes),dir=path.join(__dirname,'assets','imported');
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),bytes);
  const poster=req.headers['content-type'].startsWith('video/')?await videoPoster(path.join(dir,name)):null;
  send(201,{url:'/assets/imported/'+name,...(poster?{posterUrl:'/assets/imported/'+poster}:{})});
 }catch(error){send(400,{error:error.message})}return true;
}
module.exports={MAX_BYTES,validateMedia,assetMediaApi,videoPoster};
