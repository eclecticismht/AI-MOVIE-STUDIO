const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeResult}=require('./sensevoice-transcription'),{compareSpeech}=require('./speech-audit'),{alignSubtitles}=require('./subtitle-timing');
test('independent Chinese recognition keeps actual words and gaps without receiving script',()=>{
 const text='快一点啊工期赶不赢了',r=normalizeResult({text,tokens:[...text],timestamps:[1.32,1.56,1.68,1.86,4.32,4.5,4.74,4.92,4.98,5.16],duration:5.88});
 const events=[{type:'speech',text:'快一点啊！工期赶不赢了！'}];
 assert.equal(compareSpeech(events,r).status,'text_match');assert.equal(r.segments.length,2);assert.equal(alignSubtitles(events,r,5.88).cues[1].text,'工期赶不赢了！');
 assert.equal(compareSpeech(events,normalizeResult({text:'快点啊工期赶不赢了',duration:5.88})).status,'needs_review');
});
test('bad token timestamps fall back to explicit whole-clip timing',()=>{
 const r=normalizeResult({text:'你好',tokens:['你','好'],timestamps:[2,1],duration:3});assert.equal(r.timingSource,'whole-clip');assert.equal(r.segments[0].text,'你好');assert.throws(()=>normalizeResult({text:'a',duration:NaN}));
});
