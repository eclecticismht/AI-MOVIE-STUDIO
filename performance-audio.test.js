const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const Contract=require('./performance-audio-contract'),Dialogue=require('./dialogue-contract');
const event={type:'speech',speakerId:'xm',speakerName:'西门清',delivery:'onscreen',text:'今天换，四十了，我今年最迷惑，你知道吗。'};
const events=[event],shot={duration:4,dialogueEvents:events},file='ams-audio-'+'a'.repeat(64)+'.wav';
function harness(){
 const files=new Map(),root=path.resolve('virtual-audio'),module={exports:{}},resolve=f=>{if(!/^ams-audio-[a-f0-9]{64}\.wav$/.test(f))throw Error('invalid asset');return path.join(root,f)};
 const context=vm.createContext({module,Buffer,FormData,Blob,AbortSignal,URLSearchParams,require(name){
  if(name==='node:fs')return {readFileSync:p=>{if(!files.has(p))throw Error('missing');return files.get(p)},existsSync:p=>files.has(p),writeFileSync(p,b,o){assert.equal(o.flag,'wx');assert.equal(files.has(p),false);files.set(p,b)}};
  if(name==='./audio-assets')return {resolveAudioAsset:resolve};return require(name);
 }});vm.runInContext(fs.readFileSync('performance-audio.js','utf8'),context);
 return {api:module.exports,files,resolve};
}
function fixture(h){const bytes=h.api.wav(Buffer.alloc(48000*6));for(let i=44;i<bytes.length;i+=3)bytes.writeIntLE(1234567*(i%2?-1:1),i,3);h.files.set(h.resolve(file),bytes);return bytes}
test('approved PCM24 range is preserved exactly, padded without speed changes and reproducible',()=>{
 const h=harness(),source=fixture(h),binding=h.api.prepare({file,duration:4,dialogueEvents:events,trimIn:.1,trimOut:.8,offset:.2}),out=h.api.pcm(h.files.get(h.resolve(binding.file)));
 assert.equal(binding.duration,4);assert.equal(binding.frames,90);assert.equal(out.samples,180000);assert.equal(out.bits,24);
 assert.deepEqual(out.data.subarray(.2*48000*6,.9*48000*6),h.api.pcm(source).data.subarray(.1*48000*6,.8*48000*6));
 assert.equal(out.data.subarray(0,.2*48000*6).some(x=>x),false);assert.equal(out.data.subarray(.9*48000*6).some(x=>x),false);
 assert.equal(JSON.stringify(h.api.validate(binding,shot)),JSON.stringify(binding));assert.equal(h.api.prepare({file,duration:4,dialogueEvents:events,trimIn:.1,trimOut:.8,offset:.2}).file,binding.file);
});
test('out of range, overflow, empty and multi-speaker references never create prepared files',()=>{
 const h=harness();fixture(h);for(const change of [{trimIn:-1},{trimOut:2},{offset:3.5},{trimIn:.000001,trimOut:.000002},{duration:3},{dialogueEvents:[event,{...event,speakerId:'other'}]}])assert.throws(()=>h.api.prepare({file,duration:4,dialogueEvents:events,...change}));assert.equal(h.files.size,1);
});
test('text, delivery, speaker, nominal duration, image mode and source mutations invalidate the binding',()=>{
 const h=harness();fixture(h);const b=h.api.prepare({file,duration:4,dialogueEvents:events});
 for(const change of [{duration:4.01},{dialogueEvents:[{...event,text:'新台词'}]},{dialogueEvents:[{...event,delivery:'offscreen'}]},{dialogueEvents:[{...event,speakerId:'other'}]},{firstFrame:{file:'x'}},{continueFromShotId:'prior'},{renderMode:'black'},{audioMode:'replacement'}])assert.throws(()=>h.api.validate(b,{...shot,...change}));
 const bytes=h.files.get(h.resolve(b.file));bytes[100]^=1;assert.throws(()=>h.api.validate(b,shot),/内容或长度/);
});
test('16-bit legacy samples promote losslessly, keeping original bytes unchanged',()=>{
 const h=harness(),bytes=Buffer.alloc(44+48000*4),header=h.api.wav(Buffer.alloc(48000*6)).subarray(0,44);header.copy(bytes);bytes.writeUInt32LE(bytes.length-8,4);bytes.writeUInt32LE(192000,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.writeUInt32LE(bytes.length-44,40);for(let i=44;i<bytes.length;i+=2)bytes.writeInt16LE(-12345,i);
 h.files.set(h.resolve(file),bytes);const before=Buffer.from(bytes),b=h.api.prepare({file,duration:4,dialogueEvents:events});assert.equal(h.api.pcm(h.files.get(h.resolve(b.file))).data.readIntLE(0,3),-12345*256);assert.deepEqual(bytes,before);assert.equal(b.source.bits,16);
});
test('upload verifies the exact returned audio and rejects changed bytes before generation',async()=>{
 const h=harness();fixture(h);const b=h.api.prepare({file,duration:4,dialogueEvents:events}),calls=[];
 const fetchImpl=async(url,options)=>{calls.push(url);if(options.method==='POST'){assert.equal(await options.body.get('image').arrayBuffer().then(x=>crypto.createHash('sha256').update(Buffer.from(x)).digest('hex')),b.sha256);assert.equal(options.body.get('overwrite'),'false');return {ok:true,json:async()=>({name:b.file,subfolder:''})}}return {ok:true,arrayBuffer:async()=>h.files.get(h.resolve(b.file))}};
 assert.equal((await h.api.upload(b,shot,'http://comfy',fetchImpl)).file,b.file);assert.equal(calls.length,2);
 await assert.rejects(h.api.upload(b,shot,'http://comfy',async(url,options)=>options.method?{ok:true,json:async()=>({name:b.file})}:{ok:true,arrayBuffer:async()=>Buffer.from('different')}),/校验失败/);
});
test('verified fast speech keeps exact Chinese words and six H3 reference sections',()=>{
 const h=harness();fixture(h);const b=h.api.prepare({file,duration:4,dialogueEvents:events});assert.throws(()=>Dialogue.bindDialogue('visual',events,4),/台词过长/);
 const ref={assetId:'xm',kind:'characters',name:'西门清',notes:'restrained',file:'ams-ref-'+'b'.repeat(64)+'.png'};
 const text=h.api.prompt(Dialogue.bindDialogue('integrated_multimodal_description: [Shot 1] restrained reply.\noverall_soundscape: quiet\nnon_diegetic_music: N/A',events,4,[ref],undefined,true),[ref],b,events);
 assert.match(text,/<Audio 1>: fully_copy/);assert.match(text,/<Subject 1> \(S1\) aligns visible/);assert.ok(text.includes('<d>[Chinese]'+event.text+'</d>'));
 assert.deepEqual(text.match(/^\w+:/gm),['subject_definitions:','summary:','retention_analysis:','detailed_description:','overall_soundscape:','non_diegetic_music:']);
});
