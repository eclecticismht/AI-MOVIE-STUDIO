const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('./dialogue-contract'),U=require('./story-understanding');
const characters=[{id:'child',name:'小西门清',aliases:['小清']},{id:'father',name:'父亲',aliases:['西门建国']},{id:'mother',name:'母亲',aliases:['罗桂芳']}];
const understanding={characters,facts:[]};
const speech=(name,text)=>({type:'speech',speakerId:characters.find(c=>c.name===name)?.id||'narrator',speakerName:name,delivery:'onscreen',text});
test('directly labelled original dialogue does not depend on complete AI speech facts',()=>{
 const story='父亲：“那你接着睡，爸自己玩雪去了。”\n小西门清：“爸，两口了。”';
 assert.doesNotThrow(()=>U.checkSpeech([speech('父亲','那你接着睡，爸自己玩雪去了。'),speech('小西门清','爸，两口了。')],understanding,story));
 assert.equal(D.sourceSpeech(story,characters).length,2);
});
test('explicit delivery descriptions and character aliases retain the correct speaker',()=>{
 for(const [label,name,text] of [['母亲的声音','母亲','小清，起来了……小清？'],['母亲在身后喊','母亲','扶着栏杆！楼梯上滑！'],['父亲喘着气','父亲','让我……喘两口。'],['父亲笑着说','父亲','好，今天听你的！'],['母亲低声笑道','母亲','两个憨包。'],['西门建国','父亲','坐稳——走喽！']]){
  assert.doesNotThrow(()=>U.checkSpeech([speech(name,text)],understanding,label+'：“'+text+'”'));
 }
});
test('longest character alias wins and adult and child names do not collide',()=>{
 const list=[{id:'adult',name:'西门清',aliases:[]},...characters];
 assert.equal(D.sourceSpeech('小西门清：“下雪了！”',list)[0].speakerId,'child');
 assert.throws(()=>U.checkSpeech([speech('父亲','爸，两口了。')],understanding,'小西门清：“爸，两口了。”'),/说话人物/);
});
test('thoughts, unlabelled prose, written messages and unrecognized labels remain blocked',()=>{
 for(const source of ['父亲心想：“我真累了。”','父亲发短信：“我真累了。”','屏幕文字：“我真累了。”','父亲望着雪地，他真累了。','路人：“我真累了。”']){
  assert.throws(()=>U.checkSpeech([speech('父亲','我真累了。')],understanding,source),/原文未明确/);
 }
 assert.throws(()=>U.checkSpeech([speech('父亲','我真累了。')],understanding,'父亲：“我不累。”'),/原文未明确/);
});
test('repeated short lines are accepted only for a matching explicit speaker',()=>{
 const source='母亲：“知道了。”\n父亲：“知道了。”';
 assert.doesNotThrow(()=>U.checkSpeech([speech('父亲','知道了。')],understanding,source));
 assert.throws(()=>U.checkSpeech([speech('小西门清','知道了。')],understanding,source),/说话人物/);
});
test('dialogue on a screen still cannot be reclassified as speech',()=>{
 const source='父亲打字：“回家了。”',u={...understanding,facts:[{delivery:'speech',evidence:source}]};
 assert.throws(()=>U.checkSpeech([speech('父亲','回家了。')],u,source),/文字消息/);
});