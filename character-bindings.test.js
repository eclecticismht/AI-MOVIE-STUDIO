const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('./dialogue-contract'),Review=require('./production-review');
const characters=[{id:'adult',name:'西门清'},{id:'child',name:'小西门清'},{id:'mother',name:'母亲'},{id:'father',name:'父亲'}];
test('visible child requires its own asset and never silently falls back to an adult name',()=>{
 assert.throws(()=>D.checkCharacterBindings({characters:'小西门清',characterIds:['adult'],dialogue:''},characters),/小西门清/);
 assert.doesNotThrow(()=>D.checkCharacterBindings({characters:'小西门清',characterIds:['child'],dialogue:''},characters));
});
test('onscreen speaking actor must be bound while explicitly offscreen speech does not need a picture',()=>{
 assert.throws(()=>D.checkCharacterBindings({char:'',characterIds:[],dialogue:'父亲：坐稳。'},characters),/父亲/);
 assert.doesNotThrow(()=>D.checkCharacterBindings({char:'母亲（画外）',characterIds:[],dialogue:'母亲（画外）：坐稳。'},characters));
 assert.doesNotThrow(()=>D.checkCharacterBindings({char:'无人',characterIds:[],dialogue:''},characters));
});
test('whitespace-normalized excerpts can contain action sentences before a genuine dialogue label',()=>{
 assert.doesNotThrow(()=>D.checkSource([{type:'speech',speakerName:'母亲',speakerId:'mother',text:'扶着栏杆！'}],'母亲在身后喊。 母亲：“扶着栏杆！”',characters));
 assert.throws(()=>D.checkSource([{type:'speech',speakerName:'父亲',speakerId:'father',text:'扶着栏杆！'}],'母亲在身后喊。 母亲：“扶着栏杆！”',characters),/说话人物/);
});
test('scene review uses the scene source rather than an unrelated project-wide story',()=>{
 const doc={project:{storyText:'另一个场次。'},batch:{sourceStory:'父亲：“坐稳。”'},assets:{characters,scenes:[],props:[]},shots:[{id:'s',dialogue:'父亲：坐稳。',sourceExcerpt:'父亲：“坐稳。”',dur:4,characterIds:['father']}]};
 assert.equal(Review.audit(doc).issues.length,0);delete doc.batch.sourceStory;assert.equal(Review.audit(doc).issues[0].kind,'story-dialogue');
});