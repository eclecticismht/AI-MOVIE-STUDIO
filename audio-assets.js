const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const ROOT=path.join(__dirname,'audio-assets');
const FFMPEG=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
function wavDuration(bytes){
 if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('声音素材不是标准 WAV');
 let rate=0,length=0;for(let offset=12;offset+8<=bytes.length;){const name=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);if(offset+8+size>bytes.length)throw Error('声音文件不完整');if(name==='fmt '&&size>=16)rate=bytes.readUInt32LE(offset+16);if(name==='data')length+=size;offset+=8+size+(size%2)}
 if(!rate||!length)throw Error('无法读取声音时长');return length/rate;
}
function duration(file){return wavDuration(fs.readFileSync(resolveAudioAsset(file)))}
function resolveAudioAsset(file){
 if(typeof file!=='string'||!/^ams-audio-[a-f0-9]{64}\.wav$/.test(file))throw Error('请选择有效的独立环境音素材');
 const result=path.join(ROOT,file);if(!fs.existsSync(result))throw Error('环境音素材缺失，请重新导入');return result;
}
async function importAudio(dataUrl){
 const m=/^data:audio\/(?:wav|x-wav|wave|mpeg|mp3);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');if(!m)throw Error('请选择 WAV 或 MP3 音频');
 const bytes=Buffer.from(m[1],'base64');if(bytes.length<44||bytes.length>20*1024*1024)throw Error('声音素材须在20MB以内');
 const format=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'?'wav':bytes.toString('ascii',0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224?'mp3':null;if(!format)throw Error('声音文件格式与内容不符');
 const file='ams-audio-'+crypto.createHash('sha256').update(bytes).digest('hex')+'.wav';fs.mkdirSync(ROOT,{recursive:true});
 const target=path.join(ROOT,file);if(fs.existsSync(target))return {file};
 const temp=path.join(ROOT,crypto.randomBytes(12).toString('hex')),input=temp+'.input',output=temp+'.wav';fs.writeFileSync(input,bytes);
 try{await new Promise((resolve,reject)=>execFile(FFMPEG,['-y','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-f',format,'-i',input,'-vn','-t','600','-ac','2','-ar','48000','-c:a','pcm_s16le',output],{windowsHide:true,timeout:60000},e=>e?reject(Error('声音文件无法解码，请换一份 WAV 或 MP3')):resolve()));
 if(fs.statSync(output).size<=44)throw Error('声音文件没有可用音轨');fs.renameSync(output,target);return {file};
 }finally{for(const f of [input,output])if(fs.existsSync(f))fs.unlinkSync(f)}
}
async function audioAssetApi(req,res,pathname){
 if(pathname!=='/api/audio-assets')return false;
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))};
 try{if(req.method!=='POST')throw Error('请通过导入按钮添加声音素材');if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw Error('请从本地工作室导入');
 let raw='',size=0;for await(const c of req){size+=c.length;if(size>29000000)throw Error('音频文件过大');raw+=c}send(201,await importAudio(JSON.parse(raw).dataUrl));
 }catch(e){send(400,{error:e.message})}return true;
}
module.exports={resolveAudioAsset,importAudio,audioAssetApi,wavDuration,duration};
