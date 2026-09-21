const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveAudioAsset,importAudio}=require('./audio-assets');
test('audio import refuses paths, arbitrary data and missing assets',async()=>{
 assert.throws(()=>resolveAudioAsset('../private.wav'));assert.throws(()=>resolveAudioAsset('ams-audio-'+'f'.repeat(64)+'.wav'));
 await assert.rejects(importAudio('file:///private.wav'));await assert.rejects(importAudio('data:audio/wav;base64,YWJj'));
 await assert.rejects(importAudio('data:audio/wav;base64,'+Buffer.from('#EXTM3U\nfile:///private.txt\n'.repeat(4)).toString('base64')),/格式/);
});
