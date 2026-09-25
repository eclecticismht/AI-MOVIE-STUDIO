const {test}=require('node:test'),assert=require('node:assert/strict'),{compile}=require('./shot-prompt');
test('wardrobe binding applies to every character even without manual blocking',()=>{
 const prompt=compile({dur:5,characterPositions:{a:'left'}},{},[{assetId:'a',name:'A',kind:'characters'},{assetId:'b',name:'B',kind:'characters'}]);
 assert.match(prompt,/A: left/);assert.match(prompt,/B: as composed in this shot/);
 assert.equal((prompt.match(/Wardrobe continuity:/g)||[]).length,2);
 assert.match(prompt,/Change clothing only when this shot explicitly requires a costume change/);
});
test('prompt uses current-shot wardrobe and action, never historical character biography',()=>{
 const shot={dur:8,script:'Listen with hands still.',visual:'School shop.',camera:'Fixed medium shot.'};
 const prompt=compile(shot,{},[{name:'Chen',kind:'characters',notes:'Thirty-year-old construction worker with dusty gloves.\nState for this shot only: Teenage boy with white school sleeves.'},{name:'Sun',kind:'characters',notes:'Adult man in suit.'}]);
 assert.match(prompt,/Teenage boy with white school sleeves/);assert.match(prompt,/Listen with hands still/);assert.doesNotMatch(prompt,/dusty gloves|construction worker|Adult man in suit/);
});
test('scene and prop biographies cannot add future plot actions to this shot',()=>{
 const refs=[{kind:'scenes',name:'Shade',notes:'Later the shadow moves away and he transfers 1000.'},{kind:'props',name:'Phone',notes:'At the end he refuses another 500.'}];
 const p=compile({dur:4,script:'Listen silently.',visual:'Close-up.'},{},refs);
 assert.doesNotMatch(p,/transfers 1000|refuses another 500|shadow moves/);
 const model=require('./reference-assets').referencePrompt(p,refs.map((r,i)=>({...r,assetId:String(i)})));
 assert.doesNotMatch(model,/transfers 1000|refuses another 500|shadow moves/);
 const notes=require('./reference-visual-notes')({kind:'props',notes:'Old balance 1603.72\nExact silent screen text for this shot: 603.72'});
 assert.match(notes,/603.72/);assert.doesNotMatch(notes,/1603/);
});
test('custom prompts keep their words, with scoped constraints before soundscape',()=>{
 const prompt=compile({dur:4,continueFromShotId:'previous',prompt:'integrated_multimodal_description: A handover.\n\noverall_soundscape: Quiet.\n\nnon_diegetic_music: N/A'},{},[{kind:'props',name:'Phone portrait',notes:'ONLY inside the screen'}]);
 assert.match(prompt,/A handover/);assert.match(prompt,/ONLY inside the screen/);assert.match(prompt,/final frame of the preceding shot/);assert.ok(prompt.indexOf('Selected visual assets')<prompt.indexOf('overall_soundscape:'));
});

test('story facts reach the planner without being appended as raw text to the finished H3 prompt',()=>{
 const shot={dur:7,storyBinding:{beats:[{action:'第一次密码失败，门仍关着'}],facts:[{statement:'总共输入两次',delivery:'visual'}]}};
 assert.match(compile(shot,{},[]),/第一次密码失败/);
 shot.prompt='integrated_multimodal_description: He enters the first password. Error beep; door remains closed.\n\noverall_soundscape: Keypad taps and one error beep.\n\nnon_diegetic_music: N/A';
 const result=compile(shot,{},[]);assert.match(result,/door remains closed/);assert.doesNotMatch(result,/第一次密码失败|总共输入两次|Source-grounded action contract/);
});
