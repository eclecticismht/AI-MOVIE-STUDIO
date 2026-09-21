const {test}=require('node:test'),assert=require('node:assert/strict');
const ScreenCards=require('./screen-cards'),{makeAss,validatePlan}=require('./film-api');
const {recomposePlan}=require('./film-api');
const card={title:'余额',text:'603.72'};

test('draft animation types unicode characters, deletes every draft and ends empty',()=>{
  const cards=ScreenCards.validate([{title:'输入草稿（未发送）',text:'好\n我这个月真没了。',effect:'type-delete'}],'好\n我这个月真没了。');
  const frames=ScreenCards.timeline(cards,15);
  assert.equal(frames[0].start,0);assert.equal(frames.at(-1).end,15);assert.equal(frames.at(-1).cards[0].text,'');
  assert.ok(frames.some(f=>f.cards[0].text==='我这个月真没了。'));assert.ok(frames.some(f=>f.cards[0].text==='我这个月真没了'));
  frames.forEach((f,i)=>{assert.ok(f.end>f.start);if(i)assert.ok(Math.abs(f.start-frames[i-1].end)<1e-9)});
  assert.throws(()=>ScreenCards.validate([...cards,card],'好\n我这个月真没了。603.72'),/只能/);
  assert.throws(()=>ScreenCards.validate([{...cards[0],text:'已发送500'}],'好'),/原文/);
  const ass=makeAss([{duration:15,sourceExcerpt:'好\n我这个月真没了。',screenCards:cards,dialogueEvents:[]}]);assert.match(ass,/输入草稿（未发送）/);assert.match(ass,/我这个月真没了。/);assert.doesNotMatch(ass,/Default,,0,0,0/);
});

test('black silent shots reject accidental speech and preserve explicit generation mode',()=>{
  const s={shotId:'black',renderMode:'black',prompt:'Pure black.',duration:4,width:864,height:480,dialogueEvents:[]};
  const plan={projectId:'qa',title:'test',shots:[s]};assert.equal(validatePlan(plan).shots[0].renderMode,'black');
  assert.throws(()=>validatePlan({...plan,shots:[{...s,subtitle:'意外声音'}]}),/静音/);
  assert.throws(()=>validatePlan({...plan,shots:[{...s,renderMode:'unknown'}]}),/方式/);
});
test('screen cards must be grounded and fit the composition',()=>{
  assert.deepEqual(ScreenCards.validate([card],'当前603.72'),[card]);
  assert.throws(()=>ScreenCards.validate([card],'当前1603.72'),/原文/);
  assert.throws(()=>ScreenCards.validate([{...card,text:'{\\pos(0,0)}'}],'x'),/无效/);
  assert.throws(()=>ScreenCards.validate([{...card,text:'字'.repeat(400)}],'字'.repeat(400)),/遮挡/);
});
test('compositor writes deterministic cards without duplicate screen subtitles',()=>{
  const ass=makeAss([{duration:4,screenCards:[card],sourceExcerpt:'603.72',dialogueEvents:[{type:'screen',text:'余额 603.72'},{type:'screen',text:'另一条消息不能丢失'}]}]);
  assert.match(ass,/Style: Screen/);assert.match(ass,/余额\\N603\.72/);assert.match(ass,/另一条消息不能丢失/);assert.doesNotMatch(ass,/Default,,0,0,0,,余额/);assert.match(ass,/m 1010 30 l 1250 30/);
});
test('film snapshot preserves cards and rejects ungrounded screen text',()=>{
  const plan={projectId:'p',title:'test',shots:[{shotId:'s',duration:4,width:864,height:480,prompt:'visual',screenCards:[card],sourceExcerpt:'603.72'}]};
  assert.deepEqual(validatePlan(plan).shots[0].screenCards,[card]);
  assert.throws(()=>validatePlan({...plan,shots:[{...plan.shots[0],sourceExcerpt:'1603.72'}]}));
});
test('text-only recomposition preserves all clips and rejects foreign shots or fabricated amounts',()=>{
  const parent={id:'old',projectId:'p',title:'test',status:'complete',shots:[{shotId:'s',ready:true,sourceExcerpt:'603.72',jobId:'keep'}]};
  const child=recomposePlan(parent,[{shotId:'s',screenCards:[card]}]);assert.equal(child.compositionOnly,true);assert.equal(child.shots[0].ready,true);assert.equal(child.shots[0].jobId,'keep');assert.equal(parent.shots[0].screenCards,undefined);assert.notEqual(child.id,parent.id);
  assert.throws(()=>recomposePlan(parent,[{shotId:'other',screenCards:[card]}]));
  assert.throws(()=>recomposePlan(parent,[{shotId:'s',screenCards:[{...card,text:'1603.72'}]}]),/原文/);
});
