const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveAudioAsset,importAudio}=require('./audio-assets');
test('audio import refuses paths, arbitrary data and missing assets',async()=>{
 assert.throws(()=>resolveAudioAsset('../private.wav'));assert.throws(()=>resolveAudioAsset('ams-audio-'+'f'.repeat(64)+'.wav'));
 await assert.rejects(importAudio('file:///private.wav'));await assert.rejects(importAudio('data:audio/wav;base64,YWJj'));
 await assert.rejects(importAudio('data:audio/wav;base64,'+Buffer.from('#EXTM3U\nfile:///private.txt\n'.repeat(4)).toString('base64')),/格式/);
});

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ffmpeg=process.env.FFMPEG_PATH||'C:\\AI\\Comfy UI\\ComfyUI\\.venv\\Lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
test('24-bit audio import preserves low bits and keeps an existing legacy conversion untouched',{skip:!fs.existsSync(ffmpeg)},async()=>{
 const bytes=Buffer.alloc(44+48000*6);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(288000,28);bytes.writeUInt16LE(6,32);bytes.writeUInt16LE(24,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);
 const sample=(Number.parseInt(crypto.randomBytes(2).toString('hex'),16)&0x3fff)*256+37;
 for(let i=44;i<bytes.length;i+=3)bytes.writeIntLE(sample,i,3);
 const oldFile=path.join(__dirname,'audio-assets','ams-audio-'+crypto.createHash('sha256').update(bytes).digest('hex')+'.wav'),oldBytes=Buffer.from('legacy conversion fixture');
 fs.mkdirSync(path.dirname(oldFile),{recursive:true});assert.equal(fs.existsSync(oldFile),false);fs.writeFileSync(oldFile,oldBytes,{flag:'wx'});let created;
 try{
  const first=await importAudio('data:audio/wav;base64,'+bytes.toString('base64'));created=resolveAudioAsset(first.file);assert.notEqual(created,oldFile);
  const output=fs.readFileSync(created);let fmt,data;
  for(let offset=12;offset+8<=output.length;){const name=output.toString('ascii',offset,offset+4),size=output.readUInt32LE(offset+4);if(name==='fmt ')fmt=offset+8;if(name==='data')data=offset+8;offset+=8+size+(size%2)}
  assert.equal(output.readUInt16LE(fmt+14),24);assert.equal(output.readUInt32LE(fmt+4),48000);assert.equal(output.readUInt16LE(fmt+2),2);assert.equal(output.readIntLE(data,3),sample);assert.deepEqual(fs.readFileSync(oldFile),oldBytes);
  assert.deepEqual(await importAudio('data:audio/wav;base64,'+bytes.toString('base64')),first);
 }finally{if(created)fs.unlinkSync(created);fs.unlinkSync(oldFile)}
});
