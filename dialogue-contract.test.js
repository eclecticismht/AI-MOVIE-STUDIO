const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseDialogue,checkSource,bindDialogue,repairEvents}=require('./dialogue-contract');
const {makeAss,validatePlan}=require('./film-api');
const chars=[{id:'a',name:'甲'},{id:'b',name:'乙'}];
test('names inside screen text stay silent, and quoted captions cannot become speech',()=>{
  const events=parseDialogue('屏幕文字：甲：收到 乙：谢谢',chars);assert.equal(events.length,1);assert.equal(events[0].type,'screen');
  assert.throws(()=>checkSource(parseDialogue('甲：今晚聚聚',chars),'他发布照片，配文：\n“今晚聚聚”'),/书面/);
});
test('speech, phone messages and ambient sound are distinct events',()=>{
  const events=parseDialogue('甲（语音）：你好。\n屏幕文字：你找同事借点呗\n环境音：手机震动',chars);
  assert.equal(events[0].delivery,'phone');assert.equal(events[0].speakerId,'a');assert.equal(events[1].type,'screen');
  const prompt=bindDialogue('integrated_multimodal_description: A phone.\n\noverall_soundscape: Room tone.\n\nnon_diegetic_music: N/A',events,5,[]);
  assert.ok(prompt.includes('physically off-screen'));assert.ok(prompt.includes('<d>[Chinese]你好。</d>'));
  assert.ok(!prompt.includes('<d>[Chinese]你找同事'));assert.equal((prompt.match(/<d>/g)||[]).length,1);
});
test('unknown speakers, rewritten lines and swapped screenplay speakers are blocked',()=>{
  assert.throws(()=>parseDialogue('丙：你好。',chars),/不在本项目/);
  assert.throws(()=>parseDialogue('你好。',chars),/每行/);
  const event=parseDialogue('甲：你好。',chars);
  assert.throws(()=>checkSource(event,'甲：再见。'),/不在对应/);
  assert.throws(()=>checkSource(event,'乙：你好。'),/人物与剧本不符/);
  assert.doesNotThrow(()=>checkSource(event,'甲：你好。'));
});
test('turns cannot exceed duration or silently mix multiple speaking characters',()=>{
  assert.throws(()=>bindDialogue('visual',parseDialogue('甲：你好。 乙：再见。',chars),10),/多个说话人物/);
  assert.throws(()=>bindDialogue('visual',parseDialogue('甲：'+ '字'.repeat(50),chars),4),/台词过长/);
  assert.throws(()=>bindDialogue('old <d>wrong words</d>',[],5),/未校验台词/);
  assert.ok(bindDialogue('visual',[],5).includes('No spoken words'));
});
test('speaker binds to the matching visual reference, not the first image',()=>{
  const p=bindDialogue('visual',parseDialogue('乙：再见。',chars),5,[{assetId:'scene'},{assetId:'b'}]);
  assert.ok(p.includes('<Subject 2> (乙) (S1)'));assert.ok(p.includes('All other visible people keep their mouths closed'));
});
test('film plans keep approved speech and captions omit speaker labels and sound directions',()=>{
  const dialogueEvents=parseDialogue('甲：你好。\n屏幕文字：收到\n环境音：工地噪音',chars);
  const s={shotId:'s',duration:5,width:864,height:480,prompt:'visual',subtitle:'obsolete',dialogueEvents};
  const plan=validatePlan({projectId:'p',title:'test',shots:[s]});
  assert.deepEqual(plan.shots[0].dialogueEvents,dialogueEvents);
  const ass=makeAss(plan.shots);assert.ok(ass.includes('你好。'));assert.ok(ass.includes('收到'));assert.ok(!ass.includes('甲：'));assert.ok(!ass.includes('工地噪音'));
});
test('prompt generation service has no story-specific character or ending defaults',()=>{
  const source=require('fs').readFileSync('screenplay-api.js','utf8');
  const h3=source.match(/const H3_PROMPT=`([\s\S]*?)`;/)[1];
  for(const name of ['Chen Shi','Lao Zhang','Sun Jiajun','phone face down'])assert.ok(!h3.includes(name));
  assert.ok(h3.includes('application binds the approved dialogue separately'));
});
test('only explicitly typed source text is converted from speech to a silent caption',()=>{
  const events=parseDialogue('甲：收到',chars);
  assert.throws(()=>checkSource(events,'他打字：收到'),/文字消息/);
  assert.equal(repairEvents(events,'他打字：收到')[0].type,'screen');
  assert.equal(repairEvents(events,'甲：收到')[0].type,'speech');
  assert.equal(repairEvents(events,'甲看着手机说：收到')[0].type,'speech');
});
test('verified speech removes global voice vetoes but preserves silent listeners and screen text',()=>{
 const {bindDialogue}=require('./dialogue-contract');
 const prompt='integrated_multimodal_description: The listener keeps his mouth closed. No dialogue. The words are unintelligible and carried only as raw vocal effort.\noverall_soundscape: Construction ambience; no voices, no vocal content, no spoken words.\nnon_diegetic_music: N/A';
 const event={type:'speech',speakerId:'sun',speakerName:'孙嘉俊',delivery:'phone',text:'借我两千块钱。'};
 const bound=bindDialogue(prompt,[event],8);
 assert.doesNotMatch(bound,/no dialogue|no voices|no vocal content|no spoken words|unintelligible|raw vocal effort/i);
 assert.match(bound,/listener keeps his mouth closed/);assert.match(bound,/借我两千块钱/);assert.match(bound,/heard ONLY through the phone loudspeaker/);assert.match(bound,/text messages are silent/);
 const silent=bindDialogue(prompt,[],8);assert.match(silent,/No spoken words, narration/);
});
