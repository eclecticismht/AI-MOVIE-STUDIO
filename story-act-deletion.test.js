const {test}=require('node:test'),assert=require('node:assert/strict'),Deletion=require('./story-act-deletion'),Acts=require('./story-acts'),Timeline=require('./timeline-edit');
function fixture(){return {projects:[{id:'p',timelineEdits:{batch:{order:['a','b','c'],clips:{a:{transition:'dissolve',transitionDuration:1},b:{gain:.5}},mix:{master:.8}}}}],shots:[...['a','b','c'].map((id,i)=>({id,sequence:i+1,projectId:'p',storyboardBatchId:'batch',dur:5})),{id:'b',projectId:'other',dur:5}],generations:[{shot:'b',videoUrl:'keep.mp4'}]}}
test('deleting a scene removes only its timeline shots and orphaned edit references',()=>{
 const data=fixture(),before=[{id:'one',shotIds:['a','c']},{id:'two',shotIds:['b']}],after=Acts.remove(before,'two');Deletion.reconcile(data,'p','key',before,after);
 assert.equal(data.shots[1].autoArchived,true);assert.equal(data.shots[3].autoArchived,undefined);assert.deepEqual(Timeline.build(data.shots.filter(s=>s.projectId==='p'),data.projects[0].timelineEdits.batch).map(c=>c.shot.id),['a','c']);
 assert.equal(data.projects[0].timelineEdits.batch.clips.b,undefined);assert.equal(data.projects[0].timelineEdits.batch.clips.a.transition,'cut');assert.equal(data.generations[0].videoUrl,'keep.mp4');
 Deletion.reconcile(data,'p','key',after,before);assert.equal(data.shots[1].autoArchived,undefined);assert.equal(data.shots[1].deletedWithAct,undefined);
 assert.deepEqual(data.projects[0].timelineEdits.batch.order,['a','b','c']);
});
test('last scene deletion empties timeline and completed jobs cannot reintroduce its media',()=>{
 const data=fixture();Deletion.reconcile(data,'p','key',[{shotIds:['a','b','c']}],[]);
 assert.equal(Timeline.build(data.shots.filter(s=>s.projectId==='p')).length,0);
 assert.equal(require('./film-preview-results').merge(data,[{id:'run',projectId:'p',shots:[{shotId:'b',jobId:'j',ready:true,videoUrl:'new.mp4'}]}]).added,0);
});
test('legacy migration recognizes exact old deletion, is repeatable, and ignores regrouping',()=>{
 const data=fixture(),prior=[{id:'one',shotIds:['a','c']},{id:'two',shotIds:['b']}];
 data.projects[0].storyActs={key:{acts:[{id:'one',shotIds:['a','c','b']}],history:[prior]}};
 assert.equal(Deletion.migrate(data),true);assert.equal(data.shots[1].autoArchived,true);assert.deepEqual(data.projects[0].storyActs.key.acts[0].shotIds,['a','c']);assert.equal(Deletion.migrate(data),false);
 const safe=fixture();safe.projects[0].storyActs={key:{acts:[{id:'new',shotIds:['a','b','c']}],history:[prior]}};assert.equal(Deletion.migrate(safe),false);assert.ok(safe.shots.every(s=>!s.autoArchived));
});
