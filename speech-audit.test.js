const {test}=require('node:test'),assert=require('node:assert/strict');
const {compareSpeech}=require('./speech-audit');
const events=[{type:'speech',text:'快了。',speakerName:'陈实',delivery:'onscreen'}];
test('speech match never certifies speaker identity',()=>{const r=compareSpeech(events,{segments:[{text:' 快了！'}]});assert.equal(r.status,'text_match');assert.equal(r.speakerIdentity,'not_verified')});
test('wrong words flagged',()=>assert.equal(compareSpeech(events,{segments:[{text:'你好'}]}).status,'needs_review'));
test('ordinary numeric spellings match without rewriting original dialogue or transcription',()=>{
 for(const [expected,actual] of [['今天我40了，喝点。','今天我四十了喝点'],['今天我４０了','今天我四十了'],['10元','十元'],['101元','一百零一元'],['1001元','一千零一元'],['0元','零元']]){
  const r=compareSpeech([{type:'speech',text:expected}],{segments:[{text:actual}]});
  assert.equal(r.status,'text_match',expected);assert.equal(r.expected,expected);assert.equal(r.actual,actual);assert.equal(r.speakerIdentity,'not_verified');
 }
});
test('numeric spelling comparison still rejects changed numbers, words and extra particles',()=>{
 const event=[{type:'speech',text:'今天我40了，喝点。'}];
 for(const actual of ['今天我四十一了喝点','今天我四十了喝点儿','今天我四十了','今天我四十了喝点喝点'])assert.equal(compareSpeech(event,{segments:[{text:actual}]}).status,'needs_review',actual);
 for(const [expected,actual] of [['编号040','编号四十'],['3.14','三百一十四'],['10000','一万']])assert.equal(compareSpeech([{type:'speech',text:expected}],{segments:[{text:actual}]}).status,'needs_review');
});
test('alternate recognition ranking treats equivalent integer spellings consistently',()=>{
 const {selectTranscription}=require('./speech-audit');
 const source={normalizedExpected:'今天我40了，喝点。',segments:[{text:'今天我四十了喝点'}],alternatives:[{method:'normalized-no-vad',segments:[{text:'今天我四十了喝点儿'}]}]};
 const selected=selectTranscription(source);assert.equal(selected.method,'vad');assert.equal(selected.recognitionAttempts.length,2);assert.equal(selected.segments[0].text,'今天我四十了喝点');
});
test('traditional transcript can match simplified script without hiding original output',()=>{const r=compareSpeech([{type:'speech',text:'还你',speakerName:'甲',delivery:'phone'}],{normalizedExpected:'还你',segments:[{text:'還你',normalizedText:'还你'}]});assert.equal(r.status,'text_match');assert.equal(r.actual,'還你')});
test('screen messages are not expected speech',()=>assert.equal(compareSpeech([{type:'screen',text:'收到'}],{segments:[{text:'收到'}]}).status,'needs_review'));
test('missing speech flagged and old jobs remain unverifiable',()=>{assert.equal(compareSpeech(events,{segments:[]}).status,'needs_review');assert.equal(compareSpeech(undefined,{segments:[]}).status,'unverifiable')});
test('unknown local recognition models never launch a process',async()=>{
 await assert.rejects(require('./speech-audit').transcribe('unused.mp4','', '../remote'),/模型选项无效/);
});
test('quiet-speech recheck uses actual alternative transcript and keeps both attempts',()=>{
 const {selectTranscription}=require('./speech-audit');
 const source={normalizedExpected:'借我两千块钱',segments:[{text:'借我'}],alternatives:[{method:'normalized-no-vad',segments:[{text:'借我两千块钱'}]}]};
 const chosen=selectTranscription(source);assert.equal(chosen.method,'normalized-no-vad');assert.equal(chosen.recognitionAttempts.length,2);assert.equal(source.segments[0].text,'借我');assert.equal(chosen.segments[0].text,'借我两千块钱');
 const mismatch=selectTranscription({...source,alternatives:[{method:'normalized-no-vad',segments:[{text:'借我三千块钱'}]}]});assert.equal(mismatch.segments[0].text,'借我三千块钱');assert.equal(compareSpeech([{type:'speech',text:source.normalizedExpected}],mismatch).status,'needs_review');
});
test('recheck does not select hallucinated text for silent shots or replace a better first pass',()=>{
 const {selectTranscription}=require('./speech-audit');
 const source={normalizedExpected:'',segments:[],alternatives:[{method:'no-vad',segments:[{text:'感谢观看'}]}]};assert.deepEqual(selectTranscription(source).segments,[]);
 const exact={...source,normalizedExpected:'快了',segments:[{text:'快了'}]};assert.deepEqual(selectTranscription(exact).segments,exact.segments);
});
test('same syllables and tones distinguish homophones from changed pronunciation',()=>{
 const event=[{type:'speech',text:'陈实',speakerName:'甲',delivery:'phone'}];
 const result=compareSpeech(event,{segments:[{text:'陈时'}],expectedPhonemes:['chen2','shi2'],phonemes:['chen2','shi2']});
 assert.equal(result.status,'pronunciation_match');assert.equal(result.actual,'陈时');assert.equal(result.expected,'陈实');assert.equal(result.speakerIdentity,'not_verified');
 assert.equal(compareSpeech(event,{segments:[{text:'陈是'}],expectedPhonemes:['chen2','shi2'],phonemes:['chen2','shi4']}).status,'needs_review');
 assert.equal(compareSpeech(event,{segments:[{text:'陈'}],expectedPhonemes:['chen2','shi2'],phonemes:['chen2']}).status,'needs_review');
 assert.equal(compareSpeech([],{segments:[{text:'乱说话'}],expectedPhonemes:[],phonemes:[]}).status,'needs_review');
});
test('unstressed particles tolerate lexical ASR tone spelling but never a missing or different syllable',()=>{
 const events=[{type:'speech',text:'快了是多少？'}],base={segments:[{text:'快乐是多少'}],expectedPhonemes:['kuai4','le5','shi4','duo1','shao3'],phonemes:['kuai4','le4','shi4','duo1','shao3']};
 assert.equal(compareSpeech(events,base).status,'pronunciation_match');
 assert.equal(compareSpeech(events,{...base,phonemes:['kuai4','la1','shi4','duo1','shao3']}).status,'needs_review');
 assert.equal(compareSpeech(events,{...base,phonemes:['kuai4','le4','shi4','duo1','xiao3']}).status,'needs_review');
 assert.equal(compareSpeech(events,{...base,phonemes:['kuai4','shi4','duo1','shao3']}).status,'needs_review');
});

test('television news preserves decimal precision and matches digit-spoken years',()=>{for(const [expected,actual] of [['2024年国内出游14.19亿人次','二零二四年国内出游十四点一九亿人次'],['1984年','一九八四年'],['0.05','零点零五']])assert.equal(compareSpeech([{type:'speech',text:expected}],{segments:[{text:actual}]}).status,'text_match');for(const actual of ['十四点九一','十四点一','一千四百一十九'])assert.equal(compareSpeech([{type:'speech',text:'14.19'}],{segments:[{text:actual}]}).status,'needs_review');assert.equal(compareSpeech([{type:'speech',text:'2024年'}],{segments:[{text:'二零二五年'}]}).status,'needs_review')});
