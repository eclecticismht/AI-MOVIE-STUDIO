const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Contract=require('./performance-audio-contract');
const events=[{type:'speech',speakerId:'xm',speakerName:'西门清',delivery:'onscreen',text:'今天换。'}],binding={version:1,file:'ams-audio-'+'a'.repeat(64)+'.wav',sha256:'a'.repeat(64),duration:4,frames:90,speechKey:Contract.speechKey(events)};
test('export restores approved PCM with aligned source duration and rejects a different video length',()=>{
 const module={exports:{}},context=vm.createContext({module,__dirname,process,URL,Buffer,require(name){if(name==='./performance-audio')return {validate:Contract.validate};if(name==='./audio-assets')return {resolveAudioAsset:()=>'/verified.wav'};return require(name)}});
 vm.runInContext(fs.readFileSync('timeline-export-api.js','utf8'),context);
 const input={projectId:'p',clips:[{shotId:'s',url:'/film-runs/film_0123456789abcdef/clip-0.mp4',sourceDuration:3.75,trimIn:.25,trimOut:3.5,audioMode:'model',performanceAudio:binding,performanceDuration:4,dialogueEvents:events}]},plan=module.exports.validate(input);
 assert.equal(plan.clips[0].audioMode,'voiceover');assert.equal(plan.clips[0].audioAsset,binding.file);assert.equal(plan.clips[0].trimIn,.25);assert.equal(plan.clips[0].trimOut,3.5);assert.equal(input.clips[0].audioMode,'model');
 input.clips[0].sourceDuration=5;assert.throws(()=>module.exports.validate(input),/长度不匹配/);
});
test('timeline refuses pairing a newly bound recording with an old video version',()=>{
 const shot={dur:4,performanceAudio:binding},module={exports:{}},context=vm.createContext({module,shot,PerformanceAudio:Contract,shotDialogueEvents:()=>events,tlMedia:()=>({performanceAudio:binding}),tlMount(){},tlInspector(){},tlTools(){},go(){},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);context.tlMedia=()=>({performanceAudio:binding});assert.equal(vm.runInContext('cutPerformanceAudio(shot).file',context),binding.file);
 context.tlMedia=()=>({videoUrl:'old.mp4'});assert.throws(()=>vm.runInContext('cutPerformanceAudio(shot)',context),/所选视频未使用当前配音/);
});
