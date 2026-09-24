const {test}=require('node:test'),assert=require('node:assert/strict');
const {alignSubtitles}=require('./subtitle-timing');
const events=[{type:'speech',text:'快了。'}];
test('captions follow actual speech onset and keep original punctuation',()=>{
  const r=alignSubtitles(events,{segments:[{start:2.22,end:3.22,text:'快了'}]},3.75);assert.deepEqual(r.cues,[{start:2.22,end:3.22,text:'快了。'}]);
});
test('wrong words never produce authoritative timed captions',()=>assert.equal(alignSubtitles(events,{segments:[{start:0,end:1,text:'你好'}]},4).status,'needs_review'));
test('numeric speech matching preserves written digits and rejects ambiguous character timing',()=>{
 const sameLength=alignSubtitles([{type:'speech',text:'今天我40了。'}],{segments:[{start:0.5,end:2,text:'今天我四十了'}]},4);
 assert.deepEqual(sameLength.cues,[{start:0.5,end:2,text:'今天我40了。'}]);
 const differentLength=alignSubtitles([{type:'speech',text:'10元。'}],{segments:[{start:0.5,end:2,text:'十元'}]},4);
 assert.equal(differentLength.status,'needs_review');assert.deepEqual(differentLength.cues,[]);
});
test('multiple segments preserve punctuation and the gap between utterances',()=>{
  const r=alignSubtitles([{type:'speech',text:'你好。再见！'}],{segments:[{start:1,end:2,text:'你好'},{start:3,end:4,text:'再见'}]},4);assert.deepEqual(r.cues,[{start:1,end:2,text:'你好。'},{start:3,end:4,text:'再见！'}]);
});
test('invalid timing and silent messages cannot become speech cues',()=>{
  assert.equal(alignSubtitles(events,{segments:[{start:3,end:2,text:'快了'}]},4).status,'needs_review');assert.equal(alignSubtitles([{type:'screen',text:'消息'}],{segments:[]},4).status,'silent');
});
test('tone-identical transcription aligns original names without rewriting subtitles',()=>{
 const events=[{type:'speech',text:'陈实啊。'}],transcription={expectedPhonemes:['chen2','shi2','a5'],phonemes:['chen2','shi2','a5'],segments:[{start:0.5,end:1.7,text:'陈时啊'}]};
 assert.deepEqual(alignSubtitles(events,transcription,4),{status:'aligned',cues:[{start:0.5,end:1.7,text:'陈实啊。'}]});
 assert.equal(alignSubtitles(events,{...transcription,phonemes:['chen2','shi4','a5']},4).status,'needs_review');
});
test('composition reuses verified timing without another lower-accuracy transcription',()=>{
 const {checkedSubtitleTiming}=require('./subtitle-timing');
 const shot={duration:4,dialogueEvents:events,speechCheck:{status:'text_match',expected:'快了。',transcription:{segments:[{start:1,end:2,text:'快了'}]}}};
 assert.deepEqual(checkedSubtitleTiming(shot).cues,[{start:1,end:2,text:'快了。'}]);
 assert.equal(checkedSubtitleTiming({...shot,dialogueEvents:[{type:'speech',text:'来了。'}]}),null);
 assert.equal(checkedSubtitleTiming({...shot,speechCheck:{...shot.speechCheck,status:'needs_review',review:{accepted:true}}}),null);
 assert.equal(shot.subtitleTiming,undefined);
});
