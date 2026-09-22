const {test}=require('node:test'),assert=require('node:assert/strict'),Redo=require('./timeline-redo');
test('redo scope includes required tail-frame ancestors and descendants only',()=>{
 const shots=['a','b','c','d'].map((id,i)=>({id,projectId:'p',storyboardBatchId:'batch',sequence:i+1,...(i&&i<3?{continueFromShotId:['a','b'][i-1]}:{})}));
 assert.deepEqual(Redo.scope(shots,'b').map(s=>s.id),['a','b','c']);assert.deepEqual(Redo.scope(shots,'d').map(s=>s.id),['d']);
 assert.throws(()=>Redo.scope(shots.slice(1),'b'),/顺序/);
});
test('revision requests preserve verified dialogue and validate AI result before applying',()=>{
 const shot={id:'s',dur:5,dialogue:'甲：原句',soundscape:'old'},request=Redo.request(shot,'old prompt','车辆靠左，去掉多余声音');
 assert.equal(request.dialogue,shot.dialogue);assert.match(request.description,/车辆靠左/);assert.throws(()=>Redo.request(shot,'',' '));
 const prompt='integrated_multimodal_description: Vehicle on left.\noverall_soundscape: Quiet traffic.\nnon_diegetic_music: N/A',next=Redo.revised(shot,prompt);
 assert.equal(next.dialogue,shot.dialogue);assert.equal(next.soundscape,'Quiet traffic.');assert.equal(shot.soundscape,'old');
 assert.throws(()=>Redo.revised(shot,prompt+'<d>invented</d>'));
});
