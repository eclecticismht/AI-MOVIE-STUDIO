const {test}=require('node:test'),assert=require('node:assert/strict'),Voice=require('./shot-voiceover'),Dialogue=require('./dialogue-contract');
test('voiceover binds exact offscreen speech and restores previous dialogue and audio on removal',()=>{
 const shot={dialogue:'甲：你好',sourceExcerpt:'甲：你好',script:'街头',dur:4,audioMode:'mute'};
 const next=Voice.apply(shot,'忙碌的一天，终于结束。');
 assert.equal(next.audioMode,'model');const events=Dialogue.parseDialogue(next.dialogue);assert.equal(events[0].delivery,'offscreen');assert.equal(events[0].text,'忙碌的一天，终于结束。');Dialogue.checkSource(events,next.sourceExcerpt);
 assert.match(Dialogue.bindDialogue('visual only',events,next.dur),/off-screen voice only/);
 const restored=Voice.apply(next,'');assert.equal(restored.dialogue,shot.dialogue);assert.equal(restored.sourceExcerpt,shot.sourceExcerpt);assert.equal(restored.audioMode,'mute');assert.equal(restored.dur,4);assert.equal(restored.voiceoverOriginal,undefined);
});
test('voiceover extends duration, keeps initial backup through repeated edits and retains screen text',()=>{
 const shot={dur:4,dialogue:'',sourceExcerpt:'街道',assetStates:{screen:{screenText:'车站'}}};
 const next=Voice.apply(shot,'这是一个关于忙碌城市里普通人的故事，发生在傍晚下班的路上。');assert.ok(next.dur>4);assert.match(next.sourceExcerpt,/车站/);
 const edited=Voice.apply(next,'夜幕降临。');assert.equal(Voice.apply(edited,'').sourceExcerpt,'街道');assert.equal(Voice.text(edited),'夜幕降临。');
 assert.throws(()=>Voice.apply(shot,'字'.repeat(70)),/15 秒/);assert.throws(()=>Voice.apply(shot,'<d>台词</d>'),/普通文字/);
});
test('voiceover UI saves through source invalidation and prevents overwriting another edit',()=>{
 const vm=require('node:vm'),fs=require('node:fs');const shot={id:'s',projectId:'p',dur:5,dialogue:'',sourceExcerpt:'街道'};
 let stored=JSON.stringify({activeProjectId:'p',shots:[shot]}),notice='',renders=0;
 const ctx=vm.createContext({ShotVoiceover:Voice,FilmSourceSync:require('./film-source-sync'),D:{activeProjectId:'p',shots:[shot]},TL:{busy:false},editingShotId:null,tlCanLeave:()=>true,tlCurrent:()=>({shot:ctx.D.shots[0]}),tlMessage:v=>notice=v,tlRender:()=>renders++,tlInspector(){},tlAction(){},window:{addEventListener(){}},document:{getElementById:()=>({})},localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v}});
 vm.runInContext(fs.readFileSync('timeline-voiceover-ui.js','utf8'),ctx);
 vm.runInContext("timelineVoiceoverDrafts.set('p|s',{initial:'',text:'夜幕降临。',expected:JSON.stringify(D.shots[0])});timelineVoiceoverSave('s')",ctx);
 assert.equal(JSON.parse(stored).shots[0].dialogue,'旁白：夜幕降临。');assert.equal(JSON.parse(stored).shots[0].status,'需重做');assert.equal(renders,1);
 vm.runInContext("timelineVoiceoverDrafts.set('p|s',{initial:'',text:'改变',expected:'stale'});timelineVoiceoverSave('s')",ctx);assert.match(notice,/镜头已修改/);assert.equal(JSON.parse(stored).shots[0].dialogue,'旁白：夜幕降临。');
});
