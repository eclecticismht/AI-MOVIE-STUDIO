const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Contract=require('./performance-audio-contract'),Dialogue=require('./dialogue-contract'),{resolveAudioAsset}=require('./audio-assets');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function pcm(bytes){
 if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('H3 请先将声音导入工作室');
 let format,data;for(let at=12;at+8<=bytes.length;){const size=bytes.readUInt32LE(at+4),kind=bytes.toString('ascii',at,at+4);if(at+8+size>bytes.length)throw Error('H3 配音文件不完整');const part=bytes.subarray(at+8,at+8+size);if(kind==='fmt ')format=part;if(kind==='data')data=part;at+=8+size+(size%2)}
 if(!format||format.length<16||!data?.length)throw Error('H3 配音缺少音频数据');
 const code=format.readUInt16LE(0),bits=format.readUInt16LE(14),channels=format.readUInt16LE(2),rate=format.readUInt32LE(4);
 if(!(code===1||code===65534&&format.length>=40&&format.readUInt32LE(24)===1)||channels!==2||rate!==48000||![16,24].includes(bits)||data.length%(2*bits/8))throw Error('H3 请重新导入配音为48kHz双声道PCM');
 return {data,bits,samples:data.length/(2*bits/8)};
}
function wav(data){const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(data.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(288000,28);header.writeUInt16LE(6,32);header.writeUInt16LE(24,34);header.write('data',36);header.writeUInt32LE(data.length,40);return Buffer.concat([header,data])}
function prepare(input){
 const events=Dialogue.validateEvents(input.dialogueEvents),duration=Number(input.duration),count=Contract.frames(duration),key=Contract.speechKey(events);
 const sourceFile=resolveAudioAsset(input.file),sourceBytes=fs.readFileSync(sourceFile),source=pcm(sourceBytes),start=Number(input.trimIn??0),end=Number(input.trimOut??source.samples/48000),offset=Number(input.offset??0);
 if(![start,end,offset].every(Number.isFinite)||start<0||end<=start||end>source.samples/48000+1/48000||offset<0)throw Error('H3 配音裁切时间超出原文件，请核对入点和出点');
 const binding={version:1,file:input.file,sha256:digest(sourceBytes),duration,frames:count,speechKey:key};Contract.validate(binding,{duration,dialogueEvents:events});
 const first=Math.round(start*48000),last=Math.round(end*48000),lead=Math.round(offset*48000),total=count*2000;
 if(last<=first)throw Error('H3 配音裁切后为空，请重新选择入出点');
 if(lead+last-first>total)throw Error(`H3 本镜实际${(count/24).toFixed(3)}秒，容不下所选配音；请增加镜头时长，不能裁断尾音`);
 const output=Buffer.alloc(total*6),selected=source.data.subarray(first*2*source.bits/8,last*2*source.bits/8);
 if(source.bits===24)selected.copy(output,lead*6);else for(let i=0;i<selected.length/2;i++)output.writeIntLE(selected.readInt16LE(i*2)*256,lead*6+i*3,3);
 const bytes=wav(output),sha256=digest(bytes),file='ams-audio-'+sha256+'.wav',target=path.join(path.dirname(sourceFile),file);
 if(fs.existsSync(target)){if(digest(fs.readFileSync(target))!==sha256)throw Error('H3 已有配音副本校验失败，原文件已保留')}else fs.writeFileSync(target,bytes,{flag:'wx'});
 return {version:1,file,sha256,duration,frames:count,speechKey:key,source:{file:input.file,sha256:digest(sourceBytes),bits:source.bits,trimIn:first/48000,trimOut:last/48000,offset:lead/48000}};
}
function validate(binding,shot){
 const result=Contract.validate(binding,shot);if(!result)return undefined;
 const bytes=fs.readFileSync(resolveAudioAsset(result.file)),audio=pcm(bytes);
 if(digest(bytes)!==result.sha256||audio.bits!==24||audio.samples!==result.frames*2000)throw Error('H3 已绑定配音内容或长度改变，已停止提交，请重新核对声音');
 return result;
}
function prompt(base,refs,binding,events){
 const sections=['subject_definitions','summary','retention_analysis','detailed_description','overall_soundscape','non_diegetic_music'];
 const referenced=require('./reference-assets').referencePrompt(base,refs),parts={};
 for(let i=0;i<sections.length;i++){const label=sections[i]+':',start=referenced.indexOf(label),end=i+1<sections.length?referenced.indexOf(sections[i+1]+':',start+label.length):-1;parts[sections[i]]=start<0?'':referenced.slice(start+label.length,end<0?undefined:end).trim()}
 if(!refs.length){parts.detailed_description=base.split('overall_soundscape:')[0].replace(/^integrated_multimodal_description:\s*/,'');parts.non_diegetic_music='N/A'}
 const voice=events.find(e=>e.type==='speech'),index=refs.findIndex(r=>r.assetId===voice.speakerId),speaker=index<0?voice.speakerName:`<Subject ${index+1}>`;
 parts.subject_definitions+='\n<Audio 1> is the approved, time-aligned spoken performance for '+speaker+' (S1).';
 parts.summary='[reference generation + audio reuse] Follow the referenced appearance and the approved timing of <Audio 1>. '+parts.summary;
 parts.retention_analysis+='\n<Audio 1>: fully_copy - reuse this complete audio track, including pauses and breaths; no regeneration or time stretching.';
 parts.detailed_description+=`\n\n<Audio 1> controls the entire ${(binding.frames/24).toFixed(3)}-second timeline. ${voice.delivery==='onscreen'?speaker+' (S1) aligns visible speech articulation with the recorded syllables, stops and breaths.':'The speech stays off screen; visible characters must not mouth these words.'} Do not add words, singing, captions or subtitles. Keep reaction timing responsive without extending pauses.`;
 parts.overall_soundscape='Retain <Audio 1> as the exact final track. Additional ambience and effects will be mixed separately in post-production.';parts.non_diegetic_music='N/A';
 return sections.map(key=>key+':\n'+parts[key].trim()).join('\n\n');
}
async function upload(binding,shot,comfyUrl,fetchImpl=fetch){
 const checked=validate(binding,shot),bytes=fs.readFileSync(resolveAudioAsset(checked.file));
 const form=new FormData();form.append('image',new Blob([bytes],{type:'audio/wav'}),checked.file);form.append('type','input');form.append('overwrite','false');
 const response=await fetchImpl(comfyUrl+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(30000)}),out=await response.json();
 if(!response.ok||out.name!==checked.file||out.subfolder)throw Error('H3 配音参考上传失败，未提交视频生成');
 const verify=await fetchImpl(comfyUrl+'/view?'+new URLSearchParams({filename:checked.file,type:'input'}),{signal:AbortSignal.timeout(30000)});
 if(!verify.ok||digest(Buffer.from(await verify.arrayBuffer()))!==checked.sha256)throw Error('H3 配音上传后校验失败，未提交视频生成');
 return checked;
}
async function api(req,res,pathname){
 if(pathname!=='/api/performance-audio')return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 try{
  if(req.method==='GET'){let connected=false;try{const r=await fetch('http://127.0.0.1:8080/health',{signal:AbortSignal.timeout(3000)});connected=r.ok&&(await r.json()).performanceAudioVersion===1}catch{}send(200,{version:1,connectorReady:connected});return true}
  if(req.method!=='POST')throw Error('请使用配音参考编辑器');
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw Error('请从本地工作室保存配音');
  const input=JSON.parse(await require('./request-body').readUtf8(req,30000,'配音绑定请求过大'));send(201,{binding:prepare(input)});
 }catch(e){send(400,{error:e.message})}return true;
}
module.exports={prepare,validate,prompt,upload,api,pcm,wav};
