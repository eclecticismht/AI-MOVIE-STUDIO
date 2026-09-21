const {test}=require('node:test'),assert=require('node:assert/strict');
const {updates}=require('./film-audio-sync'),{validate}=require('./shot-audio');
test('sound repair sync is project scoped and cannot erase newly added speech',()=>{
 const file='ams-audio-'+'a'.repeat(64)+'.wav',run={projectId:'p',shots:[{shotId:'s',ready:true,audioMode:'replacement',audioAsset:file}]},shots=[{id:'s',projectId:'p',dialogueEvents:[]}];
 assert.deepEqual(updates(run,shots,'p',s=>s.dialogueEvents,validate),[{id:'s',audioMode:'replacement',audioAsset:file}]);
 assert.equal(shots[0].audioMode,undefined);
 assert.throws(()=>updates(run,shots,'other',s=>s.dialogueEvents,validate));
 assert.throws(()=>updates(run,[{...shots[0],dialogueEvents:[{type:'speech'}]}],'p',s=>s.dialogueEvents,validate));
 assert.deepEqual(updates(run,[{...shots[0],autoArchived:true}],'p',s=>s.dialogueEvents,validate),[]);
});
