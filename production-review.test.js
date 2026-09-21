const {test}=require('node:test'),assert=require('node:assert/strict'),{snapshot}=require('./production-review');
test('review preserves authored prompt and opening state through client and server snapshots',()=>{
 const project={id:'p'},batch={id:'b',projectId:'p'},shot={id:'s',projectId:'p',storyboardBatchId:'b',prompt:'integrated_multimodal_description: put phone face down on table',firstFrameIntent:'Black rear shell facing up',apiKey:'secret'};
 const client=snapshot(project,batch,[shot],{});
 const server=snapshot(client.project,{...client.batch,projectId:'p'},client.shots.map(s=>({...s,projectId:'p',storyboardBatchId:'b'})),client.assets);
 assert.equal(server.shots[0].prompt,shot.prompt);assert.equal(server.shots[0].firstFrameIntent,shot.firstFrameIntent);assert.doesNotMatch(JSON.stringify(server),/secret/);
});
test('review snapshot preserves chosen batch and current asset state without connection credentials',()=>{
 const project={id:'p',name:'film',storyText:'story',apiKey:'secret',connector:{token:'secret'}},batch={id:'b',projectId:'p',sourceContent:'screenplay'},shots=[{id:'s',projectId:'p',storyboardBatchId:'b',sequence:1,dialogue:'原句',assetStates:{c:{description:'校服',token:'secret'}}}];
 const doc=snapshot(project,batch,shots,{characters:[{id:'c',projectId:'p',name:'人物',imageUrl:'data:image/png;base64,abc',apiKey:'secret'},{id:'other',projectId:'other'}]});
 assert.equal(doc.shots[0].assetStates.c.description,'校服');assert.equal(doc.batch.sourceContent,'screenplay');assert.equal(doc.assets.characters.length,1);assert.doesNotMatch(JSON.stringify(doc),/secret|base64|connector/);
 assert.throws(()=>snapshot(project,batch,[{...shots[0],storyboardBatchId:'other'}],{}),/单一分镜/);
});
test('review flags invented dialogue even when an adapted screenplay incorrectly includes it',()=>{
 const {audit}=require('./production-review');
 const doc={project:{storyText:'“借我五十，”小林说，“明天还你。”'},assets:{characters:[{id:'c',name:'小林'}]},shots:[{id:'ok',dur:6,dialogue:'小林：借我五十，明天还你。',sourceExcerpt:'小林：借我五十，明天还你。'},{id:'bad',dur:4,dialogue:'小林：走了，吃饭。',sourceExcerpt:'小林：走了，吃饭。'}]};
 const result=audit(doc);assert.equal(result.issues.length,1);assert.equal(result.issues[0].shotId,'bad');assert.equal(result.issues[0].kind,'story-dialogue');
});
