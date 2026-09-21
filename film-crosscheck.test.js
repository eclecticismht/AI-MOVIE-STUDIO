const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkShotWithFallback,passed}=require('./film-quality');
const shot=()=>({duration:5,dialogueEvents:[{type:'speech',speakerId:'a',speakerName:'甲',delivery:'onscreen',text:'哎，你好。'}]});
const result=text=>({segments:[{text,start:0.2,end:2}],model:'test'});
test('automatic crosscheck preserves the first recognition and only passes a matching second transcription',async()=>{
 const s=shot(),calls=[];
 const r=await checkShotWithFallback(s,'clip','medium','sensevoice',async(f,e,m)=>{calls.push(m);return result(m==='medium'?'你好':'哎你好')});
 assert.deepEqual(calls,['medium','sensevoice']);assert.equal(r.status,'text_match');assert.equal(r.automaticCrosscheck,true);
 assert.equal(s.speechCheckHistory[0].result.actual,'你好');assert.equal(r.speakerIdentity,'not_verified');
});
test('two recognizers disagreeing with the line never bypass the quality hold',async()=>{
 const r=await checkShotWithFallback(shot(),'clip','medium','sensevoice',async()=>result('你好'));
 assert.equal(passed(r),false);
});
test('unavailable crosscheck retains the primary mismatch and its explanation',async()=>{
 const r=await checkShotWithFallback(shot(),'clip','medium','sensevoice',async(f,e,m)=>{if(m==='sensevoice')throw Error('model missing');return result('你好')});
 assert.equal(r.status,'needs_review');assert.equal(r.actual,'你好');assert.equal(r.crosscheckError,'model missing');
});
test('matching speech and replacement ambience do not trigger unnecessary recognition',async()=>{
 let calls=0;await checkShotWithFallback(shot(),'clip','medium','sensevoice',async()=>{calls++;return result('哎你好')});assert.equal(calls,1);
 const r=await checkShotWithFallback({...shot(),dialogueEvents:[],audioMode:'replacement'},'clip','medium','sensevoice',async()=>{throw Error('unexpected')});assert.equal(r.status,'not_applicable');
});
