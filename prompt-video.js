const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pattern=/^ams-video-[a-f0-9]{64}\.mp4$/;
async function uploadVideo(file,comfyUrl,fetchImpl=fetch){
 if(!pattern.test(file||''))throw Error('参考视频地址无效');
 const target=path.join(__dirname,'assets','imported',file),bytes=fs.readFileSync(target);
 if(bytes.length>50*1024*1024)throw Error('参考视频过大');
 const form=new FormData();form.append('image',new Blob([bytes],{type:'video/mp4'}),file);form.append('type','input');form.append('overwrite','true');
 const response=await fetchImpl(comfyUrl+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(60000)}),out=await response.json();
 if(!response.ok||out.name!==file||out.subfolder)throw Error('参考视频未能送达渲染器');return {file};
}
async function promptVideoApi(req,res,pathname){
 if(pathname!=='/api/prompt-video')return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))};
 if(req.method!=='POST'){send(405,{error:'请上传视频'});return true;}
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){send(403,{error:'请从本地工作室上传'});return true;}
 let temporary;
 try{
  const formats={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'},ext=formats[req.headers['content-type']];if(!ext)throw Error('请选择 MP4、WebM 或 MOV 视频');
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>50*1024*1024)throw Error('参考视频不能超过 50 MB');chunks.push(chunk)}const bytes=Buffer.concat(chunks);
  const valid=ext==='webm'?bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])):bytes.toString('ascii',4,8)==='ftyp';if(!valid)throw Error('视频内容与格式不符');
  const file='ams-video-'+crypto.createHash('sha256').update(bytes).digest('hex')+'.mp4',dir=path.join(__dirname,'assets','imported');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,file);
  if(req.headers['x-media-purpose']==='source'){
   const source='asset-'+crypto.createHash('sha256').update(bytes).digest('hex')+'.'+ext;
   fs.writeFileSync(path.join(dir,source),bytes);
   const poster=await require('./asset-media-api').videoPoster(path.join(dir,source));
   send(201,{url:'/assets/imported/'+source,posterUrl:'/assets/imported/'+poster});return true;
  }
  if(!fs.existsSync(target)){
   temporary=path.join(dir,'upload-'+crypto.randomBytes(8).toString('hex'));fs.writeFileSync(temporary+'.source.'+ext,bytes);
   const ffmpeg=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
   const stdout=await new Promise((resolve,reject)=>require('node:child_process').execFile(ffmpeg,['-y','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',temporary+'.source.'+ext,'-t','16','-an','-vf','fps=8,scale=768:768:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-pix_fmt','yuv420p','-crf','23','-progress','pipe:1',temporary+'.mp4'],{windowsHide:true,timeout:90000,maxBuffer:1024*1024},(error,out)=>error?reject(Error('视频无法解码，请换用可播放的视频')):resolve(out)));
   const frames=[...stdout.matchAll(/^frame=(\d+)/gm)].map(m=>Number(m[1])).at(-1)||0;if(frames<1||frames>120)throw Error('参考视频请使用 15 秒以内的片段');
   fs.renameSync(temporary+'.mp4',target);
  }
  send(201,{file,url:'/assets/imported/'+file});
 }catch(e){send(400,{error:e.message})}finally{if(temporary)for(const ext of ['mp4','source.mp4','source.mov','source.webm']){const f=temporary+'.'+ext;if(fs.existsSync(f))fs.unlinkSync(f)}}return true;
}
module.exports={uploadVideo,promptVideoApi,pattern};
