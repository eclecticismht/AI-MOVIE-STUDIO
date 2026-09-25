const test=require('node:test'),assert=require('node:assert/strict'),audio=require('./shot-audio'),quality=require('./film-quality'),{wavDuration}=require('./audio-assets');
const file='ams-audio-'+'a'.repeat(64)+'.wav',event={type:'speech',speakerId:'tv',speakerName:'电视新闻播音员',delivery:'offscreen',text:'三名航天员安全返回。'};
test('independent voice track allows verified offscreen speech but never replaces onscreen dialogue',()=>{
 assert.equal(audio.validate('voiceover',[event],file),'voiceover');assert.throws(()=>audio.validate('voiceover',[{...event,delivery:'onscreen'}],file),/画内/);assert.throws(()=>audio.validate('voiceover',[],file),/独立画外声/);assert.throws(()=>audio.validate('voiceover',[event],'../voice.wav'),/素材/);
});
test('voice quality checks the imported track instead of the silent generated video',async()=>{
 let inspected;const shot={audioMode:'voiceover',audioAsset:file,duration:8,dialogueEvents:[event]};
 const result=await quality.checkShot(shot,'model-silent.mp4','small',async input=>{inspected=input;return {segments:[{text:event.text,start:0.4,end:5}]}},asset=>{assert.equal(asset,file);return 'verified-voice.wav'});
 assert.equal(inspected,'verified-voice.wav');assert.equal(result.status,'text_match');assert.equal(shot.subtitleTiming.status,'aligned');
});
test('WAV duration is calculated from data chunks and truncated files are rejected',()=>{
 const b=Buffer.alloc(44+96000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(96000,40);assert.equal(wavDuration(b),1);assert.throws(()=>wavDuration(b.subarray(0,50)),/不完整/);
});

function previewContext(extra={}){
 const vm=require('node:vm'),fs=require('node:fs'),context=vm.createContext({tlMount(){},tlInspector(){},tlMedia(){},tlTools(){},go(){},window:{addEventListener(){}},...extra});
 vm.runInContext(fs.readFileSync('timeline-edit-ui.js','utf8'),context);return context;
}

test('timeline never restarts an ended voice recording while its picture continues',()=>{
 const vm=require('node:vm');let starts=0;const sound={paused:true,ended:true,currentTime:1,duration:1,readyState:4,loop:false,play(){starts++;return Promise.resolve()}};
 const context=previewContext({sound,TL:{time:2},tlClock(){},requestAnimationFrame(){return 1}});
 vm.runInContext('cutSettings=()=>({mix:{}});tlClips=()=>[{end:8}];cutUpdate=()=>{};CUT.slots=[{clip:{},video:{readyState:4,paused:false},audio:sound}];CUT.playing=true;CUT.last=0;cutTick(40)',context);
 assert.equal(starts,0);sound.ended=false;sound.currentTime=.3;vm.runInContext('cutTick(80)',context);assert.equal(starts,1);
});

test('voiceover preview mutes model audio and obeys gains before Web Audio attaches',()=>{
 const vm=require('node:vm'),video={volume:1},sound={volume:1},context=previewContext({video,sound,TimelineEdit:require('./timeline-edit')});
 vm.runInContext("cutSettings=()=>({mix:{master:.5}});CUT.slots=[{clip:{shot:{audioMode:'voiceover'},edit:{gain:.4}},video,audio:sound}];cutApplyMix()",context);
 assert.equal(video.volume,0);assert.equal(sound.volume,.2);
});

test('optional dialogue loudness balancing also applies to independent voice tracks',()=>{
 assert.match(require('./timeline-export-api').audioFilter({audioMode:'voiceover',gain:1},{normalizeDialogue:true},{dialogueEvents:[event]}),/^loudnorm=/);
});
